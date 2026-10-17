// REQ-03 / RN-04: precio de una pieza de bodega según la temporada del mes del vuelo. Lectura pura; sin efecto.
import { z } from "zod";
import { buscarVuelo, cargarCatalogo, parametrosPrecio } from "../lib/catalogo.ts";
import type { Datum } from "../lib/datum.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { Bodega } from "../lib/esquemas.ts";
import { multiplicadorDeFecha, precioBodega } from "../lib/precios.ts";

export const entrada = z.object({
  vuelo_id: z.string().min(1),
  bodega: Bodega,
});

export const salida = z.object({
  peso_volumetrico_kg: z.number(),
  cobrable_kg: z.number().int(),
  precio_cop: z.number().int(),
});

export async function ejecutar(input: z.infer<typeof entrada>, dep: { datum: Datum }): Promise<z.infer<typeof salida>> {
  const cat = await cargarCatalogo(dep.datum);
  const vuelo = buscarVuelo(cat, input.vuelo_id);
  const r = precioBodega(input.bodega, parametrosPrecio(cat), multiplicadorDeFecha(vuelo.fecha, cat.temporada));
  if (!r.ok) throw new ErrorNegocio(r.error);
  return { peso_volumetrico_kg: r.peso_volumetrico_kg, cobrable_kg: r.cobrable_kg, precio_cop: r.precio_cop };
}
