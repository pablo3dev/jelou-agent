// Lógica pura de asientos, exit row, PNR, hold y ventana (RN-06, RN-08, RN-13, RN-14, RN-15). Sin I/O.

export type EstadoAsiento = "LIBRE" | "RETENIDO" | "VENDIDO" | "BLOQUEADO";

export interface Asiento {
  estado: EstadoAsiento;
  pnr: string | null;
  hold_token: string | null;
  hold_expira: string | null; // ISO 8601
}

export type MapaAsientos = Record<string, Asiento>;

// Aeronave 737-8 MAX (draft): Premium filas 1-3 letras A,C,D,F; Extended 4-7 y Economy 8-30 letras A-F.
const LETRAS_PREMIUM = ["A", "C", "D", "F"];
const LETRAS_PLENAS = ["A", "B", "C", "D", "E", "F"];
const EXIT_ROWS = [13, 14];
const EDAD_MIN_EXIT_ROW = 15; // parametros.edad_min_exit_row
const MIN_PASAJEROS = 1;
const MAX_PASAJEROS = 9; // parametros.max_pasajeros
const VENTANA_INICIO = "2026-12-01";
const VENTANA_FIN = "2027-01-31";

// Las 174 claves válidas del mapa, en orden de fila.
export function clavesMapa(): string[] {
  const claves: string[] = [];
  for (let fila = 1; fila <= 30; fila++) {
    for (const letra of fila <= 3 ? LETRAS_PREMIUM : LETRAS_PLENAS) claves.push(`${fila}${letra}`);
  }
  return claves;
}

const CLAVES_VALIDAS = new Set(clavesMapa());

export function existeEnAeronave(clave: string): boolean {
  return CLAVES_VALIDAS.has(clave);
}

export function esExitRow(clave: string): boolean {
  return EXIT_ROWS.includes(parseInt(clave, 10));
}

// RN-06: acepta `12A 12B` o `12A,12B` (también mezclas y espacios extra).
// Supuesto: minúsculas se normalizan a mayúsculas; un asiento repetido en la lista es inválido
// (un asiento no puede asignarse a dos pasajeros).
export function parsearAsientos(
  texto: string,
): { ok: true; asientos: string[] } | { ok: false; invalidos: string[] } {
  const tokens = texto.split(/[\s,]+/).filter((t) => t !== "").map((t) => t.toUpperCase());
  if (tokens.length === 0) return { ok: false, invalidos: [] };
  const invalidos = tokens.filter((t, i) => !/^[1-9]\d?[A-F]$/.test(t) || tokens.indexOf(t) !== i);
  if (invalidos.length > 0) return { ok: false, invalidos };
  return { ok: true, asientos: tokens };
}

// RN-08: hold válido solo si RETENIDO y hold_expira > ahora.
export function holdValido(a: Asiento, ahora: Date): boolean {
  if (a.estado !== "RETENIDO" || a.hold_expira === null) return false;
  const expira = Date.parse(a.hold_expira);
  return Number.isFinite(expira) && expira > ahora.getTime();
}

// RN-08: un hold vencido equivale a LIBRE.
export function estaLibre(a: Asiento, ahora: Date): boolean {
  if (a.estado === "LIBRE") return true;
  return a.estado === "RETENIDO" && !holdValido(a, ahora);
}

// RN-06: formato, existencia en el mapa del vuelo, LIBRE, cantidad = pasajeros y exit row (edad >= 15).
// Supuesto: el asiento i-ésimo de la lista se asigna al pasajero i-ésimo (`edades[i]`).
export function validarSeleccion(
  texto: string,
  edades: number[],
  mapa: MapaAsientos,
  ahora: Date,
): { ok: true; asientos: string[] } | { ok: false; invalidos: string[]; motivo: string } {
  const p = parsearAsientos(texto);
  if (!p.ok) return { ok: false, invalidos: p.invalidos, motivo: "formato" };
  const { asientos } = p;
  const inexistentes = asientos.filter((c) => !existeEnAeronave(c) || mapa[c] === undefined);
  if (inexistentes.length > 0) return { ok: false, invalidos: inexistentes, motivo: "inexistente" };
  if (asientos.length !== edades.length) return { ok: false, invalidos: [], motivo: "cantidad" };
  const ocupados = asientos.filter((c) => !estaLibre(mapa[c], ahora));
  if (ocupados.length > 0) return { ok: false, invalidos: ocupados, motivo: "no_libre" };
  const exit = asientos.filter((c, i) => esExitRow(c) && !(edades[i] >= EDAD_MIN_EXIT_ROW));
  if (exit.length > 0) return { ok: false, invalidos: exit, motivo: "exit_row" };
  return { ok: true, asientos };
}

// RN-13: 6 caracteres de [A-Z2-9] sin O ni I (0 y 1 quedan fuera por el rango 2-9).
const ALFABETO_PNR = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PNR_RE = /^[A-HJ-NP-Z2-9]{6}$/;

// `rng` devuelve un número en [0, 1) (Math.random por defecto; parametrizable para pruebas).
// La unicidad (verificación por lectura antes de escribir) es responsabilidad del llamador.
export function generarPnr(rng: () => number = Math.random): string {
  let pnr = "";
  for (let i = 0; i < 6; i++) pnr += ALFABETO_PNR[Math.floor(rng() * ALFABETO_PNR.length)];
  return pnr;
}

// RN-14: fecha de viaje YYYY-MM-DD real dentro de 2026-12-01..2027-01-31 inclusive.
export function fechaEnVentana(fecha: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.toISOString().slice(0, 10) !== fecha) return false; // descarta 2026-12-32, 2027-02-30...
  return fecha >= VENTANA_INICIO && fecha <= VENTANA_FIN;
}

// RN-15: entero entre 1 y 9.
export function cantidadPasajerosValida(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_PASAJEROS && n <= MAX_PASAJEROS;
}
