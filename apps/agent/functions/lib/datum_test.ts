import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import type { MapaAsientos } from "./asientos.ts";
import {
  configDesdeEntorno,
  crearDatum,
  DatumHttpError,
  DatumNoDisponible,
  escribirMapaVerificado,
  esDuplicado,
  literalFiltro,
} from "./datum.ts";

// Valores de prueba sintéticos (no son credenciales reales).
const CLAVE = "clave-datum-test-XYZ";
const CFG = { url: "https://demo.jelou.cloud/api", apiKey: CLAVE };
const BASE = "https://demo.jelou.cloud/api/collections";

interface Llamada {
  metodo: string;
  url: string;
  headers: Headers;
  cuerpo: unknown;
}

type Registro = Record<string, unknown>;

// Datum (PocketBase) simulado en memoria, por colección. `hook` inyecta fallos o escritores concurrentes por llamada.
function datumFalso(
  cols: Record<string, Record<string, Registro>>,
  hook?: (n: number, l: Llamada) => Response | void,
  porPagina = 200,
) {
  const llamadas: Llamada[] = [];
  let seq = 0;
  const fetchFalso = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const l: Llamada = {
      metodo: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    llamadas.push(l);
    const forzada = hook?.(llamadas.length, l);
    if (forzada) return Promise.resolve(forzada);
    const [ruta, query = ""] = url.slice(BASE.length + 1).split("?");
    const [coleccion, , idCodificado] = ruta.split("/");
    const id = idCodificado === undefined ? undefined : decodeURIComponent(idCodificado);
    const registros = (cols[coleccion] ??= {});
    const json = (o: unknown, status = 200) => Promise.resolve(Response.json(o, { status }));
    const plano = (rid: string) => ({ id: rid, collectionId: "c1", collectionName: coleccion, created: "x", updated: "2026-01-01 00:00:00.000Z", ...registros[rid] });
    if (l.metodo === "GET" && id === undefined) {
      const p = new URLSearchParams(query);
      const pagina = Number(p.get("page"));
      const todos = Object.keys(registros).map(plano);
      const items = todos.slice((pagina - 1) * porPagina, pagina * porPagina);
      return json({ items, page: pagina, perPage: porPagina, totalItems: todos.length, totalPages: Math.max(1, Math.ceil(todos.length / porPagina)) });
    }
    if (l.metodo === "POST") {
      const { id: idDado, ...campos } = l.cuerpo as Registro;
      const nuevo = typeof idDado === "string" ? idDado : `row${++seq}`;
      if (nuevo in registros) return json({ status: 400, message: "x", data: { id: { code: "validation_not_unique" } } }, 400);
      registros[nuevo] = campos;
      return json(plano(nuevo), 200);
    }
    if (id === undefined || !(id in registros)) return json({ status: 404, message: "no existe" }, 404);
    if (l.metodo === "GET") return json(plano(id));
    if (l.metodo === "PATCH") {
      registros[id] = { ...registros[id], ...(l.cuerpo as Registro) };
      return json(plano(id));
    }
    return json({}, 405);
  };
  return { fetchFalso: fetchFalso as typeof fetch, llamadas };
}

const libre = () => ({ estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null });
const mapaBase = (): MapaAsientos =>
  ({ "1A": libre(), "1C": libre(), "2A": libre() }) as unknown as MapaAsientos;

const retener = (token: string, claves: string[]) => (m: MapaAsientos): MapaAsientos => {
  const copia = structuredClone(m);
  for (const c of claves) {
    if (copia[c].estado !== "LIBRE") throw new Error(`ocupado ${c}`);
    copia[c] = { estado: "RETENIDO", pnr: null, hold_token: token, hold_expira: "2026-12-01T10:15:00Z" };
  }
  return copia;
};
const esMio = (token: string, claves: string[]) => (m: MapaAsientos) =>
  claves.every((c) => m[c]?.hold_token === token);

const sinEspera = () => {
  const esperas: number[] = [];
  return { esperas, sleep: (ms: number) => { esperas.push(ms); return Promise.resolve(); } };
};

function assertThrowsSync(f: () => unknown): Error {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error("no lanzó");
}

Deno.test("cliente: cabecera X-Api-Key (sin Authorization) y Accept json", async () => {
  const { fetchFalso, llamadas } = datumFalso({ rutas: { bogmde: { origen: "BOG" } } });
  await crearDatum(CFG, fetchFalso).leer("rutas", "bogmde");
  assertEquals(llamadas[0].headers.get("x-api-key"), CLAVE);
  assertEquals(llamadas[0].headers.get("authorization"), null);
  assertEquals(llamadas[0].headers.get("accept"), "application/json");
});

