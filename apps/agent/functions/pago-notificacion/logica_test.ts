import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { MapaAsientos } from "../lib/asientos.ts";
import { DatumNoDisponible } from "../lib/datum.ts";
import type { Fila } from "../lib/datum.ts";
import { datumEscribible, filasCatalogo } from "../lib/datum_simulado.ts";
import { ejecutar, entrada, FirmaInvalida, RESUME_URL } from "./logica.ts";

const EXPIRA = "2026-11-20T10:15:00.000Z";
const ANTES = new Date("2026-11-20T10:10:00.000Z");
const DESPUES = new Date("2026-11-20T10:15:00.001Z");
const SECRETO = "whsec_super_secreto_123";
const API_KEY = "key_jelou_456_secreta";
const sleep = () => Promise.resolve();

function fixture(): Fila[] {
  const filas = filasCatalogo();
  const marca = (vuelo: string, cs: string[]) => {
    const mapa = filas.find((f) => f._id === vuelo)!.fields.mapa_asientos as MapaAsientos;
    for (const c of cs) mapa[c] = { estado: "RETENIDO", pnr: null, hold_token: "tok-1", hold_expira: EXPIRA };
  };
  marca("v-ida-dic", ["12A", "12B"]);
  marca("v-reg-dic", ["14A", "14B"]);
  filas.push(
    { _id: "res1", fields: { pnr: "ABC234", estado: "PENDIENTE_PAGO", vuelo_ida_id: "v-ida-dic", vuelo_regreso_id: "v-reg-dic", hold_expira: EXPIRA, total_cop: 520000 } },
    { _id: "pas1", fields: { reserva_id: "res1", nombre: "Ana", documento: "123", edad: 30, asiento_ida: "12A", asiento_regreso: "14A" } },
    { _id: "pas2", fields: { reserva_id: "res1", nombre: "Beto", documento: "456", edad: 8, asiento_ida: "12B", asiento_regreso: "14B" } },
    { _id: "tx1", fields: { reserva_id: "res1", estado: "PENDIENTE", expira_at: EXPIRA, execution_id: "exec-77", ultimo_evento: null } },
  );
  return filas;
}

interface Resume { url: string; init: RequestInit }
function montar(opc: { firma?: boolean; ahora?: Date; resumeStatus?: number; filas?: Fila[] } = {}) {
  const sim = datumEscribible(opc.filas ?? fixture());
  const resumes: Resume[] = [];
  const logs: string[] = [];
  const fetchFalso = ((url: string, init: RequestInit) => {
    resumes.push({ url, init });
    return Promise.resolve(new Response(null, { status: opc.resumeStatus ?? 200 }));
  }) as unknown as typeof fetch;
  const dep = {
    datum: sim.datum,
    ahora: () => opc.ahora ?? ANTES,
    firmaValida: () => Promise.resolve(opc.firma ?? true),
    apiKey: API_KEY,
    fetch: fetchFalso,
    sleep,
    log: (m: string, d?: unknown) => logs.push(`${m} ${JSON.stringify(d ?? "")}`),
  };
  return { sim, dep, resumes, logs };
}
const evento = (estado: "APROBADA" | "RECHAZADA" = "APROBADA") =>
  entrada.parse({ transaccion_id: "tx1", estado, event_id: `tx1:${estado}`, emitido_at: "2026-11-20T10:05:00.000Z" });
const campos = (sim: ReturnType<typeof datumEscribible>, id: string) => sim.almacen.find((f) => f._id === id)!.fields;
const mapa = (sim: ReturnType<typeof datumEscribible>, id: string) => campos(sim, id).mapa_asientos as MapaAsientos;
const eventos = (sim: ReturnType<typeof datumEscribible>) => sim.almacen.filter((f) => f.fields.id_evento !== undefined);

