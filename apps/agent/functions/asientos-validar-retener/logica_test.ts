import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { MapaAsientos } from "../lib/asientos.ts";
import { DatumNoDisponible } from "../lib/datum.ts";
import type { Fila } from "../lib/datum.ts";
import { datumEscribible, filasCatalogo } from "../lib/datum_simulado.ts";
import { ErrorAsientos } from "../lib/errores.ts";
import { ejecutar, entrada } from "./logica.ts";

const AHORA = new Date("2026-11-20T10:00:00.000Z");
const EXPIRA = "2026-11-20T10:15:00.000Z";
const sleep = () => Promise.resolve();

const montar = (filas: Fila[] = filasCatalogo(), opc = {}) => {
  const sim = datumEscribible(filas, opc);
  return { sim, dep: { datum: sim.datum, ahora: () => AHORA, nuevoToken: () => "tok-1", sleep } };
};
const mapaDe = (sim: ReturnType<typeof datumEscribible>, id: string) =>
  sim.almacen.find((f) => f._id === id)!.fields.mapa_asientos as MapaAsientos;
const fila = (filas: Fila[], id: string) => filas.find((f) => f._id === id)!;
const marcar = (filas: Fila[], id: string, clave: string, a: Record<string, unknown>) => {
  (fila(filas, id).fields.mapa_asientos as MapaAsientos)[clave] = a as never;
};
const base = { vuelo_ida_id: "v-ida-dic", edades: [30, 8], asientos_ida: "12A 12B" };

Deno.test("entrada: 1 a 9 edades y asientos obligatorios", () => {
  assertEquals(entrada.safeParse(base).success, true);
  assertEquals(entrada.safeParse({ ...base, edades: [] }).success, false);
  assertEquals(entrada.safeParse({ ...base, edades: Array(10).fill(30) }).success, false);
  assertEquals(entrada.safeParse({ vuelo_ida_id: "a", edades: [30] }).success, false);
});

Deno.test("hold completo ida y vuelta: RETENIDO con token y vencimiento ahora + 15 min", async () => {
  const { sim, dep } = montar();
  const r = await ejecutar(entrada.parse({ ...base, vuelo_regreso_id: "v-reg-dic", asientos_regreso: "5C,5D" }), dep);
  assertEquals(r, { hold_token: "tok-1", hold_expira: EXPIRA });
  const ida = mapaDe(sim, "v-ida-dic");
  const reg = mapaDe(sim, "v-reg-dic");
  for (const c of ["12A", "12B"]) assertEquals(ida[c], { estado: "RETENIDO", pnr: null, hold_token: "tok-1", hold_expira: EXPIRA });
  for (const c of ["5C", "5D"]) assertEquals(reg[c].hold_token, "tok-1");
  assertEquals(ida["12C"].estado, "LIBRE");
  assertEquals(sim.almacen.find((f) => f._id === "v-ida-dic")!.fields.version, 1);
});

Deno.test("asiento ocupado: 400 con la lista y sin retención parcial", async () => {
  const filas = filasCatalogo();
  marcar(filas, "v-ida-dic", "12B", { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null });
  const { sim, dep } = montar(filas);
  const e = await assertRejects(() => ejecutar(entrada.parse(base), dep), ErrorAsientos);
  assertEquals(e.asientos_invalidos, ["12B"]);
  assertEquals(e.status, 400);
  assertEquals(sim.llamadas.some((l) => l.startsWith("actualizar")), false);
  assertEquals(mapaDe(sim, "v-ida-dic")["12A"].estado, "LIBRE");
});

Deno.test("asiento inválido en el regreso: no se retiene tampoco la ida", async () => {
  const filas = filasCatalogo();
  marcar(filas, "v-reg-dic", "5C", { estado: "BLOQUEADO", pnr: null, hold_token: null, hold_expira: null });
  const { sim, dep } = montar(filas);
  const e = await assertRejects(
    () => ejecutar(entrada.parse({ ...base, vuelo_regreso_id: "v-reg-dic", asientos_regreso: "5C 99Z" }), dep),
    ErrorAsientos,
  );
  assertEquals(e.asientos_invalidos, ["99Z"]); // formato/inexistente se reporta primero
  assertEquals(sim.llamadas.some((l) => l.startsWith("actualizar")), false);
});

Deno.test("hold vencido de otro cuenta como libre (RN-08) y se puede retener", async () => {
  const filas = filasCatalogo();
  marcar(filas, "v-ida-dic", "12A", { estado: "RETENIDO", pnr: null, hold_token: "viejo", hold_expira: "2026-11-20T09:59:00.000Z" });
  const { sim, dep } = montar(filas);
  await ejecutar(entrada.parse(base), dep);
  assertEquals(mapaDe(sim, "v-ida-dic")["12A"].hold_token, "tok-1");
});

Deno.test("hold vigente de otro: rechazado como no libre", async () => {
  const filas = filasCatalogo();
  marcar(filas, "v-ida-dic", "12A", { estado: "RETENIDO", pnr: null, hold_token: "otro", hold_expira: "2026-11-20T10:05:00.000Z" });
  const { dep } = montar(filas);
  const e = await assertRejects(() => ejecutar(entrada.parse(base), dep), ErrorAsientos);
  assertEquals(e.asientos_invalidos, ["12A"]);
});

Deno.test("exit row con pasajero menor de 15 => 400; con 15 pasa", async () => {
  const { dep } = montar();
  const e = await assertRejects(
    () => ejecutar(entrada.parse({ ...base, edades: [30, 14], asientos_ida: "12A 13A" }), dep),
    ErrorAsientos,
  );
  assertEquals(e.asientos_invalidos, ["13A"]);
  const ok = await ejecutar(entrada.parse({ ...base, edades: [30, 15], asientos_ida: "12A 13A" }), dep);
  assertEquals(ok.hold_token, "tok-1");
});

Deno.test("cantidad distinta de pasajeros y regreso incoherente => 400", async () => {
  const { dep } = montar();
  await assertRejects(() => ejecutar(entrada.parse({ ...base, asientos_ida: "12A" }), dep), ErrorAsientos);
  await assertRejects(() => ejecutar(entrada.parse({ ...base, vuelo_regreso_id: "v-reg-dic" }), dep), Error, "regreso");
  await assertRejects(() => ejecutar(entrada.parse({ ...base, asientos_regreso: "5C 5D" }), dep), Error, "regreso");
});

Deno.test("fallo de verify (EC-17): 503 y nada queda retenido", async () => {
  const { sim, dep } = montar(filasCatalogo(), { perderEscritura: () => true });
  await assertRejects(() => ejecutar(entrada.parse(base), dep), DatumNoDisponible);
  assert(Object.values(mapaDe(sim, "v-ida-dic")).every((a) => a.estado === "LIBRE"));
});

Deno.test("falla la retención del regreso: se libera la ida (sin retención parcial)", async () => {
  const { sim, dep } = montar(filasCatalogo(), { perderEscritura: (id: string) => id === "v-reg-dic" });
  await assertRejects(
    () => ejecutar(entrada.parse({ ...base, vuelo_regreso_id: "v-reg-dic", asientos_regreso: "5C 5D" }), dep),
    DatumNoDisponible,
  );
  assert(Object.values(mapaDe(sim, "v-ida-dic")).every((a) => a.estado === "LIBRE"));
  assert(Object.values(mapaDe(sim, "v-reg-dic")).every((a) => a.estado === "LIBRE"));
});
