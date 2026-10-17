import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { conErroresHttp } from "../lib/http.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "rutas-listar",
  description: "Lista las rutas disponibles (origen, destino y tarifa base por pasajero y trayecto en COP)",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Listando rutas", sanitizarParaLog(input));
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await conErroresHttp(() => ejecutar(input, { datum }));
  },
});
