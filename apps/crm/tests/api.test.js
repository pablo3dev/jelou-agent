import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { ASIENTOS, TOTAL_ASIENTOS } from '../src/asientos.js';
import { AHORA, TOKEN_SECRETO, mockDatum, datumSinConfig } from './fixtures.js';

const servers = [];
async function start(deps) {
  const server = createApp({ now: () => AHORA, ...deps }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
after(() => servers.forEach((s) => s.close()));

let base;
let datum;
before(async () => {
  datum = mockDatum();
  base = await start({ datum });
});

const getJson = async (path, url = base) => {
  const res = await fetch(`${url}${path}`);
  return { status: res.status, body: await res.json() };
};

test('mapa canonico: 174 asientos, clases y exit row', () => {
  assert.equal(TOTAL_ASIENTOS, 174);
  assert.equal(ASIENTOS.filter((a) => a.clase === 'PREMIUM').length, 12);
  assert.equal(ASIENTOS.filter((a) => a.clase === 'EXTENDED').length, 24);
  assert.equal(ASIENTOS.filter((a) => a.clase === 'ECONOMY').length, 138);
  assert.deepEqual(ASIENTOS.filter((a) => a.exit_row).map((a) => a.asiento), ['13A', '13B', '13C', '13D', '13E', '13F', '14A', '14B', '14C', '14D', '14E', '14F']);
  assert.ok(!ASIENTOS.some((a) => a.fila <= 3 && ['B', 'E'].includes(a.letra)));
});

test('GET /api/vuelos calcula contadores y ocupacion con holds vencidos como LIBRE', async () => {
  const { status, body } = await getJson('/api/vuelos');
  assert.equal(status, 200);
  assert.equal(body.vuelos.length, 4);
  const v1 = body.vuelos.find((v) => v.vuelo_id === 'v1');
  assert.equal(v1.ruta, 'BOG-MDE');
  assert.equal(v1.origen, 'BOG');
  assert.equal(v1.destino, 'MDE');
  assert.equal(v1.fecha, '2026-12-01');
  assert.equal(v1.vendidos, 5);
  assert.equal(v1.retenidos, 3);
  assert.equal(v1.bloqueados, 1);
  assert.equal(v1.libres, 165);
  assert.equal(v1.libres + v1.retenidos + v1.vendidos + v1.bloqueados, 174);
  assert.equal(v1.ocupacion_pct, 2.9);
  // El mapa llega como texto JSON en v4.
  assert.equal(body.vuelos.find((v) => v.vuelo_id === 'v4').vendidos, 1);
});

test('GET /api/vuelos aplica filtros ruta, desde y hasta', async () => {
  let r = await getJson('/api/vuelos?ruta=BOG-MDE');
  assert.deepEqual(r.body.vuelos.map((v) => v.vuelo_id), ['v1', 'v4']);
  r = await getJson('/api/vuelos?desde=2026-12-02&hasta=2026-12-02');
  assert.deepEqual(r.body.vuelos.map((v) => v.vuelo_id), ['v2']);
  r = await getJson('/api/vuelos?desde=ayer');
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'fecha_invalida' });
});

test('GET /api/vuelos/:id/asientos devuelve 174 asientos con clase, exit row y estado efectivo', async () => {
  const res = await fetch(`${base}/api/vuelos/v1/asientos`);
  const raw = await res.text();
  assert.equal(res.status, 200);
  const body = JSON.parse(raw);
  assert.equal(body.asientos.length, 174);
  const por = Object.fromEntries(body.asientos.map((a) => [a.asiento, a]));

  assert.deepEqual(por['1A'], { asiento: '1A', fila: 1, letra: 'A', clase: 'PREMIUM', exit_row: false, estado: 'VENDIDO', pnr: 'ABC234' });
  assert.equal(por['5A'].clase, 'EXTENDED');
  assert.equal(por['8A'].clase, 'ECONOMY');
  assert.equal(por['13A'].exit_row, true);
  assert.equal(por['14A'].exit_row, true);
  assert.equal(por['12A'].exit_row, false);
  assert.equal(por['15A'].exit_row, false);

  assert.equal(por['2A'].estado, 'LIBRE'); // RETENIDO vencido
  assert.equal(por['14A'].estado, 'LIBRE');
  assert.equal(por['5A'].estado, 'RETENIDO'); // vigente
  assert.equal(por['8A'].estado, 'BLOQUEADO');
  assert.equal(por['30F'].pnr, 'QWE456');
  assert.equal(por['5A'].pnr, null);
  assert.equal(body.asientos.filter((a) => a.pnr !== null).every((a) => a.estado === 'VENDIDO'), true);
  assert.equal(body.resumen.vendidos, 5);

  assert.ok(!raw.includes('hold_token'));
  assert.ok(!raw.includes('hold_expira'));
  assert.ok(!raw.includes(TOKEN_SECRETO));
});

