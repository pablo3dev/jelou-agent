// Envoltorio de Chart.js (CDN). Si el CDN falla, window.Chart no existe y se muestra un aviso.
import { h } from './dom.js';
import { t } from './i18n.js';

const instancias = new Map();

export const chartDisponible = () => typeof window.Chart === 'function';

export const token = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

export function colores() {
  return {
    libre: token('--libre'),
    retenido: token('--retenido'),
    vendido: token('--vendido'),
    bloqueado: token('--bloqueado'),
    viz: [token('--viz-1'), token('--viz-2'), token('--viz-3')],
    texto: token('--muted'),
    rejilla: token('--border'),
    superficie: token('--surface'),
  };
}

// Tarjeta con un canvas (alternativa textual en aria-label) y un aviso por si no hay Chart.js.
export function tarjetaGrafico(id, tituloKey, descKey, extra = '') {
  const canvas = h('canvas', { role: 'img', 'aria-label': t(descKey) });
  const aviso = h('p', { class: 'chart-aviso', text: t('charts.noDisponible'), hidden: true });
  const el = h('section', { class: `tarjeta grafico ${extra}`.trim(), 'aria-labelledby': `t-${id}` },
    h('h3', { id: `t-${id}`, class: 'tarjeta__titulo', text: t(tituloKey) }),
    h('div', { class: 'chart-wrap' }, canvas, aviso));
  return { el, canvas, aviso, id };
}

export function pintar(tarjeta, config) {
  if (!chartDisponible()) {
    tarjeta.canvas.hidden = true;
    tarjeta.aviso.hidden = false;
    return;
  }
  tarjeta.canvas.hidden = false;
  tarjeta.aviso.hidden = true;
  const c = colores();
  window.Chart.defaults.color = c.texto;
  window.Chart.defaults.borderColor = c.rejilla;
  window.Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const opciones = { responsive: true, maintainAspectRatio: false, ...config.options };
  const previo = instancias.get(tarjeta.id);
  if (previo && previo.canvas === tarjeta.canvas && previo.config.type === config.type) {
    previo.data = config.data;
    previo.options = opciones;
    previo.update('none');
    return;
  }
  previo?.destroy();
  instancias.set(tarjeta.id, new window.Chart(tarjeta.canvas, { ...config, options: opciones }));
}

export function destruirTodos() {
  for (const ch of instancias.values()) ch.destroy();
  instancias.clear();
}
