// Enrutado por hash (#/vista o #/mapa/<vuelo>). Puro, sin DOM.
export const VISTAS_NAV = ['resumen', 'vuelos', 'mapa', 'ventas'];

export function parsearHash(hash) {
  const [, vista, id] = /^#\/(\w+)(?:\/([^/]+))?/.exec(hash ?? '') ?? [];
  let vueloId = null;
  try {
    vueloId = id ? decodeURIComponent(id) : null;
  } catch {
    vueloId = null;
  }
  return { vista: VISTAS_NAV.includes(vista) ? vista : 'resumen', id: vueloId };
}
