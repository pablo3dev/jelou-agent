// Distribucion del Boeing 737-8 MAX (174 asientos). Logica pura, sin DOM.
export const TOTAL_ESPERADO = 174;
export const FILAS_SALIDA = [13, 14];
export const ESTADOS = ['LIBRE', 'RETENIDO', 'VENDIDO', 'BLOQUEADO'];
export const CLASES = ['PREMIUM', 'EXTENDED', 'ECONOMY'];

const TRES_Y_TRES = [['A', 'B', 'C'], ['D', 'E', 'F']];
export const CABINAS = [
  { clase: 'PREMIUM', desde: 1, hasta: 3, bloques: [['A', 'C'], ['D', 'F']] },
  { clase: 'EXTENDED', desde: 4, hasta: 7, bloques: TRES_Y_TRES },
  { clase: 'ECONOMY', desde: 8, hasta: 30, bloques: TRES_Y_TRES },
];

const COLUMNA = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

export function construirLayout() {
  const asientos = [];
  const cabinas = CABINAS.map((c) => {
    const filas = [];
    for (let fila = c.desde; fila <= c.hasta; fila++) {
      const bloques = c.bloques.map((letras) =>
        letras.map((letra) => {
          const a = { asiento: `${fila}${letra}`, fila, letra, clase: c.clase, exit_row: FILAS_SALIDA.includes(fila) };
          asientos.push(a);
          return a;
        }),
      );
      filas.push({ fila, exit_row: FILAS_SALIDA.includes(fila), bloques });
    }
    return { clase: c.clase, desde: c.desde, hasta: c.hasta, filas, asientos: filas.reduce((n, f) => n + f.bloques.flat().length, 0) };
  });
  return { cabinas, asientos, total: asientos.length };
}

export function validarLayout(layout) {
  if (layout.total !== TOTAL_ESPERADO) throw new Error(`layout invalido: ${layout.total} asientos, se esperaban ${TOTAL_ESPERADO}`);
  if (new Set(layout.asientos.map((a) => a.asiento)).size !== layout.total) throw new Error('layout invalido: asientos duplicados');
  return layout;
}

export function contarPorEstado(asientos) {
  const c = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const a of asientos) if (a.estado in c) c[a.estado]++;
  return c;
}

export function contarPorClase(asientos) {
  const c = Object.fromEntries(CLASES.map((k) => [k, { total: 0, ...Object.fromEntries(ESTADOS.map((e) => [e, 0])) }]));
  for (const a of asientos) {
    const k = c[a.clase];
    if (!k) continue;
    k.total++;
    if (a.estado in k) k[a.estado]++;
  }
  return c;
}

// Navegacion con flechas: izquierda/derecha dentro de la fila, arriba/abajo a la letra mas cercana.
export function vecino(layout, asiento, direccion) {
  const filas = layout.cabinas.flatMap((c) => c.filas).map((f) => f.bloques.flat());
  const i = filas.findIndex((f) => f.some((a) => a.asiento === asiento));
  if (i < 0) return asiento;
  const j = filas[i].findIndex((a) => a.asiento === asiento);
  if (direccion === 'izquierda') return filas[i][Math.max(0, j - 1)].asiento;
  if (direccion === 'derecha') return filas[i][Math.min(filas[i].length - 1, j + 1)].asiento;
  const destino = filas[i + (direccion === 'abajo' ? 1 : -1)];
  if (!destino) return asiento;
  const col = COLUMNA[filas[i][j].letra];
  return destino.reduce((mejor, a) => (Math.abs(COLUMNA[a.letra] - col) < Math.abs(COLUMNA[mejor.letra] - col) ? a : mejor)).asiento;
}
