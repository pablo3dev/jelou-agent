// Error de regla de negocio o de entrada semánticamente inválida: la function lo responde como HTTP 400
// con la lista de motivos (contrato: "Errores comunes de salida"). Los fallos de Datum son DatumNoDisponible (503).
export class ErrorNegocio extends Error {
  readonly status = 400;
  constructor(mensaje: string, readonly motivos: string[] = [mensaje]) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}
