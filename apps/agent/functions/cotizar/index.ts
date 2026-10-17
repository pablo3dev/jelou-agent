import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { conErroresHttp } from "../lib/http.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "cotizar",
  description: "Cotiza pasajes, equipaje de bodega y mascota de una reserva; devuelve las líneas y el total en COP",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Cotizando reserva", sanitizarParaLog(input));
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await conErroresHttp(() => ejecutar(input, { datum }));
  },
});
