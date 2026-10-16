// adapter: out — Datum REST (api.jelou.ai/v2) + write-then-verify de vuelos.mapa_asientos.
//
// Fuente: learning.md §5.1 y draft.md §Acceso a Datum. La URL base es exactamente
// `https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows`; no incluye colección.
//
// SUPUESTOS / GAPS (se confirman en el spike 3.1):
// - GAP-09: `GET .../rows/{rowId}` no está confirmado en la documentación.
// - GAP-02: el esquema `Basic` frente a `X-Api-Key` no está confirmado para la API v2.
// - Colecciones: learning.md no muestra cómo se direcciona una colección en la URL. Este cliente
//   queda atado a UN `databaseId`; quien necesite otra colección crea otro cliente con su id.
// - Forma de la respuesta: se asume fila `{ _id, fields: {...} }` (o campos planos con `_id`/`id`)
//   y, para listar, un arreglo o un objeto con arreglo en `data` o `rows`. Se normaliza a `Fila`.
// - GAP-12: el formato de valor JSON de `mapa_asientos` se asume objeto (si llega como texto, se parsea).
//
// Este módulo nunca escribe logs: así ni la cabecera Authorization ni el secreto pueden filtrarse.

import type { MapaAsientos } from "./asientos.ts";

export const DATUM_BASE = "https://api.jelou.ai/v2/databases";

export type Fetch = typeof fetch;
export type Sleep = (ms: number) => Promise<void>;

export interface Fila {
  _id: string;
  fields: Record<string, unknown>;
}

export interface ConfigDatum {
  databaseId: string;
  clientId: string;
  clientSecret: string;
}

// Error de servicio: las functions lo responden como HTTP 503 (EC-17), sin efecto parcial visible.
export class DatumNoDisponible extends Error {
  readonly status = 503;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DatumNoDisponible";
  }
}

// Respuesta no 2xx de Datum. El mensaje solo lleva método, ruta y código: nunca cabeceras ni cuerpo.
export class DatumHttpError extends Error {
  constructor(readonly httpStatus: number, mensaje: string) {
    super(mensaje);
    this.name = "DatumHttpError";
  }
}

// `getEnv` es `ctx.env.get` en una function (o `Deno.env.get` en pruebas). Nunca hay valores en código.
export function configDesdeEntorno(getEnv: (nombre: string) => string | undefined): ConfigDatum {
  const leer = (nombre: string): string => {
    const v = getEnv(nombre);
    if (v === undefined || v === "") throw new Error(`Falta la variable de entorno ${nombre}`);
    return v;
  };
  return {
    databaseId: leer("DATABASE_ID"),
    clientId: leer("JELOU_CLIENT_ID"),
    clientSecret: leer("JELOU_CLIENT_SECRET"),
  };
}

