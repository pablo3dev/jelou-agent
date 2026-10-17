// Logica pura del frontend (public/js): se importa sin DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { construirLayout, validarLayout, contarPorEstado, contarPorClase, vecino, TOTAL_ESPERADO, FILAS_SALIDA } from '../public/js/seatmap-layout.js';
import { formatCOP, formatInt, formatPct, formatFecha, formatHace } from '../public/js/format.js';
import { parsearHash } from '../public/js/hash.js';
import { CATALOGOS, idiomaInicial } from '../public/js/i18n.js';
import { aplicarFiltros, ordenar } from '../public/js/views/vuelos.js';
import { vueloSeleccionado } from '../public/js/views/mapa.js';
import { ordenarAsientos } from '../public/js/views/asientos.js';
import { temaInicial } from '../public/js/tema.js';
import { ASIENTOS, detalleAsientos } from '../src/asientos.js';
import { AHORA, V1_MAPA } from './fixtures.js';

const JS_DIR = path.resolve(import.meta.dirname, '../public/js');
const archivosJs = (dir = JS_DIR) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivosJs(p) : p.endsWith('.js') ? [p] : [];
  });

test('layout: 174 asientos, 30 filas y cabinas por clase', () => {
  const layout = validarLayout(construirLayout());
  assert.equal(layout.total, TOTAL_ESPERADO);
  assert.equal(layout.asientos.length, 174);
  assert.deepEqual(layout.cabinas.map((c) => [c.clase, c.desde, c.hasta, c.asientos]), [['PREMIUM', 1, 3, 12], ['EXTENDED', 4, 7, 24], ['ECONOMY', 8, 30, 138]]);
  const letras = (fila) => layout.asientos.filter((a) => a.fila === fila).map((a) => a.letra).join('');
  assert.equal(letras(1), 'ACDF');
  assert.equal(letras(3), 'ACDF');
  assert.equal(letras(4), 'ABCDEF');
  assert.equal(letras(30), 'ABCDEF');
});

test('layout: bloques 2+2 en Premium y 3+3 en el resto; salida en filas 13 y 14', () => {
  const layout = construirLayout();
  const filas = layout.cabinas.flatMap((c) => c.filas.map((f) => ({ ...f, clase: c.clase })));
  for (const f of filas) assert.deepEqual(f.bloques.map((b) => b.length), f.clase === 'PREMIUM' ? [2, 2] : [3, 3]);
  assert.deepEqual(filas.filter((f) => f.exit_row).map((f) => f.fila), FILAS_SALIDA);
  assert.deepEqual(FILAS_SALIDA, [13, 14]);
  assert.equal(layout.asientos.filter((a) => a.exit_row).length, 12);
});

test('layout coincide con los asientos canonicos del API (src/asientos.js)', () => {
  const layout = construirLayout();
  assert.deepEqual(layout.asientos.map((a) => [a.asiento, a.clase, a.exit_row]), ASIENTOS.map((a) => [a.asiento, a.clase, a.exit_row]));
});

test('validarLayout rechaza una distribucion incompleta', () => {
  const layout = construirLayout();
  assert.throws(() => validarLayout({ ...layout, total: 173 }), /174/);
});

test('contadores por estado y por clase con el mapa de fixtures', () => {
  const asientos = detalleAsientos({ mapa_asientos: V1_MAPA }, AHORA);
  assert.deepEqual(contarPorEstado(asientos), { LIBRE: 165, RETENIDO: 3, VENDIDO: 5, BLOQUEADO: 1 });
  const c = contarPorClase(asientos);
  assert.deepEqual([c.PREMIUM.total, c.EXTENDED.total, c.ECONOMY.total], [12, 24, 138]);
  assert.equal(c.PREMIUM.VENDIDO, 2);
  assert.equal(c.EXTENDED.RETENIDO, 2);
  assert.equal(c.ECONOMY.BLOQUEADO, 1);
  assert.equal(c.PREMIUM.VENDIDO + c.EXTENDED.VENDIDO + c.ECONOMY.VENDIDO, 5);
});

test('vecino: flechas dentro de la fila y entre filas por columna cercana', () => {
  const layout = construirLayout();
  assert.equal(vecino(layout, '5A', 'derecha'), '5B');
  assert.equal(vecino(layout, '5A', 'izquierda'), '5A');
  assert.equal(vecino(layout, '5F', 'derecha'), '5F');
  assert.equal(vecino(layout, '5C', 'abajo'), '6C');
  assert.equal(vecino(layout, '1A', 'arriba'), '1A');
  assert.equal(vecino(layout, '30F', 'abajo'), '30F');
  assert.equal(vecino(layout, '4B', 'arriba'), '3A'); // A y C equidistan de B: gana la primera
  assert.equal(vecino(layout, '4E', 'arriba'), '3D');
  assert.equal(vecino(layout, '3D', 'abajo'), '4D');
});

