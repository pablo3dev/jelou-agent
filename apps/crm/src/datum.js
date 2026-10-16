// adapter: out — Datum REST (api.jelou.ai/v2), SOLO LECTURA.
//
// Este cliente no expone ningun metodo de escritura (REQ-11): solo `list` y `getById`, ambos GET
// (naturalmente idempotentes). Los secretos se leen unicamente del entorno; nunca se registran.
//
// SUPUESTOS (learning.md §5.1, GAP-09 / GAP-12): la coleccion se direcciona con el parametro de
// consulta `collection=<nombre>`; la respuesta de lista es un arreglo o un objeto con arreglo en
// `data` o `rows`; cada fila es `{ _id, fields }` o campos planos con `_id`/`id`.

export const DEFAULT_DATUM_BASE_URL = 'https://api.jelou.ai/v2';
export const DEFAULT_TTL_MS = 10_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const TIMEOUT_MS = 5000;

export class DatumNoConfigurado extends Error {}
export class DatumError extends Error {}

// Fila normalizada: campos planos + `_id` (de Datum) + `id` (campo de dominio, o `_id` si no existe).
export function normalizeRow(raw) {
  if (raw === null || typeof raw !== 'object') throw new DatumError('Fila de Datum invalida');
  const { _id, id, fields, ...planos } = raw;
  const campos = fields !== null && typeof fields === 'object' ? fields : planos;
  const rowId = _id ?? id ?? campos.id;
  return { ...campos, _id: rowId, id: campos.id ?? rowId };
}

export function createDatumClient({ env = process.env, fetchFn = fetch } = {}) {
  const cache = new Map(); // coleccion -> { at, promise }

  function config() {
    const { JELOU_CLIENT_ID, JELOU_CLIENT_SECRET, DATABASE_ID } = env;
    if (!JELOU_CLIENT_ID || !JELOU_CLIENT_SECRET || !DATABASE_ID) throw new DatumNoConfigurado('Datum no configurado');
    const base = (env.DATUM_BASE_URL || DEFAULT_DATUM_BASE_URL).replace(/\/+$/, '');
    return {
      rows: `${base}/databases/${encodeURIComponent(DATABASE_ID)}/rows`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${JELOU_CLIENT_ID}:${JELOU_CLIENT_SECRET}`).toString('base64')}`,
        Accept: 'application/json',
      },
    };
  }

  const ttlMs = () => {
    const n = Number(env.CRM_CACHE_TTL_MS);
    return env.CRM_CACHE_TTL_MS !== undefined && env.CRM_CACHE_TTL_MS !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
  };

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
    const { rows, headers } = config();
    const todas = [];
    let primeraAnterior;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${rows}?collection=${encodeURIComponent(coleccion)}&limit=${PAGE_SIZE}&page=${page}`;
      const body = await get(url, headers);
      const filas = Array.isArray(body) ? body : (body?.data ?? body?.rows ?? []);
      if (!Array.isArray(filas)) throw new DatumError('Respuesta de Datum invalida');
      if (filas.length === 0) break;
      const normalizadas = filas.map(normalizeRow);
      // Defensa: si la API ignora `page` y repite la misma pagina, se corta.
      if (page > 1 && normalizadas[0]._id === primeraAnterior) break;
      primeraAnterior = normalizadas[0]._id;
      todas.push(...normalizadas);
      if (filas.length < PAGE_SIZE) break;
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

    async getById(rowId) {
      const { rows, headers } = config();
      const body = await get(`${rows}/${encodeURIComponent(rowId)}`, headers);
      return body === null ? null : normalizeRow(body);
    },
  };
}
