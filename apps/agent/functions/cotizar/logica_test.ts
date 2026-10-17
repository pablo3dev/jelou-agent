import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { datumSimulado, filasCatalogo } from "../lib/datum_simulado.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { ejecutar, entrada } from "./logica.ts";

const dep = () => ({ datum: datumSimulado(filasCatalogo()) });
const chica = { largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 2 }; // mínimo 40000 -> 52000 en dic

Deno.test("entrada: 1 a 9 pasajeros, mascota <= 8 kg, bodega dentro de límites", () => {
  const ok = { vuelo_ida_id: "a", pasajeros: [{ edad: 30 }] };
  assertEquals(entrada.safeParse(ok).success, true);
  assertEquals(entrada.safeParse({ ...ok, pasajeros: [] }).success, false);
  assertEquals(entrada.safeParse({ ...ok, pasajeros: Array(10).fill({ edad: 30 }) }).success, false);
  assertEquals(entrada.safeParse({ ...ok, mascota: { pasajero_indice: 0, especie: "perro", peso_kg: 9 } }).success, false);
  assertEquals(entrada.safeParse({ ...ok, pasajeros: [{ edad: 30, bodega_ida: { ...chica, peso_kg: 33 } }] }).success, false);
  assertEquals(entrada.safeParse({ pasajeros: [{ edad: 30 }] }).success, false);
});

Deno.test("solo ida, 2 pasajeros: suma de líneas con temporada de diciembre", async () => {
  const r = await ejecutar(entrada.parse({ vuelo_ida_id: "v-ida-dic", pasajeros: [{ edad: 30 }, { edad: 8 }] }), dep());
  assertEquals(r.lineas.map((l) => l.monto_cop), [260000, 260000]);
  assertEquals(r.total_cop, 520000);
});

Deno.test("ida y vuelta con equipaje y mascota: líneas por concepto y total", async () => {
  const r = await ejecutar(
    entrada.parse({
      vuelo_ida_id: "v-ida-dic",
      vuelo_regreso_id: "v-reg-dic",
      pasajeros: [{ edad: 30, bodega_ida: chica }, { edad: 12 }],
      mascota: { pasajero_indice: 1, especie: "perro", peso_kg: 6 },
    }),
    dep(),
  );
  assertEquals(r.lineas, [
    { concepto: "PASAJE", trayecto: "IDA", pasajero_indice: 0, monto_cop: 260000 },
    { concepto: "EQUIPAJE", trayecto: "IDA", pasajero_indice: 0, monto_cop: 52000 },
    { concepto: "PASAJE", trayecto: "REGRESO", pasajero_indice: 0, monto_cop: 273000 },
    { concepto: "PASAJE", trayecto: "IDA", pasajero_indice: 1, monto_cop: 260000 },
    { concepto: "PASAJE", trayecto: "REGRESO", pasajero_indice: 1, monto_cop: 273000 },
    { concepto: "MASCOTA", trayecto: "IDA", pasajero_indice: 1, monto_cop: 195000 },
  ]);
  assertEquals(r.total_cop, 1313000);
});

Deno.test("mascota de regreso: línea en REGRESO con la temporada del vuelo de regreso", async () => {
  const r = await ejecutar(
    entrada.parse({
      vuelo_ida_id: "v-ida-dic",
      vuelo_regreso_id: "v-reg-dic",
      pasajeros: [{ edad: 30 }],
      mascota: { pasajero_indice: 0, especie: "perro", peso_kg: 6, trayecto: "REGRESO" },
    }),
    dep(),
  );
  assertEquals(r.lineas.filter((l) => l.concepto === "MASCOTA").map((l) => l.trayecto), ["REGRESO"]);
});

Deno.test("el total es la suma de las líneas ya redondeadas (RN-07)", async () => {
  const r = await ejecutar(entrada.parse({ vuelo_ida_id: "v-ida-ene31", pasajeros: [{ edad: 30 }, { edad: 30 }, { edad: 30 }] }), dep());
  assertEquals(r.total_cop, r.lineas.reduce((a, l) => a + l.monto_cop, 0));
  assertEquals(r.total_cop, 780000);
});

Deno.test("reglas de negocio -> ErrorNegocio (400)", async () => {
  const caso = (o: Record<string, unknown>) => ejecutar(entrada.parse({ vuelo_ida_id: "v-ida-dic", pasajeros: [{ edad: 30 }], ...o }), dep());
  await assertRejects(() => caso({ vuelo_ida_id: "nope" }), ErrorNegocio, "Vuelo no encontrado");
  await assertRejects(() => caso({ vuelo_regreso_id: "v-ida-ene31" }), ErrorNegocio, "ruta inversa");
  await assertRejects(() => caso({ pasajeros: [{ edad: 30, bodega_regreso: chica }] }), ErrorNegocio, "no hay vuelo de regreso");
  await assertRejects(
    () => caso({ mascota: { pasajero_indice: 0, especie: "gato", peso_kg: 4, trayecto: "REGRESO" } }),
    ErrorNegocio,
    "no hay vuelo de regreso",
  );
  await assertRejects(
    () => caso({ mascota: { pasajero_indice: 3, especie: "gato", peso_kg: 4 } }),
    ErrorNegocio,
    "fuera de rango",
  );
});
