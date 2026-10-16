// Solo para pruebas: Datum en memoria que cumple la interfaz `Datum` y registra llamadas.
import type { Datum, Fila } from "./datum.ts";
import { clavesMapa } from "./asientos.ts";
import type { Asiento, MapaAsientos } from "./asientos.ts";

export function datumSimulado(filas: Fila[]): Datum & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    listar(limit, page) {
      llamadas.push(`listar:${page}`);
      return Promise.resolve(filas.slice((page - 1) * limit, page * limit));
    },
    crear: () => Promise.reject(new Error("crear no esperado en lecturas puras")),
    actualizar: () => Promise.reject(new Error("actualizar no esperado en lecturas puras")),
    leer(rowId) {
      llamadas.push(`leer:${rowId}`);
      const f = filas.find((x) => x._id === rowId);
      return f ? Promise.resolve(f) : Promise.reject(new Error("no existe"));
    },
  };
}

export const LIBRE: Asiento = { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null };

export function mapaLibre(): MapaAsientos {
  return Object.fromEntries(clavesMapa().map((c) => [c, { ...LIBRE }]));
}

const TEMPORADA_ALTA = [1, 6, 7, 12];

// Catálogo mínimo: 2 rutas inversas, 12 meses, parámetros comerciales y 3 vuelos.
export function filasCatalogo(): Fila[] {
  const filas: Fila[] = [
    { _id: "r1", fields: { id: "BOG-MDE", origen: "BOG", destino: "MDE", tarifa_base_cop: 200000 } },
    { _id: "r2", fields: { id: "MDE-BOG", origen: "MDE", destino: "BOG", tarifa_base_cop: 210000 } },
  ];
  for (let mes = 1; mes <= 12; mes++) {
    filas.push({ _id: `t${mes}`, fields: { mes, multiplicador: TEMPORADA_ALTA.includes(mes) ? 1.3 : 1.0 } });
  }
  const params: Record<string, number> = {
    tarifa_kg_bodega_cop: 12000,
    cargo_minimo_bodega_cop: 40000,
    tarifa_mascota_cop: 150000,
    divisor_volumetrico: 6000,
    max_lineal_bodega_cm: 158,
    max_peso_bodega_kg: 32,
    peso_max_mascota_kg: 8,
    max_mascotas_reserva: 1,
    max_piezas_bodega_pasajero: 1,
  };
  for (const [clave, valor] of Object.entries(params)) filas.push({ _id: `p-${clave}`, fields: { clave, valor } });
  const vuelo = (_id: string, ruta_id: string, fecha: string): Fila => ({
    _id,
    fields: { id: _id, ruta_id, fecha, hora_salida: "07:00", mapa_asientos: mapaLibre(), version: 0 },
  });
  filas.push(
    vuelo("v-ida-dic", "BOG-MDE", "2026-12-10"),
    vuelo("v-reg-dic", "MDE-BOG", "2026-12-20"),
    vuelo("v-ida-ene31", "BOG-MDE", "2027-01-31"),
  );
  return filas;
}
