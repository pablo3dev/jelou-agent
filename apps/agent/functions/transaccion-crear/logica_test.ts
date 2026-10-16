import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { PNR_RE } from "../lib/asientos.ts";
import type { MapaAsientos } from "../lib/asientos.ts";
import { DatumNoDisponible } from "../lib/datum.ts";
import type { Fila } from "../lib/datum.ts";
import { datumEscribible, filasCatalogo } from "../lib/datum_simulado.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { ejecutar, entrada } from "./logica.ts";

const AHORA = new Date("2026-11-20T10:00:00.000Z");
const EXPIRA = "2026-11-20T10:15:00.000Z"; // ahora + 15 min
const HOLD_PREVIO = "2026-11-20T10:05:00.000Z"; // el hold de validar-retener, creado 10 min antes
const sleep = () => Promise.resolve();

function conHold(seats: Record<string, string[]>, token = "tok-1", expira = HOLD_PREVIO): Fila[] {
  const filas = filasCatalogo();
  for (const [vuelo, cs] of Object.entries(seats)) {
    const mapa = filas.find((f) => f._id === vuelo)!.fields.mapa_asientos as MapaAsientos;
    for (const c of cs) mapa[c] = { estado: "RETENIDO", pnr: null, hold_token: token, hold_expira: expira };
  }
  return filas;
}
const montar = (filas: Fila[], opc = {}, rng?: () => number) => {
  const sim = datumEscribible(filas, opc);
  return { sim, dep: { datum: sim.datum, ahora: () => AHORA, payPublicUrl: "http://pay.test/", sleep, rng } };
};
const mapaDe = (sim: ReturnType<typeof datumEscribible>, id: string) =>
  sim.almacen.find((f) => f._id === id)!.fields.mapa_asientos as MapaAsientos;

const p = (nombre: string, edad: number, ida: string, extra: Record<string, unknown> = {}) =>
  ({ nombre, documento: "1020304050", edad, asiento_ida: ida, ...extra });
const base = () => ({
  hold_token: "tok-1",
  vuelo_ida_id: "v-ida-dic",
  pasajeros: [p("Ana", 30, "12A"), p("Beto", 8, "12B")],
  execution_id: "exec-1",
});
const chica = { largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 2 };

Deno.test("entrada: execution_id y hold_token obligatorios, 1 a 9 pasajeros", () => {
  assertEquals(entrada.safeParse(base()).success, true);
  assertEquals(entrada.safeParse({ ...base(), execution_id: undefined }).success, false);
  assertEquals(entrada.safeParse({ ...base(), hold_token: "" }).success, false);
  assertEquals(entrada.safeParse({ ...base(), pasajeros: [] }).success, false);
});

Deno.test("crea reserva PENDIENTE_PAGO con PNR y total, transacción PENDIENTE y enlace de pago", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }));
  const r = await ejecutar(entrada.parse(base()), dep);
  assertEquals(r.existente, false);
  assert(PNR_RE.test(r.pnr));
  assertEquals(r.total_cop, 520000);
  assertEquals(r.expira_at, EXPIRA);
  assertEquals(r.enlace_pago, `http://pay.test/pay/${r.transaccion_id}`);
  const reserva = sim.almacen.find((f) => f._id === r.reserva_id)!.fields;
  assertEquals(reserva, {
    pnr: r.pnr, estado: "PENDIENTE_PAGO", vuelo_ida_id: "v-ida-dic", vuelo_regreso_id: null, hold_expira: EXPIRA, total_cop: 520000,
  });
  const tx = sim.almacen.find((f) => f._id === r.transaccion_id)!.fields;
  assertEquals(tx, { reserva_id: r.reserva_id, estado: "PENDIENTE", expira_at: EXPIRA, execution_id: "exec-1", ultimo_evento: null });
  assertEquals(sim.creadas.filter((f) => f.fields.documento !== undefined).length, 2);
});

Deno.test("re-fija a creación+15 min reserva, transacción y hold de asientos como un solo instante", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"], "v-reg-dic": ["5C", "5D"] }));
  const input = entrada.parse({
    ...base(),
    vuelo_regreso_id: "v-reg-dic",
    pasajeros: [p("Ana", 30, "12A", { asiento_regreso: "5C" }), p("Beto", 8, "12B", { asiento_regreso: "5D" })],
  });
  const r = await ejecutar(input, dep);
  for (const [v, cs] of [["v-ida-dic", ["12A", "12B"]], ["v-reg-dic", ["5C", "5D"]]] as const) {
    for (const c of cs) {
      assertEquals(mapaDe(sim, v)[c].hold_expira, EXPIRA);
      assertEquals(mapaDe(sim, v)[c].hold_token, "tok-1");
    }
  }
  assertEquals(sim.almacen.find((f) => f._id === r.reserva_id)!.fields.hold_expira, EXPIRA);
  assertEquals(sim.almacen.find((f) => f._id === r.transaccion_id)!.fields.expira_at, EXPIRA);
  assertEquals(r.expira_at, EXPIRA);
});

