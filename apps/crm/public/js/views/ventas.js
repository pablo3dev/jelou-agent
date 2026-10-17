// Vista Ventas: por destino y por vuelo (graficos + tablas).
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatInt, formatPct, formatFecha } from '../format.js';
import { tarjetaGrafico, pintar, colores } from '../charts.js';
import { pintarEstadoSinDatos } from '../ui.js';
import { barraOcupacion } from './vuelos.js';

// Filtro del detalle por vuelo: pestana + palabra clave. Vive a nivel de modulo para sobrevivir al auto-refresco.
const filtro = { pestana: 'todos', texto: '' };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarVentasVuelo(vuelos, { pestana, texto }, formatoFecha = (f) => f) {
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  let lista = vuelos.filter((x) => {
    if (pestana === 'con' && !(x.vendidos > 0)) return false;
    if (pestana === 'sin' && x.vendidos > 0) return false;
    const pajar = norm(`${x.vuelo_id} ${x.ruta} ${x.fecha} ${formatoFecha(x.fecha)}`);
    return palabras.every((w) => pajar.includes(w));
  });
  if (pestana === 'con') lista = [...lista].sort((a, b) => b.vendidos - a.vendidos || String(a.vuelo_id).localeCompare(String(b.vuelo_id)));
  return lista;
}

// Serie de ventas por periodo (dia / semana ISO lunes / mes) para no perder informacion con 1.100+ vuelos.
const GRANULARIDADES = ['dia', 'semana', 'mes'];
let granularidad = 'dia';

