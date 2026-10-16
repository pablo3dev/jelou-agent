// Vista Mapa de asientos: fuselaje del Boeing 737-8 MAX dibujado con HTML/CSS grid.
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatInt, formatPct, formatFecha } from '../format.js';
import { construirLayout, validarLayout, contarPorEstado, contarPorClase, vecino, ESTADOS, CLASES, FILAS_SALIDA } from '../seatmap-layout.js';
import { pintarEstadoSinDatos } from '../ui.js';

const GLIFOS = { LIBRE: '○', RETENIDO: '…', VENDIDO: '✕', BLOQUEADO: '▬' };
const TECLAS = { ArrowLeft: 'izquierda', ArrowRight: 'derecha', ArrowUp: 'arriba', ArrowDown: 'abajo' };

export function vueloSeleccionado(ruta, vuelos) {
  return ruta.id ?? vuelos?.[0]?.vuelo_id ?? null;
}

const textoAsiento = (a) =>
  [`${t('mapa.asiento')} ${a.asiento}`, t(`clase.${a.clase}`), a.exit_row ? t('mapa.salidaEmergencia') : null, t(`estado.${a.estado}`), a.pnr ? `PNR ${a.pnr}` : null]
    .filter(Boolean).join(' · ');

export function montar(root, ctx) {
  const layout = validarLayout(construirLayout());
  const botones = new Map();
  let datos = new Map(); // asiento -> detalle de la API
  let seleccionado = null;
  let actual = layout.asientos[0].asiento;

  // ---- fuselaje (se construye una sola vez) ----
  const fuselaje = h('div', { class: 'fuselaje', role: 'group', 'aria-label': t('mapa.fuselajeLabel') });
  fuselaje.append(h('div', { class: 'nariz', 'aria-hidden': 'true' }, h('span', { class: 'cabina-vidrio' })));
  for (const cab of layout.cabinas) {
    fuselaje.append(h('h3', { class: `cabina-titulo cabina-titulo--${cab.clase.toLowerCase()}` },
      h('span', { text: t(`clase.${cab.clase}`) }),
      h('span', { class: 'cabina-titulo__rango', text: t('mapa.filas', { desde: cab.desde, hasta: cab.hasta, n: cab.asientos }) })));
    for (const fila of cab.filas) {
      if (fila.fila === FILAS_SALIDA[0]) {
        fuselaje.append(h('div', { class: 'salida-banner' }, h('span', { 'aria-hidden': 'true', text: '▶' }), h('span', { text: t('mapa.bannerSalida', { desde: FILAS_SALIDA[0], hasta: FILAS_SALIDA[1] }) }), h('span', { 'aria-hidden': 'true', text: '◀' })));
      }
      const bloque = (letras) => h('div', { class: 'bloque' }, letras.map((a) => {
        const b = h('button', { type: 'button', class: 'asiento', tabindex: -1, 'data-asiento': a.asiento, text: a.letra });
        botones.set(a.asiento, b);
        return b;
      }));
      fuselaje.append(h('div', { class: `fila fila--${cab.clase.toLowerCase()}${fila.exit_row ? ' fila--salida' : ''}`, role: 'group', 'aria-label': t('mapa.filaN', { n: fila.fila }) },
        h('span', { class: 'ind', 'aria-hidden': 'true' }, fila.exit_row ? [h('span', { text: '◀' }), h('span', { class: 'ind__t', text: t('mapa.exit') })] : null),
        bloque(fila.bloques[0]),
        h('span', { class: 'num', 'aria-hidden': 'true', text: String(fila.fila) }),
        bloque(fila.bloques[1]),
        h('span', { class: 'ind ind--der', 'aria-hidden': 'true' }, fila.exit_row ? [h('span', { class: 'ind__t', text: t('mapa.exit') }), h('span', { text: '▶' })] : null)));
    }
  }
  fuselaje.append(h('div', { class: 'cola', 'aria-hidden': 'true' }));
  botones.get(actual).tabIndex = 0;

  const enfocar = (id) => {
    botones.get(actual).tabIndex = -1;
    actual = id;
    const b = botones.get(id);
    b.tabIndex = 0;
    b.focus();
  };
  fuselaje.addEventListener('keydown', (e) => {
    const dir = TECLAS[e.key];
    if (!dir || !e.target.dataset.asiento) return;
    e.preventDefault();
    enfocar(vecino(layout, e.target.dataset.asiento, dir));
  });
  const seleccionar = (id) => {
    seleccionado = id;
    actual = id;
    for (const [k, b] of botones) {
      b.tabIndex = k === id ? 0 : -1;
      b.setAttribute('aria-pressed', String(k === id));
    }
    pintarDetalle();
  };
  fuselaje.addEventListener('click', (e) => { const id = e.target.closest('.asiento')?.dataset.asiento; if (id) seleccionar(id); });
  fuselaje.addEventListener('focusin', (e) => { const id = e.target.dataset?.asiento; if (id && id !== seleccionado) { seleccionado = id; pintarDetalle(); } });

  // ---- panel lateral ----
  const detalle = h('section', { class: 'tarjeta detalle', 'aria-labelledby': 'detalle-t', 'aria-live': 'polite' });
  function pintarDetalle() {
    const a = seleccionado ? datos.get(seleccionado) : null;
    if (!a) {
      detalle.replaceChildren(h('h3', { id: 'detalle-t', class: 'tarjeta__titulo', text: t('mapa.detalle') }), h('p', { class: 'estado__texto', text: t('mapa.detalleVacio') }));
      return;
    }
    const fila = (k, v) => [h('dt', { text: t(k) }), h('dd', {}, v)];
    detalle.replaceChildren(
      h('h3', { id: 'detalle-t', class: 'tarjeta__titulo', text: `${t('mapa.asiento')} ${a.asiento}` }),
      h('dl', { class: 'detalle__lista' },
        fila('mapa.clase', t(`clase.${a.clase}`)),
        fila('mapa.salida', a.exit_row ? t('si') : t('no')),
        fila('mapa.estado', h('span', { class: `pastilla pastilla--${a.estado.toLowerCase()}` }, h('span', { 'aria-hidden': 'true', text: GLIFOS[a.estado] }), ` ${t(`estado.${a.estado}`)}`)),
        a.pnr ? fila('mapa.pnr', h('code', { text: a.pnr })) : null));
  }

  const leyenda = h('ul', { class: 'leyenda', 'aria-label': t('mapa.leyenda') }, ESTADOS.map((e) =>
    h('li', { class: 'leyenda__item' }, h('span', { class: `muestra asiento asiento--leyenda`, 'data-estado': e, 'aria-hidden': 'true' }), t(`estado.${e}`))));

  const contEstados = h('div', { class: 'cont-estados' });
  const contClase = h('tbody');
  const resumenClase = h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla tabla--compacta' },
    h('caption', { class: 'tarjeta__titulo', text: t('mapa.porClase') }),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: t('mapa.clase') }), h('th', { scope: 'col', text: t('mapa.total') }), ESTADOS.map((e) => h('th', { scope: 'col', text: t(`estado.${e}`) })))),
    contClase));

  const selVuelo = h('select', { id: 'sel-vuelo', class: 'campo' });
  selVuelo.addEventListener('change', () => ctx.ir(`#/mapa/${encodeURIComponent(selVuelo.value)}`));
  const info = h('p', { class: 'vista__sub' });
  const estado = h('div', { class: 'estado-host' });
  const contenido = h('div', { class: 'contenido', hidden: true },
    h('div', { class: 'mapa-grid' },
      h('div', { class: 'mapa-col' }, leyenda, fuselaje),
      h('div', { class: 'mapa-lateral' }, detalle, contEstados, h('section', { class: 'tarjeta' }, resumenClase))));
  pintarDetalle();
  root.append(
    h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('nav.mapa') }), info),
    h('div', { class: 'filtros' }, h('div', { class: 'campo-grupo' }, h('label', { for: 'sel-vuelo', text: t('mapa.vuelo') }), selVuelo)),
    estado, contenido);

  function actualizar(state) {
    const id = vueloSeleccionado(ctx.ruta(), state.vuelos);
    const a = state.asientos;
    const hay = Boolean(a && a.vuelo_id === id);
    if (state.vuelos?.length) {
      const L = locale();
      selVuelo.replaceChildren(...state.vuelos.map((v) => h('option', { value: v.vuelo_id, text: `${v.vuelo_id} · ${v.ruta} · ${formatFecha(v.fecha, L, true)}` })));
      selVuelo.value = id ?? '';
    }
    if (pintarEstadoSinDatos(estado, state, hay, ctx.refrescar, 'mapa.vacio')) {
      contenido.hidden = true;
      return;
    }
    estado.replaceChildren();
    contenido.hidden = false;
    const L = locale();
    datos = new Map(a.asientos.map((s) => [s.asiento, s]));
    for (const [k, b] of botones) {
      const s = datos.get(k);
      if (!s) continue;
      b.dataset.estado = s.estado;
      b.dataset.salida = String(s.exit_row);
      const txt = textoAsiento(s);
      b.title = txt;
      b.setAttribute('aria-label', txt);
      b.setAttribute('aria-pressed', String(k === seleccionado));
    }
    const resumen = a.resumen;
    info.textContent = `${a.ruta} · ${formatFecha(a.fecha, L)} · ${t('mapa.ocupacion')}: ${formatPct(resumen.ocupacion_pct, L)}`;

    const porEstado = contarPorEstado(a.asientos);
    contEstados.replaceChildren(...ESTADOS.map((e) => h('article', { class: `tarjeta kpi kpi--${e.toLowerCase()}` },
      h('span', { class: 'kpi__icono', 'aria-hidden': 'true', text: GLIFOS[e] }),
      h('div', { class: 'kpi__cuerpo' }, h('h3', { class: 'kpi__label', text: t(`estado.${e}`) }), h('p', { class: 'kpi__valor', text: formatInt(porEstado[e], L) })))));
    const porClase = contarPorClase(a.asientos);
    contClase.replaceChildren(...CLASES.map((k) => h('tr', {},
      h('th', { scope: 'row', text: t(`clase.${k}`) }), h('td', { text: formatInt(porClase[k].total, L) }), ESTADOS.map((e) => h('td', { text: formatInt(porClase[k][e], L) })))));
    pintarDetalle();
  }
  return { actualizar };
}