Deno.test("ida y vuelta con bodega, cabina y mascota: filas de detalle y total", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"], "v-reg-dic": ["5C", "5D"] }));
  const r = await ejecutar(
    entrada.parse({
      ...base(),
      vuelo_regreso_id: "v-reg-dic",
      pasajeros: [
        p("Ana", 30, "12A", { asiento_regreso: "5C", bodega_ida: chica }),
        p("Beto", 12, "12B", { asiento_regreso: "5D" }),
      ],
      mascota: { pasajero_indice: 1, especie: "perro", peso_kg: 6 },
    }),
    dep,
  );
  assertEquals(r.total_cop, 1313000);
  const equipaje = sim.creadas.filter((f) => f.fields.tipo !== undefined).map((f) => f.fields);
  assertEquals(equipaje.length, 5); // 1 bodega + 4 cabina (2 pasajeros x 2 trayectos)
  const bodega = equipaje.find((e) => e.tipo === "BODEGA")!;
  assertEquals([bodega.trayecto, bodega.precio_cop, bodega.peso_volumetrico_kg], ["IDA", 52000, 0.17]);
  assertEquals(equipaje.filter((e) => e.tipo === "CABINA").every((e) => e.precio_cop === 0 && e.largo_cm === null), true);
  const mascota = sim.creadas.find((f) => f.fields.especie !== undefined)!.fields;
  assertEquals(mascota.precio_cop, 195000);
  assertEquals(sim.creadas.length, 1 + 2 + 5 + 1 + 1);
});

Deno.test("idempotencia (EC-01/EC-16): repetir devuelve la PENDIENTE existente sin escribir", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }));
  const a = await ejecutar(entrada.parse(base()), dep);
  const filas = sim.creadas.length;
  const llamadas = sim.llamadas.length;
  const b = await ejecutar(entrada.parse(base()), dep);
  assertEquals(b, { ...a, existente: true });
  assertEquals(sim.creadas.length, filas);
  assertEquals(sim.llamadas.slice(llamadas).some((l) => l === "crear" || l.startsWith("actualizar")), false);
});

Deno.test("una PENDIENTE vencida no se reutiliza: se crea una nueva si el hold es válido", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }));
  const a = await ejecutar(entrada.parse(base()), dep);
  sim.almacen.find((f) => f._id === a.transaccion_id)!.fields.expira_at = "2026-11-20T09:00:00.000Z";
  const b = await ejecutar(entrada.parse(base()), dep);
  assertEquals(b.existente, false);
  assert(b.transaccion_id !== a.transaccion_id);
});

Deno.test("PNR único (RN-13): ante colisión con una reserva existente genera otro", async () => {
  const filas = conHold({ "v-ida-dic": ["12A", "12B"] });
  filas.push({ _id: "res-0", fields: { pnr: "AAAAAA", estado: "EMITIDA", vuelo_ida_id: "otro", vuelo_regreso_id: null, hold_expira: "2026-11-01T00:00:00.000Z", total_cop: 1 } });
  let n = 0;
  const rng = () => (n++ < 6 ? 0 : 0.5); // 1.º "AAAAAA" (ocupado), 2.º "SSSSSS"
  const { dep } = montar(filas, {}, rng);
  const r = await ejecutar(entrada.parse(base()), dep);
  assertEquals(r.pnr, "SSSSSS");
});

Deno.test("hold_token que no corresponde a los asientos => 400 y no se crea nada", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }, "otro-token"));
  await assertRejects(() => ejecutar(entrada.parse(base()), dep), ErrorNegocio, "hold");
  assertEquals(sim.creadas.length, 0);
});

Deno.test("hold vencido => 400 y no se crea nada", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }, "tok-1", "2026-11-20T09:59:00.000Z"));
  await assertRejects(() => ejecutar(entrada.parse(base()), dep), ErrorNegocio, "hold");
  assertEquals(sim.creadas.length, 0);
});

Deno.test("exit row con menor de 15 => 400 y no se crea nada", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "13A"] }));
  const input = entrada.parse({ ...base(), pasajeros: [p("Ana", 30, "12A"), p("Beto", 14, "13A")] });
  await assertRejects(() => ejecutar(input, dep), ErrorNegocio, "Exit row");
  assertEquals(sim.creadas.length, 0);
});

Deno.test("regreso incoherente: asiento de regreso sin vuelo, o vuelo sin asientos => 400", async () => {
  const { dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }));
  const sinVuelo = entrada.parse({ ...base(), pasajeros: [p("Ana", 30, "12A", { asiento_regreso: "5C" }), p("Beto", 8, "12B")] });
  await assertRejects(() => ejecutar(sinVuelo, dep), ErrorNegocio, "regreso");
  const sinAsientos = entrada.parse({ ...base(), vuelo_regreso_id: "v-reg-dic" });
  await assertRejects(() => ejecutar(sinAsientos, dep), ErrorNegocio, "regreso");
});

Deno.test("fallo de verify de la re-fijación (EC-16): 503 sin crear ninguna fila", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }), { perderEscritura: () => true });
  await assertRejects(() => ejecutar(entrada.parse(base()), dep), DatumNoDisponible);
  assertEquals(sim.creadas.length, 0);
  assertEquals(mapaDe(sim, "v-ida-dic")["12A"].hold_expira, HOLD_PREVIO); // el hold no cambió
});

Deno.test("falla la creación de la transacción: 503 y la reserva queda CANCELADA, no PENDIENTE_PAGO", async () => {
  const { sim, dep } = montar(conHold({ "v-ida-dic": ["12A", "12B"] }), { fallaCrear: (f: Record<string, unknown>) => f.estado === "PENDIENTE" });
  await assertRejects(() => ejecutar(entrada.parse(base()), dep), DatumNoDisponible);
  const reservas = sim.almacen.filter((f) => f.fields.pnr !== undefined && f.fields.total_cop === 520000);
  assertEquals(reservas.map((f) => f.fields.estado), ["CANCELADA"]);
  assertEquals(sim.almacen.some((f) => f.fields.expira_at !== undefined), false);
});
