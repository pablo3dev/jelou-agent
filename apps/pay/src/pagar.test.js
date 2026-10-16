import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { DatumError } from './datum.js';

const AHORA = new Date('2026-12-01T10:00:00Z');

function datumFalso(filas) {
  return {
    async getRow(id) {
      const v = filas[id];
      if (v instanceof Error) throw v;
      return v ?? null;
    },
  };
}

async function pedir(filas, ruta, init, headers) {
  const server = createApp({ datum: datumFalso(filas), now: () => AHORA }).listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${ruta}`, { ...init, headers });
    return { status: res.status, body: await res.text(), headers: res.headers };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const PENDIENTE = {
  t1: { estado: 'PENDIENTE', reserva_id: 'r1', expira_at: '2026-12-01T10:15:00Z' },
  r1: { total_cop: 1234567 },
};

test('PENDIENTE vigente: muestra monto COP y los dos formularios', async () => {
  const r = await pedir(PENDIENTE, '/pagar/t1');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.body, /\$\s?1\.234\.567/);
  assert.match(r.body, /action="\/pagar\/t1\/aprobar"/);
  assert.match(r.body, /action="\/pagar\/t1\/rechazar"/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
});

test('el enlace del contrato /pay/:id también funciona y Accept-Language en usa inglés', async () => {
  const r = await pedir(PENDIENTE, '/pay/t1', undefined, { 'accept-language': 'en-US' });
  assert.equal(r.status, 200);
  assert.match(r.body, /<html lang="en">/);
  assert.match(r.body, />Approve</);
});

test('estado no PENDIENTE: muestra el estado sin botones', async () => {
  const r = await pedir({ t1: { estado: 'APROBADA', reserva_id: 'r1', expira_at: '2026-12-01T10:15:00Z' } }, '/pagar/t1');
  assert.equal(r.status, 200);
  assert.match(r.body, /Aprobada/);
  assert.doesNotMatch(r.body, /<form|<button/);
});

test('PENDIENTE vencida: se muestra como expirada sin botones', async () => {
  const r = await pedir({ t1: { estado: 'PENDIENTE', reserva_id: 'r1', expira_at: '2026-12-01T09:59:00Z' } }, '/pagar/t1');
  assert.equal(r.status, 200);
  assert.match(r.body, /Expirada/);
  assert.doesNotMatch(r.body, /<form|<button/);
});

test('404 si no existe', async () => {
  assert.equal((await pedir({}, '/pagar/nada')).status, 404);
});

test('400 si el id es inválido', async () => {
  assert.equal((await pedir({}, '/pagar/a%3Cb')).status, 400);
  assert.equal((await pedir({}, `/pagar/${'a'.repeat(65)}`)).status, 400);
  assert.equal((await pedir({}, '/pagar/t1/aprobar%3C', { method: 'POST' })).status, 404);
});

test('502 si Datum falla (transacción o reserva) o el total es inválido', async () => {
  assert.equal((await pedir({ t1: new DatumError('x') }, '/pagar/t1')).status, 502);
  assert.equal((await pedir({ ...PENDIENTE, r1: new DatumError('x') }, '/pagar/t1')).status, 502);
  assert.equal((await pedir({ ...PENDIENTE, r1: { total_cop: '<script>' } }, '/pagar/t1')).status, 502);
  assert.equal((await pedir({ ...PENDIENTE, r1: undefined }, '/pagar/t1')).status, 502);
});

test('escapa los valores renderizados (XSS)', async () => {
  const xss = '<img src=x onerror=alert(1)>';
  const r = await pedir({ t1: { estado: xss, reserva_id: 'r1', expira_at: '2026-12-01T10:15:00Z' } }, '/pagar/t1');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.body, /<img/);
  assert.match(r.body, /&lt;img/);
});

