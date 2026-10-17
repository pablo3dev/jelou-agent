// Lógica pura del hold de asientos sobre vuelos.mapa_asientos (RN-08, RN-09). Sin I/O: devuelve mapas nuevos.
import { holdValido } from "./asientos.ts";
import type { MapaAsientos } from "./asientos.ts";
import type { Catalogo } from "./catalogo.ts";
import { ErrorNegocio } from "./errores.ts";

const HOLD_MINUTOS_DEFECTO = 15; // parametros.hold_minutos (draft: 15)

// Instante de vencimiento ISO 8601 UTC: ahora + parametros.hold_minutos (15 si el parámetro no está cargado).
export function expiraHold(cat: Catalogo, ahora: Date): string {
  const min = cat.parametros.hold_minutos;
  const minutos = Number.isFinite(min) && min > 0 ? min : HOLD_MINUTOS_DEFECTO;
  return new Date(ahora.getTime() + minutos * 60_000).toISOString();
}

// ¿Todos los asientos están RETENIDOS con este token (y, si se indica, con ese vencimiento exacto)?
export function tieneHold(mapa: MapaAsientos, asientos: string[], token: string, expira?: string): boolean {
  return asientos.every((c) => {
    const a = mapa[c];
    return a?.estado === "RETENIDO" && a.hold_token === token && (expira === undefined || a.hold_expira === expira);
  });
}

export function retener(mapa: MapaAsientos, asientos: string[], token: string, expira: string): MapaAsientos {
  const copia = { ...mapa };
  for (const c of asientos) copia[c] = { estado: "RETENIDO", pnr: null, hold_token: token, hold_expira: expira };
  return copia;
}

// Libera solo los asientos que llevan este token (nunca pisa el hold de otro).
export function liberar(mapa: MapaAsientos, asientos: string[], token: string): MapaAsientos {
  const copia = { ...mapa };
  for (const c of asientos) {
    if (copia[c]?.hold_token === token) copia[c] = { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null };
  }
  return copia;
}

export const sinHold = (mapa: MapaAsientos, asientos: string[], token: string) =>
  asientos.every((c) => mapa[c]?.hold_token !== token);

// Mueve el vencimiento del hold propio a `expira`. Idempotente si ya está fijado. Hold ajeno, vencido
// o inexistente => regla de negocio violada (400).
export function refijar(mapa: MapaAsientos, asientos: string[], token: string, expira: string, ahora: Date): MapaAsientos {
  if (tieneHold(mapa, asientos, token, expira)) return mapa;
  if (!asientos.every((c) => mapa[c]?.hold_token === token && holdValido(mapa[c], ahora))) {
    throw new ErrorNegocio("El hold de los asientos no es válido o ya venció");
  }
  const copia = { ...mapa };
  for (const c of asientos) copia[c] = { ...copia[c], hold_expira: expira };
  return copia;
}
