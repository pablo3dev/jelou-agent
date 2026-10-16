// Estados de UI compartidos por las vistas: cargando, vacio y error con reintento.
import { h } from './dom.js';
import { t } from './i18n.js';

export function esqueleto(bloques = 4) {
  return h('div', { class: 'esqueleto', role: 'status', 'aria-label': t('estado.cargando') },
    Array.from({ length: bloques }, () => h('div', { class: 'esqueleto__bloque', 'aria-hidden': 'true' })));
}

export function vacio(mensajeKey, accionKey, alAccion) {
  return h('div', { class: 'estado estado--vacio' },
    h('span', { class: 'estado__icono', 'aria-hidden': 'true', text: '◌' }),
    h('p', { class: 'estado__texto', text: t(mensajeKey) }),
    accionKey ? h('button', { type: 'button', class: 'btn', onclick: alAccion, text: t(accionKey) }) : null);
}

const MENSAJES = { datum_no_configurado: 'error.datumNoConfigurado', red: 'error.red' };

export function errorPanel(err, reintentar) {
  const key = MENSAJES[err?.codigo] ?? 'error.generico';
  return h('div', { class: 'estado estado--error', role: 'alert' },
    h('span', { class: 'estado__icono', 'aria-hidden': 'true', text: '⚠' }),
    h('p', { class: 'estado__texto', text: t(key) }),
    h('button', { type: 'button', class: 'btn', onclick: reintentar, text: t('estado.reintentar') }));
}

// Decide que mostrar en `host` cuando aun no hay datos. Devuelve true si ya pinto un estado.
export function pintarEstadoSinDatos(host, state, hayDatos, reintentar, vacioKey = 'estado.sinDatos') {
  if (hayDatos) return false;
  if (state.error) host.replaceChildren(errorPanel(state.error, reintentar));
  else if (state.cargando || !state.actualizadoAt) host.replaceChildren(esqueleto());
  else host.replaceChildren(vacio(vacioKey));
  return true;
}