Deno.test("entrada: event_id debe ser <transaccion_id>:<estado> y EXPIRADA no se acepta", () => {
  assertEquals(entrada.safeParse({ transaccion_id: "tx1", estado: "APROBADA", event_id: "tx1:APROBADA", emitido_at: "2026-11-20T10:05:00Z" }).success, true);
  assertEquals(entrada.safeParse({ transaccion_id: "tx1", estado: "APROBADA", event_id: "tx1:RECHAZADA", emitido_at: "2026-11-20T10:05:00Z" }).success, false);
  assertEquals(entrada.safeParse({ transaccion_id: "tx1", estado: "EXPIRADA", event_id: "tx1:EXPIRADA", emitido_at: "2026-11-20T10:05:00Z" }).success, false);
});

Deno.test("CRITICA seguridad: firma inválida o ausente => 401 y cero lecturas, escrituras y reanudaciones", async () => {
  const { sim, dep, resumes } = montar({ firma: false });
  const e = await assertRejects(() => ejecutar(evento(), dep), FirmaInvalida);
  assertEquals(e.status, 401);
  assertEquals(sim.llamadas, []); // ni listar, ni leer, ni crear, ni actualizar
  assertEquals(resumes.length, 0);
  assertEquals(eventos(sim).length, 0);
});

Deno.test("CRITICA seguridad: la verificación de firma ocurre antes de tocar Datum (orden)", async () => {
  const { sim, dep } = montar();
  const orden: string[] = [];
  const firma = dep.firmaValida;
  dep.firmaValida = () => { orden.push(`firma tras ${sim.llamadas.length} llamadas`); return firma(); };
  await ejecutar(evento(), dep);
  assertEquals(orden, ["firma tras 0 llamadas"]);
});

Deno.test("RN-10: aprobada y PENDIENTE vigente => transacción APROBADA, reserva EMITIDA, asientos VENDIDO con pnr, un resume 'paid'", async () => {
  const { sim, dep, resumes } = montar();
  assertEquals(await ejecutar(evento(), dep), { resultado: "APLICADO" });
  assertEquals(campos(sim, "tx1").estado, "APROBADA");
  assertEquals(campos(sim, "tx1").ultimo_evento, "tx1:APROBADA");
  assertEquals(campos(sim, "res1").estado, "EMITIDA");
  assertEquals(campos(sim, "res1").pnr, "ABC234");
  for (const c of ["12A", "12B"]) assertEquals(mapa(sim, "v-ida-dic")[c], { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null });
  for (const c of ["14A", "14B"]) assertEquals(mapa(sim, "v-reg-dic")[c], { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null });
  assertEquals(campos(sim, "v-ida-dic").version, 1);
  assertEquals(eventos(sim).map((f) => f.fields), [{ transaccion_id: "tx1", id_evento: "tx1:APROBADA", estado: "APROBADA" }]);
  assertEquals(resumes.length, 1);
});

Deno.test("EC-04: el evento se registra ANTES de aplicar el efecto", async () => {
  const { sim, dep } = montar();
  await ejecutar(evento(), dep);
  const iEvento = sim.llamadas.indexOf("crear");
  const primeraEscritura = sim.llamadas.findIndex((l) => l.startsWith("actualizar:"));
  assert(iEvento >= 0 && iEvento < primeraEscritura);
});

Deno.test("RN-11: rechazada => asientos LIBRE, reserva PAGO_RECHAZADO, transacción RECHAZADA, resume 'rejected'", async () => {
  const { sim, dep, resumes } = montar();
  assertEquals(await ejecutar(evento("RECHAZADA"), dep), { resultado: "APLICADO" });
  assertEquals(campos(sim, "tx1").estado, "RECHAZADA");
  assertEquals(campos(sim, "res1").estado, "PAGO_RECHAZADO");
  for (const [v, cs] of [["v-ida-dic", ["12A", "12B"]], ["v-reg-dic", ["14A", "14B"]]] as const) {
    for (const c of cs) assertEquals(mapa(sim, v)[c], { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null });
  }
  assertEquals(JSON.parse(resumes[0].init.body as string).message, "rejected");
});

