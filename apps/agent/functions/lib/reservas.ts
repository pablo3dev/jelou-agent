// adapter: out — lectura de reservas, transacciones y pasajeros desde Datum con filtros en servidor.
//
// `reserva_id` / `transaccion_id` = `_id` del registro (Datum lo asigna). Lectura pura: sin efecto de lado.
import { DatumHttpError, literalFiltro } from "./datum.ts";
import type { Datum, Fila } from "./datum.ts";

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

const aReserva = ({ _id, fields: f }: Fila): ReservaFila => ({
  rowId: _id,
  pnr: texto(f.pnr),
  estado: texto(f.estado),
  vuelo_ida_id: texto(f.vuelo_ida_id),
  vuelo_regreso_id: textoONulo(f.vuelo_regreso_id),
  hold_expira: texto(f.hold_expira),
  total_cop: Number(f.total_cop),
});

export async function transaccionesPendientes(datum: Datum): Promise<TransaccionFila[]> {
  const filas = await datum.listar("transacciones", { filter: `estado=${literalFiltro("PENDIENTE")}` });
  return filas.map(({ _id, fields: f }) => ({
    rowId: _id,
    reserva_id: texto(f.reserva_id),
    estado: texto(f.estado),
    expira_at: texto(f.expira_at),
  }));
}

export async function leerReserva(datum: Datum, id: string): Promise<ReservaFila | null> {
  try {
    return aReserva(await datum.leer("reservas", id));
  } catch (e) {
    if (e instanceof DatumHttpError && e.httpStatus === 404) return null;
    throw e;
  }
}

export async function pasajerosDeReserva(datum: Datum, reservaId: string): Promise<PasajeroFila[]> {
  const filas = await datum.listar("pasajeros", { filter: `reserva_id=${literalFiltro(reservaId)}` });
  return filas.map(({ fields: f }) => ({
    reserva_id: texto(f.reserva_id),
    asiento_ida: textoONulo(f.asiento_ida),
    asiento_regreso: textoONulo(f.asiento_regreso),
  }));
}

export async function pnrEnUso(datum: Datum, pnr: string): Promise<boolean> {
  return (await datum.listar("reservas", { filter: `pnr=${literalFiltro(pnr)}`, fields: "id" })).length > 0;
}
