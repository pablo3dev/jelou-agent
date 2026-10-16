// Solo para pruebas: Datum en memoria que cumple la interfaz `Datum` por colección y registra llamadas.
//
// Los fixtures son `Fila[]` sin colección: aquí (y SOLO aquí) se clasifican por forma en colecciones.
import { DatumHttpError } from "./datum.ts";
import type { Datum, Fila, OpcionesListado } from "./datum.ts";
import { clavesMapa } from "./asientos.ts";
import type { Asiento, MapaAsientos } from "./asientos.ts";

const tiene = (f: Record<string, unknown>, ...claves: string[]) => claves.every((k) => f[k] !== undefined);

function coleccionDe(f: Record<string, unknown>): string {
  if (tiene(f, "ruta_id", "mapa_asientos")) return "vuelos";
  if (tiene(f, "origen", "destino", "tarifa_base_cop")) return "rutas";
  if (tiene(f, "mes", "multiplicador")) return "temporada";
  if (tiene(f, "clave", "valor")) return "parametros";
  if (tiene(f, "pnr", "vuelo_ida_id")) return "reservas";
  if (tiene(f, "reserva_id", "expira_at")) return "transacciones";
  if (tiene(f, "reserva_id", "documento")) return "pasajeros";
  if (tiene(f, "id_evento")) return "eventos_pago";
  return "otros";
}

// Soporta `campo="valor"` combinados con ` && ` (valores con `\"` y `\` escapados).
function coincide(fila: Fila, filter?: string): boolean {
  if (!filter) return true;
  return filter.split(" && ").every((cond) => {
    const m = /^(\w+)="((?:[^"\\]|\\.)*)"$/.exec(cond.trim());
    if (!m) throw new Error(`Filtro no soportado por el simulado: ${cond}`);
    const valor = m[2].replace(/\\(.)/g, "$1");
    const actual = m[1] === "id" ? fila._id : fila.fields[m[1]];
    return String(actual ?? "") === valor;
  });
}

export interface OpcionesEscribible {
  perderEscritura?: (rowId: string) => boolean; // el PATCH responde bien pero no se aplica (falla el verify)
  fallaCrear?: (fields: Record<string, unknown>) => boolean; // el POST responde 500
}

// Datum en memoria con escritura: crear (id n1, n2... o el dado; repetido => 400 validation_not_unique),
// actualizar (fusiona campos) y leer/listar con copias. `almacen` es por colección.
export function datumEscribible(filas: Fila[], opc: OpcionesEscribible = {}) {
  const almacen: Record<string, Fila[]> = {};
  for (const f of structuredClone(filas)) (almacen[coleccionDe(f.fields)] ??= []).push(f);
  const llamadas: string[] = [];
  const creadas: Fila[] = [];
  let n = 0;
  const de = (coleccion: string) => (almacen[coleccion] ??= []);
  const noExiste = () => new DatumHttpError(404, "Datum respondió 404 (no existe)");
  const datum: Datum = {
    listar(coleccion: string, o: OpcionesListado = {}) {
      llamadas.push(`listar:${coleccion}`);
      return Promise.resolve(structuredClone(de(coleccion).filter((f) => coincide(f, o.filter))));
    },
    crear(coleccion, fields, id) {
      llamadas.push("crear");
      if (opc.fallaCrear?.(fields)) return Promise.reject(new DatumHttpError(500, "Datum respondió 500 a POST"));
      if (id !== undefined && de(coleccion).some((f) => f._id === id)) {
        return Promise.reject(new DatumHttpError(400, "Datum respondió 400 a POST", "validation_not_unique"));
      }
      const fila = { _id: id ?? `n${++n}`, fields: structuredClone(fields) };
      de(coleccion).push(fila);
      creadas.push(fila);
      return Promise.resolve(structuredClone(fila));
    },
    actualizar(coleccion, rowId, fields) {
      llamadas.push(`actualizar:${rowId}`);
      const fila = de(coleccion).find((x) => x._id === rowId);
      if (!fila) return Promise.reject(noExiste());
      if (!opc.perderEscritura?.(rowId)) fila.fields = { ...fila.fields, ...structuredClone(fields) };
      return Promise.resolve(structuredClone(fila));
    },
    leer(coleccion, rowId) {
      llamadas.push(`leer:${rowId}`);
      const fila = de(coleccion).find((x) => x._id === rowId);
      return fila ? Promise.resolve(structuredClone(fila)) : Promise.reject(noExiste());
    },
  };
  const todas = () => Object.values(almacen).flat();
  const fila = (id: string) => todas().find((f) => f._id === id)!; // los ids de fixtures son únicos entre colecciones
  return { datum, almacen, llamadas, creadas, todas, fila };
}

// Variante de solo lectura (crear/actualizar rechazan): para las functions de lectura pura.
export function datumSimulado(filas: Fila[]): Datum & { llamadas: string[] } {
  const { datum, llamadas } = datumEscribible(filas);
  return {
    ...datum,
    llamadas,
    crear: () => Promise.reject(new Error("crear no esperado en lecturas puras")),
    actualizar: () => Promise.reject(new Error("actualizar no esperado en lecturas puras")),
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
    { _id: "r1", fields: { origen: "BOG", destino: "MDE", tarifa_base_cop: 200000 } },
    { _id: "r2", fields: { origen: "MDE", destino: "BOG", tarifa_base_cop: 210000 } },
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
    fields: { ruta_id, fecha, hora_salida: "07:00", mapa_asientos: mapaLibre(), version: 0 },
  });
  filas.push(
    vuelo("v-ida-dic", "BOG-MDE", "2026-12-10"),
    vuelo("v-reg-dic", "MDE-BOG", "2026-12-20"),
    vuelo("v-ida-ene31", "BOG-MDE", "2027-01-31"),
  );
  return filas;
}
