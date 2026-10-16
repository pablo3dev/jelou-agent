// adapter: out — lectura del catálogo (rutas, temporada, parametros, vuelos) desde Datum.
//
// SUPUESTO (GAP de direccionamiento, ver datum.ts): el cliente Datum está atado a una base y learning.md no
// muestra cómo se direcciona una colección. Se listan todas las filas de la base y cada una se clasifica por su
// forma: vuelo = {ruta_id, mapa_asientos}; ruta = {origen, destino, tarifa_base_cop}; temporada = {mes, multiplicador};
// parámetro = {clave, valor}. Se confirma en el spike 3.1.
// `vuelo_id` = `fields.id` si existe; si no, el `_id` de la fila. Al buscar se acepta cualquiera de los dos.
// Lectura pura: sin efecto de lado, naturalmente idempotente.

import type { MapaAsientos } from "./asientos.ts";
import type { Datum, Fila } from "./datum.ts";
import { ErrorNegocio } from "./errores.ts";
import type { ParametrosPrecio } from "./precios.ts";

export interface Ruta {
  id: string;
  origen: string;
  destino: string;
  tarifa_base_cop: number;
}

export interface Vuelo {
  vuelo_id: string;
  rowId: string;
  ruta_id: string;
  fecha: string; // YYYY-MM-DD
  hora_salida: string;
  mapa: MapaAsientos;
}

export interface Catalogo {
  rutas: Ruta[];
  temporada: Record<number, number>;
  parametros: Record<string, number>;
  vuelos: Vuelo[];
}

const PAGINA = 100;
const MAX_PAGINAS = 20;

export async function listarTodo(datum: Datum): Promise<Fila[]> {
  const vistas = new Map<string, Fila>();
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const filas = await datum.listar(PAGINA, pagina);
    const nuevas = filas.filter((f) => !vistas.has(f._id));
    nuevas.forEach((f) => vistas.set(f._id, f));
    if (filas.length < PAGINA || nuevas.length === 0) break; // última página, o la API ignora `page`
  }
  return [...vistas.values()];
}

const texto = (v: unknown) => String(v ?? "");

function mapaDe(bruto: unknown): MapaAsientos {
  return (typeof bruto === "string" ? JSON.parse(bruto) : bruto) as MapaAsientos;
}

export async function cargarCatalogo(datum: Datum): Promise<Catalogo> {
  const cat: Catalogo = { rutas: [], temporada: {}, parametros: {}, vuelos: [] };
  for (const { _id, fields: f } of await listarTodo(datum)) {
    if (f.mapa_asientos !== undefined && f.ruta_id !== undefined) {
      cat.vuelos.push({
        vuelo_id: texto(f.id ?? _id),
        rowId: _id,
        ruta_id: texto(f.ruta_id),
        fecha: texto(f.fecha).slice(0, 10),
        hora_salida: texto(f.hora_salida),
        mapa: mapaDe(f.mapa_asientos),
      });
    } else if (f.tarifa_base_cop !== undefined && f.origen !== undefined) {
      cat.rutas.push({
        id: texto(f.id ?? `${f.origen}-${f.destino}`),
        origen: texto(f.origen),
        destino: texto(f.destino),
        tarifa_base_cop: Number(f.tarifa_base_cop),
      });
    } else if (f.mes !== undefined && f.multiplicador !== undefined) {
      cat.temporada[Number(f.mes)] = Number(f.multiplicador);
    } else if (f.clave !== undefined && f.valor !== undefined) {
      cat.parametros[texto(f.clave)] = Number(f.valor);
    }
  }
  return cat;
}

export function buscarVuelo(cat: Catalogo, id: string): Vuelo {
  const v = cat.vuelos.find((x) => x.vuelo_id === id || x.rowId === id);
  if (!v) throw new ErrorNegocio(`Vuelo no encontrado: ${id}`);
  return v;
}

export function buscarRuta(cat: Catalogo, id: string): Ruta {
  const r = cat.rutas.find((x) => x.id === id);
  if (!r) throw new ErrorNegocio(`Ruta no encontrada: ${id}`);
  return r;
}

// Ruta con origen y destino intercambiados (cada sentido es una fila de `rutas`).
export function rutaInversa(cat: Catalogo, ruta: Ruta): Ruta {
  const r = cat.rutas.find((x) => x.origen === ruta.destino && x.destino === ruta.origen);
  if (!r) throw new ErrorNegocio(`No existe la ruta inversa de ${ruta.id}`);
  return r;
}

// RN-09/RN-14: el regreso es de la ruta inversa y no es anterior a la ida.
export function validarRegreso(cat: Catalogo, ida: Vuelo, regreso: Vuelo): void {
  if (regreso.ruta_id !== rutaInversa(cat, buscarRuta(cat, ida.ruta_id)).id) {
    throw new ErrorNegocio("El vuelo de regreso debe ser de la ruta inversa a la de ida");
  }
  if (regreso.fecha < ida.fecha) throw new ErrorNegocio("El vuelo de regreso no puede ser anterior al de ida");
}

const CLAVES_PRECIO: (keyof ParametrosPrecio)[] = [
  "tarifa_kg_bodega_cop",
  "cargo_minimo_bodega_cop",
  "tarifa_mascota_cop",
  "max_lineal_bodega_cm",
  "max_peso_bodega_kg",
  "peso_max_mascota_kg",
  "max_mascotas_reserva",
  "max_piezas_bodega_pasajero",
  "divisor_volumetrico",
];

// Parámetros faltantes son un fallo de datos del servidor (500), no del cliente.
export function parametrosPrecio(cat: Catalogo): ParametrosPrecio {
  const faltan = CLAVES_PRECIO.filter((k) => !Number.isFinite(cat.parametros[k]));
  if (faltan.length > 0) throw new Error(`Faltan parámetros en Datum: ${faltan.join(", ")}`);
  return Object.fromEntries(CLAVES_PRECIO.map((k) => [k, cat.parametros[k]])) as unknown as ParametrosPrecio;
}
