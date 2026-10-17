// Tema claro/oscuro: preferencia guardada o la del sistema. Se aplica con data-theme en <html>.
const CLAVE = 'crm-theme';

export function temaInicial(guardado, prefiereClaro) {
  if (guardado === 'light' || guardado === 'dark') return guardado;
  return prefiereClaro ? 'light' : 'dark';
}

let actual = 'dark';

export function iniciarTema() {
  let guardado = null;
  try {
    guardado = localStorage.getItem(CLAVE);
  } catch {
    /* almacenamiento no disponible */
  }
  setTema(temaInicial(guardado, matchMedia('(prefers-color-scheme: light)').matches), false);
}

export function setTema(nuevo, guardar = true) {
  actual = nuevo;
  document.documentElement.dataset.theme = nuevo;
  if (!guardar) return;
  try {
    localStorage.setItem(CLAVE, nuevo);
  } catch {
    /* ignorar */
  }
}

export const tema = () => actual;
