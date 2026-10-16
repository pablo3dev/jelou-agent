import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "equipaje-calcular",
  description: "Calcula peso volumétrico, kilos cobrables y precio en COP de una pieza de equipaje de bodega para un vuelo",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Calculando equipaje", sanitizarParaLog(input));
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await ejecutar(input, { datum });
  },
});
