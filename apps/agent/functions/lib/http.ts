import { DatumNoDisponible } from "./datum.ts";
import { ErrorAsientos, ErrorNegocio, FirmaInvalida } from "./errores.ts";

// La plataforma convierte cualquier excepción del handler en 500 {"error":"Internal function error"} y no respeta
// `error.status`; por eso los errores esperados del contrato se devuelven como respuesta con su status.
export interface RespuestaError {
  status: number;
  cuerpo: Record<string, unknown>;
}

// Pura (sin SDK): excepción -> respuesta del contrato, o null si es inesperada (se relanza => 500).
// Los cuerpos solo llevan mensajes/motivos propios de negocio; nunca la causa técnica ni datos de Datum.
export function mapearError(e: unknown): RespuestaError | null {
  if (e instanceof ErrorAsientos) {
    return { status: 400, cuerpo: { error: e.error, asientos_invalidos: e.asientos_invalidos } };
  }
  if (e instanceof ErrorNegocio) return { status: 400, cuerpo: { error: e.message, motivos: e.motivos } };
  if (e instanceof DatumNoDisponible) return { status: 503, cuerpo: { error: e.message } };
  if (e instanceof FirmaInvalida) return { status: 401, cuerpo: { error: "Firma inválida" } };
  return null;
}

// Envoltorio fino. Se usa `Response` nativa (el runtime 1.5.0 la devuelve tal cual, normalizeHandlerResult/rawResponse)
// y así no pasa por validateOutput, que con el builder `response.json` registraría un warning por cada error.
export async function conErroresHttp<O>(fn: () => Promise<O>): Promise<O | Response> {
  try {
    return await fn();
  } catch (e) {
    const r = mapearError(e);
    if (!r) throw e;
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { "content-type": "application/json" } });
  }
}
