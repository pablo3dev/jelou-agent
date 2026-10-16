import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { sanitizarParaLog } from "../lib/enmascarar.ts";
import { conErroresHttp } from "../lib/http.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

export default define({
  name: "transaccion-crear",
  description: "Crea la reserva pendiente de pago y su transacción; devuelve PNR, total, vencimiento y enlace de pago",
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    ctx.log("Creando reserva y transacción", sanitizarParaLog({ ...input, hold_token: undefined }));
    const payPublicUrl = ctx.env.get("PAY_PUBLIC_URL");
    if (!payPublicUrl) throw new Error("Falta la variable de entorno PAY_PUBLIC_URL");
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    return await conErroresHttp(() => ejecutar(input, { datum, ahora: () => new Date(), payPublicUrl }));
  },
});
