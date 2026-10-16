import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "asientos-validar-retener",
  description: "Valida los asientos elegidos y los retiene 15 minutos; devuelve hold_token (opaco) y hold_expira",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Validando y reteniendo asientos", sanitizarParaLog(input));
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await ejecutar(input, { datum, ahora: () => new Date(), nuevoToken: () => crypto.randomUUID() });
  },
});
