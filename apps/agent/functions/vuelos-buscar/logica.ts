// REQ-01: vuelos de ida (y de regreso por la ruta inversa) en la ventana. Lectura pura; sin efecto.
import { z } from "zod";
import { estaLibre } from "../lib/asientos.ts";
import { buscarRuta, cargarCatalogo, rutaInversa } from "../lib/catalogo.ts";
import type { Catalogo } from "../lib/catalogo.ts";
import type { Datum } from "../lib/datum.ts";
import { FechaViaje, NumPasajeros, RutaId } from "../lib/esquemas.ts";
import { multiplicadorDeFecha, precioPasaje } from "../lib/precios.ts";

export const entrada = z.object({
  ruta_id: RutaId,
  fecha_ida: FechaViaje,
  fecha_regreso: FechaViaje.optional(),
  pasajeros: NumPasajeros,
}).refine((i) => i.fecha_regreso === undefined || i.fecha_regreso >= i.fecha_ida, {
  message: "fecha_regreso debe ser mayor o igual a fecha_ida",
});

const VueloResumen = z.object({
  vuelo_id: z.string(),
  ruta_id: z.string(),
  fecha: z.string(),
  hora_salida: z.string(),
  asientos_libres: z.number().int(),
  tarifa_pasajero_cop: z.number().int(),
  mapa_url: z.string().optional(), // widget de seleccion de asientos del CRM (solo si hay CRM_PUBLIC_URL)
});

export const salida = z.object({
  ida: z.array(VueloResumen),
  regreso: z.array(VueloResumen).optional(),
});

// RN-08: LIBRE más RETENIDO vencido cuentan como libres. RN-01/02/07: tarifa con temporada del mes del vuelo, redondeada.
function resumir(cat: Catalogo, rutaId: string, fecha: string, ahora: Date, pasajeros: number, crmUrl?: string) {
  const ruta = buscarRuta(cat, rutaId);
  return cat.vuelos
    .filter((v) => v.ruta_id === rutaId && v.fecha === fecha)
    .map((v) => ({
      vuelo_id: v.vuelo_id,
      ruta_id: v.ruta_id,
      fecha: v.fecha,
      hora_salida: v.hora_salida,
      asientos_libres: Object.values(v.mapa).filter((a) => estaLibre(a, ahora)).length,
      tarifa_pasajero_cop: precioPasaje(ruta.tarifa_base_cop, multiplicadorDeFecha(v.fecha, cat.temporada)),
      ...(crmUrl ? { mapa_url: `${crmUrl.replace(/\/+$/, "")}/#/asientos/${v.vuelo_id}/${pasajeros}` } : {}),
    }));
}

// `pasajeros` solo se valida (RN-15): no filtra vuelos; el agente compara con `asientos_libres`.
export async function ejecutar(
  input: z.infer<typeof entrada>,
  dep: { datum: Datum; ahora: Date; crmPublicUrl?: string },
): Promise<z.infer<typeof salida>> {
  const cat = await cargarCatalogo(dep.datum);
  const ida = resumir(cat, input.ruta_id, input.fecha_ida, dep.ahora, input.pasajeros, dep.crmPublicUrl);
  if (input.fecha_regreso === undefined) return { ida };
  const inversa = rutaInversa(cat, buscarRuta(cat, input.ruta_id));
  return { ida, regreso: resumir(cat, inversa.id, input.fecha_regreso, dep.ahora, input.pasajeros, dep.crmPublicUrl) };
}
