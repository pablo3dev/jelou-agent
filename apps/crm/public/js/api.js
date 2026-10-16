// Cliente del API del CRM: solo lecturas (fetch con el verbo por defecto).
export class ApiError extends Error {
  constructor(codigo, status) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
  }
}

async function leer(ruta) {
  let res;
  try {
    res = await fetch(ruta, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new ApiError('red', 0);
  }
  let cuerpo = null;
  try {
    cuerpo = await res.json();
  } catch {
    /* cuerpo no JSON */
  }
  if (!res.ok) throw new ApiError(cuerpo?.error ?? 'desconocido', res.status);
  return cuerpo;
}

export const getEstadisticas = () => leer('/api/estadisticas');
export const getVuelos = () => leer('/api/vuelos');
export const getVentasPorVuelo = () => leer('/api/ventas/por-vuelo');
export const getVentasPorDestino = () => leer('/api/ventas/por-destino');
export const getAsientos = (id) => leer(`/api/vuelos/${encodeURIComponent(id)}/asientos`);
