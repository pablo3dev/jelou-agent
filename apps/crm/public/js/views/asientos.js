// Widget de seleccion de asientos (se comparte por enlace #/asientos/<vuelo>/<n> en el chat de WhatsApp).
// Solo lectura: elegir y quitar asientos es estado local de la pagina; copiar deja la lista en el portapapeles.
import { h } from '../dom.js';
import { t, locale } from '../i18n.js';
import { formatFecha } from '../format.js';
import { construirLayout, validarLayout, ESTADOS } from '../seatmap-layout.js';
import { pintarEstadoSinDatos } from '../ui.js';

// Orden natural por fila y letra: "8A 8B 12C".
export const ordenarAsientos = (ids) =>
  [...ids].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.slice(-1).localeCompare(b.slice(-1)));

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = h('textarea', { 'aria-hidden': 'true', readonly: true });
    area.value = texto;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function montar(root, ctx) {
  const layout = validarLayout(construirLayout());
  const botones = new Map();
  const elegidos = new Set();
  let datos = new Map();
  let mensajeTimer = null;

  const limite = () => ctx.ruta().n ?? null;

  const fuselaje = h('div', { class: 'fuselaje', role: 'group', 'aria-label': t('asientos.fuselajeLabel') });
  fuselaje.append(h('div', { class: 'nariz', 'aria-hidden': 'true' }, h('span', { class: 'cabina-vidrio' })));
  for (const cab of layout.cabinas) {
    fuselaje.append(h('h3', { class: `cabina-titulo cabina-titulo--${cab.clase.toLowerCase()}` },
      h('span', { text: t(`clase.${cab.clase}`) }),
      h('span', { class: 'cabina-titulo__rango', text: t('mapa.filas', { desde: cab.desde, hasta: cab.hasta, n: cab.asientos }) })));
    for (const fila of cab.filas) {
      const bloque = (letras) => h('div', { class: 'bloque' }, letras.map((a) => {
        const b = h('button', { type: 'button', class: 'asiento', 'data-asiento': a.asiento, 'aria-pressed': 'false', text: a.letra });
        botones.set(a.asiento, b);
        return b;
      }));
      fuselaje.append(h('div', { class: `fila fila--${cab.clase.toLowerCase()}${fila.exit_row ? ' fila--salida' : ''}`, role: 'group', 'aria-label': t('mapa.filaN', { n: fila.fila }) },
        h('span', { class: 'ind', 'aria-hidden': 'true' }),
        bloque(fila.bloques[0]),
        h('span', { class: 'num', 'aria-hidden': 'true', text: String(fila.fila) }),
        bloque(fila.bloques[1]),
        h('span', { class: 'ind ind--der', 'aria-hidden': 'true' })));
    }
  }
  fuselaje.append(h('div', { class: 'cola', 'aria-hidden': 'true' }));

  const leyenda = h('ul', { class: 'leyenda', 'aria-label': t('mapa.leyenda') }, [...ESTADOS, 'ELEGIDO'].map((e) =>
    h('li', { class: 'leyenda__item' }, h('span', { class: 'muestra asiento asiento--leyenda', 'data-estado': e === 'ELEGIDO' ? 'LIBRE' : e, 'aria-pressed': e === 'ELEGIDO' ? 'true' : 'false', 'aria-hidden': 'true' }),
      e === 'ELEGIDO' ? t('asientos.elegido') : t(`estado.${e}`))));

  const lista = h('output', { class: 'seleccion__lista', id: 'seleccion-lista', 'aria-live': 'polite' });
  const cuenta = h('p', { class: 'seleccion__cuenta' });
  const aviso = h('p', { class: 'seleccion__aviso', role: 'status' });
  const copiar = h('button', { type: 'button', class: 'btn btn--primario', id: 'copiar-asientos', text: t('asientos.copiar') });
  const panel = h('section', { class: 'tarjeta seleccion', 'aria-labelledby': 'seleccion-t' },
    h('h3', { id: 'seleccion-t', class: 'tarjeta__titulo', text: t('asientos.seleccion') }), cuenta, lista, copiar, aviso);

  const info = h('p', { class: 'vista__sub' });
  const estado = h('div', { class: 'estado-host' });
  const contenido = h('div', { class: 'contenido', hidden: true },
    h('div', { class: 'seleccion-grid' }, h('div', { class: 'mapa-col' }, leyenda, fuselaje), panel));
  root.append(h('div', { class: 'vista__cabecera' }, h('h2', { class: 'vista__titulo', text: t('asientos.titulo') }), h('p', { class: 'vista__sub', text: t('asientos.instruccion') }), info), estado, contenido);

  function decir(texto) {
    aviso.textContent = texto;
    clearTimeout(mensajeTimer);
    mensajeTimer = setTimeout(() => { aviso.textContent = ''; }, 4000);
  }

  function pintarSeleccion() {
    const ids = ordenarAsientos(elegidos);
    lista.textContent = ids.length ? ids.join(' ') : t('asientos.vacia');
    lista.dataset.vacia = String(ids.length === 0);
    const n = limite();
    cuenta.textContent = n ? t('asientos.cuentaDe', { k: ids.length, n }) : t('asientos.cuenta', { k: ids.length });
    copiar.disabled = ids.length === 0;
    for (const [k, b] of botones) b.setAttribute('aria-pressed', String(elegidos.has(k)));
  }

  fuselaje.addEventListener('click', (e) => {
    const b = e.target.closest('.asiento');
    const id = b?.dataset.asiento;
    if (!id) return;
    if (elegidos.has(id)) {
      elegidos.delete(id);
    } else if (datos.get(id)?.estado !== 'LIBRE') {
      decir(t('asientos.noDisponible', { id }));
      return;
    } else if (limite() && elegidos.size >= limite()) {
      decir(t('asientos.limite', { n: limite() }));
      return;
    } else {
      elegidos.add(id);
    }
    aviso.textContent = '';
    pintarSeleccion();
  });

  copiar.addEventListener('click', async () => {
    const texto = ordenarAsientos(elegidos).join(' ');
    if (!texto) return;
    decir((await copiarTexto(texto)) ? t('asientos.copiado') : t('asientos.copiarFallo'));
  });

  function actualizar(state) {
    const id = ctx.ruta().id;
    const a = state.asientos;
    const hay = Boolean(a && a.vuelo_id === id);
    if (pintarEstadoSinDatos(estado, state, hay, ctx.refrescar, 'asientos.vacio')) {
      contenido.hidden = true;
      return;
    }
    estado.replaceChildren();
    contenido.hidden = false;
    datos = new Map(a.asientos.map((s) => [s.asiento, s]));
    for (const [k, b] of botones) {
      const s = datos.get(k);
      if (!s) continue;
      if (s.estado !== 'LIBRE') elegidos.delete(k); // lo tomaron mientras tanto
      b.dataset.estado = s.estado;
      b.disabled = s.estado !== 'LIBRE' && !elegidos.has(k);
      b.setAttribute('aria-label', `${t('mapa.asiento')} ${k} · ${t(`estado.${s.estado}`)}`);
    }
    info.textContent = `${a.ruta} · ${formatFecha(a.fecha, locale())}`;
    pintarSeleccion();
  }
  return { actualizar };
}
