import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearDbml, compararConEsquema } from './conformidad.mjs';

const DBML = `
Enum est { A
 B }
Table t {
  id text [pk, note: 'x, [y]']
  nombre text [not null]
  n int [not null]
  d decimal(3,2)
  est est [not null]
  Note: '''
  zz text [not null]
  '''
}`;
const sys = { name: 'id', system: true, primaryKey: true, type: 'text', required: true };
const esquema = () => ({
  t: { fields: [
    sys,
    { name: 'created', system: true, type: 'autodate' },
    { name: 'nombre', type: 'text', required: true },
    { name: 'n', type: 'number', onlyInt: true },
    { name: 'd', type: 'number', onlyInt: false },
    { name: 'est', type: 'select', maxSelect: 1, required: true, values: ['B', 'A'] },
  ] },
});
const dif = (mut) => { const e = esquema(); mut?.(e); return compararConEsquema(parsearDbml(DBML), e); };

test('parsea enums y columnas ignorando notas', () => {
  const { enums, tablas } = parsearDbml(DBML);
  assert.deepEqual(enums.est, ['A', 'B']);
  assert.deepEqual(tablas.t.map((c) => c.nombre), ['id', 'nombre', 'n', 'd', 'est']);
  assert.equal(tablas.t[0].pk, true);
  assert.equal(tablas.t[1].notNull, true);
});
test('conforme', () => assert.deepEqual(dif(), []));
test('falta coleccion', () => assert.match(dif((e) => delete e.t)[0], /coleccion faltante: t/));
test('falta campo', () => assert.match(dif((e) => { e.t.fields = e.t.fields.filter((f) => f.name !== 'n'); })[0], /campo faltante: t.n/));
test('tipo distinto', () => assert.match(dif((e) => { e.t.fields[2].type = 'number'; })[0], /tipo distinto: t.nombre/));
test('enum distinto', () => assert.match(dif((e) => { e.t.fields[5].values = ['A', 'C']; })[0], /enum distinto: t.est/));
test('campo extra', () => assert.match(dif((e) => e.t.fields.push({ name: 'zz', type: 'text' }))[0], /campo extra: t.zz/));
test('required faltante y onlyInt', () => {
  const r = dif((e) => { e.t.fields[2].required = false; e.t.fields[3].onlyInt = false; });
  assert.equal(r.length, 2);
});

test('dbml real: 10 tablas y 12 claves', () => {
  const { enums, tablas } = parsearDbml(readFileSync(new URL('./db-design.dbml', import.meta.url), 'utf8'));
  assert.equal(Object.keys(tablas).length, 10);
  assert.equal(enums.clave_parametro.length, 12);
  assert.equal(tablas.parametros[0].pk, true);
  assert.equal(tablas.temporada[0].nombre, 'mes');
});
