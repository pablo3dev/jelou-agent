// domain: mapa de asientos del Boeing 737-8 MAX (174 asientos) y estado efectivo (RN-08).

const ESTADOS = ['LIBRE', 'RETENIDO', 'VENDIDO', 'BLOQUEADO'];
const EXIT_ROWS = new Set([13, 14]);

export function claseDeFila(fila) {
  if (fila <= 3) return 'PREMIUM';
  if (fila <= 7) return 'EXTENDED';
  return 'ECONOMY';
}

// Los 174 asientos canonicos: filas 1-3 letras A,C,D,F; filas 4-30 letras A-F.
export const ASIENTOS = [];
for (let fila = 1; fila <= 30; fila++) {
  for (const letra of fila <= 3 ? ['A', 'C', 'D', 'F'] : ['A', 'B', 'C', 'D', 'E', 'F']) {
    ASIENTOS.push({ asiento: `${fila}${letra}`, fila, letra, clase: claseDeFila(fila), exit_row: EXIT_ROWS.has(fila) });
  }
}
export const TOTAL_ASIENTOS = ASIENTOS.length;

export function leerMapa(vuelo) {
  const bruto = vuelo.mapa_asientos;
  const mapa = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
  return mapa !== null && typeof mapa === 'object' ? mapa : {};
}

// RETENIDO con hold_expira <= ahora cuenta como LIBRE. Una clave ausente del mapa no es
// vendible: se reporta BLOQUEADO. Nunca se copia hold_token.
export function estadoEfectivo(entrada, ahora) {
  const estado = entrada?.estado;
  if (!ESTADOS.includes(estado)) return 'BLOQUEADO';
  if (estado === 'RETENIDO') {
    const expira = Date.parse(entrada.hold_expira);
    if (Number.isFinite(expira) && expira <= ahora.getTime()) return 'LIBRE';
  }
  return estado;
}

export function detalleAsientos(vuelo, ahora) {
  const mapa = leerMapa(vuelo);
  return ASIENTOS.map((a) => {
    const estado = estadoEfectivo(mapa[a.asiento], ahora);
    return { ...a, estado, pnr: estado === 'VENDIDO' ? (mapa[a.asiento].pnr ?? null) : null };
  });
}

export function contarEstados(vuelo, ahora) {
  const mapa = leerMapa(vuelo);
  const c = { libres: 0, retenidos: 0, vendidos: 0, bloqueados: 0 };
  const clave = { LIBRE: 'libres', RETENIDO: 'retenidos', VENDIDO: 'vendidos', BLOQUEADO: 'bloqueados' };
  for (const a of ASIENTOS) c[clave[estadoEfectivo(mapa[a.asiento], ahora)]]++;
  return c;
}

export const porcentaje = (parte, total) => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);
