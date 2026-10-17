import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { enmascarar, sanitizarParaLog } from "./enmascarar.ts";

Deno.test("enmascarar deja visibles solo los 2 últimos caracteres", () => {
  assertEquals(enmascarar("1012345678"), "********78");
  assertEquals(enmascarar("AB123456"), "******56");
});

Deno.test("enmascarar oculta por completo los documentos cortos", () => {
  assertEquals(enmascarar("123"), "****");
  assertEquals(enmascarar("1234"), "****");
});

Deno.test("sanitizarParaLog enmascara documento, cedula y pasaporte en cualquier nivel", () => {
  const entrada = {
    vuelo_ida_id: "v1",
    pasajeros: [{ nombre: "Ana", documento: "1012345678", edad: 30 }],
    titular: { cedula: "99887766", pasaporte: "PA1234567" },
  };
  const s = sanitizarParaLog(entrada) as typeof entrada;
  assertEquals(s.pasajeros[0].documento, "********78");
  assertEquals(s.titular.cedula, "******66");
  assertEquals(s.titular.pasaporte, "*******67");
  assertEquals(s.pasajeros[0].nombre, "Ana");
  assertNotEquals(JSON.stringify(s).includes("1012345678"), true);
  assertEquals(entrada.pasajeros[0].documento, "1012345678"); // no muta el original
});
