// Error de regla de negocio o de entrada semánticamente inválida: la function lo responde como HTTP 400
// con la lista de motivos (contrato: "Errores comunes de salida"). Los fallos de Datum son DatumNoDisponible (503).
// Contrato asientos-validar-retener: 400 `{ error: "Asientos inválidos", asientos_invalidos }`.
export class ErrorAsientos extends Error {
  readonly status = 400;
  readonly error = "Asientos inválidos";
  constructor(readonly asientos_invalidos: string[], readonly motivos: string[]) {
    super("Asientos inválidos");
    this.name = "ErrorAsientos";
  }
}

export class ErrorNegocio extends Error {
  readonly status = 400;
  constructor(mensaje: string, readonly motivos: string[] = [mensaje]) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}
