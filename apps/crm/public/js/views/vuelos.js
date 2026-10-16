// Vista Vuelos: filtros, tabla ordenable con barra de ocupacion y grafico de ventas por vuelo.
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatInt, formatPct, formatFecha } from '../format.js';
import { tarjetaGrafico, pintar, colores } from '../charts.js';
import { pintarEstadoSinDatos, vacio } from '../ui.js';

const filtros = { ruta: '', desde: '', hasta: '' };
const orden = { clave: 'fecha', dir: 'asc' };

const COLUMNAS = [
  ['vuelo_id', 'vuelos.col.vuelo'],
  ['ruta', 'vuelos.col.ruta'],
  ['fecha', 'vuelos.col.fecha'],
  ['hora_salida', 'vuelos.col.hora'],
  ['vendidos', 'vuelos.col.vendidos'],
  ['retenidos', 'vuelos.col.retenidos'],
  ['libres', 'vuelos.col.libres'],
  ['ocupacion_pct', 'vuelos.col.ocupacion'],
];

export const aplicarFiltros = (vuelos, f) =>
  vuelos.filter((v) => (!f.ruta || v.ruta === f.ruta) && (!f.desde || v.fecha >= f.desde) && (!f.hasta || v.fecha <= f.hasta));

export function ordenar(vuelos, clave, dir) {
  const signo = dir === 'desc' ? -1 : 1;
  return [...vuelos].sort((a, b) => {
    const x = a[clave] ?? '';
    const y = b[clave] ?? '';
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return signo * c || String(a.vuelo_id).localeCompare(String(b.vuelo_id));
  });
}

export function barraOcupacion(pct, etiqueta) {
  return h('div', { class: 'barra', role: 'img', 'aria-label': etiqueta },
    h('span', { class: 'barra__v', vars: { '--p': String(Math.min(100, Math.max(0, pct))) } }));
}

