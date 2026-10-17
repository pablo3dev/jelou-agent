import test from "node:test";
import assert from "node:assert/strict";
import { generarColecciones, generarVuelos, clavesMapa, idFisico } from "./datos.mjs";
import { cargar, contar } from "./cargar.mjs";
import { crearCliente, INTERVALO_MS } from "./cliente.mjs";
import { main } from "./seed.mjs";

const URL_BASE = "https://demo.jelou.cloud/api";
const CLAVE = "clave-secreta-de-prueba";
const CFG = { url: URL_BASE, apiKey: CLAVE };
const resp = (status, cuerpo = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  body: null,
  json: async () => cuerpo,
});
const DUP = { data: { id: { code: "validation_not_unique" } } };

// Datum (PocketBase) simulado en memoria: POST con id unico, GET paginado { items, totalPages, totalItems }.
function datumSimulado(previos = {}) {
  const tablas = {};
  for (const [c, ids] of Object.entries(previos)) tablas[c] = new Map(ids.map((id) => [id, { id }]));
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    llamadas.push({ url, method: init.method, headers: init.headers, body: init.body });
    const u = new URL(url);
    const col = u.pathname.match(/\/collections\/([^/]+)\/records$/)[1];
    const tabla = (tablas[col] ??= new Map());
    if (init.method === "POST") {
      const reg = JSON.parse(init.body);
      if (tabla.has(reg.id)) return resp(400, DUP);
      tabla.set(reg.id, reg);
      return resp(200, reg);
    }
    const perPage = +u.searchParams.get("perPage");
    const page = +u.searchParams.get("page");
    const todos = [...tabla.values()];
    return resp(200, {
      items: todos.slice((page - 1) * perPage, page * perPage).map((r) => ({ id: r.id })),
      page,
      perPage,
      totalItems: todos.length,
      totalPages: Math.max(1, Math.ceil(todos.length / perPage)),
    });
  };
  const total = () => Object.values(tablas).reduce((n, t) => n + t.size, 0);
  return { tablas, llamadas, fetchImpl, total };
}

const clienteDe = (fetchImpl, esperas = []) => {
  let t = 0;
  return crearCliente(CFG, { fetchImpl, sleep: async (ms) => { esperas.push(ms); t += ms; }, ahora: () => t });
};
const posts = (d) => d.llamadas.filter((l) => l.method === "POST");

test("conteos 6/12/12/1116", () => {
  assert.deepEqual(contar(), { rutas: 6, temporada: 12, parametros: 12, vuelos: 1116 });
});

test("ids fisicos deterministas y solo [a-z0-9]", () => {
  assert.equal(idFisico.rutas("BOG-MDE"), "bogmde");
  assert.equal(idFisico.temporada(1), "mes01");
  assert.equal(idFisico.temporada(12), "mes12");
  assert.equal(idFisico.parametros("tarifa_kg_bodega_cop"), "tarifakgbodegacop");
  assert.equal(idFisico.vuelos("BOG-MDE", "2026-12-01"), "bogmde20261201");
  for (const c of generarColecciones()) {
    assert.equal(new Set(c.filas.map((f) => f.id)).size, c.filas.length, c.nombre);
    assert.ok(c.filas.every((f) => /^[a-z0-9]+$/.test(f.id) && !("id" in f.campos)), c.nombre);
  }
});

test("vuelos: ruta_id logica, 3 horarios por fecha (id original para 07:00, hhmm para los demas), 174 asientos LIBRE, version 1, ventana", () => {
  const vuelos = generarVuelos();
  assert.equal(vuelos.length, 1116);
  assert.equal(vuelos[0].id, "bogmde20261201");
  assert.equal(vuelos[0].campos.ruta_id, "BOG-MDE");
  assert.equal(vuelos[1].id, "bogmde202612011230");
  assert.equal(vuelos[2].id, "bogmde202612011845");
  assert.equal(vuelos[0].campos.fecha, "2026-12-01");
  assert.equal(vuelos.at(-1).campos.fecha, "2027-01-31");
  assert.equal(clavesMapa().length, 174);
  for (const { campos: v } of vuelos) {
    assert.ok(["07:00", "12:30", "18:45"].includes(v.hora_salida));
    assert.equal(v.version, 1);
    assert.deepEqual(Object.keys(v.mapa_asientos), clavesMapa());
    assert.ok(Object.values(v.mapa_asientos).every((a) => a.estado === "LIBRE" && a.pnr === null && a.hold_token === null && a.hold_expira === null));
  }
});

