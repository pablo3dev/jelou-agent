// REQ-07 / REQ-08 / RN-10, RN-11, RN-12, RN-16: notificación de pago de la pasarela (function PÚBLICA, protegida por HMAC).
//
// Orden (cada paso solo corre si el anterior pasó):
//  0. Firma: `dep.firmaValida()` (en la function: `ctx.verifyHmac` sobre el cuerpo crudo). Inválida => FirmaInvalida (401)
//     y CERO lecturas o escrituras en Datum, CERO llamadas de red (EC-05).
//  1. Se lee la transacción. Inexistente o no PENDIENTE => SIN_EFECTO (EC-07): una APROBADA
//     posterior a una RECHAZADA (o al revés) nunca reabre la transacción.
//  2. Idempotencia (EC-04): `eventos_pago.id_evento` = `<transaccion_id>:<estado>`. Si ya existe y la transacción ya salió
//     de PENDIENTE => DUPLICADO (200, sin efecto, sin reanudar). Si no existe, se registra ANTES de aplicar el efecto con
//     id determinista `<transaccion_id><estado en minúsculas>`: la creación es atómica en Datum y, si otra entrega
//     simultánea ya la ganó (`esDuplicado`), esta responde DUPLICADO sin aplicar nada.
//  3. Efecto según RN-12 / RN-10 / RN-11: asientos (write-then-verify) -> reserva -> reanudación -> transacción.
//
// Idempotencia / reintentos: la transacción es el marcador de "efecto terminado": se actualiza al FINAL. Si algo falla antes
// (503), la transacción sigue PENDIENTE; el evento ya registrado NO cuenta como duplicado y el reintento de la pasarela
// reaplica los pasos, que son idempotentes (asientos con verificación por pnr/vencimiento propio, reserva con estado fijo).
// Se prefiere que una caída entre la reanudación y el cierre de la transacción reanude dos veces a que la reanudación se pierda.
// Dos entregas simultáneas del mismo evento se serializan por la creación atómica del evento (id determinista).
import { z } from "zod";
import type { MapaAsientos } from "../lib/asientos.ts";
import { DatumHttpError, DatumNoDisponible, escribirMapaVerificado, esDuplicado, literalFiltro } from "../lib/datum.ts";
import type { Datum, Fetch, Fila, Sleep } from "../lib/datum.ts";

export const RESUME_URL = "https://gateway.jelou.ai/workflows/v1/skills/resume";

export const entrada = z.object({
  transaccion_id: z.string().min(1),
  estado: z.enum(["APROBADA", "RECHAZADA"]), // la pasarela nunca envía EXPIRADA
  event_id: z.string().min(1), // "<transaccion_id>:<estado>"
  emitido_at: z.string().datetime(),
}).refine((b) => b.event_id === `${b.transaccion_id}:${b.estado}`, { message: "event_id debe ser <transaccion_id>:<estado>" });

export const salida = z.object({
  resultado: z.enum(["APLICADO", "EXPIRADO", "DUPLICADO", "SIN_EFECTO"]),
});

export class FirmaInvalida extends Error {
  readonly status = 401;
  constructor() {
    super("Firma inválida");
    this.name = "FirmaInvalida";
  }
}

export interface Dep {
  datum: Datum;
  ahora: () => Date;
  firmaValida: () => Promise<boolean>;
  apiKey: string; // JELOU_API_KEY, del entorno; nunca se registra
  fetch?: Fetch;
  sleep?: Sleep;
  log?: (mensaje: string, datos?: unknown) => void;
}

type Entrada = z.infer<typeof entrada>;
type Mensaje = "paid" | "rejected" | "expired";

const texto = (v: unknown) => String(v ?? "");

interface Destino {
  estadoTx: "APROBADA" | "RECHAZADA" | "EXPIRADA";
  estadoReserva: "EMITIDA" | "PAGO_RECHAZADO" | "EXPIRADA";
  mensaje: Mensaje;
  resultado: "APLICADO" | "EXPIRADO";
}

