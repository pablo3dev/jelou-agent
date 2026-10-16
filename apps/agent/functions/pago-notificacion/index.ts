import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { ejecutar, entrada, salida } from "./logica.ts";

// SUPUESTOS (se confirman en el spike 3.1): el handler recibe la petición cruda en `ctx.request` y `ctx.verifyHmac`
// devuelve `true` solo si la firma es válida. Se exige `=== true` y cualquier excepción cuenta como inválida: ante la duda, 401.
// Crear el cliente Datum solo lee variables de entorno (no toca datos); la firma se verifica en `ejecutar` antes de cualquier I/O.
// Nunca se registra el cuerpo, las cabeceras, PAY_WEBHOOK_SECRET ni JELOU_API_KEY.
export default define({
  name: "pago-notificacion",
  description: "Recibe la notificación de pago de la pasarela (pública, firmada con HMAC) y aplica aprobación, rechazo o expiración",
  config: { path: "/pago-notificacion", methods: ["POST"], public: true },
  input: entrada,
  output: salida,
  handler: async (input, ctx) => {
    const apiKey = ctx.env.get("JELOU_API_KEY");
    if (!apiKey) throw new Error("Falta la variable de entorno JELOU_API_KEY");
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    const firmaValida = async () => {
      try {
        return (await ctx.verifyHmac(ctx.request, { secretEnv: "PAY_WEBHOOK_SECRET", header: "x-webhook-signature" })) === true;
      } catch {
        return false;
      }
    };
    return await ejecutar(input, { datum, ahora: () => new Date(), firmaValida, apiKey, log: ctx.log });
  },
});