test("parametros: las 12 claves del dbml y temporada 1.30 en 1,6,7,12", () => {
  const [, temporada, parametros] = generarColecciones();
  assert.equal(parametros.filas.length, 12);
  for (const k of ["tarifa_kg_bodega_cop", "cargo_minimo_bodega_cop", "tarifa_mascota_cop", "hold_minutos"]) {
    assert.ok(parametros.filas.some((p) => p.campos.clave === k), k);
  }
  assert.deepEqual(temporada.filas.filter((t) => t.campos.multiplicador === 1.3).map((t) => t.campos.mes), [1, 6, 7, 12]);
});

test("carga completa crea 1146 filas por coleccion/URL y la segunda ejecucion crea 0", async () => {
  const d = datumSimulado();
  const cliente = clienteDe(d.fetchImpl);
  const r1 = await cargar(cliente);
  assert.deepEqual(Object.fromEntries(Object.entries(r1).map(([k, v]) => [k, v.creadas])), { rutas: 6, temporada: 12, parametros: 12, vuelos: 1116 });
  assert.equal(d.total(), 1146);
  assert.equal(posts(d)[0].url, `${URL_BASE}/collections/rutas/records`);
  assert.deepEqual(JSON.parse(posts(d)[0].body), { id: "bogmde", origen: "BOG", destino: "MDE", tarifa_base_cop: 350000 });
  const n = posts(d).length;
  const r2 = await cargar(cliente);
  assert.ok(Object.values(r2).every((v) => v.creadas === 0));
  assert.equal(r2.vuelos.omitidas, 1116);
  assert.equal(posts(d).length, n);
  assert.equal(d.total(), 1146);
});

test("reanudable: tras una interrupcion a mitad otra ejecucion completa lo que falta", async () => {
  const d = datumSimulado();
  let vivos = 100; // falla de red permanente tras 100 peticiones
  const cliente = clienteDe(async (u, i) => {
    if (vivos-- <= 0) throw new TypeError("fetch failed");
    return d.fetchImpl(u, i);
  });
  await assert.rejects(() => cargar(cliente), /error de red/);
  const parcial = d.total();
  assert.ok(parcial > 0 && parcial < 1146);
  const r = await cargar(clienteDe(d.fetchImpl));
  assert.equal(d.total(), 1146);
  assert.equal(Object.values(r).reduce((n, v) => n + v.creadas, 0), 1146 - parcial);
});

test("carga parcial: solo crea lo que falta", async () => {
  const d = datumSimulado();
  const cliente = clienteDe(d.fetchImpl);
  await cargar(cliente, { colecciones: generarColecciones().slice(0, 1) });
  const r = await cargar(cliente);
  assert.equal(r.rutas.creadas, 0);
  assert.equal(r.rutas.omitidas, 6);
  assert.equal(r.vuelos.creadas, 1116);
});

test("duplicado 400 validation_not_unique cuenta como omitida (carrera) y no lanza", async () => {
  const d = datumSimulado();
  const cliente = clienteDe(d.fetchImpl);
  const real = cliente.listarIds.bind(cliente);
  // El listado no ve nada, pero las filas ya existen: todo POST responde duplicado.
  d.tablas.rutas = new Map(generarColecciones()[0].filas.map((f) => [f.id, f]));
  const sinVer = { ...cliente, listarIds: async () => new Set() };
  assert.ok(real);
  const r = await cargar(sinVer, { colecciones: generarColecciones().slice(0, 1) });
  assert.deepEqual(r.rutas, { creadas: 0, omitidas: 6 });
});

test("otro 400 distinto de duplicado lanza ErrorDatum sin cuerpo", async () => {
  const cliente = clienteDe(async () => resp(400, { data: { tipo: { code: "validation_invalid_value", secreto: CLAVE } } }));
  await assert.rejects(() => cliente.crear("rutas", { a: 1 }, "x"), (e) => e.status === 400 && !e.message.includes("secreto") && !e.message.includes(CLAVE));
});

test("ritmo: nunca mas de 5 req/s (espacio minimo entre peticiones)", async () => {
  const d = datumSimulado();
  const tiempos = [];
  let t = 0;
  const cliente = crearCliente(CFG, {
    fetchImpl: (u, i) => { tiempos.push(t); return d.fetchImpl(u, i); },
    sleep: async (ms) => { t += ms; },
    ahora: () => t,
  });
  await cargar(cliente, { colecciones: generarColecciones().slice(0, 3) });
  assert.ok(tiempos.length > 30);
  for (let i = 1; i < tiempos.length; i++) assert.ok(tiempos[i] - tiempos[i - 1] >= INTERVALO_MS);
  assert.ok(INTERVALO_MS >= 250);
});

