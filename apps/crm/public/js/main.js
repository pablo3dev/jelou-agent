// Punto de entrada: shell, enrutado por hash, auto-refresco cada 15 s.
import { h } from './dom.js';
import { iniciarIdioma, setIdioma, idioma, t, locale } from './i18n.js';
import { iniciarTema, setTema, tema } from './tema.js';
import { formatHace } from './format.js';
import { parsearHash, VISTAS_NAV } from './hash.js';
import { destruirTodos } from './charts.js';
import { getEstadisticas, getVuelos, getVentasPorVuelo, getVentasPorDestino, getAsientos } from './api.js';
import * as resumen from './views/resumen.js';
import * as vuelos from './views/vuelos.js';
import * as mapa from './views/mapa.js';
import * as ventas from './views/ventas.js';
import * as asientos from './views/asientos.js';

const INTERVALO_MS = 15000;
const VISTAS = { resumen, vuelos, mapa, ventas, asientos };
const NAV = VISTAS_NAV;

const state = { stats: null, vuelos: null, ventasVuelo: null, ventasDestino: null, asientos: null, actualizadoAt: null, error: null, cargando: false };
let ruta = { vista: 'resumen', id: null };
let vistaActiva = null;
let auto = true;
let pendiente = false;
let el = {};

const ctx = { refrescar: () => refrescar(true), ir: (hash) => { location.hash = hash; }, ruta: () => ruta };

async function refrescar(manual = false) {
  if (state.cargando) {
    pendiente = true;
    return;
  }
  state.cargando = true;
  pintarCabecera();
  vistaActiva?.actualizar(state);
  try {
    const [stats, lista, pv, pd] = await Promise.all([getEstadisticas(), getVuelos(), getVentasPorVuelo(), getVentasPorDestino()]);
    const id = mapa.vueloSeleccionado(ruta, lista.vuelos);
    const detalleAsientos = (ruta.vista === 'mapa' || ruta.vista === 'asientos') && id ? await getAsientos(id) : state.asientos;
    Object.assign(state, { stats, vuelos: lista.vuelos, ventasVuelo: pv, ventasDestino: pd, asientos: detalleAsientos, error: null, actualizadoAt: Date.now() });
    if (manual) el.anuncio.textContent = t('refrescar.anuncio');
  } catch (e) {
    state.error = e;
  } finally {
    state.cargando = false;
    pintarCabecera();
    pintarAviso();
    vistaActiva?.actualizar(state);
    if (pendiente) {
      pendiente = false;
      refrescar();
    }
  }
}

function pintarAviso() {
  const hayDatos = Boolean(state.stats);
  el.aviso.replaceChildren(state.error && hayDatos ? h('p', { class: 'aviso aviso--atencion', role: 'alert' }, h('span', { 'aria-hidden': 'true', text: '⚠ ' }), t('estado.obsoletos')) : '');
}

function pintarCabecera() {
  el.refrescar.disabled = state.cargando;
  el.refrescar.setAttribute('aria-busy', String(state.cargando));
  el.refrescar.classList.toggle('btn--cargando', state.cargando);
  el.refrescarTexto.textContent = state.cargando ? t('refrescar.cargando') : t('refrescar.boton');
  el.hace.textContent = state.actualizadoAt ? t('refrescar.hace', { tiempo: formatHace(Date.now() - state.actualizadoAt, locale()) }) : t('refrescar.nunca');
  el.hace.classList.toggle('hace--error', Boolean(state.error));
}

function mostrarVista() {
  destruirTodos();
  document.body.classList.toggle('modo-seleccion', ruta.vista === 'asientos');
  el.main.replaceChildren();
  vistaActiva = VISTAS[ruta.vista].montar(el.main, ctx);
  vistaActiva.actualizar(state);
  for (const a of el.nav.querySelectorAll('a')) {
    if (a.dataset.vista === ruta.vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function construirShell() {
  const app = document.getElementById('app');
  document.title = t('app.titulo');
  el.nav = h('nav', { class: 'nav', 'aria-label': t('nav.label') }, NAV.map((v) =>
    h('a', { href: `#/${v}`, class: 'nav__link', 'data-vista': v, text: t(`nav.${v}`) })));
  el.refrescarTexto = h('span');
  el.refrescar = h('button', { type: 'button', class: 'btn btn--primario', onclick: () => refrescar(true) }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), el.refrescarTexto);
  el.hace = h('span', { class: 'hace' });
  el.anuncio = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  el.aviso = h('div', { class: 'aviso-host' });
  el.main = h('main', { id: 'contenido', class: 'main', tabindex: -1 });
  const interruptor = h('input', { type: 'checkbox', id: 'auto', class: 'interruptor__input', checked: auto, onchange: (e) => { auto = e.target.checked; } });
  const lang = h('button', { type: 'button', class: 'btn btn--sec btn--icono', 'aria-label': t('idioma.cambiar'), lang: idioma() === 'es' ? 'en' : 'es', onclick: () => {
    setIdioma(idioma() === 'es' ? 'en' : 'es');
    construirShell();
    pintarCabecera();
    mostrarVista();
  }, text: t('idioma.actual') });

  const oscuro = tema() === 'dark';
  const botonTema = h('button', { type: 'button', id: 'tema', class: 'btn btn--sec btn--icono', 'aria-label': t(oscuro ? 'tema.claro' : 'tema.oscuro'), title: t(oscuro ? 'tema.claro' : 'tema.oscuro'), onclick: () => {
    setTema(tema() === 'dark' ? 'light' : 'dark');
    construirShell();
    pintarCabecera();
    destruirTodos();
    mostrarVista();
  }, text: oscuro ? '☀' : '☾' });

  app.replaceChildren(
    h('a', { href: '#contenido', class: 'saltar', text: t('app.saltar'), onclick: (e) => { e.preventDefault(); el.main.focus(); } }),
    h('header', { class: 'cabecera' },
      h('div', { class: 'cabecera__fila' },
        h('p', { class: 'marca' }, h('span', { class: 'marca__logo', 'aria-hidden': 'true', text: '✈' }), h('span', { text: t('app.marca') })),
        h('div', { class: 'acciones' }, el.hace,
          h('label', { class: 'interruptor', for: 'auto' }, interruptor, h('span', { class: 'interruptor__pista', 'aria-hidden': 'true' }), h('span', { text: t('refrescar.auto') })),
          el.refrescar, botonTema, lang)),
      el.nav),
    el.aviso, el.main, el.anuncio);
}

function alCambiarHash() {
  ruta = parsearHash(location.hash);
  mostrarVista();
  refrescar();
}

iniciarIdioma();
iniciarTema();
construirShell();
pintarCabecera();
ruta = parsearHash(location.hash);
mostrarVista();
refrescar();
addEventListener('hashchange', alCambiarHash);
setInterval(() => { if (auto && !document.hidden) refrescar(); }, INTERVALO_MS);
setInterval(pintarCabecera, 1000);
