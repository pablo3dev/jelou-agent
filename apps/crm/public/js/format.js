// Formateadores puros (sin DOM) segun el locale activo. La moneda siempre es COP.
export const LOCALES = { es: 'es-CO', en: 'en-US' };

export function formatCOP(valor, locale = LOCALES.es) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(valor) || 0);
}

export function formatInt(valor, locale = LOCALES.es) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(valor) || 0);
}

// `valor` ya viene en escala 0-100 (ocupacion_pct de la API).
export function formatPct(valor, locale = LOCALES.es) {
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format((Number(valor) || 0) / 100);
}

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

// 'YYYY-MM-DD' se interpreta en UTC para que no cambie de dia segun la zona del navegador.
export function formatFecha(iso, locale = LOCALES.es, corta = false) {
  const m = ISO_FECHA.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const opciones = corta ? { day: '2-digit', month: 'short' } : { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: 'UTC' }).format(fecha);
}

// "hace 12 segundos" / "12 seconds ago" a partir de una diferencia en milisegundos.
export function formatHace(deltaMs, locale = LOCALES.es) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const s = Math.max(0, Math.round(deltaMs / 1000));
  if (s < 60) return rtf.format(-s, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  return rtf.format(-Math.floor(s / 3600), 'hour');
}