test('formateadores COP, enteros y porcentaje (es-CO / en-US)', () => {
  assert.match(formatCOP(1234567), /^\$\s?1\.234\.567$/);
  assert.match(formatCOP(1234567, 'en-US'), /1,234,567/);
  assert.match(formatCOP(null), /0$/);
  assert.equal(formatInt(12345), '12.345');
  assert.match(formatPct(12.34), /^12,3\s?%$/);
  assert.match(formatPct(0), /^0\s?%$/);
  assert.match(formatPct(100, 'en-US'), /^100%$/);
});

test('formatFecha usa UTC (sin desfase por zona) y tolera valores raros', () => {
  assert.match(formatFecha('2026-12-01', 'es-CO', true), /^0?1 de dic/);
  assert.match(formatFecha('2026-12-31', 'en-US'), /31/);
  assert.equal(formatFecha('no-fecha'), 'no-fecha');
  assert.equal(formatFecha(null), '');
});

test('formatHace: segundos, minutos y horas', () => {
  assert.match(formatHace(12000, 'es-CO'), /12 segundos/);
  assert.match(formatHace(0, 'es-CO'), /ahora/);
  assert.equal(formatHace(12000, 'en-US'), '12 seconds ago');
  assert.match(formatHace(125000, 'en-US'), /2 minutes ago/);
  assert.match(formatHace(7300000, 'en-US'), /2 hours ago/);
  assert.match(formatHace(-5000, 'en-US'), /now|0 seconds/);
});

test('hash routing', () => {
  assert.deepEqual(parsearHash(''), { vista: 'resumen', id: null });
  assert.deepEqual(parsearHash('#/vuelos'), { vista: 'vuelos', id: null });
  assert.deepEqual(parsearHash('#/mapa/v%201'), { vista: 'mapa', id: 'v 1' });
  assert.deepEqual(parsearHash('#/mapa/%E0%A4%A'), { vista: 'mapa', id: null });
  assert.deepEqual(parsearHash('#/otra'), { vista: 'resumen', id: null });
  assert.equal(vueloSeleccionado({ id: null }, [{ vuelo_id: 'a' }]), 'a');
  assert.equal(vueloSeleccionado({ id: 'z' }, [{ vuelo_id: 'a' }]), 'z');
  assert.equal(vueloSeleccionado({ id: null }, []), null);
});

test('filtros y orden de vuelos', () => {
  const v = [
    { vuelo_id: 'b', ruta: 'BOG-MDE', fecha: '2026-12-02', vendidos: 5, ocupacion_pct: 2.9 },
    { vuelo_id: 'a', ruta: 'BOG-CTG', fecha: '2026-12-01', vendidos: 10, ocupacion_pct: 5.7 },
    { vuelo_id: 'c', ruta: 'BOG-MDE', fecha: '2026-12-03', vendidos: 1, ocupacion_pct: 0.6 },
  ];
  assert.deepEqual(aplicarFiltros(v, { ruta: 'BOG-MDE', desde: '', hasta: '' }).map((x) => x.vuelo_id), ['b', 'c']);
  assert.deepEqual(aplicarFiltros(v, { ruta: '', desde: '2026-12-02', hasta: '2026-12-02' }).map((x) => x.vuelo_id), ['b']);
  assert.deepEqual(ordenar(v, 'vendidos', 'desc').map((x) => x.vuelo_id), ['a', 'b', 'c']);
  assert.deepEqual(ordenar(v, 'fecha', 'asc').map((x) => x.vuelo_id), ['a', 'b', 'c']);
  assert.deepEqual(ordenar(v, 'ruta', 'asc').map((x) => x.vuelo_id), ['a', 'b', 'c']);
});

test('i18n: catalogos es/en con las mismas claves y toda clave usada existe', () => {
  assert.deepEqual(Object.keys(CATALOGOS.es).sort(), Object.keys(CATALOGOS.en).sort());
  assert.equal(idiomaInicial('en', 'es-CO'), 'en');
  assert.equal(idiomaInicial(null, 'en-US'), 'en');
  assert.equal(idiomaInicial(null, 'fr-FR'), 'es');
  const usadas = new Set();
  for (const f of archivosJs()) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) usadas.add(m[1]);
    for (const m of src.matchAll(/(?:Key|key)\??:?\s*[,:=]?\s*'([a-z]+\.[\w.]+)'/g)) usadas.add(m[1]);
    for (const m of src.matchAll(/\['\w+', '[^']*', '([a-z]+\.[\w.]+)'/g)) usadas.add(m[1]);
    for (const m of src.matchAll(/'((?:vuelos|ventas|mapa|resumen|kpi|charts|nav|estado|error|refrescar|app|idioma)\.[\w.]+)'/g)) usadas.add(m[1]);
  }
  assert.ok(usadas.size > 40);
  for (const k of usadas) assert.ok(k in CATALOGOS.es, `falta en es: ${k}`);
  for (const e of ['LIBRE', 'RETENIDO', 'VENDIDO', 'BLOQUEADO']) assert.ok(`estado.${e}` in CATALOGOS.en);
  for (const c of ['PREMIUM', 'EXTENDED', 'ECONOMY']) assert.ok(`clase.${c}` in CATALOGOS.en);
  for (const r of ['EMITIDA', 'PENDIENTE_PAGO', 'PAGO_RECHAZADO', 'EXPIRADA', 'CANCELADA']) assert.ok(`reserva.${r}` in CATALOGOS.en);
});