// RN-12 manda sobre el estado recibido: pasado `expira_at` (estricto) se expira aunque llegue APROBADA.
function decidir(estado: Entrada["estado"], expiraAt: string, ahora: Date): Destino {
  if (ahora.getTime() > Date.parse(expiraAt)) {
    return { estadoTx: "EXPIRADA", estadoReserva: "EXPIRADA", mensaje: "expired", resultado: "EXPIRADO" };
  }
  return estado === "APROBADA"
    ? { estadoTx: "APROBADA", estadoReserva: "EMITIDA", mensaje: "paid", resultado: "APLICADO" }
    : { estadoTx: "RECHAZADA", estadoReserva: "PAGO_RECHAZADO", mensaje: "rejected", resultado: "APLICADO" };
}

async function leerONulo(datum: Datum, coleccion: string, id: string): Promise<Fila | null> {
  try {
    return await datum.leer(coleccion, id);
  } catch (e) {
    if (e instanceof DatumHttpError && e.httpStatus === 404) return null;
    throw e;
  }
}

async function existeEvento(datum: Datum, idEvento: string): Promise<boolean> {
  return (await datum.listar("eventos_pago", { filter: `id_evento=${literalFiltro(idEvento)}`, fields: "id" })).length > 0;
}

// Adapta la verificación del SDK (`ctx.verifyHmac`: no devuelve nada si la firma es válida y lanza si no) a booleano.
// Cualquier excepción cuenta como firma inválida: ante la duda, 401.
export async function adaptarVerificacion(verify: () => Promise<unknown>): Promise<boolean> {
  try {
    await verify();
    return true;
  } catch {
    return false;
  }
}

// Asientos de la reserva por vuelo (vuelo_id = _id del registro de `vuelos`).
async function asientosPorVuelo(datum: Datum, reserva: Fila) {
  const pasajeros = await datum.listar("pasajeros", { filter: `reserva_id=${literalFiltro(reserva._id)}` });
  const grupos: { vueloId: string; claves: string[] }[] = [
    { vueloId: texto(reserva.fields.vuelo_ida_id), claves: pasajeros.map((p) => texto(p.fields.asiento_ida)).filter(Boolean) },
  ];
  const regreso = reserva.fields.vuelo_regreso_id;
  if (regreso !== null && regreso !== undefined && regreso !== "") {
    grupos.push({ vueloId: texto(regreso), claves: pasajeros.map((p) => texto(p.fields.asiento_regreso)).filter(Boolean) });
  }
  const resultado: { vueloRowId: string; claves: string[] }[] = [];
  for (const g of grupos) {
    const vuelo = await leerONulo(datum, "vuelos", g.vueloId);
    if (!vuelo) throw new Error(`No se encontró el vuelo ${g.vueloId} de la reserva`);
    resultado.push({ vueloRowId: vuelo._id, claves: g.claves });
  }
  return resultado;
}

// Mis asientos: RETENIDO con mi vencimiento exacto (refijado en transaccion-crear) o, ya aplicado, VENDIDO con mi pnr.
const esMioRetenido = (a: MapaAsientos[string] | undefined, expira: string) =>
  a?.estado === "RETENIDO" && a.hold_expira === expira;

function mutarVenta(claves: string[], pnr: string, expira: string) {
  return (m: MapaAsientos): MapaAsientos => {
    const copia = { ...m };
    for (const c of claves) {
      const a = copia[c];
      if (a?.estado === "VENDIDO" && a.pnr === pnr) continue; // ya aplicado
      if (!esMioRetenido(a, expira) && a?.estado !== "LIBRE") throw new Error(`El asiento ${c} no está retenido por esta reserva`);
      copia[c] = { estado: "VENDIDO", pnr, hold_token: null, hold_expira: null };
    }
    return copia;
  };
}

// Libera solo lo que sigue retenido con MI vencimiento: tras `expira_at` otro cliente pudo retener el asiento (RN-08).
function mutarLiberacion(claves: string[], expira: string) {
  return (m: MapaAsientos): MapaAsientos => {
    const copia = { ...m };
    for (const c of claves) {
      if (esMioRetenido(copia[c], expira)) copia[c] = { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null };
    }
    return copia;
  };
}