Deno.test("configDesdeEntorno lee DATUM_URL y DATUM_API_KEY y falla sin imprimir valores", () => {
  const env: Record<string, string> = { DATUM_URL: "https://x.jelou.cloud/api", DATUM_API_KEY: "k-secreta" };
  assertEquals(configDesdeEntorno((k) => env[k]), { url: "https://x.jelou.cloud/api", apiKey: "k-secreta" });
  delete env.DATUM_API_KEY;
  const e = assertThrowsSync(() => configDesdeEntorno((k) => env[k]));
  assertStringIncludes(e.message, "DATUM_API_KEY");
  assert(!e.message.includes("x.jelou.cloud"));
});

Deno.test("CRUD por colección: URLs, métodos (PATCH, no PUT) y cuerpo plano", async () => {
  const { fetchFalso, llamadas } = datumFalso({});
  const d = crearDatum({ ...CFG, url: `${CFG.url}/` }, fetchFalso); // barra final tolerada
  const creada = await d.crear("pasajeros", { nombre: "x" });
  assertEquals(creada._id, "row1");
  assertEquals(creada.fields, { nombre: "x" }); // sin id/collectionId/collectionName/created/updated
  assertEquals(creada.updated, "2026-01-01T00:00:00.000Z");
  await d.actualizar("pasajeros", "row1", { edad: 30 });
  assertEquals((await d.leer("pasajeros", "row1")).fields, { nombre: "x", edad: 30 }); // PATCH fusiona
  assertEquals((await d.listar("pasajeros")).map((f) => f._id), ["row1"]);
  assertEquals(llamadas.map((l) => `${l.metodo} ${l.url}`), [
    `POST ${BASE}/pasajeros/records`,
    `PATCH ${BASE}/pasajeros/records/row1`,
    `GET ${BASE}/pasajeros/records/row1`,
    `GET ${BASE}/pasajeros/records?page=1&perPage=200`,
  ]);
  assertEquals(llamadas[0].cuerpo, { nombre: "x" });
  assertEquals(llamadas[1].cuerpo, { edad: 30 });
});

Deno.test("crear con id determinista lo envía en el cuerpo; repetido => 400 validation_not_unique => esDuplicado", async () => {
  const { fetchFalso, llamadas } = datumFalso({});
  const d = crearDatum(CFG, fetchFalso);
  const f = await d.crear("eventos_pago", { id_evento: "tx1:APROBADA" }, "tx1aprobada");
  assertEquals(f._id, "tx1aprobada");
  assertEquals(llamadas[0].cuerpo, { id_evento: "tx1:APROBADA", id: "tx1aprobada" });
  const e = await assertRejects(() => d.crear("eventos_pago", { id_evento: "tx1:APROBADA" }, "tx1aprobada"), DatumHttpError);
  assertEquals([e.httpStatus, e.codigo, esDuplicado(e)], [400, "validation_not_unique", true]);
  assert(!e.message.includes("validation_not_unique")); // el mensaje no lleva cuerpo
});

Deno.test("esDuplicado: solo 400 con validation_not_unique", () => {
  assertEquals(esDuplicado(new DatumHttpError(400, "m", "validation_required")), false);
  assertEquals(esDuplicado(new DatumHttpError(400, "m")), false);
  assertEquals(esDuplicado(new DatumHttpError(500, "m", "validation_not_unique")), false);
  assertEquals(esDuplicado(new Error("x")), false);
  assertEquals(esDuplicado(undefined), false);
});

Deno.test("listar: filtro, sort y fields en la query; filtro con comillas y barras escapado", async () => {
  const { fetchFalso, llamadas } = datumFalso({ reservas: { a: { pnr: "ABC234" } } });
  await crearDatum(CFG, fetchFalso).listar("reservas", {
    filter: `pnr=${literalFiltro('A"B\\C')} && estado="PENDIENTE"`,
    sort: "-created",
    fields: "id,pnr",
  });
  const q = new URL(llamadas[0].url).searchParams;
  assertEquals(q.get("filter"), 'pnr="A\\"B\\\\C" && estado="PENDIENTE"');
  assertEquals([q.get("sort"), q.get("fields"), q.get("perPage")], ["-created", "id,pnr", "200"]);
  assertEquals(literalFiltro("abc"), '"abc"');
});

