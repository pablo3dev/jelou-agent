// REQ-06 / RN-09, RN-13: crea la reserva PENDIENTE_PAGO, sus pasajeros, equipaje y mascota, y la transacción PENDIENTE.
//
// Orden (sin efecto parcial visible, EC-16):
//  1. Validaciones puras y búsqueda de una transacción PENDIENTE existente para los mismos vuelos y asientos.
//  2. Cotización en servidor (reutiliza `cotizar`).
//  3. Re-fijación del vencimiento de los holds a creación+15 min con write-then-verify. Si falla (503) no se ha creado ninguna fila.
//  4. PNR único (se lee la lista de reservas justo antes de escribir, RN-13) y creación de filas; la transacción va al final.
//     Si la creación falla a medias, la reserva huérfana se marca CANCELADA (best-effort) y se responde 503.
//
// Idempotencia (EC-16): si ya existe una transacción PENDIENTE vigente de una reserva PENDIENTE_PAGO con los mismos vuelos y
// el mismo conjunto de asientos, se devuelve esa (`existente: true`) sin escribir nada. Dos asientos no pueden estar retenidos
// por dos reservas, así que ese conjunto identifica la reserva. Límite: dos llamadas simultáneas no se serializan (Datum no
// tiene compare-and-set, GAP-08).
import { z } from "zod";
import { esExitRow, existeEnAeronave } from "../lib/asientos.ts";
import { buscarVuelo, cargarCatalogo, parametrosPrecio, validarRegreso } from "../lib/catalogo.ts";
import type { Vuelo } from "../lib/catalogo.ts";
import { generarPnr } from "../lib/asientos.ts";
import { DatumHttpError, DatumNoDisponible, escribirMapaVerificado } from "../lib/datum.ts";
import type { Datum, Sleep } from "../lib/datum.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { Mascota, PasajeroEntrada } from "../lib/esquemas.ts";
import { expiraHold, refijar, tieneHold } from "../lib/hold.ts";
import { cargarReservas } from "../lib/reservas.ts";
import { ejecutar as cotizar } from "../cotizar/logica.ts";

export const entrada = z.object({
  hold_token: z.string().min(1),
  vuelo_ida_id: z.string().min(1),
  vuelo_regreso_id: z.string().min(1).optional(),
  pasajeros: z.array(PasajeroEntrada.extend({
    asiento_ida: z.string().min(2).max(3),
    asiento_regreso: z.string().min(2).max(3).optional(),
  })).min(1).max(9),
  mascota: Mascota.optional(),
  execution_id: z.string().min(1), // valor de {{$context.executionId}}
});

export const salida = z.object({
  transaccion_id: z.string(),
  reserva_id: z.string(),
  pnr: z.string().length(6),
  total_cop: z.number().int(),
  expira_at: z.string(),
  enlace_pago: z.string().url(),
  existente: z.boolean(),
});

export interface Dep {
  datum: Datum;
  ahora: () => Date;
  payPublicUrl: string;
  rng?: () => number;
  sleep?: Sleep;
}

type Entrada = z.infer<typeof entrada>;
const MAX_INTENTOS_PNR = 50;

const mismoConjunto = (a: (string | null)[], b: string[]) =>
  a.length === b.length && b.every((x) => a.includes(x));

function validarAsientos(input: Entrada, hayRegreso: boolean) {
  const ida = input.pasajeros.map((p) => p.asiento_ida.toUpperCase());
  const regreso = input.pasajeros.map((p) => p.asiento_regreso?.toUpperCase());
  if (hayRegreso && regreso.some((a) => a === undefined)) throw new ErrorNegocio("Falta el asiento de regreso de algún pasajero");
  if (!hayRegreso && regreso.some((a) => a !== undefined)) throw new ErrorNegocio("Hay asientos de regreso pero no hay vuelo de regreso");
  const lista = (cs: string[], etiqueta: string) => {
    const malos = cs.filter((c, i) => !existeEnAeronave(c) || cs.indexOf(c) !== i);
    if (malos.length > 0) throw new ErrorNegocio(`Asientos de ${etiqueta} inválidos o repetidos: ${malos.join(", ")}`);
    cs.forEach((c, i) => {
      if (esExitRow(c) && !(input.pasajeros[i].edad >= 15)) throw new ErrorNegocio(`Exit row ${c} exige edad mínima de 15 años`);
    });
    return cs;
  };
  return { ida: lista(ida, "ida"), regreso: hayRegreso ? lista(regreso as string[], "regreso") : [] };
}

