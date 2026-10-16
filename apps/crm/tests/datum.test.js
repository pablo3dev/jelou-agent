import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatumClient, normalizeRow, DatumError, DatumNoConfigurado } from '../src/datum.js';

const ENV = { JELOU_CLIENT_ID: 'cid', JELOU_CLIENT_SECRET: 'sec', DATABASE_ID: 'db 1' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

test('normalizeRow soporta envoltorio fields y campos planos, _id e id', () => {
  assert.deepEqual(normalizeRow({ _id: 'x1', fields: { id: 'v1', a: 1 } }), { id: 'v1', a: 1, _id: 'x1' });
  assert.deepEqual(normalizeRow({ _id: 'x2', fields: { a: 1 } }), { a: 1, _id: 'x2', id: 'x2' });
  assert.deepEqual(normalizeRow({ id: 'p1', a: 2 }), { a: 2, _id: 'p1', id: 'p1' });
  assert.throws(() => normalizeRow(null), DatumError);
});

test('list pagina con limit/page hasta agotar, con Basic y solo GET', async () => {
  const total = 250;
  const fetchFn = fakeFetch((url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    const filas = [];
    for (let i = (page - 1) * 100; i < Math.min(page * 100, total); i++) filas.push({ _id: `r${i}`, fields: { n: i } });
    return json({ data: filas });
  });
  const datum = createDatumClient({ env: ENV, fetchFn });
  const filas = await datum.list('vuelos');
  assert.equal(filas.length, 250);
  assert.equal(fetchFn.calls.length, 3);
  const u = new URL(fetchFn.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://api.jelou.ai/v2/databases/db%201/rows');
  assert.equal(u.searchParams.get('collection'), 'vuelos');
  assert.equal(u.searchParams.get('limit'), '100');
  assert.equal(fetchFn.calls[0].init.headers.Authorization, `Basic ${Buffer.from('cid:sec').toString('base64')}`);
  assert.ok(fetchFn.calls.every((c) => c.init.method === 'GET' && c.init.body === undefined));
});

test('list se detiene si la API repite la misma pagina', async () => {
  const fetchFn = fakeFetch(() => json(Array.from({ length: 100 }, (_, i) => ({ _id: `r${i}` }))));
  const filas = await createDatumClient({ env: ENV, fetchFn }).list('rutas');
  assert.equal(filas.length, 100);
  assert.equal(fetchFn.calls.length, 2);
});

test('cache breve: segunda lista dentro del TTL no vuelve a la red; TTL 0 si', async () => {
  const fetchFn = fakeFetch(() => json([{ _id: 'a' }]));
  const datum = createDatumClient({ env: ENV, fetchFn });
  await datum.list('rutas');
  await datum.list('rutas');
  assert.equal(fetchFn.calls.length, 1);
  await datum.list('vuelos');
  assert.equal(fetchFn.calls.length, 2);

  const sinCache = fakeFetch(() => json([{ _id: 'a' }]));
  const d0 = createDatumClient({ env: { ...ENV, CRM_CACHE_TTL_MS: '0' }, fetchFn: sinCache });
  await d0.list('rutas');
  await d0.list('rutas');
  assert.equal(sinCache.calls.length, 2);
});

test('un fallo no queda en cache', async () => {
  let n = 0;
  const fetchFn = fakeFetch(() => (++n === 1 ? json({}, 500) : json([{ _id: 'a' }])));
  const datum = createDatumClient({ env: ENV, fetchFn });
  await assert.rejects(datum.list('rutas'), DatumError);
  assert.equal((await datum.list('rutas')).length, 1);
});

test('getById: normaliza, 404 -> null, error HTTP -> DatumError', async () => {
  const ok = fakeFetch(() => json({ _id: 'z', fields: { estado: 'EMITIDA' } }));
  assert.deepEqual(await createDatumClient({ env: ENV, fetchFn: ok }).getById('a/b'), { estado: 'EMITIDA', _id: 'z', id: 'z' });
  assert.equal(ok.calls[0].url, 'https://api.jelou.ai/v2/databases/db%201/rows/a%2Fb');
  assert.equal(await createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json({}, 404)) }).getById('x'), null);
  await assert.rejects(createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json({}, 500)) }).getById('x'), DatumError);
});

test('red caida -> DatumError sin detalles del secreto', async () => {
  const fetchFn = fakeFetch(() => {
    throw new Error('fallo con cid:sec');
  });
  await assert.rejects(createDatumClient({ env: ENV, fetchFn }).list('rutas'), (e) => e instanceof DatumError && !/sec/.test(e.message));
});

test('sin credenciales -> DatumNoConfigurado y sin llamadas de red', async () => {
  const fetchFn = fakeFetch(() => json([]));
  const datum = createDatumClient({ env: { JELOU_CLIENT_ID: 'cid' }, fetchFn });
  await assert.rejects(datum.list('rutas'), DatumNoConfigurado);
  await assert.rejects(datum.getById('x'), DatumNoConfigurado);
  assert.equal(fetchFn.calls.length, 0);
});

test('el cliente solo expone metodos de lectura', () => {
  assert.deepEqual(Object.keys(createDatumClient({ env: ENV })).sort(), ['getById', 'list']);
});