Deno.test("listar pagina internamente con totalPages hasta agotar", async () => {
  const filas: Record<string, Registro> = {};
  for (let i = 0; i < 7; i++) filas[`f${i}`] = { n: i };
  const { fetchFalso, llamadas } = datumFalso({ vuelos: filas }, undefined, 3);
  const r = await crearDatum(CFG, fetchFalso).listar("vuelos");
  assertEquals(r.map((f) => f._id), ["f0", "f1", "f2", "f3", "f4", "f5", "f6"]);
  assertEquals(llamadas.map((l) => new URL(l.url).searchParams.get("page")), ["1", "2", "3"]);
});

Deno.test("listar: tope de seguridad de 100 páginas", async () => {
  let n = 0;
  const fetchInfinito = (() =>
    Promise.resolve(Response.json({ items: [{ id: `i${++n}` }], page: n, perPage: 200, totalItems: 9999, totalPages: 9999 }))) as unknown as typeof fetch;
  const e = await assertRejects(() => crearDatum(CFG, fetchInfinito).listar("vuelos"), DatumHttpError);
  assertEquals(n, 100);
  assertEquals(e.httpStatus, 502);
});

Deno.test("fechas date 'YYYY-MM-DD hh:mm:ss.sssZ' se normalizan a ISO; JSON llega como objeto; otros textos intactos", async () => {
  const { fetchFalso } = datumFalso({
    vuelos: { v1: { fecha: "2026-12-01 00:00:00.000Z", hold: "2026-12-01 10:15:00Z", nota: "hola mundo 2026-12-01 00:00:00.000Z", mapa_asientos: { "1A": libre() } } },
  });
  const f = await crearDatum(CFG, fetchFalso).leer("vuelos", "v1");
  assertEquals(f.fields.fecha, "2026-12-01T00:00:00.000Z");
  assertEquals(f.fields.hold, "2026-12-01T10:15:00Z");
  assertEquals(f.fields.nota, "hola mundo 2026-12-01 00:00:00.000Z");
  assertEquals((f.fields.mapa_asientos as MapaAsientos)["1A"].estado, "LIBRE");
});

Deno.test("respuesta no 2xx lanza DatumHttpError (404 inexistente) sin filtrar la clave", async () => {
  const { fetchFalso } = datumFalso({});
  const e = await assertRejects(() => crearDatum(CFG, fetchFalso).leer("rutas", "nada"), DatumHttpError);
  assertEquals(e.httpStatus, 404);
  assertEquals(e.codigo, undefined);
  assertStringIncludes(e.message, "GET /collections/rutas/records/nada");
  assert(!e.message.includes(CLAVE));
});

Deno.test("error con cuerpo no JSON o sin código: DatumHttpError sin codigo", async () => {
  const fetch500 = (() => Promise.resolve(new Response("boom", { status: 500 }))) as unknown as typeof fetch;
  const e = await assertRejects(() => crearDatum(CFG, fetch500).leer("rutas", "x"), DatumHttpError);
  assertEquals([e.httpStatus, e.codigo], [500, undefined]);
});

Deno.test("write-then-verify: éxito al primer intento con version + 1 (colección vuelos, PATCH)", async () => {
  const cols = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 4 } } };
  const { fetchFalso, llamadas } = datumFalso(cols);
  const { esperas, sleep } = sinEspera();
  const res = await escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
    vueloRowId: "v1",
    mutar: retener("tok-A", ["1A", "1C"]),
    verificar: esMio("tok-A", ["1A", "1C"]),
    sleep,
  });
  assertEquals(res["1A"].hold_token, "tok-A");
  assertEquals(cols.vuelos.v1.version, 5);
  assertEquals(esperas, []);
  assertEquals(llamadas.map((l) => l.metodo), ["GET", "PATCH", "GET"]);
  assertEquals(llamadas[1].url, `${BASE}/vuelos/records/v1`);
  assertEquals((llamadas[1].cuerpo as { version: number }).version, 5);
});

Deno.test("write-then-verify: relectura no coincide (otro escritor pisó) y el reintento tiene éxito", async () => {
  const cols: Record<string, Record<string, Registro>> = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 1 } } };
  // Tras mi primer PATCH (llamada 2), un escritor concurrente reemplaza el mapa sin mis marcas.
  const { fetchFalso, llamadas } = datumFalso(cols, (n) => {
    if (n === 3) cols.vuelos.v1 = { mapa_asientos: mapaBase(), version: 3 };
  });
  const { esperas, sleep } = sinEspera();
  const res = await escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
    vueloRowId: "v1",
    mutar: retener("tok-A", ["2A"]),
    verificar: esMio("tok-A", ["2A"]),
    sleep,
  });
  assertEquals(res["2A"].hold_token, "tok-A");
  assertEquals(esperas, [200]);
  assertEquals(cols.vuelos.v1.version, 4); // reintento sobre version releída 3, escribe 4
  assertEquals(llamadas.filter((l) => l.metodo === "PATCH").length, 2);
});

