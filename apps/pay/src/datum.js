export class DatumError extends Error {}

// Fechas `date` de Datum v2 (PocketBase): "2026-12-01 00:00:00.000Z" -> ISO con "T".
const FECHA_DATUM = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;

function normalizar(registro) {
  const salida = {};
  for (const [k, v] of Object.entries(registro)) {
    salida[k] = typeof v === 'string' ? v.replace(FECHA_DATUM, '$1T$2') : v;
  }
  return salida;
}

// Cliente mínimo de solo lectura de Datum v2 (contrato: endpoints.md, "Acceso a Datum v2").
// Los secretos se leen solo de `env` y nunca se incluyen en errores; `fetchFn` es inyectable.
export function createDatumClient({ env = process.env, fetchFn = fetch } = {}) {
  // Lectura pura: un GET por id es naturalmente idempotente.
  async function getRecord(coleccion, id) {
    const { DATUM_URL, DATUM_API_KEY } = env;
    if (!DATUM_URL || !DATUM_API_KEY) throw new DatumError('Datum no configurado');
    const base = DATUM_URL.replace(/\/+$/, '');
    const url = `${base}/collections/${encodeURIComponent(coleccion)}/records/${encodeURIComponent(id)}`;

    let res;
    try {
      res = await fetchFn(url, {
        method: 'GET',
        headers: { 'X-Api-Key': DATUM_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new DatumError('Datum no disponible');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new DatumError(`Datum respondió ${res.status}`);

    let body;
    try {
      body = await res.json();
    } catch {
      throw new DatumError('Respuesta de Datum no es JSON');
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new DatumError('Respuesta de Datum inválida');
    }
    return normalizar(body);
  }

  return { getRecord };
}