Deno.test("CRITICA expiración (RN-12, EC-03): APROBADA después de expira_at => EXPIRADA, libera, resume 'expired'", async () => {
  const { sim, dep, resumes } = montar({ ahora: DESPUES });
  assertEquals(await ejecutar(evento("APROBADA"), dep), { resultado: "EXPIRADO" });
  assertEquals(campos(sim, "tx1").estado, "EXPIRADA");
  assertEquals(campos(sim, "res1").estado, "EXPIRADA");
  assertEquals(mapa(sim, "v-ida-dic")["12A"].estado, "LIBRE");
  assertEquals(mapa(sim, "v-reg-dic")["14B"].estado, "LIBRE");
  assertEquals(resumes.length, 1);
  assertEquals(JSON.parse(resumes[0].init.body as string).message, "expired");
});

Deno.test("RN-12: exactamente en expira_at aún es vigente (comparación estricta)", async () => {
  const { sim, dep } = montar({ ahora: new Date(EXPIRA) });
  assertEquals(await ejecutar(evento(), dep), { resultado: "APLICADO" });
  assertEquals(campos(sim, "tx1").estado, "APROBADA");
});

Deno.test("RN-12: la expiración no pisa un asiento que otro cliente retuvo tras el vencimiento", async () => {
  const filas = fixture();
  (filas.find((f) => f._id === "v-ida-dic")!.fields.mapa_asientos as MapaAsientos)["12A"] =
    { estado: "RETENIDO", pnr: null, hold_token: "otro", hold_expira: "2026-11-20T10:40:00.000Z" };
  const { sim, dep } = montar({ ahora: DESPUES, filas });
  await ejecutar(evento(), dep);
  assertEquals(mapa(sim, "v-ida-dic")["12A"].hold_token, "otro");
  assertEquals(mapa(sim, "v-ida-dic")["12B"].estado, "LIBRE");
});

Deno.test("CRITICA idempotencia (EC-04): evento duplicado => 200 DUPLICADO sin efecto y un solo resume", async () => {
  const { sim, dep, resumes } = montar();
  await ejecutar(evento(), dep);
  const escriturasTrasPrimero = sim.llamadas.filter((l) => l === "crear" || l.startsWith("actualizar:")).length;
  const estadoTrasPrimero = structuredClone(sim.almacen);
  assertEquals(await ejecutar(evento(), dep), { resultado: "DUPLICADO" });
  assertEquals(await ejecutar(evento(), dep), { resultado: "DUPLICADO" });
  assertEquals(sim.llamadas.filter((l) => l === "crear" || l.startsWith("actualizar:")).length, escriturasTrasPrimero);
  assertEquals(sim.almacen, estadoTrasPrimero);
  assertEquals(eventos(sim).length, 1);
  assertEquals(resumes.length, 1);
});

Deno.test("CRITICA EC-07: APROBADA después de RECHAZADA no reabre la reserva ni los asientos", async () => {
  const { sim, dep, resumes } = montar();
  await ejecutar(evento("RECHAZADA"), dep);
  const estadoTras = structuredClone(sim.almacen);
  assertEquals(await ejecutar(evento("APROBADA"), dep), { resultado: "SIN_EFECTO" });
  assertEquals(sim.almacen, estadoTras);
  assertEquals(campos(sim, "tx1").estado, "RECHAZADA");
  assertEquals(campos(sim, "res1").estado, "PAGO_RECHAZADO");
  assertEquals(mapa(sim, "v-ida-dic")["12A"].estado, "LIBRE");
  assertEquals(resumes.length, 1); // solo el de 'rejected'
});

