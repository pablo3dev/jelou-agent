// REQ-01: lista las rutas con su tarifa base. Lectura pura; sin efecto.
import { z } from "zod";
import { cargarCatalogo } from "../lib/catalogo.ts";
import type { Datum } from "../lib/datum.ts";

export const entrada = z.object({});

export const salida = z.object({
  rutas: z.array(z.object({
    id: z.string(),
    origen: z.string(),
    destino: z.string(),
    tarifa_base_cop: z.number(),
  })),
});

export async function ejecutar(_entrada: z.infer<typeof entrada>, dep: { datum: Datum }): Promise<z.infer<typeof salida>> {
  const cat = await cargarCatalogo(dep.datum);
  return { rutas: cat.rutas.map(({ id, origen, destino, tarifa_base_cop }) => ({ id, origen, destino, tarifa_base_cop })) };
}