const enlace = (dep: Dep, transaccionId: string) => `${dep.payPublicUrl.replace(/\/+$/, "")}/pay/${transaccionId}`;

export async function ejecutar(input: Entrada, dep: Dep): Promise<z.infer<typeof salida>> {
  const ahora = dep.ahora();
  const cat = await cargarCatalogo(dep.datum);
  const ida = buscarVuelo(cat, input.vuelo_ida_id);
  const regreso = input.vuelo_regreso_id === undefined ? undefined : buscarVuelo(cat, input.vuelo_regreso_id);
  if (regreso) validarRegreso(cat, ida, regreso);
  const asientos = validarAsientos(input, regreso !== undefined);

  // 1. Transacción PENDIENTE existente (EC-16).
  const previo = await cargarReservas(dep.datum);
  for (const t of previo.transacciones) {
    if (t.estado !== "PENDIENTE" || !(Date.parse(t.expira_at) > ahora.getTime())) continue;
    const r = previo.reservas.find((x) => x.rowId === t.reserva_id);
    if (!r || r.estado !== "PENDIENTE_PAGO" || r.vuelo_ida_id !== ida.vuelo_id || r.vuelo_regreso_id !== (regreso?.vuelo_id ?? null)) continue;
    const ps = previo.pasajeros.filter((p) => p.reserva_id === r.rowId);
    if (!mismoConjunto(ps.map((p) => p.asiento_ida), asientos.ida)) continue;
    if (regreso && !mismoConjunto(ps.map((p) => p.asiento_regreso), asientos.regreso)) continue;
    return {
      transaccion_id: t.rowId, reserva_id: r.rowId, pnr: r.pnr, total_cop: r.total_cop,
      expira_at: t.expira_at, enlace_pago: enlace(dep, t.rowId), existente: true,
    };
  }

  // 2. Cotización en servidor (400 si el equipaje o la mascota violan reglas).
  const cot = await cotizar({
    vuelo_ida_id: input.vuelo_ida_id,
    vuelo_regreso_id: input.vuelo_regreso_id,
    pasajeros: input.pasajeros.map((p) => ({ edad: p.edad, bodega_ida: p.bodega_ida, bodega_regreso: p.bodega_regreso })),
    mascota: input.mascota,
  }, { datum: dep.datum });

  // 3. Un solo instante de vencimiento (RN-09): re-fijar los holds a creación+15 min.
  const expira = expiraHold(cat, ahora);
  const re = (v: Vuelo, cs: string[]) =>
    escribirMapaVerificado(dep.datum, {
      vueloRowId: v.rowId,
      sleep: dep.sleep,
      mutar: (m) => refijar(m, cs, input.hold_token, expira, dep.ahora()),
      verificar: (m) => tieneHold(m, cs, input.hold_token, expira),
    });
  await re(ida, asientos.ida);
  if (regreso) await re(regreso, asientos.regreso);

  // 4. PNR único (RN-13): leer antes de escribir.
  const usados = new Set((await cargarReservas(dep.datum)).reservas.map((r) => r.pnr));
  let pnr = generarPnr(dep.rng);
  for (let i = 1; usados.has(pnr); i++) {
    if (i >= MAX_INTENTOS_PNR) throw new Error("No se pudo generar un PNR único");
    pnr = generarPnr(dep.rng);
  }

  const camposReserva = {
    pnr, estado: "PENDIENTE_PAGO", vuelo_ida_id: ida.vuelo_id, vuelo_regreso_id: regreso?.vuelo_id ?? null,
    hold_expira: expira, total_cop: cot.total_cop,
  };
  let reservaId: string | undefined;
  try {
    reservaId = (await dep.datum.crear(camposReserva))._id;
    await crearDetalle(input, cot.lineas, cat, reservaId, dep.datum);
    const t = await dep.datum.crear({
      reserva_id: reservaId, estado: "PENDIENTE", expira_at: expira, execution_id: input.execution_id, ultimo_evento: null,
    });
    const leida = await dep.datum.leer(t._id); // verify
    if (leida.fields.estado !== "PENDIENTE" || leida.fields.reserva_id !== reservaId) {
      throw new DatumNoDisponible("No se pudo verificar la transacción creada");
    }
    return {
      transaccion_id: t._id, reserva_id: reservaId, pnr, total_cop: cot.total_cop,
      expira_at: expira, enlace_pago: enlace(dep, t._id), existente: false,
    };
  } catch (e) {
    if (reservaId !== undefined) {
      try { // best-effort: una reserva sin transacción no debe quedar como PENDIENTE_PAGO
        await dep.datum.actualizar(reservaId, { ...camposReserva, estado: "CANCELADA" });
      } catch { /* queda sin transacción y con hold que vence (RN-08) */ }
    }
    if (e instanceof DatumHttpError || e instanceof TypeError) throw new DatumNoDisponible("No se pudo crear la reserva y la transacción");
    throw e;
  }
}