export function montar(root, ctx) {
  const estado = h('div', { class: 'estado-host' });
  const selRuta = h('select', { id: 'f-ruta', class: 'campo' });
  const inDesde = h('input', { id: 'f-desde', class: 'campo', type: 'date' });
  const inHasta = h('input', { id: 'f-hasta', class: 'campo', type: 'date' });
  const limpiarBtn = h('button', { type: 'button', class: 'btn btn--sec', text: t('vuelos.limpiar') });
  const contador = h('p', { class: 'vista__sub', role: 'status' });
  const tbody = h('tbody');
  const thead = h('tr');
  const grafico = tarjetaGrafico('ventas-vuelo', 'vuelos.graficoTitulo', 'vuelos.graficoTitulo.desc');
  const vaciosHost = h('div');
  let ultimo = null;

  const campo = (id, key, control) => h('div', { class: 'campo-grupo' }, h('label', { for: id, text: t(key) }), control);
  const barra = h('form', { class: 'filtros', 'aria-label': t('vuelos.filtros'), onsubmit: (e) => e.preventDefault() },
    campo('f-ruta', 'vuelos.filtroRuta', selRuta), campo('f-desde', 'vuelos.filtroDesde', inDesde), campo('f-hasta', 'vuelos.filtroHasta', inHasta), limpiarBtn);

  function cabeceras() {
    thead.replaceChildren(...COLUMNAS.map(([clave, key]) => {
      const activa = orden.clave === clave;
      const th = h('th', { scope: 'col', 'aria-sort': activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', {
          type: 'button', class: 'th-btn',
          onclick: () => {
            orden.dir = activa && orden.dir === 'asc' ? 'desc' : 'asc';
            orden.clave = clave;
            cabeceras();
            if (ultimo) actualizar(ultimo);
          },
        }, t(key), h('span', { class: 'th-flecha', 'aria-hidden': 'true', text: activa ? (orden.dir === 'asc' ? '▲' : '▼') : '' })));
      return th;
    }));
  }
  cabeceras();

  const tabla = h('div', { class: 'tabla-wrap' },
    h('table', { class: 'tabla tabla--apilable' }, h('caption', { class: 'sr-only', text: t('vuelos.titulo') }), h('thead', {}, thead), tbody));
  const contenido = h('div', { class: 'contenido', hidden: true }, barra, contador, vaciosHost, tabla, h('div', { class: 'graficos graficos--uno' }, grafico.el));
  root.append(h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('nav.vuelos') }), h('p', { class: 'vista__sub', text: t('vuelos.sub') })), estado, contenido);

  const leerFiltros = () => {
    filtros.ruta = selRuta.value;
    filtros.desde = inDesde.value;
    filtros.hasta = inHasta.value;
    if (ultimo) actualizar(ultimo);
  };
  for (const el of [selRuta, inDesde, inHasta]) el.addEventListener('change', leerFiltros);
  limpiarBtn.addEventListener('click', () => {
    selRuta.value = inDesde.value = inHasta.value = '';
    leerFiltros();
  });

  function actualizar(state) {
    ultimo = state;
    const todos = state.vuelos;
    if (pintarEstadoSinDatos(estado, state, Boolean(todos?.length), ctx.refrescar, 'vuelos.vacio')) {
      contenido.hidden = true;
      return;
    }
    estado.replaceChildren();
    contenido.hidden = false;
    const L = locale();

    const rutas = [...new Set(todos.map((v) => v.ruta))].sort();
    selRuta.replaceChildren(h('option', { value: '', text: t('vuelos.todasRutas') }), ...rutas.map((r) => h('option', { value: r, text: r })));
    selRuta.value = rutas.includes(filtros.ruta) ? filtros.ruta : '';
    inDesde.value = filtros.desde;
    inHasta.value = filtros.hasta;

    const lista = ordenar(aplicarFiltros(todos, { ...filtros, ruta: selRuta.value }), orden.clave, orden.dir);
    contador.textContent = t('vuelos.mostrando', { n: lista.length, total: todos.length });
    vaciosHost.replaceChildren(lista.length ? '' : vacio('vuelos.sinResultados', 'vuelos.limpiar', () => limpiarBtn.click()));
    tabla.hidden = grafico.el.hidden = lista.length === 0;

    tbody.replaceChildren(...lista.map((v) => {
      const celda = (key, ...c) => h('td', { 'data-label': t(key) }, ...c);
      const tr = h('tr', { class: 'fila-click', onclick: (e) => { if (!e.target.closest('a')) ctx.ir(`#/mapa/${encodeURIComponent(v.vuelo_id)}`); } },
        celda('vuelos.col.vuelo', h('a', { href: `#/mapa/${encodeURIComponent(v.vuelo_id)}`, class: 'enlace', 'aria-label': t('vuelos.verMapa', { id: v.vuelo_id }), text: v.vuelo_id })),
        celda('vuelos.col.ruta', h('strong', { text: v.ruta })),
        celda('vuelos.col.fecha', formatFecha(v.fecha, L)),
        celda('vuelos.col.hora', v.hora_salida ?? '—'),
        celda('vuelos.col.vendidos', formatInt(v.vendidos, L)),
        celda('vuelos.col.retenidos', formatInt(v.retenidos, L)),
        celda('vuelos.col.libres', formatInt(v.libres, L)),
        celda('vuelos.col.ocupacion', h('div', { class: 'ocupacion' }, barraOcupacion(v.ocupacion_pct, `${t('vuelos.col.ocupacion')}: ${formatPct(v.ocupacion_pct, L)}`), h('span', { class: 'ocupacion__pct', text: formatPct(v.ocupacion_pct, L) }))));
      return tr;
    }));

    const c = colores();
    pintar(grafico, {
      type: 'bar',
      data: { labels: lista.map((v) => `${v.ruta} · ${formatFecha(v.fecha, L, true)}`), datasets: [{ label: t('charts.vendidos'), data: lista.map((v) => v.vendidos), backgroundColor: c.viz[0], borderRadius: 6 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });
  }
  return { actualizar };
}
