import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatumClient, DatumError } from './datum.js';

const ENV = { DATUM_URL: 'https://base.jelou.cloud/api/', DATUM_API_KEY: 'db_clave' };

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
}

test('GET por id con X-Api-Key, colección e id codificados, sin Basic', async () => {
  const calls = [];
  const c = createDatumClient({ env: ENV, fetchFn: fakeFetch(200, { id: 'a', estado: 'PENDIENTE' }, calls) });
  assert.deepEqual(await c.getRecord('transacciones', 'a/b'), { id: 'a', estado: 'PENDIENTE' });
  assert.equal(calls[0].url, 'https://base.jelou.cloud/api/collections/transacciones/records/a%2Fb');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['X-Api-Key'], 'db_clave');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('normaliza fechas con espacio a ISO con T', async () => {
  const c = createDatumClient({
    env: ENV,
    fetchFn: fakeFetch(200, { expira_at: '2026-12-01 10:15:00.000Z', nota: 'a b', n: 3 }),
  });
  assert.deepEqual(await c.getRecord('transacciones', 'x'), {
    expira_at: '2026-12-01T10:15:00.000Z',
    nota: 'a b',
    n: 3,
  });
});

test('404 devuelve null', async () => {
  const c = createDatumClient({ env: ENV, fetchFn: fakeFetch(404, {}) });
  assert.equal(await c.getRecord('reservas', 'x'), null);
});

test('5xx, red caída, JSON inválido, cuerpo no objeto y env faltante lanzan DatumError sin filtrar la clave', async () => {
  const falla = (env, fetchFn) => createDatumClient({ env, fetchFn }).getRecord('reservas', 'x');
  await assert.rejects(falla(ENV, fakeFetch(500, {})), DatumError);
  await assert.rejects(falla(ENV, async () => { throw new Error('boom db_clave'); }), (e) => {
    assert.ok(e instanceof DatumError);
    assert.ok(!e.message.includes('db_clave'));
    return true;
  });
  await assert.rejects(falla(ENV, async () => new Response('no json', { status: 200 })), DatumError);
  await assert.rejects(falla(ENV, fakeFetch(200, [1])), DatumError);
  await assert.rejects(falla({}, fakeFetch(200, {})), DatumError);
  await assert.rejects(falla({ DATUM_URL: 'x' }, fakeFetch(200, {})), DatumError);
});
