import { assertEquals } from "jsr:@std/assert@1";
import type { Fila } from "../lib/datum.ts";
import { datumSimulado, filasCatalogo } from "../lib/datum_simulado.ts";
import { ejecutar, entrada } from "./logica.ts";

const AHORA = new Date("2026-10-16T12:00:00Z");
const base = { ruta_id: "BOG-MDE", fecha_ida: "2026-12-10", pasajeros: 2 };

Deno.test("entrada: fechas dentro de la ventana, incluidos los bordes", () => {
  assertEquals(entrada.safeParse({ ...base, fecha_ida: "2026-12-01" }).success, true);
  assertEquals(entrada.safeParse({ ...base, fecha_ida: "2027-01-31", fecha_regreso: "2027-01-31" }).success, true);
});

Deno.test("entrada: rechaza fechas fuera de ventana o inexistentes", () => {
  for (const fecha_ida of ["2026-11-30", "2027-02-01", "2026-12-32", "diciembre"]) {
    assertEquals(entrada.safeParse({ ...base, fecha_ida }).success, false, fecha_ida);
  }
  assertEquals(entrada.safeParse({ ...base, fecha_regreso: "2027-02-01" }).success, false);
});

Deno.test("entrada: rechaza regreso anterior a la ida, pasajeros fuera de 1..9 y ruta desconocida", () => {
  assertEquals(entrada.safeParse({ ...base, fecha_regreso: "2026-12-09" }).success, false);
  assertEquals(entrada.safeParse({ ...base, pasajeros: 0 }).success, false);
  assertEquals(entrada.safeParse({ ...base, pasajeros: 10 }).success, false);
  assertEquals(entrada.safeParse({ ...base, ruta_id: "BOG-XXX" }).success, false);
});

Deno.test("solo ida: tarifa con temporada de diciembre (x1.30) y 174 asientos libres", async () => {
  const r = await ejecutar(entrada.parse(base), { datum: datumSimulado(filasCatalogo()), ahora: AHORA });
  assertEquals(r.regreso, undefined);
  assertEquals(r.ida, [{
    vuelo_id: "v-ida-dic",
    ruta_id: "BOG-MDE",
    fecha: "2026-12-10",
    hora_salida: "07:00",
    asientos_libres: 174,
    tarifa_pasajero_cop: 260000,
  }]);
});

Deno.test("ida y vuelta: el regreso usa la ruta inversa y su propia tarifa", async () => {
  const r = await ejecutar(entrada.parse({ ...base, fecha_regreso: "2026-12-20" }), {
    datum: datumSimulado(filasCatalogo()),
    ahora: AHORA,
  });
  assertEquals(r.regreso?.map((v) => [v.vuelo_id, v.ruta_id, v.tarifa_pasajero_cop]), [["v-reg-dic", "MDE-BOG", 273000]]);
});

Deno.test("fecha sin vuelo devuelve lista vacía", async () => {
  const r = await ejecutar(entrada.parse({ ...base, fecha_ida: "2026-12-11" }), {
    datum: datumSimulado(filasCatalogo()),
    ahora: AHORA,
  });
  assertEquals(r.ida, []);
});

Deno.test("asientos_libres cuenta LIBRE y RETENIDO vencido, no RETENIDO vigente ni VENDIDO (RN-08)", async () => {
  const filas = filasCatalogo();
  const vuelo = filas.find((f) => f._id === "v-ida-dic") as Fila;
  const mapa = vuelo.fields.mapa_asientos as Record<string, Record<string, unknown>>;
  mapa["1A"] = { estado: "RETENIDO", pnr: null, hold_token: "t", hold_expira: "2026-10-16T12:10:00Z" }; // vigente
  mapa["1C"] = { estado: "RETENIDO", pnr: null, hold_token: "t", hold_expira: "2026-10-16T11:50:00Z" }; // vencido
  mapa["1D"] = { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null };
  const r = await ejecutar(entrada.parse(base), { datum: datumSimulado(filas), ahora: AHORA });
  assertEquals(r.ida[0].asientos_libres, 172);
});

Deno.test("el catálogo se lee por colección (rutas, temporada, parametros, vuelos)", async () => {
  const datum = datumSimulado(filasCatalogo());
  const r = await ejecutar(entrada.parse(base), { datum, ahora: AHORA });
  assertEquals(r.ida.length, 1);
  assertEquals([...datum.llamadas].sort(), ["listar:parametros", "listar:rutas", "listar:temporada", "listar:vuelos"]);
});
