export const DEFAULT_DATUM_BASE_URL = 'https://api.jelou.ai/v2';

export class DatumError extends Error {}

// Cliente mínimo de solo lectura de Datum (contrato: "Lectura de la transacción por id").
// Los secretos se leen solo de `env`; `fetchFn` es inyectable para las pruebas.
export function createDatumClient({ env = process.env, fetchFn = fetch } = {}) {
  // Lectura pura: un GET por id es naturalmente idempotente.
  async function getRow(rowId) {
    const { JELOU_CLIENT_ID, JELOU_CLIENT_SECRET, DATABASE_ID } = env;
    if (!JELOU_CLIENT_ID || !JELOU_CLIENT_SECRET || !DATABASE_ID) {
      throw new DatumError('Datum no configurado');
    }
    const base = (env.DATUM_BASE_URL || DEFAULT_DATUM_BASE_URL).replace(/\/+$/, '');
    const url = `${base}/databases/${encodeURIComponent(DATABASE_ID)}/rows/${encodeURIComponent(rowId)}`;
    const basic = Buffer.from(`${JELOU_CLIENT_ID}:${JELOU_CLIENT_SECRET}`).toString('base64');

    let res;
    try {
      res = await fetchFn(url, {
        method: 'GET',
        headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
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
    // SUPUESTO (GAP-09): envoltorio `fields` o campos planos; se confirma en el spike 3.1.
    const row = body?.fields ?? body;
    if (row === null || typeof row !== 'object') throw new DatumError('Respuesta de Datum inválida');
    return row;
  }

  return { getRow };
}
