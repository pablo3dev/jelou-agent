// adapter: out — lectura de reservas, transacciones y pasajeros desde Datum.
//
// SUPUESTO (igual que catalogo.ts): el cliente Datum está atado a una base; se listan todas las filas y cada
// una se clasifica por su forma: reserva = {pnr, vuelo_ida_id}; transacción = {reserva_id, expira_at};
// pasajero = {reserva_id, documento}. `reserva_id` / `transaccion_id` = `_id` de la fila (Datum lo asigna).
// Lectura pura: sin efecto de lado.
import type { Datum } from "./datum.ts";
import { listarTodo } from "./catalogo.ts";

export interface ReservaFila {
  rowId: string;
  pnr: string;
  estado: string;
  vuelo_ida_id: string;
  vuelo_regreso_id: string | null;
  hold_expira: string;
  total_cop: number;
}
export interface TransaccionFila {
  rowId: string;
  reserva_id: string;
  estado: string;
  expira_at: string;
}
export interface PasajeroFila {
  reserva_id: string;
  asiento_ida: string | null;
  asiento_regreso: string | null;
}

const texto = (v: unknown) => String(v ?? "");
const textoONulo = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function cargarReservas(datum: Datum) {
  const reservas: ReservaFila[] = [];
  const transacciones: TransaccionFila[] = [];
  const pasajeros: PasajeroFila[] = [];
  for (const { _id, fields: f } of await listarTodo(datum)) {
    if (f.pnr !== undefined && f.vuelo_ida_id !== undefined) {
      reservas.push({
        rowId: _id,
        pnr: texto(f.pnr),
        estado: texto(f.estado),
        vuelo_ida_id: texto(f.vuelo_ida_id),
        vuelo_regreso_id: textoONulo(f.vuelo_regreso_id),
        hold_expira: texto(f.hold_expira),
        total_cop: Number(f.total_cop),
      });
    } else if (f.reserva_id !== undefined && f.expira_at !== undefined) {
      transacciones.push({ rowId: _id, reserva_id: texto(f.reserva_id), estado: texto(f.estado), expira_at: texto(f.expira_at) });
    } else if (f.reserva_id !== undefined && f.documento !== undefined) {
      pasajeros.push({ reserva_id: texto(f.reserva_id), asiento_ida: textoONulo(f.asiento_ida), asiento_regreso: textoONulo(f.asiento_regreso) });
    }
  }
  return { reservas, transacciones, pasajeros };
}
