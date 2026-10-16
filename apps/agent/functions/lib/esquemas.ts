// Esquemas zod compartidos de entrada (contrato: apps/agent/contract/endpoints.md § Esquemas zod compartidos).
import { z } from "zod";
import { fechaEnVentana } from "./asientos.ts";

export const RutaId = z.enum(["BOG-MDE", "MDE-BOG", "BOG-CLO", "CLO-BOG", "BOG-CTG", "CTG-BOG"]);

// RN-14: ventana 2026-12-01 .. 2027-01-31 inclusive; la fecha debe existir en el calendario.
export const FechaViaje = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(fechaEnVentana);

export const NumPasajeros = z.number().int().min(1).max(9); // RN-15

export const Bodega = z.object({ // RN-04
  largo_cm: z.number().int().positive(),
  ancho_cm: z.number().int().positive(),
  alto_cm: z.number().int().positive(),
  peso_kg: z.number().positive().max(32),
}).refine((b) => b.largo_cm + b.ancho_cm + b.alto_cm <= 158);

export const Mascota = z.object({ // RN-05
  pasajero_indice: z.number().int().min(0).max(8),
  especie: z.string().min(1).max(50),
  peso_kg: z.number().positive().max(8),
});

export const PasajeroEntrada = z.object({
  nombre: z.string().min(1).max(120),
  documento: z.string().min(1).max(30),
  edad: z.number().int().min(0).max(120),
  cabina: z.boolean().default(true), // cabina: sin costo y sin medidas (RN-03)
  bodega_ida: Bodega.optional(),
  bodega_regreso: Bodega.optional(),
});
