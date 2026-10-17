import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { datumSimulado, filasCatalogo } from "../lib/datum_simulado.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { ejecutar, entrada } from "./logica.ts";

const dep = () => ({ datum: datumSimulado(filasCatalogo()) });
const pieza = { largo_cm: 50, ancho_cm: 40, alto_cm: 30, peso_kg: 10 }; // volumétrico 10 kg

Deno.test("entrada: rechaza peso > 32 kg, L+A+H > 158 y medidas no positivas", () => {
  const ok = { vuelo_id: "v-ida-dic", bodega: pieza };
  assertEquals(entrada.safeParse(ok).success, true);
  assertEquals(entrada.safeParse({ ...ok, bodega: { ...pieza, peso_kg: 33 } }).success, false);
  assertEquals(entrada.safeParse({ ...ok, bodega: { ...pieza, largo_cm: 80, ancho_cm: 40, alto_cm: 39 } }).success, false);
  assertEquals(entrada.safeParse({ ...ok, bodega: { ...pieza, alto_cm: 0 } }).success, false);
  assertEquals(entrada.safeParse({ bodega: pieza }).success, false);
});

Deno.test("entrada: acepta los límites exactos (158 cm y 32 kg)", () => {
  const b = { largo_cm: 100, ancho_cm: 30, alto_cm: 28, peso_kg: 32 };
  assertEquals(entrada.safeParse({ vuelo_id: "v", bodega: b }).success, true);
});

Deno.test("temporada alta (diciembre): 10 kg cobrables -> 120000 x 1.30 = 156000", async () => {
  const r = await ejecutar({ vuelo_id: "v-ida-dic", bodega: pieza }, dep());
  assertEquals(r, { peso_volumetrico_kg: 10, cobrable_kg: 10, precio_cop: 156000 });
});

Deno.test("cargo mínimo 40000 x temporada cuando el peso es bajo", async () => {
  const r = await ejecutar({ vuelo_id: "v-ida-dic", bodega: { largo_cm: 30, ancho_cm: 30, alto_cm: 30, peso_kg: 2 } }, dep());
  assertEquals(r.cobrable_kg, 5); // ceil(max(2, 4.5))
  assertEquals(r.precio_cop, 78000); // 5 x 12000 = 60000 > 40000; x1.30
  const m = await ejecutar({ vuelo_id: "v-ida-dic", bodega: { largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 2 } }, dep());
  assertEquals(m.precio_cop, 52000); // 40000 x 1.30
});

Deno.test("el volumétrico mayor que el real manda en kilos cobrables", async () => {
  const r = await ejecutar({ vuelo_id: "v-ida-dic", bodega: { largo_cm: 80, ancho_cm: 50, alto_cm: 28, peso_kg: 5 } }, dep());
  assertEquals(r.cobrable_kg, 19); // 112000/6000 = 18.67 -> 19
});

Deno.test("vuelo inexistente -> ErrorNegocio (400)", async () => {
  await assertRejects(() => ejecutar({ vuelo_id: "nope", bodega: pieza }, dep()), ErrorNegocio, "Vuelo no encontrado");
});
