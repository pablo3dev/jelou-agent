import { define } from "@jelou/functions";
import { configDesdeEntorno, crearDatum } from "../lib/datum.ts";
import { adaptarVerificacion, ejecutar, entrada, salida } from "./logica.ts";

// CONFIRMADO (spike, @jelou/functions 1.5.0): el handler recibe `(input, ctx, request)`; `ctx.request` NO existe.
// `ctx.verifyHmac(request, { secretEnv, header, prefix })` devuelve `undefined` si la firma es válida y LANZA
// `WebhookVerificationError` si no lo es. `adaptarVerificacion` lo convierte en booleano: no lanzó => true;
// cualquier excepción => false (firma inválida => 401).
// Crear el cliente Datum solo lee variables de entorno (no toca datos); la firma se verifica en `ejecutar` antes de cualquier I/O.
// Nunca se registra el cuerpo, las cabeceras, PAY_WEBHOOK_SECRET ni JELOU_API_KEY.
export default define({
  name: "pago-notificacion",
  description: "Recibe la notificación de pago de la pasarela (pública, firmada con HMAC) y aplica aprobación, rechazo o expiración",
  config: { path: "/pago-notificacion", methods: ["POST"], public: true },
  input: entrada,
  output: salida,
  handler: async (input, ctx, request) => {
    const apiKey = ctx.env.get("JELOU_API_KEY");
    if (!apiKey) throw new Error("Falta la variable de entorno JELOU_API_KEY");
    const datum = crearDatum(configDesdeEntorno((n) => ctx.env.get(n)));
    const firmaValida = () =>
      adaptarVerificacion(() =>
        ctx.verifyHmac(request, { secretEnv: "PAY_WEBHOOK_SECRET", header: "x-webhook-signature", prefix: "sha256=" })
      );
    return await ejecutar(input, { datum, ahora: () => new Date(), firmaValida, apiKey, log: ctx.log });
  },
});