async function reanudar(dep: Dep, executionId: string, message: Mensaje): Promise<void> {
  const f = dep.fetch ?? fetch;
  let resp: Response;
  try {
    resp = await f(RESUME_URL, {
      method: "POST",
      headers: { "x-api-key": dep.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ executionId, message, pauseInteraction: false }),
    });
  } catch {
    throw new DatumNoDisponible("No se pudo reanudar la ejecución (fallo de red)"); // sin detalle: podría traer cabeceras
  }
  await resp.body?.cancel();
  if (!resp.ok) throw new DatumNoDisponible(`No se pudo reanudar la ejecución (HTTP ${resp.status})`);
}

export async function ejecutar(input: Entrada, dep: Dep): Promise<z.infer<typeof salida>> {
  // 0. Firma antes de cualquier acceso a datos.
  if (!(await dep.firmaValida())) {
    dep.log?.("Notificación de pago rechazada: firma inválida");
    throw new FirmaInvalida();
  }
  const log = (m: string) => dep.log?.(m, { transaccion_id: input.transaccion_id, estado: input.estado });

  // 1. Transacción.
  const tx = await leerONulo(dep.datum, "transacciones", input.transaccion_id);
  if (!tx || tx.fields.estado !== "PENDIENTE") {
    // Idempotencia por estado terminal: repetir el mismo evento o un evento contrario no cambia nada.
    const repetido = await existeEvento(dep.datum, input.event_id);
    log(repetido ? "Evento duplicado: sin efecto" : "Transacción inexistente o no pendiente: sin efecto");
    return { resultado: repetido ? "DUPLICADO" : "SIN_EFECTO" };
  }

  const destino = decidir(input.estado, texto(tx.fields.expira_at), dep.ahora());

  // 2. Registrar el evento antes del efecto (si un intento previo ya lo registró y no terminó, se reaplica).
  // Idempotencia: id determinista => la creación es atómica; si otra entrega simultánea la ganó, esta es DUPLICADO.
  if (!(await existeEvento(dep.datum, input.event_id))) {
    try {
      await dep.datum.crear(
        "eventos_pago",
        { transaccion_id: input.transaccion_id, id_evento: input.event_id, estado: input.estado },
        `${input.transaccion_id}${input.estado.toLowerCase()}`,
      );
    } catch (e) {
      if (!esDuplicado(e)) throw e;
      log("Evento duplicado (entrega simultánea): sin efecto");
      return { resultado: "DUPLICADO" };
    }
  }

  // 3. Efecto.
  const reserva = await leerONulo(dep.datum, "reservas", texto(tx.fields.reserva_id));
  if (!reserva) throw new Error("La transacción apunta a una reserva inexistente");
  const expira = texto(tx.fields.expira_at);
  const pnr = texto(reserva.fields.pnr);
  const vender = destino.estadoTx === "APROBADA";
  for (const g of await asientosPorVuelo(dep.datum, reserva)) {
    const mutar = vender ? mutarVenta(g.claves, pnr, expira) : mutarLiberacion(g.claves, expira);
    await escribirMapaVerificado(dep.datum, {
      vueloRowId: g.vueloRowId,
      sleep: dep.sleep,
      mutar,
      verificar: (m) => g.claves.every((c) => vender ? m[c]?.estado === "VENDIDO" && m[c].pnr === pnr : !esMioRetenido(m[c], expira)),
    });
  }
  await dep.datum.actualizar("reservas", reserva._id, { estado: destino.estadoReserva });

  const executionId = tx.fields.execution_id;
  if (typeof executionId === "string" && executionId !== "") await reanudar(dep, executionId, destino.mensaje);
  else log("Transacción sin execution_id: no hay ejecución que reanudar");

  // Cierre: la transacción sale de PENDIENTE al final (marcador de efecto completo).
  await dep.datum.actualizar("transacciones", tx._id, { estado: destino.estadoTx, ultimo_evento: input.event_id });
  log(`Evento aplicado: ${destino.resultado}`);
  return { resultado: destino.resultado };
}
