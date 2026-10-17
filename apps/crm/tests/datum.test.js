import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatumClient, normalizeRow, DatumError, DatumNoConfigurado } from '../src/datum.js';

const ENV = { DATUM_URL: 'https://demo.jelou.cloud/api/', DATUM_API_KEY: 'db_clave-secreta' };
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

test('normalizeRow quita metadatos de PocketBase, alias _id y fechas con espacio a ISO', () => {
  const fila = normalizeRow({
    id: 'bogmde20261201', collectionId: 'c1', collectionName: 'vuelos', created: '2026-10-16 10:00:00.000Z', updated: 'x',
    ruta_id: 'BOG-MDE', fecha: '2026-12-01 00:00:00.000Z', nota: 'a b', mapa_asientos: { '1A': { estado: 'LIBRE' } },
  });
  assert.deepEqual(fila, {
    id: 'bogmde20261201', _id: 'bogmde20261201', ruta_id: 'BOG-MDE', fecha: '2026-12-01T00:00:00.000Z', nota: 'a b',
    mapa_asientos: { '1A': { estado: 'LIBRE' } },
  });
  assert.throws(() => normalizeRow(null), DatumError);
  assert.throws(() => normalizeRow([]), DatumError);
});

test('list pagina con page/perPage hasta totalPages, con X-Api-Key y solo GET', async () => {
  const total = 250;
  const fetchFn = fakeFetch((url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    const items = [];
    for (let i = (page - 1) * 100; i < Math.min(page * 100, total); i++) items.push({ id: `r${i}`, n: i });
    return json({ items, page, perPage: 100, totalItems: total, totalPages: 3 });
  });
  const datum = createDatumClient({ env: ENV, fetchFn });
  const filas = await datum.list('vuelos');
  assert.equal(filas.length, 250);
  assert.equal(fetchFn.calls.length, 3);
  const u = new URL(fetchFn.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://demo.jelou.cloud/api/collections/vuelos/records');
  assert.equal(u.searchParams.get('perPage'), '100');
  const h = fetchFn.calls[0].init.headers;
  assert.equal(h['X-Api-Key'], 'db_clave-secreta');
  assert.equal(h.Authorization, undefined);
  assert.ok(fetchFn.calls.every((c) => c.init.method === 'GET' && c.init.body === undefined));
});

test('list: pagina vacia corta el ciclo y respuesta sin items es invalida', async () => {
  const vacia = fakeFetch(() => json({ items: [], page: 1, totalPages: 0 }));
  assert.deepEqual(await createDatumClient({ env: ENV, fetchFn: vacia }).list('rutas'), []);
  assert.equal(vacia.calls.length, 1);
  await assert.rejects(createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json([{ id: 'a' }])) }).list('rutas'), DatumError);
  await assert.rejects(createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json({}, 404)) }).list('nada'), DatumError);
});

test('cache breve: segunda lista dentro del TTL no vuelve a la red; TTL 0 si', async () => {
  const resp = () => json({ items: [{ id: 'a' }], totalPages: 1 });
  const fetchFn = fakeFetch(resp);
  const datum = createDatumClient({ env: ENV, fetchFn });
  await datum.list('rutas');
  await datum.list('rutas');
  assert.equal(fetchFn.calls.length, 1);
  await datum.list('vuelos');
  assert.equal(fetchFn.calls.length, 2);

  const sinCache = fakeFetch(resp);
  const d0 = createDatumClient({ env: { ...ENV, CRM_CACHE_TTL_MS: '0' }, fetchFn: sinCache });
  await d0.list('rutas');
  await d0.list('rutas');
  assert.equal(sinCache.calls.length, 2);
});

test('un fallo no queda en cache', async () => {
  let n = 0;
  const fetchFn = fakeFetch(() => (++n === 1 ? json({}, 500) : json({ items: [{ id: 'a' }], totalPages: 1 })));
  const datum = createDatumClient({ env: ENV, fetchFn });
  await assert.rejects(datum.list('rutas'), DatumError);
  assert.equal((await datum.list('rutas')).length, 1);
});

test('getById: normaliza, 404 -> null, error HTTP -> DatumError', async () => {
  const ok = fakeFetch(() => json({ id: 'z', collectionId: 'c', estado: 'EMITIDA' }));
  assert.deepEqual(await createDatumClient({ env: ENV, fetchFn: ok }).getById('reservas', 'a/b'), { id: 'z', _id: 'z', estado: 'EMITIDA' });
  assert.equal(ok.calls[0].url, 'https://demo.jelou.cloud/api/collections/reservas/records/a%2Fb');
  assert.equal(await createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json({}, 404)) }).getById('reservas', 'x'), null);
  await assert.rejects(createDatumClient({ env: ENV, fetchFn: fakeFetch(() => json({}, 500)) }).getById('reservas', 'x'), DatumError);
});

test('red caida -> DatumError sin detalles del secreto', async () => {
  const fetchFn = fakeFetch(() => {
    throw new Error('fallo con db_clave-secreta');
  });
  await assert.rejects(createDatumClient({ env: ENV, fetchFn }).list('rutas'), (e) => e instanceof DatumError && !/secreta/.test(e.message));
});

test('sin DATUM_URL o DATUM_API_KEY -> DatumNoConfigurado y sin llamadas de red', async () => {
  const fetchFn = fakeFetch(() => json({ items: [] }));
  for (const env of [{ DATUM_URL: 'https://x/api' }, { DATUM_API_KEY: 'db_x' }, {}]) {
    const datum = createDatumClient({ env, fetchFn });
    await assert.rejects(datum.list('rutas'), DatumNoConfigurado);
    await assert.rejects(datum.getById('rutas', 'x'), DatumNoConfigurado);
  }
  assert.equal(fetchFn.calls.length, 0);
});

test('el cliente solo expone metodos de lectura', () => {
  assert.deepEqual(Object.keys(createDatumClient({ env: ENV })).sort(), ['getById', 'list']);
});
