import test from "node:test";
import assert from "node:assert/strict";
import { generarColecciones, generarVuelos, clasificar, clavesMapa } from "./datos.mjs";
import { cargar, contar } from "./cargar.mjs";
import { crearCliente, INTERVALO_MS } from "./cliente.mjs";
import { main } from "./seed.mjs";

const CFG = { databaseId: "db1", clientId: "id", clientSecret: "sec" };
const resp = (status, cuerpo = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  body: null,
  json: async () => cuerpo,
});

// Datum simulado en memoria: POST crea, GET lista paginado.
function datumSimulado() {
  const filas = [];
  const llamadas = [];
  const fetchImpl = async (url, init) => {
    llamadas.push({ url, method: init.method, headers: init.headers });
    if (init.method === "POST") {
      const fila = { _id: `r${filas.length + 1}`, fields: JSON.parse(init.body).fields };
      filas.push(fila);
      return resp(201, fila);
    }
    const u = new URL(url);
    const limit = +u.searchParams.get("limit");
    const page = +u.searchParams.get("page");
    return resp(200, { data: filas.slice((page - 1) * limit, page * limit) });
  };
  return { filas, llamadas, fetchImpl };
}

const clienteDe = (fetchImpl, esperas = []) => {
  let t = 0;
  return crearCliente(CFG, { fetchImpl, sleep: async (ms) => { esperas.push(ms); t += ms; }, ahora: () => t });
};

test("conteos 6/12/12/372", () => {
  assert.deepEqual(contar(), { rutas: 6, temporada: 12, parametros: 12, vuelos: 372 });
});

test("vuelos: 07:00, 174 asientos LIBRE, claves unicas, ventana", () => {
  const vuelos = generarVuelos();
  assert.equal(new Set(vuelos.map((v) => v.id)).size, 372);
  assert.equal(vuelos[0].fecha, "2026-12-01");
  assert.equal(vuelos.at(-1).fecha, "2027-01-31");
  assert.equal(clavesMapa().length, 174);
  for (const v of vuelos) {
    assert.equal(v.hora_salida, "07:00");
    assert.deepEqual(Object.keys(v.mapa_asientos), clavesMapa());
    assert.ok(Object.values(v.mapa_asientos).every((a) => a.estado === "LIBRE" && a.pnr === null && a.hold_token === null && a.hold_expira === null));
  }
});

test("parametros: las 12 claves del dbml y temporada 1.30 en 1,6,7,12", () => {
  const [, temporada, parametros] = generarColecciones();
  assert.equal(parametros.filas.length, 12);
  for (const k of ["tarifa_kg_bodega_cop", "cargo_minimo_bodega_cop", "tarifa_mascota_cop", "hold_minutos"]) {
    assert.ok(parametros.filas.some((p) => p.clave === k), k);
  }
  assert.deepEqual(temporada.filas.filter((t) => t.multiplicador === 1.3).map((t) => t.mes), [1, 6, 7, 12]);
});

test("clasificar reconoce cada forma de fila", () => {
  for (const c of generarColecciones()) {
    assert.ok(c.filas.every((f) => clasificar(f)?.nombre === c.nombre && clasificar(f).clave === c.clave(f)));
  }
});

test("carga completa crea 402 filas y la segunda ejecucion no crea nada", async () => {
  const d = datumSimulado();
  const cliente = clienteDe(d.fetchImpl);
  const r1 = await cargar(cliente);
  assert.deepEqual(Object.fromEntries(Object.entries(r1).map(([k, v]) => [k, v.creadas])), { rutas: 6, temporada: 12, parametros: 12, vuelos: 372 });
  assert.equal(d.filas.length, 402);
  const posts = d.llamadas.filter((l) => l.method === "POST").length;
  const r2 = await cargar(cliente);
  assert.ok(Object.values(r2).every((v) => v.creadas === 0));
  assert.equal(r2.vuelos.omitidas, 372);
  assert.equal(d.llamadas.filter((l) => l.method === "POST").length, posts);
  assert.equal(d.filas.length, 402);
});

test("carga parcial: solo crea lo que falta", async () => {
  const d = datumSimulado();
  const cliente = clienteDe(d.fetchImpl);
  await cargar(cliente, { colecciones: generarColecciones().slice(0, 1) });
  const r = await cargar(cliente);
  assert.equal(r.rutas.creadas, 0);
  assert.equal(r.vuelos.creadas, 372);
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
  assert.ok(INTERVALO_MS >= 200);
});

test("backoff exponencial ante 429 y 5xx, respeta Retry-After, y luego tiene exito", async () => {
  const respuestas = [resp(429, {}, { "retry-after": "3" }), resp(503), resp(500), resp(201, { _id: "x", fields: {} })];
  let n = 0;
  const esperas = [];
  const cliente = clienteDe(async () => respuestas[n++], esperas);
  await cliente.crear({ a: 1 });
  assert.equal(n, 4);
  assert.deepEqual(esperas.filter((e) => e >= 500 && e !== INTERVALO_MS), [3000, 1000, 2000]);
});

test("backoff ante error de red y se rinde tras agotar reintentos", async () => {
  let n = 0;
  const cliente = clienteDe(async () => { n++; throw new TypeError("fetch failed"); });
  await assert.rejects(() => cliente.crear({}), /error de red/);
  assert.equal(n, 6);
});

test("4xx distinto de 429 no se reintenta y el error no filtra credenciales", async () => {
  let n = 0;
  const cliente = clienteDe(async () => { n++; return resp(401); });
  await assert.rejects(() => cliente.listarTodo(), (e) => e.status === 401 && !/sec|Basic/.test(e.message));
  assert.equal(n, 1);
});

test("autenticacion Basic y URL de rows", async () => {
  const d = datumSimulado();
  await clienteDe(d.fetchImpl).crear({ a: 1 });
  assert.equal(d.llamadas[0].url, "https://api.jelou.ai/v2/databases/db1/rows");
  assert.equal(d.llamadas[0].headers.Authorization, `Basic ${Buffer.from("id:sec").toString("base64")}`);
});

test("listarTodo pagina y corta si la API ignora page", async () => {
  const filas = Array.from({ length: 100 }, (_, i) => ({ _id: `r${i}`, fields: {} }));
  let n = 0;
  const cliente = clienteDe(async () => { n++; return resp(200, { data: filas }); });
  assert.equal((await cliente.listarTodo()).length, 100);
  assert.equal(n, 2);
});

test("CLI: dry-run sin red ni credenciales; sin credenciales falla sin imprimirlas", async () => {
  const salida = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("red prohibida"); };
  try {
    assert.equal(await main(["--dry-run"], {}, (m) => salida.push(m)), 0);
    assert.match(salida[0], /rutas=6 temporada=12 parametros=12 vuelos=372/);
    assert.equal(await main([], { JELOU_CLIENT_ID: "x" }, (m) => salida.push(m)), 2);
    assert.match(salida.at(-1), /JELOU_CLIENT_SECRET, DATABASE_ID/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