test('hash del widget de asientos: vuelo y limite de seleccion', () => {
  assert.deepEqual(parsearHash('#/asientos/bogmde20261201/2'), { vista: 'asientos', id: 'bogmde20261201', n: 2 });
  assert.deepEqual(parsearHash('#/asientos/bogmde20261201'), { vista: 'asientos', id: 'bogmde20261201', n: null });
  assert.equal(parsearHash('#/asientos/x/99').n, 9);
  assert.equal(parsearHash('#/asientos/x/0').n, null);
});

test('asientos elegidos se copian en orden natural fila-letra', () => {
  assert.deepEqual(ordenarAsientos(new Set(['12C', '8B', '12A', '8A'])), ['8A', '8B', '12A', '12C']);
});

test('tema: preferencia guardada o la del sistema', () => {
  assert.equal(temaInicial('light', false), 'light');
  assert.equal(temaInicial('dark', true), 'dark');
  assert.equal(temaInicial(null, true), 'light');
  assert.equal(temaInicial('raro', false), 'dark');
});

test('ventas: pestanas con/sin ventas y buscador por palabra clave', async () => {
  const { filtrarVentasVuelo } = await import('../public/js/views/ventas.js');
  const v = [
    { vuelo_id: 'bogmde20261201', ruta: 'BOG-MDE', fecha: '2026-12-01', vendidos: 0 },
    { vuelo_id: 'bogclo20261202', ruta: 'BOG-CLO', fecha: '2026-12-02', vendidos: 3 },
    { vuelo_id: 'clobog20261203', ruta: 'CLO-BOG', fecha: '2026-12-03', vendidos: 9 },
  ];
  const ids = (l) => l.map((x) => x.vuelo_id);
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'todos', texto: '' })), ids(v));
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'con', texto: '' })), ['clobog20261203', 'bogclo20261202']);
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'sin', texto: '' })), ['bogmde20261201']);
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'con', texto: 'CLO bog' })), ['clobog20261203', 'bogclo20261202']);
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'todos', texto: 'mde 2026-12-01' })), ['bogmde20261201']);
  assert.deepEqual(ids(filtrarVentasVuelo(v, { pestana: 'sin', texto: 'clo' })), []);
});

test('ventas: agrupa por dia/semana/mes y detecta picos', async () => {
  const { agruparVentas, indicesPicos } = await import('../public/js/views/ventas.js');
  const v = [
    { vuelo_id: 'a', ruta: 'BOG-MDE', fecha: '2026-12-01', vendidos: 5 },
    { vuelo_id: 'b', ruta: 'BOG-CLO', fecha: '2026-12-01', vendidos: 9 },
    { vuelo_id: 'c', ruta: 'BOG-CLO', fecha: '2026-12-06', vendidos: 0 },
    { vuelo_id: 'd', ruta: 'CLO-BOG', fecha: '2026-12-07', vendidos: 4 },
    { vuelo_id: 'e', ruta: 'CLO-BOG', fecha: '2027-01-02', vendidos: 2 },
  ];
  const dia = agruparVentas(v, 'dia');
  assert.equal(dia.length, 4);
  assert.deepEqual([dia[0].vendidos, dia[0].vuelosConVentas, dia[0].top.vuelo_id], [14, 2, 'b']);
  // 2026-12-01 es martes: su semana empieza el lunes 2026-11-30; el 2026-12-07 abre otra semana
  assert.deepEqual(agruparVentas(v, 'semana').map((p) => [p.fecha, p.vendidos]), [['2026-11-30', 14], ['2026-12-07', 4], ['2026-12-28', 2]]);
  assert.deepEqual(agruparVentas(v, 'mes').map((p) => [p.fecha, p.vendidos]), [['2026-12-01', 18], ['2027-01-01', 2]]);
  assert.equal(agruparVentas([{ vuelo_id: 'z', ruta: 'X-Y', fecha: '2026-12-03', vendidos: 0 }])[0].top, null);
  assert.deepEqual(indicesPicos([1, 5, 2, 8, 3, 3, 0], 2), [3, 1]);
});
