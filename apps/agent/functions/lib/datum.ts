// adapter: out — Datum v2 (PocketBase) por colección + write-then-verify de vuelos.mapa_asientos.
//
// Contrato verificado contra Datum real:
// - Base `DATUM_URL` = `https://<slug>.jelou.cloud/api`; autenticación con la cabecera `X-Api-Key`.
// - `GET|POST {url}/collections/{coleccion}/records` y `GET|PATCH {url}/collections/{coleccion}/records/{id}`
//   (PATCH fusiona campos; PUT no existe). Listado `?page=&perPage=&filter=&sort=&fields=` => `{items,page,perPage,totalItems,totalPages}`.
// - Registro plano `{id, collectionId, collectionName, created, updated, ...campos}`; se normaliza a `Fila` sin esos metadatos.
// - Las fechas `date` llegan como "2026-12-01 00:00:00.000Z" y se normalizan a ISO ("T").
// - Inexistente => 404. POST con `id` repetido => 400 con `data.id.code = validation_not_unique` (escritura atómica).
// - No hay compare-and-set: se mantiene write-then-verify con `version`.
//
// Este módulo nunca escribe logs ni incluye cabeceras, cuerpos ni claves en los mensajes de error.

import type { MapaAsientos } from "./asientos.ts";

export type Fetch = typeof fetch;
export type Sleep = (ms: number) => Promise<void>;

export interface Fila {
  _id: string;
  fields: Record<string, unknown>;
  updated?: string;
}

export interface ConfigDatum {
  url: string;
  apiKey: string;
}

export interface OpcionesListado {
  filter?: string;
  sort?: string;
  fields?: string;
}

// Error de servicio: las functions lo responden como HTTP 503 (EC-17), sin efecto parcial visible.
export class DatumNoDisponible extends Error {
  readonly status = 503;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DatumNoDisponible";
  }
}

// Respuesta no 2xx de Datum. El mensaje solo lleva método, ruta y código HTTP: nunca cabeceras ni cuerpo.
// `codigo` es lo único que se conserva del cuerpo de error (`data.id.code`, p. ej. "validation_not_unique").
export class DatumHttpError extends Error {
  constructor(readonly httpStatus: number, mensaje: string, readonly codigo?: string) {
    super(mensaje);
    this.name = "DatumHttpError";
  }
}

// Clave `id` repetida en un POST (la creación atómica con id determinista fue ganada por otro).
export function esDuplicado(e: unknown): boolean {
  return e instanceof DatumHttpError && e.httpStatus === 400 && e.codigo === "validation_not_unique";
}

// `getEnv` es `ctx.env.get` en una function (o `Deno.env.get` en pruebas). Nunca hay valores en código.
export function configDesdeEntorno(getEnv: (nombre: string) => string | undefined): ConfigDatum {
  const leer = (nombre: string): string => {
    const v = getEnv(nombre);
    if (v === undefined || v === "") throw new Error(`Falta la variable de entorno ${nombre}`);
    return v;
  };
  return { url: leer("DATUM_URL"), apiKey: leer("DATUM_API_KEY") };
}

