import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatumClient, DatumError } from './datum.js';

const ENV = { JELOU_CLIENT_ID: 'cid', JELOU_CLIENT_SECRET: 'sec', DATABASE_ID: 'db 1' };

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
}

test('GET con Basic base64, DATABASE_ID y rowId codificados; desenvuelve fields', async () => {
  const calls = [];
  const c = createDatumClient({ env: ENV, fetchFn: fakeFetch(200, { fields: { estado: 'PENDIENTE' } }, calls) });
  assert.deepEqual(await c.getRow('a/b'), { estado: 'PENDIENTE' });
  assert.equal(calls[0].url, 'https://api.jelou.ai/v2/databases/db%201/rows/a%2Fb');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from('cid:sec').toString('base64')}`,
  );
});

test('acepta campos planos y respeta DATUM_BASE_URL', async () => {
  const calls = [];
  const c = createDatumClient({
    env: { ...ENV, DATUM_BASE_URL: 'http://mock/v2/' },
    fetchFn: fakeFetch(200, { estado: 'APROBADA' }, calls),
  });
  assert.deepEqual(await c.getRow('x'), { estado: 'APROBADA' });
  assert.equal(calls[0].url, 'http://mock/v2/databases/db%201/rows/x');
});

test('404 devuelve null', async () => {
  const c = createDatumClient({ env: ENV, fetchFn: fakeFetch(404, {}) });
  assert.equal(await c.getRow('x'), null);
});

test('5xx, red caída, JSON inválido y env faltante lanzan DatumError', async () => {
  await assert.rejects(createDatumClient({ env: ENV, fetchFn: fakeFetch(500, {}) }).getRow('x'), DatumError);
  await assert.rejects(
    createDatumClient({ env: ENV, fetchFn: async () => { throw new Error('boom'); } }).getRow('x'),
    DatumError,
  );
  await assert.rejects(
    createDatumClient({ env: ENV, fetchFn: async () => new Response('no json', { status: 200 }) }).getRow('x'),
    DatumError,
  );
  await assert.rejects(createDatumClient({ env: {}, fetchFn: fakeFetch(200, {}) }).getRow('x'), DatumError);
});
