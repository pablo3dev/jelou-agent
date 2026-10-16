// adapter: out — lectura del catálogo (rutas, temporada, parametros, vuelos) desde Datum, una consulta por colección.
//
// `vuelo_id` = `_id` del registro de `vuelos` (p. ej. "bogmde20261201"); `rowId` es ese mismo valor.
// La ruta lógica `BOG-MDE` se arma como `${origen}-${destino}` (la colección `rutas` no trae campo `id`);
// `vuelos.ruta_id` ya guarda esa forma.
// Lectura pura: sin efecto de lado, naturalmente idempotente.

import type { MapaAsientos } from "./asientos.ts";
import type { Datum } from "./datum.ts";
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

const texto = (v: unknown) => String(v ?? "");

function mapaDe(bruto: unknown): MapaAsientos {
  return (typeof bruto === "string" ? JSON.parse(bruto) : bruto) as MapaAsientos;
}

export async function cargarCatalogo(datum: Datum): Promise<Catalogo> {
  const [rutas, temporada, parametros, vuelos] = await Promise.all([
    datum.listar("rutas"),
    datum.listar("temporada"),
    datum.listar("parametros"),
    datum.listar("vuelos"),
  ]);
  return {
    rutas: rutas.map(({ fields: f }) => ({
      id: `${texto(f.origen)}-${texto(f.destino)}`,
      origen: texto(f.origen),
      destino: texto(f.destino),
      tarifa_base_cop: Number(f.tarifa_base_cop),
    })),
    temporada: Object.fromEntries(temporada.map(({ fields: f }) => [Number(f.mes), Number(f.multiplicador)])),
    parametros: Object.fromEntries(parametros.map(({ fields: f }) => [texto(f.clave), Number(f.valor)])),
    vuelos: vuelos.map(({ _id, fields: f }) => ({
      vuelo_id: _id,
      rowId: _id,
      ruta_id: texto(f.ruta_id),
      fecha: texto(f.fecha).slice(0, 10),
      hora_salida: texto(f.hora_salida),
      mapa: mapaDe(f.mapa_asientos),
    })),
  };
}

export function buscarVuelo(cat: Catalogo, id: string): Vuelo {
  const v = cat.vuelos.find((x) => x.vuelo_id === id);
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