Deno.test("EC-07: RECHAZADA después de APROBADA tampoco cambia nada", async () => {
  const { sim, dep, resumes } = montar();
  await ejecutar(evento("APROBADA"), dep);
  assertEquals(await ejecutar(evento("RECHAZADA"), dep), { resultado: "SIN_EFECTO" });
  assertEquals(campos(sim, "res1").estado, "EMITIDA");
  assertEquals(mapa(sim, "v-ida-dic")["12A"].estado, "VENDIDO");
  assertEquals(resumes.length, 1);
});

Deno.test("transacción inexistente => SIN_EFECTO sin escrituras ni resume", async () => {
  const { sim, dep, resumes } = montar();
  const r = await ejecutar(entrada.parse({ transaccion_id: "nope", estado: "APROBADA", event_id: "nope:APROBADA", emitido_at: "2026-11-20T10:05:00.000Z" }), dep);
  assertEquals(r, { resultado: "SIN_EFECTO" });
  assertEquals(sim.llamadas.filter((l) => l === "crear" || l.startsWith("actualizar:")), []);
  assertEquals(resumes.length, 0);
});

Deno.test("CRITICA reanudación: URL, cabecera x-api-key y cuerpo exactos", async () => {
  const { dep, resumes } = montar();
  await ejecutar(evento(), dep);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].url, "https://gateway.jelou.ai/workflows/v1/skills/resume");
  assertEquals(RESUME_URL, resumes[0].url);
  assertEquals(resumes[0].init.method, "POST");
  assertEquals(resumes[0].init.headers, { "x-api-key": API_KEY, "Content-Type": "application/json" });
  assertEquals(resumes[0].init.body, '{"executionId":"exec-77","message":"paid","pauseInteraction":false}');
});

Deno.test("fallo de reanudación => 503 y la transacción sigue PENDIENTE; el reintento reaplica y reanuda", async () => {
  const { sim, dep, resumes } = montar({ resumeStatus: 500 });
  await assertRejects(() => ejecutar(evento(), dep), DatumNoDisponible);
  assertEquals(campos(sim, "tx1").estado, "PENDIENTE");
  assertEquals(eventos(sim).length, 1);
  // la pasarela reintenta con la pasarela de resume ya sana
  const sano = { ...dep, fetch: ((u: string, i: RequestInit) => { resumes.push({ url: u, init: i }); return Promise.resolve(new Response(null, { status: 200 })); }) as unknown as typeof fetch };
  assertEquals(await ejecutar(evento(), sano), { resultado: "APLICADO" });
  assertEquals(campos(sim, "tx1").estado, "APROBADA");
  assertEquals(eventos(sim).length, 1); // no se duplica el registro del evento
  assertEquals(mapa(sim, "v-ida-dic")["12A"].estado, "VENDIDO");
});

Deno.test("transacción sin execution_id: aplica el efecto sin reanudar", async () => {
  const filas = fixture();
  filas.find((f) => f._id === "tx1")!.fields.execution_id = null;
  const { sim, dep, resumes } = montar({ filas });
  assertEquals(await ejecutar(evento(), dep), { resultado: "APLICADO" });
  assertEquals(campos(sim, "tx1").estado, "APROBADA");
  assertEquals(resumes.length, 0);
});

Deno.test("CRITICA secreto no logueado: ni logs ni mensajes de error contienen el secreto, la API key ni la firma", async () => {
  const salidas: string[] = [];
  for (const opc of [{ firma: false }, {}, { resumeStatus: 500 }, { ahora: DESPUES }]) {
    const { dep, logs } = montar(opc);
    try {
      await ejecutar(evento(), dep);
    } catch (e) {
      salidas.push(String((e as Error).message), String((e as Error).stack));
    }
    salidas.push(...logs);
  }
  const todo = salidas.join("\n");
  assert(todo.length > 0);
  for (const prohibido of [SECRETO, API_KEY, "x-api-key", "sha256="]) assert(!todo.includes(prohibido), `se filtró ${prohibido}`);
});