// Literal de cadena para filtros PocketBase: comillas dobles, con `"` y `\` escapados (evita inyección de filtro).
export function literalFiltro(valor: string): string {
  return `"${valor.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

const FECHA_PB = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const METADATOS = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);

const aIso = (v: unknown) => (typeof v === "string" && FECHA_PB.test(v) ? v.replace(" ", "T") : v);

function normalizar(crudo: unknown): Fila {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const _id = String(r.id ?? "");
  if (_id === "") throw new DatumHttpError(502, "Respuesta de Datum sin id de registro");
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!METADATOS.has(k)) fields[k] = aIso(v);
  const fila: Fila = { _id, fields };
  if (typeof r.updated === "string") fila.updated = aIso(r.updated) as string;
  return fila;
}

export interface Datum {
  listar(coleccion: string, opc?: OpcionesListado): Promise<Fila[]>;
  leer(coleccion: string, id: string): Promise<Fila>;
  crear(coleccion: string, fields: Record<string, unknown>, id?: string): Promise<Fila>;
  actualizar(coleccion: string, id: string, fields: Record<string, unknown>): Promise<Fila>;
}

const POR_PAGINA = 200;
const MAX_PAGINAS = 100;

// Código de validación del cuerpo de error de Datum (`data.id.code`); nada más del cuerpo se conserva.
async function codigoDeError(resp: Response): Promise<string | undefined> {
  try {
    const cuerpo = await resp.json() as { data?: { id?: { code?: unknown } } };
    const codigo = cuerpo?.data?.id?.code;
    return typeof codigo === "string" ? codigo : undefined;
  } catch {
    return undefined;
  }
}

export function crearDatum(config: ConfigDatum, fetchImpl: Fetch = fetch): Datum {
  const base = config.url.replace(/\/+$/, "");

  async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" };
    const init: RequestInit = { method: metodo, headers };
    if (cuerpo !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }
    const resp = await fetchImpl(`${base}${ruta}`, init);
    if (!resp.ok) {
      const codigo = await codigoDeError(resp);
      throw new DatumHttpError(resp.status, `Datum respondió ${resp.status} a ${metodo} ${ruta.split("?")[0]}`, codigo);
    }
    return await resp.json();
  }

  const rutaColeccion = (coleccion: string) => `/collections/${encodeURIComponent(coleccion)}/records`;
  const rutaRegistro = (coleccion: string, id: string) => `${rutaColeccion(coleccion)}/${encodeURIComponent(id)}`;

  return {
    async listar(coleccion, opc = {}) {
      const filas: Fila[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const q = new URLSearchParams({ page: String(pagina), perPage: String(POR_PAGINA) });
        if (opc.filter) q.set("filter", opc.filter);
        if (opc.sort) q.set("sort", opc.sort);
        if (opc.fields) q.set("fields", opc.fields);
        const cuerpo = await pedir("GET", `${rutaColeccion(coleccion)}?${q}`) as {
          items?: unknown[];
          totalPages?: number;
        };
        const items = cuerpo?.items ?? [];
        filas.push(...items.map(normalizar));
        if (items.length === 0 || pagina >= Number(cuerpo?.totalPages ?? 0)) return filas;
      }
      throw new DatumHttpError(502, `Datum: la colección ${coleccion} excede ${MAX_PAGINAS} páginas`);
    },
    async leer(coleccion, id) {
      return normalizar(await pedir("GET", rutaRegistro(coleccion, id)));
    },
    async crear(coleccion, fields, id) {
      return normalizar(await pedir("POST", rutaColeccion(coleccion), id === undefined ? fields : { ...fields, id }));
    },
    async actualizar(coleccion, id, fields) {
      return normalizar(await pedir("PATCH", rutaRegistro(coleccion, id), fields));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Write-then-verify de vuelos.mapa_asientos (EC-17).
//
// Datum no ofrece transacciones ni compare-and-set (GAP-08): el mapa es un único JSON por vuelo y
// cada cambio es leer-modificar-escribir. Por intento: leer fila -> `mutar(mapa)` -> PATCH con
// `version + 1` -> releer -> `verificar(mapa)` (los asientos llevan MI hold_token o MI pnr) y
// `version` releída === la escrita. Si otro escritor pisó el mapa, la relectura no coincide y se
// reintenta desde la lectura (mutar corre otra vez sobre el mapa fresco; si el asiento ya no está
// libre, `mutar` lanza y el error se propaga como regla de negocio, no como 503).
//
// Sin efecto parcial: el PATCH reemplaza el campo mapa_asientos completo en una sola escritura, así que no existe
// un estado "a medias" dentro del vuelo. Si se agotan los intentos: (1) si el mapa releído aún
// contiene mis marcas, se invoca `deshacer` (reversión best-effort, un PATCH más con version + 1);
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
  await datum.actualizar("vuelos", rowId, { mapa_asientos: mapa, version });
  return extraerMapa(await datum.leer("vuelos", rowId));
}

// Idempotencia: la verificación por hold_token/pnr propio hace seguro repetir el intento; un
// reintento tras un PATCH que sí se aplicó reescribe el mismo contenido lógico.
export async function escribirMapaVerificado(datum: Datum, op: OpcionesEscritura): Promise<MapaAsientos> {
  const sleep = op.sleep ?? dormir;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const actual = extraerMapa(await datum.leer("vuelos", op.vueloRowId));
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
    const actual = extraerMapa(await datum.leer("vuelos", op.vueloRowId));
    if (!op.verificar(actual.mapa)) return; // mis marcas no están: nada que revertir
    await datum.actualizar("vuelos", op.vueloRowId, { mapa_asientos: op.deshacer(actual.mapa), version: actual.version + 1 });
  } catch {
    // Best-effort: si falla, el hold vence por hold_expira (RN-08).
  }
}