function inicioDePeriodo(fecha, gran) {
  if (gran === 'mes') return `${fecha.slice(0, 7)}-01`;
  if (gran === 'dia') return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function agruparVentas(vuelos, gran = 'dia') {
  const periodos = new Map();
  for (const x of vuelos) {
    const clave = inicioDePeriodo(x.fecha, gran);
    const p = periodos.get(clave) ?? { fecha: clave, vendidos: 0, vuelosConVentas: 0, top: null };
    p.vendidos += x.vendidos;
    if (x.vendidos > 0) p.vuelosConVentas++;
    if (x.vendidos > 0 && (!p.top || x.vendidos > p.top.vendidos)) p.top = { vuelo_id: x.vuelo_id, ruta: x.ruta, vendidos: x.vendidos };
    periodos.set(clave, p);
  }
  return [...periodos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Indices de los `n` maximos locales mas altos (los picos que se resaltan con punto).
export function indicesPicos(valores, n = 5) {
  return valores
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => v > 0 && v >= (valores[i - 1] ?? 0) && v >= (valores[i + 1] ?? 0))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, n)
    .map(({ i }) => i);
}

function etiquetaPeriodo(fecha, gran, L) {
  if (gran === 'mes') return new Intl.DateTimeFormat(L, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T00:00:00Z`));
  return formatFecha(fecha, L, true);
}

export function montar(root, ctx) {
  const estado = h('div', { class: 'estado-host' });
  const gDestino = tarjetaGrafico('ventas-destino', 'ventas.graficoDestino', 'ventas.graficoDestino.desc');
  const gVuelo = tarjetaGrafico('ventas-por-vuelo', 'ventas.graficoVuelo', 'ventas.graficoVuelo.desc');
  const botonesGran = GRANULARIDADES.map((id) => h('button', {
    type: 'button', role: 'tab', class: 'pestana',
    onclick: () => { granularidad = id; if (ultimo) actualizar(ultimo); },
  }));
  gVuelo.el.querySelector('h3').after(h('div', { class: 'pestanas pestanas--grafico', role: 'tablist', 'aria-label': t('ventas.gran') }, botonesGran));
  const totalVendidos = h('p', { class: 'vista__sub', role: 'status' });
  const tbDestino = h('tbody');
  const tbVuelo = h('tbody');
  const tabla = (titulo, cols, cuerpo) => h('section', { class: 'tarjeta' }, h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla--compacta' },
    h('caption', { class: 'tarjeta__titulo', text: t(titulo) }), h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', text: t(c) })))), cuerpo)));
  const PESTANAS = [['todos', 'ventas.tab.todos'], ['con', 'ventas.tab.con'], ['sin', 'ventas.tab.sin']];
  const botones = PESTANAS.map(([id]) => h('button', {
    type: 'button', role: 'tab', class: 'pestana', id: `ventas-tab-${id}`,
    onclick: () => { filtro.pestana = id; if (ultimo) actualizar(ultimo); },
  }));
  const buscador = h('input', {
    type: 'search', class: 'campo buscador', id: 'ventas-buscar', autocomplete: 'off',
    placeholder: t('ventas.buscar.ph'), 'aria-label': t('ventas.buscar'),
    oninput: (e) => { filtro.texto = e.target.value; if (ultimo) actualizar(ultimo); },
  });
  buscador.value = filtro.texto;
  const sinResultados = h('p', { class: 'vista__sub', role: 'status', hidden: true, text: t('ventas.sinResultados') });
  let ultimo = null;
  const tarjetaVuelo = h('section', { class: 'tarjeta' },
    h('div', { class: 'tarjeta__cab' },
      h('h3', { class: 'tarjeta__titulo', text: t('ventas.tablaVuelo') }),
      h('div', { class: 'pestanas', role: 'tablist', 'aria-label': t('ventas.tablaVuelo') }, botones),
      buscador),
    sinResultados,
    h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla--compacta' },
      h('caption', { class: 'sr-only', text: t('ventas.tablaVuelo') }),
      h('thead', {}, h('tr', {}, ['ventas.col.vuelo', 'ventas.col.ruta', 'ventas.col.fecha', 'ventas.col.vendidos'].map((c) => h('th', { scope: 'col', text: t(c) })))), tbVuelo)));
  const contenido = h('div', { class: 'contenido', hidden: true },
    totalVendidos,
    h('div', { class: 'graficos' }, gDestino.el, gVuelo.el),
    h('div', { class: 'graficos' },
      tabla('ventas.tablaDestino', ['ventas.col.destino', 'ventas.col.vuelos', 'ventas.col.vendidos', 'ventas.col.asientos', 'ventas.col.ocupacion'], tbDestino),
      tarjetaVuelo));
  root.append(h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('nav.ventas') }), h('p', { class: 'vista__sub', text: t('ventas.sub') })), estado, contenido);

  function actualizar(state) {
    ultimo = state;
    const d = state.ventasDestino?.destinos ?? [];
    const v = state.ventasVuelo?.vuelos ?? [];
    if (pintarEstadoSinDatos(estado, state, Boolean(d.length || v.length),ctx.refrescar, 'ventas.vacio')) {
      contenido.hidden = true;
      return;
    }
    estado.replaceChildren();
    contenido.hidden = false;
    const L = locale();
    totalVendidos.textContent = t('ventas.total', { n: formatInt(state.ventasVuelo?.total_vendidos ?? 0, L) });
    const c = colores();

    pintar(gDestino, {
      type: 'bar',
      data: { labels: d.map((x) => x.destino), datasets: [{ label: t('charts.vendidos'), data: d.map((x) => x.vendidos), backgroundColor: c.viz[0], borderRadius: 6 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });
    const serie = agruparVentas(v, granularidad);
    const valores = serie.map((p) => p.vendidos);
    const picos = new Set(indicesPicos(valores));
    GRANULARIDADES.forEach((id, i) => {
      botonesGran[i].textContent = t(`ventas.gran.${id}`);
      botonesGran[i].setAttribute('aria-selected', String(granularidad === id));
      botonesGran[i].tabIndex = granularidad === id ? 0 : -1;
    });
    pintar(gVuelo, {
      type: 'line',
      data: {
        labels: serie.map((p) => etiquetaPeriodo(p.fecha, granularidad, L)),
        datasets: [{
          label: t('charts.vendidos'), data: valores, borderColor: c.viz[2], backgroundColor: `${c.viz[2]}33`, fill: true, tension: 0.35, borderWidth: 2,
          pointRadius: serie.map((_, i) => (picos.has(i) ? 6 : 0)), pointHoverRadius: 7, pointBackgroundColor: c.viz[2], pointBorderColor: c.superficie, pointBorderWidth: 2,
        }],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctxPunto) => {
                const p = serie[ctxPunto.dataIndex];
                const lineas = [t('ventas.tooltip.vuelos', { n: formatInt(p.vuelosConVentas, L) })];
                if (p.top) lineas.push(t('ventas.tooltip.top', { id: p.top.vuelo_id, ruta: p.top.ruta, n: formatInt(p.top.vendidos, L) }));
                return lineas;
              },
            },
          },
        },
      },
    });

    tbDestino.replaceChildren(...d.map((x) => h('tr', {},
      h('th', { scope: 'row', text: x.destino }), h('td', { text: formatInt(x.vuelos, L) }), h('td', { text: formatInt(x.vendidos, L) }), h('td', { text: formatInt(x.total_asientos, L) }),
      h('td', {}, h('div', { class: 'ocupacion' }, barraOcupacion(x.ocupacion_pct, `${t('ventas.col.ocupacion')}: ${formatPct(x.ocupacion_pct, L)}`), h('span', { class: 'ocupacion__pct', text: formatPct(x.ocupacion_pct, L) }))))));
    const conteo = { todos: v.length, con: v.filter((x) => x.vendidos > 0).length, sin: v.filter((x) => !(x.vendidos > 0)).length };
    PESTANAS.forEach(([id, key], i) => {
      botones[i].textContent = `${t(key)} (${formatInt(conteo[id], L)})`;
      botones[i].setAttribute('aria-selected', String(filtro.pestana === id));
      botones[i].tabIndex = filtro.pestana === id ? 0 : -1;
    });
    const visibles = filtrarVentasVuelo(v, filtro, (f) => formatFecha(f, L, true));
    sinResultados.hidden = visibles.length > 0;
    tbVuelo.replaceChildren(...visibles.map((x) => h('tr', {},
      h('th', { scope: 'row' }, h('a', { class: 'enlace', href: `#/mapa/${encodeURIComponent(x.vuelo_id)}`, text: x.vuelo_id })),
      h('td', { text: x.ruta }), h('td', { text: formatFecha(x.fecha, L, true) }), h('td', { text: formatInt(x.vendidos, L) }))));
  }
  return { actualizar };
}
