import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "vuelos-buscar",
  description: "Busca vuelos de ida y, opcionalmente, de regreso (2026-12-01 a 2027-01-31) con asientos libres y tarifa por pasajero",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Buscando vuelos", sanitizarParaLog(input));
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await ejecutar(input, { datum, ahora: new Date() });
  },
});
