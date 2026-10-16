import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { DatumHttpError, DatumNoDisponible } from "./datum.ts";
import { ErrorAsientos, ErrorNegocio, FirmaInvalida } from "./errores.ts";
import { conErroresHttp, mapearError } from "./http.ts";

Deno.test("mapearError: ErrorAsientos => 400 con asientos_invalidos", () => {
  assertEquals(mapearError(new ErrorAsientos(["99Z"], ["no existe"])), {
    status: 400,
    cuerpo: { error: "Asientos inválidos", asientos_invalidos: ["99Z"] },
  });
});

Deno.test("mapearError: ErrorNegocio => 400 con motivos", () => {
  assertEquals(mapearError(new ErrorNegocio("Reserva no cotizable", ["a", "b"])), {
    status: 400,
    cuerpo: { error: "Reserva no cotizable", motivos: ["a", "b"] },
  });
  assertEquals(mapearError(new ErrorNegocio("x"))?.cuerpo, { error: "x", motivos: ["x"] });
});

Deno.test("mapearError: DatumNoDisponible => 503 sin datos sensibles", () => {
  const e = new DatumNoDisponible("Datum no disponible");
  (e as unknown as { cause: unknown }).cause = new Error("Bearer secreto-123 https://interno/x");
  const r = mapearError(e)!;
  assertEquals(r.status, 503);
  assertEquals(r.cuerpo, { error: "Datum no disponible" });
  assertEquals(JSON.stringify(r.cuerpo).includes("secreto"), false);
});

Deno.test("mapearError: FirmaInvalida => 401", () => {
  assertEquals(mapearError(new FirmaInvalida()), { status: 401, cuerpo: { error: "Firma inválida" } });
});

Deno.test("mapearError: errores inesperados => null", () => {
  assertEquals(mapearError(new Error("boom")), null);
  assertEquals(mapearError(new DatumHttpError(500, "GET /x 500")), null);
  assertEquals(mapearError("texto"), null);
});

Deno.test("conErroresHttp: devuelve el resultado, responde errores del contrato y relanza el resto", async () => {
  assertEquals(await conErroresHttp(() => Promise.resolve({ ok: 1 })), { ok: 1 });
  const r = await conErroresHttp(() => Promise.reject(new FirmaInvalida())) as Response;
  assertEquals(r.status, 401);
  assertEquals(r.headers.get("content-type"), "application/json");
  assertEquals(await r.json(), { error: "Firma inválida" });
  await assertRejects(() => conErroresHttp(() => Promise.reject(new Error("boom"))), Error, "boom");
});
