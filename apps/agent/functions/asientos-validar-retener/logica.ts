// REQ-05 / RN-06, RN-08, RN-09: valida la selección de asientos y retiene LIBRE -> RETENIDO por 15 min.
// Idempotencia: la retención usa un hold_token nuevo por llamada; el write-then-verify es seguro de reintentar
// (si un PUT ya se aplicó, `mutar` reconoce los asientos con el token propio y no los vuelve a validar).
// Una repetición de la llamada completa (sin token de entrada) ve los asientos ya RETENIDOS y se rechaza como "no libre".
import { z } from "zod";
import { validarSeleccion } from "../lib/asientos.ts";
import type { MapaAsientos } from "../lib/asientos.ts";
import { buscarVuelo, cargarCatalogo, validarRegreso } from "../lib/catalogo.ts";
import type { Vuelo } from "../lib/catalogo.ts";
import { escribirMapaVerificado } from "../lib/datum.ts";
import type { Datum, Sleep } from "../lib/datum.ts";
import { ErrorAsientos, ErrorNegocio } from "../lib/errores.ts";
import { expiraHold, liberar, retener, sinHold, tieneHold } from "../lib/hold.ts";

export const entrada = z.object({
  vuelo_ida_id: z.string().min(1),
  vuelo_regreso_id: z.string().min(1).optional(),
  edades: z.array(z.number().int().min(0).max(120)).min(1).max(9),
  asientos_ida: z.string().min(1).max(100),
  asientos_regreso: z.string().min(1).max(100).optional(),
});

export const salida = z.object({ hold_token: z.string(), hold_expira: z.string() });

export interface Dep {
  datum: Datum;
  ahora: () => Date;
  nuevoToken: () => string;
  sleep?: Sleep;
}

type Seleccion = { vuelo: Vuelo; texto: string };

function validar(s: Seleccion, edades: number[], mapa: MapaAsientos, ahora: Date) {
  const r = validarSeleccion(s.texto, edades, mapa, ahora);
  return r.ok ? r.asientos : { invalidos: r.invalidos, motivo: `${r.motivo} (${s.vuelo.vuelo_id})` };
}

// Retiene los asientos de un trayecto con write-then-verify; revalida sobre el mapa fresco en cada intento.
async function retenerTrayecto(s: Seleccion, edades: number[], token: string, expira: string, asientos: string[], dep: Dep) {
  await escribirMapaVerificado(dep.datum, {
    vueloRowId: s.vuelo.rowId,
    sleep: dep.sleep,
    mutar: (mapa) => {
      if (tieneHold(mapa, asientos, token)) return mapa; // reintento tras un PUT ya aplicado
      const r = validar(s, edades, mapa, dep.ahora());
      if (!Array.isArray(r)) throw new ErrorAsientos(r.invalidos, [`Asientos inválidos: ${r.motivo}`]);
      return retener(mapa, r, token, expira);
    },
    verificar: (mapa) => tieneHold(mapa, asientos, token, expira),
    deshacer: (mapa) => liberar(mapa, asientos, token),
  });
}

async function liberarTrayecto(s: Seleccion, token: string, asientos: string[], dep: Dep) {
  try { // best-effort: si falla, el hold vence por hold_expira (RN-08)
    await escribirMapaVerificado(dep.datum, {
      vueloRowId: s.vuelo.rowId,
      sleep: dep.sleep,
      mutar: (mapa) => liberar(mapa, asientos, token),
      verificar: (mapa) => sinHold(mapa, asientos, token),
    });
  } catch { /* nada más que hacer */ }
}

export async function ejecutar(input: z.infer<typeof entrada>, dep: Dep): Promise<z.infer<typeof salida>> {
  const ahora = dep.ahora();
  const cat = await cargarCatalogo(dep.datum);
  const ida = buscarVuelo(cat, input.vuelo_ida_id);
  const regreso = input.vuelo_regreso_id === undefined ? undefined : buscarVuelo(cat, input.vuelo_regreso_id);
  if (regreso) validarRegreso(cat, ida, regreso);
  if (regreso && input.asientos_regreso === undefined) throw new ErrorNegocio("Faltan los asientos del vuelo de regreso");
  if (!regreso && input.asientos_regreso !== undefined) throw new ErrorNegocio("Hay asientos de regreso pero no hay vuelo de regreso");

  const trayectos: Seleccion[] = [{ vuelo: ida, texto: input.asientos_ida }];
  if (regreso) trayectos.push({ vuelo: regreso, texto: input.asientos_regreso! });

  // Validación completa de todos los trayectos ANTES de retener nada (sin retención parcial).
  const invalidos: string[] = [];
  const motivos: string[] = [];
  const listas: string[][] = [];
  for (const t of trayectos) {
    const r = validar(t, input.edades, t.vuelo.mapa, ahora);
    if (Array.isArray(r)) listas.push(r);
    else {
      invalidos.push(...r.invalidos);
      motivos.push(`Asientos inválidos: ${r.motivo}`);
    }
  }
  if (motivos.length > 0) throw new ErrorAsientos(invalidos, motivos);

  const token = dep.nuevoToken();
  const expira = expiraHold(cat, ahora);
  await retenerTrayecto(trayectos[0], input.edades, token, expira, listas[0], dep);
  if (regreso) {
    try {
      await retenerTrayecto(trayectos[1], input.edades, token, expira, listas[1], dep);
    } catch (e) {
      await liberarTrayecto(trayectos[0], token, listas[0], dep); // sin retención parcial entre trayectos
      throw e;
    }
  }
  return { hold_token: token, hold_expira: expira };
}
