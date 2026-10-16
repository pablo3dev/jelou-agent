// REQ-02 / RN-01, RN-02, RN-04, RN-05, RN-07: cotización de pasajes, equipaje de bodega y mascota.
// Lectura pura; sin efecto. Precios y totales los calcula el servidor (ninguna entrada los trae).
import { z } from "zod";
import { buscarRuta, buscarVuelo, cargarCatalogo, parametrosPrecio, validarRegreso } from "../lib/catalogo.ts";
import type { Datum } from "../lib/datum.ts";
import { ErrorNegocio } from "../lib/errores.ts";
import { Bodega, Mascota } from "../lib/esquemas.ts";
import { multiplicadorDeFecha, precioBodega, precioMascota, precioPasaje, totalCop } from "../lib/precios.ts";

export const entrada = z.object({
  vuelo_ida_id: z.string().min(1),
  vuelo_regreso_id: z.string().min(1).optional(),
  pasajeros: z.array(z.object({
    edad: z.number().int().min(0).max(120),
    bodega_ida: Bodega.optional(),
    bodega_regreso: Bodega.optional(),
  })).min(1).max(9),
  mascota: Mascota.optional(),
});

export const salida = z.object({
  lineas: z.array(z.object({
    concepto: z.enum(["PASAJE", "EQUIPAJE", "MASCOTA"]),
    trayecto: z.enum(["IDA", "REGRESO"]).optional(),
    pasajero_indice: z.number().int().optional(),
    monto_cop: z.number().int(),
  })),
  total_cop: z.number().int(),
});

type Linea = z.infer<typeof salida>["lineas"][number];

export async function ejecutar(input: z.infer<typeof entrada>, dep: { datum: Datum }): Promise<z.infer<typeof salida>> {
  const cat = await cargarCatalogo(dep.datum);
  const params = parametrosPrecio(cat);
  const ida = buscarVuelo(cat, input.vuelo_ida_id);
  const regreso = input.vuelo_regreso_id === undefined ? undefined : buscarVuelo(cat, input.vuelo_regreso_id);

  if (regreso) validarRegreso(cat, ida, regreso);
  const sinRegreso = !regreso && input.pasajeros.some((p) => p.bodega_regreso !== undefined);
  if (sinRegreso) throw new ErrorNegocio("Hay equipaje de regreso pero no hay vuelo de regreso");
  const m = input.mascota;
  if (m && m.pasajero_indice >= input.pasajeros.length) throw new ErrorNegocio("pasajero_indice de la mascota fuera de rango");

  const trayectos = [
    { nombre: "IDA" as const, vuelo: ida, bodega: (p: typeof input.pasajeros[number]) => p.bodega_ida },
    ...(regreso ? [{ nombre: "REGRESO" as const, vuelo: regreso, bodega: (p: typeof input.pasajeros[number]) => p.bodega_regreso }] : []),
  ];
  const lineas: Linea[] = [];
  input.pasajeros.forEach((p, i) => {
    for (const t of trayectos) {
      const mult = multiplicadorDeFecha(t.vuelo.fecha, cat.temporada);
      const ruta = buscarRuta(cat, t.vuelo.ruta_id);
      lineas.push({ concepto: "PASAJE", trayecto: t.nombre, pasajero_indice: i, monto_cop: precioPasaje(ruta.tarifa_base_cop, mult) });
      const bodega = t.bodega(p);
      if (bodega) {
        const r = precioBodega(bodega, params, mult);
        if (!r.ok) throw new ErrorNegocio(`Pasajero ${i}, ${t.nombre}: ${r.error}`);
        lineas.push({ concepto: "EQUIPAJE", trayecto: t.nombre, pasajero_indice: i, monto_cop: r.precio_cop });
      }
    }
  });
  if (m) {
    // Supuesto: la temporada de la mascota es la del vuelo de ida (el draft no fija el trayecto; línea única).
    const r = precioMascota(m.peso_kg, params, multiplicadorDeFecha(ida.fecha, cat.temporada));
    if (!r.ok) throw new ErrorNegocio(r.error);
    lineas.push({ concepto: "MASCOTA", trayecto: "IDA", pasajero_indice: m.pasajero_indice, monto_cop: r.precio_cop });
  }
  return { lineas, total_cop: totalCop(lineas.map((l) => l.monto_cop)) };
}
