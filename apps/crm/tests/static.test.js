// Frontend estatico servido por createApp: HTML, MIME, CSP-compatibilidad y solo-lectura.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { mockDatum, AHORA } from './fixtures.js';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const CHARTJS = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
let server;
let base;
let datum;

before(async () => {
  datum = mockDatum();
  server = createApp({ datum, now: () => AHORA }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const listar = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
const jsPublicos = () => listar(path.join(PUBLIC, 'js')).filter((p) => p.endsWith('.js'));

test('/ sirve el HTML que referencia chart.js@4.5.1 exacto, con defer, y los assets propios', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.ok(html.includes(`<script src="${CHARTJS}" defer></script>`));
  assert.equal([...html.matchAll(/chart\.js@([^/]+)\//g)].map((m) => m[1]).join(), '4.5.1');
  assert.match(html, /<script type="module" src="\/js\/main\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<div id="app"><\/div>/);
});

test('el unico origen externo permitido es cdn.jsdelivr.net (CSP script-src)', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const externos = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).origin);
  assert.deepEqual([...new Set(externos)], ['https://cdn.jsdelivr.net']);
});

test('assets responden 200 con el tipo MIME correcto', async () => {
  const css = await fetch(`${base}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = jsPublicos().map((p) => `/${path.relative(PUBLIC, p).split(path.sep).join('/')}`);
  assert.ok(js.includes('/js/main.js') && js.includes('/js/seatmap-layout.js') && js.length >= 8);
  for (const ruta of js) {
    const res = await fetch(`${base}${ruta}`);
    assert.equal(res.status, 200, ruta);
    assert.match(res.headers.get('content-type'), /(text|application)\/javascript/, ruta);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('sin estilos inline: ni style=" ni <style> en HTML ni en JS (compatible con style-src self)', () => {
  const archivos = [path.join(PUBLIC, 'index.html'), ...jsPublicos()];
  for (const f of archivos) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\sstyle\s*=\s*["']/i, f);
    assert.doesNotMatch(src, /<style[\s>]/i, f);
    assert.doesNotMatch(src, /setAttribute\(\s*['"]style['"]/, f);
    assert.doesNotMatch(src, /cssText/, f);
  }
  const css = readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');
  assert.doesNotMatch(css, /@import\s+url\(\s*['"]?https?:/);
});

test('HTML no inyectado: ningun JS usa innerHTML, insertAdjacentHTML, document.write ni eval', () => {
  for (const f of jsPublicos()) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, f);
  }
});

test('solo lectura: ningun JS publico declara un verbo distinto de GET en fetch', () => {
  let llamadas = 0;
  for (const f of jsPublicos()) {
    const src = readFileSync(f, 'utf8');
    llamadas += (src.match(/\bfetch\(/g) ?? []).length;
    assert.doesNotMatch(src, /method\s*:/i, f);
    assert.doesNotMatch(src, /\b(POST|PUT|PATCH|DELETE)\b/, f);
    assert.doesNotMatch(src, /XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  }
  assert.equal(llamadas, 1); // un unico fetch, centralizado en api.js
  const api = readFileSync(path.join(PUBLIC, 'js/api.js'), 'utf8');
  for (const ruta of api.matchAll(/leer\(\s*[`'"]([^`'"]+)/g)) assert.match(ruta[1], /^\/api\//);
});

test('los endpoints que consume el frontend responden 200 JSON con las formas esperadas', async () => {
  const get = async (p) => {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 200, p);
    return res.json();
  };
  const stats = await get('/api/estadisticas');
  for (const k of ['vuelos', 'asientos', 'ocupacion_pct', 'reservas_por_estado', 'ingresos_cop', 'top_rutas', 'serie_vendidos_por_fecha']) assert.ok(k in stats, k);
  const { vuelos } = await get('/api/vuelos');
  assert.ok(vuelos.length > 0);
  const mapa = await get(`/api/vuelos/${vuelos[0].vuelo_id}/asientos`);
  assert.equal(mapa.asientos.length, 174);
  assert.doesNotMatch(JSON.stringify(mapa), /hold_token|SECRET/);
  assert.ok((await get('/api/ventas/por-destino')).destinos.length > 0);
  assert.ok((await get('/api/ventas/por-vuelo')).vuelos.length > 0);
  assert.deepEqual(datum.writes, []);
});
