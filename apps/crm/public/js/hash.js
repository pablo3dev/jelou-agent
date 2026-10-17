// Enrutado por hash (#/vista, #/mapa/<vuelo> o #/asientos/<vuelo>/<n>). Puro, sin DOM.
export const VISTAS_NAV = ['resumen', 'vuelos', 'mapa', 'ventas'];
// `asientos` es el widget de seleccion que se comparte por enlace: no aparece en la navegacion.
const VISTAS = [...VISTAS_NAV, 'asientos'];
export const MAX_SELECCION = 9;

export function parsearHash(hash) {
  const [, vista, id, n] = /^#\/(\w+)(?:\/([^/]+))?(?:\/(\d+))?/.exec(hash ?? '') ?? [];
  let vueloId = null;
  try {
    vueloId = id ? decodeURIComponent(id) : null;
  } catch {
    vueloId = null;
  }
  const ruta = { vista: VISTAS.includes(vista) ? vista : 'resumen', id: vueloId };
  // Cantidad de asientos a elegir (1..9); sin valor valido, el widget no fija limite.
  if (ruta.vista === 'asientos') ruta.n = n && Number(n) >= 1 ? Math.min(Number(n), MAX_SELECCION) : null;
  return ruta;
}
