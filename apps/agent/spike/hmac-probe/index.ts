// Probe del spike 3.1: verifica ctx.verifyHmac sobre el cuerpo crudo (GAP-13).
// `request` es el TERCER argumento del handler; ctx.request no existe.
import { app, define, z } from "@jelou/functions";

const hmacProbe = define({
  name: "hmac-probe",
  description: "Verifica la firma HMAC de la peticion y devuelve el resultado",
  config: { public: true },
  input: z.object({}).passthrough(),
  output: z.object({ ok: z.boolean(), code: z.string().optional() }),
  handler: async (_input, ctx, request) => {
    try {
      // Exito => undefined; fallo => lanza WebhookVerificationError.
      await ctx.verifyHmac(request, {
        secretEnv: "PAY_WEBHOOK_SECRET",
        header: "x-webhook-signature",
        prefix: "sha256=",
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? "error" };
    }
  },
});

export default app({ tools: [hmacProbe] });