test("backoff exponencial ante 429 y 5xx, respeta Retry-After, y luego tiene exito", async () => {
  const respuestas = [resp(429, {}, { "retry-after": "3" }), resp(503), resp(500), resp(200, { id: "x" })];
  let n = 0;
  const esperas = [];
  const cliente = clienteDe(async () => respuestas[n++], esperas);
  assert.deepEqual(await cliente.crear("rutas", { a: 1 }, "x"), { duplicado: false });
  assert.equal(n, 4);
  assert.deepEqual(esperas.filter((e) => e >= 500 && e !== INTERVALO_MS), [3000, 1000, 2000]);
});

test("backoff ante error de red y se rinde tras agotar reintentos (5 reintentos)", async () => {
  let n = 0;
  const cliente = clienteDe(async () => { n++; throw new TypeError("fetch failed"); });
  await assert.rejects(() => cliente.crear("rutas", {}, "x"), /error de red/);
  assert.equal(n, 6);
});

test("5xx persistente se rinde tras 5 reintentos", async () => {
  let n = 0;
  const cliente = clienteDe(async () => { n++; return resp(503); });
  await assert.rejects(() => cliente.listarIds("rutas"), (e) => e.status === 503);
  assert.equal(n, 6);
});

test("4xx distinto de 429 no se reintenta y el error no filtra la clave", async () => {
  let n = 0;
  const cliente = clienteDe(async () => { n++; return resp(401); });
  await assert.rejects(() => cliente.listarIds("rutas"), (e) => e.status === 401 && !e.message.includes(CLAVE) && !/api-key|Basic/i.test(e.message));
  assert.equal(n, 1);
});

test("X-Api-Key, sin Basic/Authorization, URL por coleccion y paginacion de ids", async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
  const d = datumSimulado({ vuelos: ids });
  const set = await clienteDe(d.fetchImpl).listarIds("vuelos");
  assert.equal(set.size, 450);
  assert.equal(d.llamadas.length, 3);
  const u = new URL(d.llamadas[0].url);
  assert.equal(`${u.origin}${u.pathname}`, `${URL_BASE}/collections/vuelos/records`);
  assert.equal(u.searchParams.get("perPage"), "200");
  assert.equal(u.searchParams.get("fields"), "id");
  for (const l of d.llamadas) {
    assert.equal(l.headers["X-Api-Key"], CLAVE);
    assert.ok(!("Authorization" in l.headers));
    assert.ok(!JSON.stringify(l.headers).includes("Basic"));
  }
});

test("CLI: dry-run sin red; sin entorno falla sin imprimir valores", async () => {
  const salida = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("red prohibida"); };
  try {
    assert.equal(await main(["--dry-run"], {}, (m) => salida.push(m)), 0);
    assert.match(salida[0], /rutas=6 temporada=12 parametros=12 vuelos=1116/);
    assert.equal(await main([], { DATUM_URL: URL_BASE }, (m) => salida.push(m)), 2);
    assert.match(salida.at(-1), /DATUM_API_KEY/);
    assert.ok(!salida.join("\n").includes(URL_BASE));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("CLI: carga, log solo con conteos y sin la clave; error de red no la filtra", async () => {
  const d = datumSimulado();
  const salida = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = d.fetchImpl;
  try {
    // Sin sleep inyectable en main: precarga todo para que la carga solo liste (rapido y sin escrituras).
    for (const c of generarColecciones()) d.tablas[c.nombre] = new Map(c.filas.map((f) => [f.id, f]));
    assert.equal(await main([], { DATUM_URL: URL_BASE, DATUM_API_KEY: CLAVE }, (m) => salida.push(m)), 0);
    assert.ok(salida.includes("vuelos: 0 creadas, 1116 omitidas"));
    globalThis.fetch = async () => resp(401);
    assert.equal(await main([], { DATUM_URL: URL_BASE, DATUM_API_KEY: CLAVE }, (m) => salida.push(m)), 1);
    assert.ok(!salida.join("\n").includes(CLAVE));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("CLI --verificar: exit 0 si coincide 6/12/12/1116, 1 si no", async () => {
  const d = datumSimulado();
  const salida = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = d.fetchImpl;
  const env = { DATUM_URL: URL_BASE, DATUM_API_KEY: CLAVE };
  try {
    assert.equal(await main(["--verificar"], env, (m) => salida.push(m)), 1);
    for (const c of generarColecciones()) d.tablas[c.nombre] = new Map(c.filas.map((f) => [f.id, f]));
    d.llamadas.length = 0;
    assert.equal(await main(["--verificar"], env, (m) => salida.push(m)), 0);
    assert.match(salida.at(-1), /rutas=6 temporada=12 parametros=12 vuelos=1116/);
    assert.ok(d.llamadas.every((l) => l.method === "GET" && new URL(l.url).searchParams.get("perPage") === "1"));
    assert.ok(!salida.join("\n").includes(CLAVE));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