Deno.test("write-then-verify: conflicto de negocio en el reintento (asiento ya tomado) sube sin ser 503", async () => {
  const cols: Record<string, Record<string, Registro>> = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 1 } } };
  const { fetchFalso } = datumFalso(cols, (n) => {
    if (n === 3) {
      const m = mapaBase();
      m["2A"] = { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null };
      cols.vuelos.v1 = { mapa_asientos: m, version: 2 };
    }
  });
  const { sleep } = sinEspera();
  const e = await assertRejects(() =>
    escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
      vueloRowId: "v1",
      mutar: retener("tok-A", ["2A"]),
      verificar: esMio("tok-A", ["2A"]),
      sleep,
    })
  );
  assert(!(e instanceof DatumNoDisponible));
  assertStringIncludes((e as Error).message, "ocupado 2A");
});

Deno.test("write-then-verify: agotamiento de 3 intentos lanza DatumNoDisponible (503) con backoff", async () => {
  const cols = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 1 } } };
  // El PATCH "responde" pero no persiste: la relectura nunca trae mis marcas.
  let patches = 0;
  const { fetchFalso } = datumFalso(cols, (_n, l) => {
    if (l.metodo === "PATCH") {
      patches++;
      return Response.json({ id: "v1" });
    }
  });
  const { esperas, sleep } = sinEspera();
  const e = await assertRejects(
    () =>
      escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
        vueloRowId: "v1",
        mutar: retener("tok-A", ["1A"]),
        verificar: esMio("tok-A", ["1A"]),
        sleep,
      }),
    DatumNoDisponible,
  );
  assertEquals(e.status, 503);
  assertEquals(patches, 3);
  assertEquals(esperas, [200, 400]);
  assertEquals(cols.vuelos.v1.version, 1);
  assertEquals((cols.vuelos.v1.mapa_asientos as MapaAsientos)["1A"].estado, "LIBRE"); // sin efecto parcial
});

Deno.test("write-then-verify: errores HTTP de Datum cuentan como intento y agotan en 503; deshacer revierte marcas propias", async () => {
  const cols: Record<string, Record<string, Registro>> = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 1 } } };
  // La releída siempre falla (500) tras escribir: el PATCH sí persiste mis marcas.
  const { fetchFalso } = datumFalso(cols, (n, l) => {
    const esReleidaTrasPatch = l.metodo === "GET" && n > 1 && n % 3 === 0 && n <= 9;
    if (esReleidaTrasPatch) return new Response("boom", { status: 500 });
  });
  const { sleep } = sinEspera();
  await assertRejects(
    () =>
      escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
        vueloRowId: "v1",
        mutar: (m) => (m["1A"].hold_token === "tok-A" ? m : retener("tok-A", ["1A"])(m)),
        verificar: esMio("tok-A", ["1A"]),
        deshacer: (m) => ({ ...m, "1A": libre() }) as unknown as MapaAsientos,
        sleep,
      }),
    DatumNoDisponible,
  );
  assertEquals((cols.vuelos.v1.mapa_asientos as MapaAsientos)["1A"].estado, "LIBRE");
});

Deno.test("no se loguea la clave ni aparece en errores (ni en éxito ni en error)", async () => {
  const salidas: string[] = [];
  const originales = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(originales) as (keyof typeof originales)[]) {
    console[k] = (...a: unknown[]) => { salidas.push(a.map(String).join(" ")); };
  }
  const textos: string[] = [];
  try {
    const cols = { vuelos: { v1: { mapa_asientos: mapaBase(), version: 1 } } };
    const { fetchFalso } = datumFalso(cols, (_n, l) => (l.metodo === "PATCH" ? new Response("x", { status: 500 }) : undefined));
    const { sleep } = sinEspera();
    const e = await assertRejects(() =>
      escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
        vueloRowId: "v1",
        mutar: retener("tok-A", ["1A"]),
        verificar: esMio("tok-A", ["1A"]),
        sleep,
      })
    );
    textos.push((e as Error).message, String((e as Error).stack));
    const e2 = await assertRejects(() => crearDatum(CFG, fetchFalso).crear("vuelos", {}, "v1"), DatumHttpError);
    textos.push(e2.message, String(e2.stack));
  } finally {
    Object.assign(console, originales);
  }
  for (const t of [...salidas, ...textos]) assert(!t.includes(CLAVE), "clave filtrada");
  assertEquals(salidas, []);
});
