import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import type { MapaAsientos } from "./asientos.ts";
import {
  cabeceraBasic,
  configDesdeEntorno,
  crearDatum,
  DatumHttpError,
  DatumNoDisponible,
  escribirMapaVerificado,
} from "./datum.ts";

// Valores de prueba sintéticos (no son credenciales reales).
const CFG = { databaseId: "db-test", clientId: "cid-test", clientSecret: "secreto-test-XYZ" };
const BASE = "https://api.jelou.ai/v2/databases/db-test/rows";

interface Llamada {
  metodo: string;
  url: string;
  headers: Headers;
  cuerpo: unknown;
}

// Datum simulado en memoria. `hook` permite inyectar fallos o escritores concurrentes por llamada.
function datumFalso(filas: Record<string, Record<string, unknown>>, hook?: (n: number, l: Llamada) => Response | void) {
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
    const ruta = url.slice(BASE.length).split("?")[0];
    const id = decodeURIComponent(ruta.replace(/^\//, ""));
    const json = (o: unknown, status = 200) => Promise.resolve(Response.json(o, { status }));
    if (l.metodo === "GET" && id === "") return json({ data: Object.entries(filas).map(([_id, fields]) => ({ _id, fields })) });
    if (l.metodo === "POST") {
      const _id = `row-${++seq}`;
      filas[_id] = (l.cuerpo as { fields: Record<string, unknown> }).fields;
      return json({ _id, fields: filas[_id] }, 201);
    }
    if (!(id in filas)) return json({ error: "no existe" }, 404);
    if (l.metodo === "GET") return json({ _id: id, fields: filas[id] });
    if (l.metodo === "PUT") {
      filas[id] = { ...filas[id], ...(l.cuerpo as { fields: Record<string, unknown> }).fields };
      return json({ _id: id, fields: filas[id] });
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

Deno.test("cabecera Basic: base64(clientId:clientSecret)", async () => {
  assertEquals(cabeceraBasic("a", "b"), `Basic ${btoa("a:b")}`);
  const { fetchFalso, llamadas } = datumFalso({ r1: { x: 1 } });
  await crearDatum(CFG, fetchFalso).leer("r1");
  assertEquals(llamadas[0].headers.get("authorization"), `Basic ${btoa("cid-test:secreto-test-XYZ")}`);
  assertEquals(llamadas[0].headers.get("accept"), "application/json");
});

Deno.test("configDesdeEntorno lee del entorno inyectado y falla si falta una variable", () => {
  const env: Record<string, string> = { DATABASE_ID: "d", JELOU_CLIENT_ID: "i", JELOU_CLIENT_SECRET: "s" };
  assertEquals(configDesdeEntorno((k) => env[k]), { databaseId: "d", clientId: "i", clientSecret: "s" });
  delete env.JELOU_CLIENT_SECRET;
  const e = assertThrowsSync(() => configDesdeEntorno((k) => env[k]));
  assertStringIncludes(e.message, "JELOU_CLIENT_SECRET");
});

function assertThrowsSync(f: () => unknown): Error {
  try {
    f();
  } catch (e) {
    return e as Error;
  }
  throw new Error("no lanzó");
}

Deno.test("CRUD: URLs, métodos y envoltorio fields", async () => {
  const { fetchFalso, llamadas } = datumFalso({});
  const d = crearDatum(CFG, fetchFalso);
  const creada = await d.crear({ nombre: "x" });
  assertEquals(creada, { _id: "row-1", fields: { nombre: "x" } });
  await d.actualizar("row-1", { nombre: "y" });
  assertEquals((await d.leer("row-1")).fields, { nombre: "y" });
  assertEquals((await d.listar(10, 1)).map((f) => f._id), ["row-1"]);
  assertEquals(llamadas.map((l) => `${l.metodo} ${l.url}`), [
    `POST ${BASE}`,
    `PUT ${BASE}/row-1`,
    `GET ${BASE}/row-1`,
    `GET ${BASE}?limit=10&page=1`,
  ]);
  assertEquals(llamadas[0].cuerpo, { fields: { nombre: "x" } });
  assertEquals(llamadas[1].cuerpo, { fields: { nombre: "y" } });
});

Deno.test("respuesta no 2xx lanza DatumHttpError sin filtrar secretos", async () => {
  const { fetchFalso } = datumFalso({});
  const e = await assertRejects(() => crearDatum(CFG, fetchFalso).leer("nada"), DatumHttpError);
  assertEquals(e.httpStatus, 404);
  assert(!e.message.includes(CFG.clientSecret));
  assert(!e.message.includes(btoa(`${CFG.clientId}:${CFG.clientSecret}`)));
});

Deno.test("write-then-verify: éxito al primer intento con version + 1", async () => {
  const filas = { v1: { mapa_asientos: mapaBase(), version: 4 } };
  const { fetchFalso, llamadas } = datumFalso(filas);
  const { esperas, sleep } = sinEspera();
  const res = await escribirMapaVerificado(crearDatum(CFG, fetchFalso), {
    vueloRowId: "v1",
    mutar: retener("tok-A", ["1A", "1C"]),
    verificar: esMio("tok-A", ["1A", "1C"]),
    sleep,
  });
  assertEquals(res["1A"].hold_token, "tok-A");
  assertEquals(filas.v1.version, 5);
  assertEquals(esperas, []);
  assertEquals(llamadas.map((l) => l.metodo), ["GET", "PUT", "GET"]);
  assertEquals((llamadas[1].cuerpo as { fields: { version: number } }).fields.version, 5);
});

Deno.test("write-then-verify: relectura no coincide (otro escritor pisó) y el reintento tiene éxito", async () => {
  const filas: Record<string, Record<string, unknown>> = { v1: { mapa_asientos: mapaBase(), version: 1 } };
  // Tras mi primer PUT (llamada 2), un escritor concurrente reemplaza el mapa sin mis marcas.
  const { fetchFalso, llamadas } = datumFalso(filas, (n) => {
    if (n === 3) filas.v1 = { mapa_asientos: mapaBase(), version: 3 };
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
  assertEquals(filas.v1.version, 4); // reintento sobre version releída 3, escribe 4
  assertEquals(llamadas.filter((l) => l.metodo === "PUT").length, 2);
});

Deno.test("write-then-verify: conflicto de negocio en el reintento (asiento ya tomado) sube sin ser 503", async () => {
  const filas: Record<string, Record<string, unknown>> = { v1: { mapa_asientos: mapaBase(), version: 1 } };
  const { fetchFalso } = datumFalso(filas, (n) => {
    if (n === 3) {
      const m = mapaBase();
      m["2A"] = { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null };
      filas.v1 = { mapa_asientos: m, version: 2 };
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
  const filas = { v1: { mapa_asientos: mapaBase(), version: 1 } };
  // Cada relectura devuelve un mapa sin mis marcas: el escritor concurrente siempre gana.
  let puts = 0;
  const { fetchFalso } = datumFalso(filas, (_n, l) => {
    if (l.metodo === "PUT") {
      puts++;
      return Response.json({ _id: "v1", fields: {} }); // el PUT "responde" pero no persiste
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
  assertEquals(puts, 3);
  assertEquals(esperas, [200, 400]);
  assertEquals(filas.v1.version, 1);
  assertEquals((filas.v1.mapa_asientos as MapaAsientos)["1A"].estado, "LIBRE"); // sin efecto parcial
});

Deno.test("write-then-verify: errores HTTP de Datum cuentan como intento y agotan en 503; deshacer revierte marcas propias", async () => {
  const filas: Record<string, Record<string, unknown>> = { v1: { mapa_asientos: mapaBase(), version: 1 } };
  // La releída siempre falla (500) tras escribir: el PUT sí persiste mis marcas.
  const { fetchFalso } = datumFalso(filas, (n, l) => {
    const esReleidaTrasPut = l.metodo === "GET" && n > 1 && n % 3 === 0 && n <= 9;
    if (esReleidaTrasPut) return new Response("boom", { status: 500 });
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
  assertEquals((filas.v1.mapa_asientos as MapaAsientos)["1A"].estado, "LIBRE");
});

Deno.test("no se loguea el secreto ni la cabecera Authorization (ni en éxito ni en error)", async () => {
  const salidas: string[] = [];
  const originales = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(originales) as (keyof typeof originales)[]) {
    console[k] = (...a: unknown[]) => { salidas.push(a.map(String).join(" ")); };
  }
  const textos: string[] = [];
  try {
    const filas = { v1: { mapa_asientos: mapaBase(), version: 1 } };
    const { fetchFalso } = datumFalso(filas, (_n, l) => (l.metodo === "PUT" ? new Response("x", { status: 500 }) : undefined));
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
  } finally {
    Object.assign(console, originales);
  }
  const b64 = btoa(`${CFG.clientId}:${CFG.clientSecret}`);
  for (const t of [...salidas, ...textos]) {
    assert(!t.includes(CFG.clientSecret) && !t.includes(b64), "secreto filtrado");
  }
  assertEquals(salidas, []);
});
