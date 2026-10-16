// adapter: out — Datum v2 (PocketBase), SOLO LECTURA.
//
// Este cliente no expone ningun metodo de escritura (REQ-11): solo `list` y `getById`, ambos GET
// (naturalmente idempotentes). Los secretos se leen unicamente del entorno; nunca se registran.
//
// Contrato (contract/endpoints.md, spike 3.1): base `DATUM_URL` (https://<slug>.jelou.cloud/api),
// auth solo con la cabecera `X-Api-Key: DATUM_API_KEY`, coleccion en
// `GET {DATUM_URL}/collections/{coleccion}/records` con respuesta `{items, page, perPage, totalPages,
// totalItems}`, registro plano `{id, collectionId, collectionName, created, updated, ...campos}`.
// Las fechas `date` llegan como `2026-12-01 00:00:00.000Z` (espacio): se normalizan a ISO con `T`.

export const DEFAULT_TTL_MS = 10_000;
const PER_PAGE = 100;
const MAX_PAGES = 200;
const TIMEOUT_MS = 8000;
const META = new Set(['collectionId', 'collectionName', 'created', 'updated', 'expand']);
const FECHA_CON_ESPACIO = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/;

export class DatumNoConfigurado extends Error {}
export class DatumError extends Error {}

export const normalizarFecha = (v) => {
  if (typeof v !== 'string') return v;
  const m = FECHA_CON_ESPACIO.exec(v);
  return m ? `${m[1]}T${m[2]}` : v;
};

// Fila normalizada: campos del dominio + `id` (id fisico de Datum) + `_id` (alias de `id`).
// Sin metadatos de PocketBase y con las fechas en ISO.
export function normalizeRow(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new DatumError('Fila de Datum invalida');
  const fila = {};
  for (const [k, v] of Object.entries(raw)) if (!META.has(k)) fila[k] = normalizarFecha(v);
  fila._id = fila.id;
  return fila;
}

export function createDatumClient({ env = process.env, fetchFn = fetch } = {}) {
  const cache = new Map(); // coleccion -> { at, promise }

  function config() {
    const { DATUM_URL, DATUM_API_KEY } = env;
    if (!DATUM_URL || !DATUM_API_KEY) throw new DatumNoConfigurado('Datum no configurado');
    return {
      base: DATUM_URL.replace(/\/+$/, ''),
      headers: { 'X-Api-Key': DATUM_API_KEY, Accept: 'application/json' },
    };
  }

  const ttlMs = () => {
    const n = Number(env.CRM_CACHE_TTL_MS);
    return env.CRM_CACHE_TTL_MS !== undefined && env.CRM_CACHE_TTL_MS !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
  };

  const registros = (base, coleccion) => `${base}/collections/${encodeURIComponent(coleccion)}/records`;

  // Unico punto de red: siempre GET. Los errores no incluyen cabeceras ni cuerpo.
  async function get(url, headers) {
    let res;
    try {
      res = await fetchFn(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new DatumError('Datum no disponible');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new DatumError(`Datum respondio ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new DatumError('Respuesta de Datum no es JSON');
    }
  }

  async function fetchAll(coleccion) {
    const { base, headers } = config();
    const todas = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await get(`${registros(base, coleccion)}?page=${page}&perPage=${PER_PAGE}`, headers);
      if (body === null) throw new DatumError('Coleccion de Datum no encontrada');
      if (!Array.isArray(body?.items)) throw new DatumError('Respuesta de Datum invalida');
      todas.push(...body.items.map(normalizeRow));
      const totalPages = Number(body.totalPages);
      if (body.items.length === 0 || !Number.isFinite(totalPages) || page >= totalPages) break;
    }
    return todas;
  }

  return {
    // Lista completa de una coleccion (todas las paginas), con cache breve en memoria.
    async list(coleccion) {
      config(); // sin configuracion falla antes de tocar la cache
      const hit = cache.get(coleccion);
      if (hit && Date.now() - hit.at < ttlMs()) return hit.promise;
      const promise = fetchAll(coleccion);
      cache.set(coleccion, { at: Date.now(), promise });
      try {
        return await promise;
      } catch (e) {
        cache.delete(coleccion);
        throw e;
      }
    },

    async getById(coleccion, id) {
      const { base, headers } = config();
      const body = await get(`${registros(base, coleccion)}/${encodeURIComponent(id)}`, headers);
      return body === null ? null : normalizeRow(body);
    },
  };
}
