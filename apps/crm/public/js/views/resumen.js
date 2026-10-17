// Vista Resumen: KPIs y graficos globales.
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatCOP, formatInt, formatPct, formatFecha } from '../format.js';
import { tarjetaGrafico, pintar, colores } from '../charts.js';
import { pintarEstadoSinDatos } from '../ui.js';

const KPIS = [
  ['vuelos', '✈', 'kpi.vuelos'],
  ['vendidos', '●', 'kpi.vendidos', 'vendido'],
  ['retenidos', '…', 'kpi.retenidos', 'retenido'],
  ['libres', '○', 'kpi.libres', 'libre'],
  ['ocupacion', '%', 'kpi.ocupacion', 'acento'],
  ['ingresos', '$', 'kpi.ingresos', 'acento'],
];
const ESTADOS_RESERVA = ['EMITIDA', 'PENDIENTE_PAGO', 'PAGO_RECHAZADO', 'EXPIRADA', 'CANCELADA'];

function kpi([clave, icono, labelKey, tono = 'neutro']) {
  const valor = h('p', { class: 'kpi__valor', text: '—' });
  const el = h('article', { class: `tarjeta kpi kpi--${tono}`, 'data-kpi': clave },
    h('span', { class: 'kpi__icono', 'aria-hidden': 'true', text: icono }),
    h('div', { class: 'kpi__cuerpo' }, h('h3', { class: 'kpi__label', text: t(labelKey) }), valor));
  return { clave, el, valor };
}

export function montar(root, ctx) {
  const estado = h('div', { class: 'estado-host' });
  const kpis = KPIS.map(kpi);
  const chips = h('ul', { class: 'chips', 'aria-label': t('resumen.reservasPorEstado') });
  const g = {
    dona: tarjetaGrafico('dona', 'resumen.ocupacionGlobal', 'resumen.ocupacionGlobal.desc'),
    destino: tarjetaGrafico('destino', 'resumen.ocupacionDestino', 'resumen.ocupacionDestino.desc'),
    fecha: tarjetaGrafico('fecha', 'resumen.vendidosFecha', 'resumen.vendidosFecha.desc', 'grafico--s4'),
    rutas: tarjetaGrafico('rutas', 'resumen.topRutas', 'resumen.topRutas.desc'),
    reservas: tarjetaGrafico('reservas', 'resumen.reservasPorEstado', 'resumen.reservasPorEstado.desc'),
  };
  const contenido = h('div', { class: 'contenido', hidden: true },
    h('div', { class: 'kpis' }, kpis.map((k) => k.el)),
    chips,
    h('div', { class: 'graficos graficos--resumen' }, [g.dona, g.destino, g.reservas, g.fecha, g.rutas].map((x) => x.el)));
  root.append(
    h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('nav.resumen') }), h('p', { class: 'vista__sub', text: t('resumen.sub') })),
    estado, contenido);

  function actualizar(state) {
    const s = state.stats;
    if (pintarEstadoSinDatos(estado, state, Boolean(s), ctx.refrescar)) {
      contenido.hidden = true;
      return;
    }
    estado.replaceChildren();
    contenido.hidden = false;
    const L = locale();
    const val = {
      vuelos: formatInt(s.vuelos, L),
      vendidos: formatInt(s.asientos.vendidos, L),
      retenidos: formatInt(s.asientos.retenidos, L),
      libres: formatInt(s.asientos.libres, L),
      ocupacion: formatPct(s.ocupacion_pct, L),
      ingresos: formatCOP(s.ingresos_cop, L),
    };
    for (const k of kpis) k.valor.textContent = val[k.clave];

    chips.replaceChildren(...ESTADOS_RESERVA.map((e) =>
      h('li', { class: `chip chip--${e.toLowerCase()}` },
        h('span', { class: 'chip__n', text: formatInt(s.reservas_por_estado[e] ?? 0, L) }),
        h('span', { class: 'chip__t', text: t(`reserva.${e}`) }))));

    const c = colores();
    pintar(g.dona, {
      type: 'doughnut',
      data: {
        labels: [t('estado.VENDIDO'), t('estado.RETENIDO'), t('estado.LIBRE')],
        datasets: [{ data: [s.asientos.vendidos, s.asientos.retenidos, s.asientos.libres], backgroundColor: [c.vendido, c.retenido, c.libre], borderColor: c.superficie, borderWidth: 3 }],
      },
      options: { cutout: '68%', plugins: { legend: { position: 'bottom' } } },
    });
    const destinos = state.ventasDestino?.destinos ?? [];
    pintar(g.destino, {
      type: 'bar',
      data: { labels: destinos.map((d) => d.destino), datasets: [{ label: t('charts.ocupacionPct'), data: destinos.map((d) => d.ocupacion_pct), backgroundColor: c.viz[0], borderRadius: 6 }] },
      options: { scales: { y: { beginAtZero: true, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } } }, plugins: { legend: { display: false } } },
    });
    const serie = s.serie_vendidos_por_fecha;
    pintar(g.fecha, {
      type: 'line',
      data: { labels: serie.map((p) => formatFecha(p.fecha, L, true)), datasets: [{ label: t('charts.vendidos'), data: serie.map((p) => p.vendidos), borderColor: c.viz[0], backgroundColor: `${c.viz[0]}33`, fill: true, tension: 0.35, pointRadius: 3 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });
    pintar(g.rutas, {
      type: 'bar',
      data: { labels: s.top_rutas.map((r) => r.ruta), datasets: [{ label: t('charts.vendidos'), data: s.top_rutas.map((r) => r.vendidos), backgroundColor: c.viz[1], borderRadius: 6 }] },
      options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });
    const colorReserva = { EMITIDA: c.libre, PENDIENTE_PAGO: c.retenido, PAGO_RECHAZADO: c.vendido, EXPIRADA: c.bloqueado, CANCELADA: c.rejilla };
    pintar(g.reservas, {
      type: 'bar',
      data: { labels: ESTADOS_RESERVA.map((e) => t(`reserva.${e}`)), datasets: [{ label: t('charts.reservas'), data: ESTADOS_RESERVA.map((e) => s.reservas_por_estado[e] ?? 0), backgroundColor: ESTADOS_RESERVA.map((e) => colorReserva[e]), borderRadius: 6 }] },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
    });
  }
  return { actualizar };
}
