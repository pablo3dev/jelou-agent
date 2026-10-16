import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { createApp } from './app.js';
import { createNotificador } from './notificacion.js';

const AHORA = new Date('2026-12-01T10:00:00Z');
const SECRETO = 'secreto-super-privado-123';

const FILAS = {
  t1: { estado: 'PENDIENTE', reserva_id: 'r1', expira_at: '2026-12-01T10:15:00Z' },
  r1: { total_cop: 500000 },
  vencida: { estado: 'PENDIENTE', reserva_id: 'r1', expira_at: '2026-12-01T09:59:00Z' },
  hecha: { estado: 'APROBADA', reserva_id: 'r1', expira_at: '2026-12-01T10:15:00Z' },
};

const datumFalso = { getRow: async (id) => FILAS[id] ?? null };

// Receptor simulado: guarda cuerpo crudo y cabeceras; `respuestas` define los status sucesivos.
async function conReceptor(respuestas, fn) {
  const recibidos = [];
  const receptor = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      recibidos.push({ raw: Buffer.concat(partes).toString('utf8'), headers: req.headers });
      res.statusCode = respuestas[Math.min(recibidos.length - 1, respuestas.length - 1)];
      res.end('{}');
    });
  }).listen(0);
  try {
    await fn(`http://127.0.0.1:${receptor.address().port}/pago`, recibidos);
  } finally {
    await new Promise((resolve) => receptor.close(resolve));
  }
}

async function postear(env, ruta, { lang } = {}) {
  const esperas = [];
  const notificador = createNotificador({ env, now: () => AHORA, sleep: async (ms) => esperas.push(ms) });
  const server = createApp({ datum: datumFalso, now: () => AHORA, notificador }).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${ruta}`, {
      method: 'POST',
      headers: lang ? { 'accept-language': lang } : {},
    });
    return { status: res.status, body: await res.text(), esperas };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('aprobar: cuerpo exacto, firma válida sobre el cuerpo crudo y event_id', async () => {
  await conReceptor([200], async (url, recibidos) => {
    const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
    assert.equal(r.status, 200);
    assert.match(r.body, /Aprobada/);
    assert.equal(recibidos.length, 1);
    const { raw, headers } = recibidos[0];
    assert.equal(
      raw,
      '{"transaccion_id":"t1","estado":"APROBADA","event_id":"t1:APROBADA","emitido_at":"2026-12-01T10:00:00.000Z"}',
    );
    const esperada = createHmac('sha256', SECRETO).update(raw).digest('hex');
    assert.equal(headers['x-webhook-signature'], `sha256=${esperada}`);
    assert.match(headers['content-type'], /application\/json/);
    assert.equal(JSON.parse(raw).event_id, 't1:APROBADA');
  });
});

test('rechazar: estado RECHAZADA y event_id correspondiente', async () => {
  await conReceptor([200], async (url, recibidos) => {
    const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/rechazar', { lang: 'en' });
    assert.equal(r.status, 200);
    assert.match(r.body, /Rejected/);
    const cuerpo = JSON.parse(recibidos[0].raw);
    assert.equal(cuerpo.estado, 'RECHAZADA');
    assert.equal(cuerpo.event_id, 't1:RECHAZADA');
    assert.equal(
      recibidos[0].headers['x-webhook-signature'],
      `sha256=${createHmac('sha256', SECRETO).update(recibidos[0].raw).digest('hex')}`,
    );
  });
});

test('re-notificar produce el mismo event_id', async () => {
  await conReceptor([200], async (url, recibidos) => {
    const env = { PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url };
    await postear(env, '/pagar/t1/aprobar');
    await postear(env, '/pagar/t1/aprobar');
    assert.equal(recibidos.length, 2);
    assert.equal(JSON.parse(recibidos[0].raw).event_id, JSON.parse(recibidos[1].raw).event_id);
  });
});

test('receptor con 5xx: 3 intentos con backoff 1 s y 2 s y luego 502 con mensaje al usuario', async () => {
  await conReceptor([500], async (url, recibidos) => {
    const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
    assert.equal(r.status, 502);
    assert.match(r.body, /No pudimos notificar/);
    assert.equal(recibidos.length, 3);
    assert.deepEqual(r.esperas, [1000, 2000]);
    assert.ok(!r.body.includes(SECRETO));
  });
});

test('receptor que falla y luego acepta: éxito en el reintento', async () => {
  await conReceptor([503, 200], async (url, recibidos) => {
    const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
    assert.equal(r.status, 200);
    assert.equal(recibidos.length, 2);
    assert.equal(recibidos[0].raw, recibidos[1].raw);
  });
});

test('401 del receptor es definitivo: un intento y 502', async () => {
  await conReceptor([401], async (url, recibidos) => {
    const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
    assert.equal(r.status, 502);
    assert.equal(recibidos.length, 1);
  });
});

test('receptor inalcanzable: 502', async () => {
  const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: 'http://127.0.0.1:1/x' }, '/pagar/t1/aprobar');
  assert.equal(r.status, 502);
});

test('no notifica si la transacción no está PENDIENTE o está vencida', async () => {
  await conReceptor([200], async (url, recibidos) => {
    const env = { PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url };
    const vencida = await postear(env, '/pagar/vencida/aprobar');
    assert.equal(vencida.status, 200);
    assert.match(vencida.body, /Expirada/);
    const hecha = await postear(env, '/pagar/hecha/rechazar');
    assert.equal(hecha.status, 200);
    assert.match(hecha.body, /Aprobada/);
    assert.equal((await postear(env, '/pagar/nada/aprobar')).status, 404);
    assert.equal(recibidos.length, 0);
  });
});

test('sin secreto o sin URL: 500 sin filtrar el secreto ni notificar', async () => {
  await conReceptor([200], async (url, recibidos) => {
    const sinUrl = await postear({ PAY_WEBHOOK_SECRET: SECRETO }, '/pagar/t1/aprobar');
    assert.equal(sinUrl.status, 500);
    assert.ok(!sinUrl.body.includes(SECRETO));
    const sinSecreto = await postear({ PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
    assert.equal(sinSecreto.status, 500);
    assert.equal(recibidos.length, 0);
  });
});

test('el secreto no aparece en respuestas ni en logs', async () => {
  const logs = [];
  const originales = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a) => logs.push(a.join(' '));
  try {
    await conReceptor([500], async (url) => {
      const r = await postear({ PAY_WEBHOOK_SECRET: SECRETO, PAGO_NOTIFICACION_URL: url }, '/pagar/t1/aprobar');
      assert.ok(!r.body.includes(SECRETO));
    });
  } finally {
    Object.assign(console, originales);
  }
  assert.ok(!logs.join('\n').includes(SECRETO));
});