type Lineas = Awaited<ReturnType<typeof cotizar>>["lineas"];

async function crearDetalle(input: Entrada, lineas: Lineas, cat: Awaited<ReturnType<typeof cargarCatalogo>>, reservaId: string, datum: Datum) {
  const divisor = parametrosPrecio(cat).divisor_volumetrico;
  const precio = (concepto: string, trayecto: string, i: number) =>
    lineas.find((l) => l.concepto === concepto && l.trayecto === trayecto && l.pasajero_indice === i)?.monto_cop ?? 0;
  const trayectos = [
    { nombre: "IDA", bodega: (p: Entrada["pasajeros"][number]) => p.bodega_ida },
    ...(input.vuelo_regreso_id ? [{ nombre: "REGRESO", bodega: (p: Entrada["pasajeros"][number]) => p.bodega_regreso }] : []),
  ];
  const ids: string[] = [];
  for (const [i, p] of input.pasajeros.entries()) {
    const fila = await datum.crear({
      reserva_id: reservaId, nombre: p.nombre, documento: p.documento, edad: p.edad,
      asiento_ida: p.asiento_ida.toUpperCase(), asiento_regreso: p.asiento_regreso?.toUpperCase() ?? null,
    });
    ids.push(fila._id);
    for (const t of trayectos) {
      const b = t.bodega(p);
      if (b) {
        await datum.crear({
          pasajero_id: fila._id, reserva_id: reservaId, tipo: "BODEGA", trayecto: t.nombre,
          largo_cm: b.largo_cm, ancho_cm: b.ancho_cm, alto_cm: b.alto_cm, peso_real_kg: b.peso_kg,
          peso_volumetrico_kg: Math.round((b.largo_cm * b.ancho_cm * b.alto_cm / divisor) * 100) / 100,
          precio_cop: precio("EQUIPAJE", t.nombre, i),
        });
      }
      if (p.cabina) {
        await datum.crear({
          pasajero_id: fila._id, reserva_id: reservaId, tipo: "CABINA", trayecto: t.nombre,
          largo_cm: null, ancho_cm: null, alto_cm: null, peso_real_kg: null, peso_volumetrico_kg: null, precio_cop: 0,
        });
      }
    }
  }
  const m = input.mascota;
  if (m) {
    await datum.crear({
      pasajero_id: ids[m.pasajero_indice], reserva_id: reservaId, especie: m.especie, peso_kg: m.peso_kg,
      precio_cop: lineas.find((l) => l.concepto === "MASCOTA")?.monto_cop ?? 0,
    });
  }
}
