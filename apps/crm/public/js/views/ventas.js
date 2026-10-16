// Vista Ventas: por destino y por vuelo (graficos + tablas).
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatInt, formatPct, formatFecha } from '../format.js';
import { tarjetaGrafico, pintar, colores } from '../charts.js';
import { pintarEstadoSinDatos } from '../ui.js';
import { barraOcupacion } from './vuelos.js';

export function montar(root, ctx) {
  const estado = h('div', { class: 'estado-host' });
  const gDestino = tarjetaGrafico('ventas-destino', 'ventas.graficoDestino', 'ventas.graficoDestino.desc');
  const gVuelo = tarjetaGrafico('ventas-por-vuelo', 'ventas.graficoVuelo', 'ventas.graficoVuelo.desc');
  const totalVendidos = h('p', { class: 'vista__sub', role: 'status' });
  const tbDestino = h('tbody');
  const tbVuelo = h('tbody');
  const tabla = (titulo, cols, cuerpo) => h('section', { class: 'tarjeta' }, h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla--compacta' },
    h('caption', { class: 'tarjeta__titulo', text: t(titulo) }), h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', text: t(c) })))), cuerpo)));
  const contenido = h('div', { class: 'contenido', hidden: true },
    totalVendidos,
    h('div', { class: 'graficos' }, gDestino.el, gVuelo.el),
    h('div', { class: 'graficos' },
      tabla('ventas.tablaDestino', ['ventas.col.destino', 'ventas.col.vuelos', 'ventas.col.vendidos', 'ventas.col.asientos', 'ventas.col.ocupacion'], tbDestino),
      tabla('ventas.tablaVuelo', ['ventas.col.vuelo', 'ventas.col.ruta', 'ventas.col.fecha', 'ventas.col.vendidos'], tbVuelo)));
  root.append(h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('nav.ventas') }), h('p', { class: 'vista__sub', text: t('ventas.sub') })), estado, contenido);

  function actualizar(state) {
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
    pintar(gVuelo, {
      type: 'bar',
      data: { labels: v.map((x) => `${x.vuelo_id} · ${x.ruta}`), datasets: [{ label: t('charts.vendidos'), data: v.map((x) => x.vendidos), backgroundColor: c.viz[2], borderRadius: 6 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });

    tbDestino.replaceChildren(...d.map((x) => h('tr', {},
      h('th', { scope: 'row', text: x.destino }), h('td', { text: formatInt(x.vuelos, L) }), h('td', { text: formatInt(x.vendidos, L) }), h('td', { text: formatInt(x.total_asientos, L) }),
      h('td', {}, h('div', { class: 'ocupacion' }, barraOcupacion(x.ocupacion_pct, `${t('ventas.col.ocupacion')}: ${formatPct(x.ocupacion_pct, L)}`), h('span', { class: 'ocupacion__pct', text: formatPct(x.ocupacion_pct, L) }))))));
    tbVuelo.replaceChildren(...v.map((x) => h('tr', {},
      h('th', { scope: 'row' }, h('a', { class: 'enlace', href: `#/mapa/${encodeURIComponent(x.vuelo_id)}`, text: x.vuelo_id })),
      h('td', { text: x.ruta }), h('td', { text: formatFecha(x.fecha, L, true) }), h('td', { text: formatInt(x.vendidos, L) }))));
  }
  return { actualizar };
}
