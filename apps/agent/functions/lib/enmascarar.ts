// Enmascarado de documentos (cédula/pasaporte) para `ctx.log`: el documento es PII y nunca se registra completo.

// Deja visibles solo los 2 últimos caracteres; los documentos de 4 o menos caracteres se ocultan por completo.
export function enmascarar(documento: string): string {
  const d = String(documento);
  if (d.length <= 4) return "*".repeat(4);
  return "*".repeat(d.length - 2) + d.slice(-2);
}

const CLAVES_DOCUMENTO = new Set(["documento", "cedula", "pasaporte"]);

// Copia profunda de `valor` con las claves de documento enmascaradas; para registrar entradas completas.
export function sanitizarParaLog(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizarParaLog);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [
        k,
        CLAVES_DOCUMENTO.has(k.toLowerCase()) && v !== null && v !== undefined ? enmascarar(String(v)) : sanitizarParaLog(v),
      ]),
    );
  }
  return valor;
}
