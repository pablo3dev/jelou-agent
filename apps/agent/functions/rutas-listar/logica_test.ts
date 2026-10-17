import { assertEquals } from "jsr:@std/assert@1";
import { datumSimulado, filasCatalogo } from "../lib/datum_simulado.ts";
import { ejecutar, entrada } from "./logica.ts";

Deno.test("entrada acepta objeto vacío", () => {
  assertEquals(entrada.safeParse({}).success, true);
});

Deno.test("lista las rutas con su tarifa base", async () => {
  const r = await ejecutar({}, { datum: datumSimulado(filasCatalogo()) });
  assertEquals(r.rutas, [
    { id: "BOG-MDE", origen: "BOG", destino: "MDE", tarifa_base_cop: 200000 },
    { id: "MDE-BOG", origen: "MDE", destino: "BOG", tarifa_base_cop: 210000 },
  ]);
});