test('GET /api/vuelos/:id/asientos responde 404 si no existe', async () => {
  const { status, body } = await getJson('/api/vuelos/nope/asientos');
  assert.equal(status, 404);
  assert.deepEqual(body, { error: 'vuelo_no_encontrado' });
});

test('GET /api/ventas/por-vuelo', async () => {
  const { status, body } = await getJson('/api/ventas/por-vuelo');
  assert.equal(status, 200);
  assert.equal(body.total_vendidos, 5 + 10 + 0 + 1);
  assert.deepEqual(body.vuelos.map((v) => [v.vuelo_id, v.vendidos]), [['v1', 5], ['v2', 10], ['v4', 1], ['v3', 0]]);
});

test('GET /api/ventas/por-destino agrega vendidos y ocupacion', async () => {
  const { body } = await getJson('/api/ventas/por-destino');
  assert.deepEqual(body.destinos.map((d) => d.destino), ['CTG', 'MDE', 'BOG']);
  const mde = body.destinos.find((d) => d.destino === 'MDE');
  assert.deepEqual(mde, { destino: 'MDE', vuelos: 2, vendidos: 6, total_asientos: 348, ocupacion_pct: 1.7 });
  assert.equal(body.destinos.find((d) => d.destino === 'CTG').ocupacion_pct, 5.7);
});

test('GET /api/estadisticas', async () => {
  const { status, body } = await getJson('/api/estadisticas');
  assert.equal(status, 200);
  assert.equal(body.vuelos, 4);
  assert.deepEqual(body.asientos, { total: 696, vendidos: 16, retenidos: 3, libres: 676, bloqueados: 1 });
  assert.equal(body.ocupacion_pct, 2.3);
  assert.deepEqual(body.reservas_por_estado, { PENDIENTE_PAGO: 1, EMITIDA: 2, PAGO_RECHAZADO: 0, EXPIRADA: 1, CANCELADA: 0 });
  assert.equal(body.ingresos_cop, 350000);
  assert.deepEqual(body.top_rutas.map((r) => [r.ruta, r.vendidos]), [['BOG-CTG', 10], ['BOG-MDE', 6], ['MDE-BOG', 0]]);
  assert.deepEqual(body.serie_vendidos_por_fecha, [
    { fecha: '2026-12-01', vendidos: 5 },
    { fecha: '2026-12-02', vendidos: 10 },
    { fecha: '2026-12-03', vendidos: 1 },
  ]);
  assert.equal(body.generado_at, AHORA.toISOString());
});

test('ningun endpoint filtra hold_token', async () => {
  for (const p of ['/api/vuelos', '/api/vuelos/v1/asientos', '/api/ventas/por-vuelo', '/api/ventas/por-destino', '/api/estadisticas']) {
    const raw = await (await fetch(`${base}${p}`)).text();
    assert.ok(!raw.includes('hold_token') && !raw.includes(TOKEN_SECRETO), p);
  }
});

test('metodos distintos de GET/HEAD/OPTIONS responden 405', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const p of ['/api/vuelos', '/api/vuelos/v1/asientos', '/api/estadisticas', '/api/inexistente']) {
      const res = await fetch(`${base}${p}`, { method, headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 405, `${method} ${p}`);
      assert.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
    }
  }
  assert.equal((await fetch(`${base}/api/vuelos`, { method: 'HEAD' })).status, 200);
  assert.notEqual((await fetch(`${base}/api/vuelos`, { method: 'OPTIONS' })).status, 405);
});

test('sin configuracion de Datum responde 503 datum_no_configurado', async () => {
  const url = await start({ datum: datumSinConfig });
  for (const p of ['/api/vuelos', '/api/vuelos/v1/asientos', '/api/ventas/por-vuelo', '/api/ventas/por-destino', '/api/estadisticas']) {
    const { status, body } = await getJson(p, url);
    assert.equal(status, 503, p);
    assert.deepEqual(body, { error: 'datum_no_configurado' });
  }
});

test('createApp sin deps usa el cliente real y, sin variables, responde 503', async () => {
  const previo = { ...process.env };
  delete process.env.DATUM_URL;
  delete process.env.DATUM_API_KEY;
  try {
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    servers.push(server);
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/vuelos`);
    assert.equal(res.status, 503);
  } finally {
    process.env = previo;
  }
});

test('errores del cliente Datum -> 502 sin filtrar detalles', async () => {
  const url = await start({ datum: mockDatum(undefined, { fallo: true }) });
  const res = await fetch(`${url}/api/estadisticas`);
  const raw = await res.text();
  assert.equal(res.status, 502);
  assert.deepEqual(JSON.parse(raw), { error: 'datum_no_disponible' });
  assert.ok(!raw.includes('boom') && !raw.includes('supersecreto'));
});

test('el cliente simulado no recibio ninguna escritura', () => {
  assert.deepEqual(datum.writes, []);
  assert.ok(datum.calls.length > 0);
  assert.ok(datum.calls.every(([metodo]) => metodo === 'list' || metodo === 'getById'));
});
