import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { resolvePort } from '../src/config.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /health responde 200 {status:"ok"}', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('sirve estaticos de public/', async () => {
  const res = await fetch(`${base}/index.html`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<div id="app"><\/div>/);
  const root = await fetch(`${base}/`);
  assert.equal(root.status, 200);
});

test('ruta inexistente responde 404', async () => {
  const res = await fetch(`${base}/no-existe`);
  assert.equal(res.status, 404);
});

test('cabeceras de seguridad', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('referrer-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
});

test('puerto por defecto 3000 y PORT_CRM valido', () => {
  assert.equal(resolvePort({}), 3000);
  assert.equal(resolvePort({ PORT_CRM: 'abc' }), 3000);
  assert.equal(resolvePort({ PORT_CRM: '4000' }), 4000);
});
