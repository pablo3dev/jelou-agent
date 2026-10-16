import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, resolvePort } from './app.js';

test('GET /health responde 200 {"status":"ok"}', async () => {
  const server = createApp().listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('el puerto por defecto es 3001', () => {
  assert.equal(resolvePort({}), 3001);
});

test('PORT_PAY del entorno sobrescribe el puerto', () => {
  assert.equal(resolvePort({ PORT_PAY: '4100' }), 4100);
});

test('PORT_PAY inválido cae al puerto por defecto', () => {
  assert.equal(resolvePort({ PORT_PAY: 'abc' }), 3001);
});