export function cabeceraBasic(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function normalizar(crudo: unknown): Fila {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const _id = String(r._id ?? r.id ?? "");
  if (_id === "") throw new DatumHttpError(502, "Respuesta de Datum sin id de fila");
  if (typeof r.fields === "object" && r.fields !== null) return { _id, fields: r.fields as Record<string, unknown> };
  const { _id: _a, id: _b, ...planos } = r;
  return { _id, fields: planos };
}

export interface Datum {
  listar(limit: number, page: number): Promise<Fila[]>;
  crear(fields: Record<string, unknown>): Promise<Fila>;
  actualizar(rowId: string, fields: Record<string, unknown>): Promise<Fila>;
  leer(rowId: string): Promise<Fila>;
}

export function crearDatum(config: ConfigDatum, fetchImpl: Fetch = fetch): Datum {
  const base = `${DATUM_BASE}/${encodeURIComponent(config.databaseId)}/rows`;
  const autorizacion = cabeceraBasic(config.clientId, config.clientSecret);

  async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: autorizacion, Accept: "application/json" };
    const init: RequestInit = { method: metodo, headers };
    if (cuerpo !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }
    const resp = await fetchImpl(`${base}${ruta}`, init);
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new DatumHttpError(resp.status, `Datum respondió ${resp.status} a ${metodo} /rows${ruta}`);
    }
    return await resp.json();
  }

  const idEnRuta = (rowId: string) => `/${encodeURIComponent(rowId)}`;

  return {
    async listar(limit, page) {
      const cuerpo = await pedir("GET", `?limit=${limit}&page=${page}`) as unknown;
      const filas = Array.isArray(cuerpo)
        ? cuerpo
        : ((cuerpo as Record<string, unknown>)?.data ?? (cuerpo as Record<string, unknown>)?.rows ?? []);
      return (filas as unknown[]).map(normalizar);
    },
    async crear(fields) {
      return normalizar(await pedir("POST", "", { fields }));
    },
    async actualizar(rowId, fields) {
      await pedir("PUT", idEnRuta(rowId), { fields });
      return { _id: rowId, fields }; // GAP-09: la forma de la respuesta del PUT no está confirmada; no se depende de ella
    },
    async leer(rowId) { // GAP-09
      return normalizar(await pedir("GET", idEnRuta(rowId)));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Write-then-verify de vuelos.mapa_asientos (EC-17).
//
// Datum no ofrece transacciones ni compare-and-set (GAP-08): el mapa es un único JSON por vuelo y
// cada cambio es leer-modificar-escribir. Por intento: leer fila -> `mutar(mapa)` -> PUT con
// `version + 1` -> releer -> `verificar(mapa)` (los asientos llevan MI hold_token o MI pnr) y
// `version` releída === la escrita. Si otro escritor pisó el mapa, la relectura no coincide y se
// reintenta desde la lectura (mutar corre otra vez sobre el mapa fresco; si el asiento ya no está
// libre, `mutar` lanza y el error se propaga como regla de negocio, no como 503).
//
// Sin efecto parcial: el PUT reemplaza el mapa completo en una sola escritura, así que no existe
// un estado "a medias" dentro del vuelo. Si se agotan los intentos: (1) si el mapa releído aún
// contiene mis marcas, se invoca `deshacer` (reversión best-effort, un PUT más con version + 1);
// (2) si no hay `deshacer` o falla, un hold queda con `hold_expira` y por RN-08 vale LIBRE al
// vencer. Luego se lanza DatumNoDisponible (503) y el agente no recibe hold_token ni pnr.

export const INTENTOS = 3;
export const BACKOFF_BASE_MS = 200; // 200 ms, 400 ms entre intentos (sin espera tras el último)

export interface OpcionesEscritura {
  vueloRowId: string;
  mutar: (mapa: MapaAsientos) => MapaAsientos;
  verificar: (mapa: MapaAsientos) => boolean;
  deshacer?: (mapa: MapaAsientos) => MapaAsientos;
  sleep?: Sleep;
}

const dormir: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extraerMapa(fila: Fila): { mapa: MapaAsientos; version: number } {
  const bruto = fila.fields.mapa_asientos;
  const mapa = (typeof bruto === "string" ? JSON.parse(bruto) : bruto) as MapaAsientos | undefined;
  const version = Number(fila.fields.version);
  if (!mapa || typeof mapa !== "object" || !Number.isInteger(version)) {
    throw new DatumHttpError(502, "Fila de vuelo sin mapa_asientos o version válidos");
  }
  return { mapa, version };
}

async function escribirYReleer(datum: Datum, rowId: string, mapa: MapaAsientos, version: number) {
  await datum.actualizar(rowId, { mapa_asientos: mapa, version });
  return extraerMapa(await datum.leer(rowId));
}

// Idempotencia: la verificación por hold_token/pnr propio hace seguro repetir el intento; un
// reintento tras un PUT que sí se aplicó reescribe el mismo contenido lógico.
export async function escribirMapaVerificado(datum: Datum, op: OpcionesEscritura): Promise<MapaAsientos> {
  const sleep = op.sleep ?? dormir;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const actual = extraerMapa(await datum.leer(op.vueloRowId));
      const nuevaVersion = actual.version + 1;
      const releido = await escribirYReleer(datum, op.vueloRowId, op.mutar(actual.mapa), nuevaVersion);
      if (releido.version === nuevaVersion && op.verificar(releido.mapa)) return releido.mapa;
    } catch (e) {
      // Errores de Datum (HTTP, red, formato) cuentan como intento fallido; los de negocio (de `mutar`) suben.
      if (!(e instanceof DatumHttpError) && !(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
    }
    if (intento < INTENTOS) await sleep(BACKOFF_BASE_MS * 2 ** (intento - 1));
  }
  await revertirSiPosible(datum, op);
  throw new DatumNoDisponible("No se pudo verificar la escritura del mapa de asientos tras 3 intentos");
}

async function revertirSiPosible(datum: Datum, op: OpcionesEscritura): Promise<void> {
  if (!op.deshacer) return;
  try {
    const actual = extraerMapa(await datum.leer(op.vueloRowId));
    if (!op.verificar(actual.mapa)) return; // mis marcas no están: nada que revertir
    await datum.actualizar(op.vueloRowId, { mapa_asientos: op.deshacer(actual.mapa), version: actual.version + 1 });
  } catch {
    // Best-effort: si falla, el hold vence por hold_expira (RN-08).
  }
}
