// application: calculos de solo lectura sobre vuelos, rutas y reservas. Sin I/O.
// Ocupacion % = vendidos / 174 * 100 (un RETENIDO vigente aun no es venta).
import { TOTAL_ASIENTOS, contarEstados, porcentaje } from './asientos.js';

const ESTADOS_RESERVA = ['PENDIENTE_PAGO', 'EMITIDA', 'PAGO_RECHAZADO', 'EXPIRADA', 'CANCELADA'];
const TOP_RUTAS = 5;

const fechaDe = (v) => String(v.fecha ?? '').slice(0, 10);

function rutaDe(vuelo, rutas) {
  const ruta = rutas.find((r) => `${r.origen}-${r.destino}` === vuelo.ruta_id || r.id === vuelo.ruta_id);
  const [o, d] = String(vuelo.ruta_id ?? '').split('-');
  return { origen: ruta?.origen ?? o ?? null, destino: ruta?.destino ?? d ?? null };
}

export function resumirVuelos(vuelos, rutas, ahora) {
  return vuelos
    .map((v) => {
      const c = contarEstados(v, ahora);
      return {
        vuelo_id: v.id,
        ruta: v.ruta_id,
        ...rutaDe(v, rutas),
        fecha: fechaDe(v),
        hora_salida: v.hora_salida ?? null,
        total_asientos: TOTAL_ASIENTOS,
        ...c,
        ocupacion_pct: porcentaje(c.vendidos, TOTAL_ASIENTOS),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.ruta).localeCompare(String(b.ruta)));
}

export function filtrarVuelos(resumen, { ruta, desde, hasta }) {
  return resumen.filter((v) => (!ruta || v.ruta === ruta) && (!desde || v.fecha >= desde) && (!hasta || v.fecha <= hasta));
}

export function ventasPorVuelo(resumen) {
  return {
    total_vendidos: resumen.reduce((s, v) => s + v.vendidos, 0),
    vuelos: resumen.map((v) => ({ vuelo_id: v.vuelo_id, ruta: v.ruta, fecha: v.fecha, vendidos: v.vendidos })),
  };
}

export function ventasPorDestino(resumen) {
  const porDestino = new Map();
  for (const v of resumen) {
    const d = porDestino.get(v.destino) ?? { destino: v.destino, vuelos: 0, vendidos: 0, total_asientos: 0 };
    d.vuelos++;
    d.vendidos += v.vendidos;
    d.total_asientos += v.total_asientos;
    porDestino.set(v.destino, d);
  }
  const destinos = [...porDestino.values()]
    .map((d) => ({ ...d, ocupacion_pct: porcentaje(d.vendidos, d.total_asientos) }))
    .sort((a, b) => b.vendidos - a.vendidos || String(a.destino).localeCompare(String(b.destino)));
  return { destinos };
}

export function estadisticas(resumen, reservas, ahora) {
  const suma = (k) => resumen.reduce((s, v) => s + v[k], 0);
  const total = resumen.length * TOTAL_ASIENTOS;
  const vendidos = suma('vendidos');

  const reservasPorEstado = Object.fromEntries(ESTADOS_RESERVA.map((e) => [e, 0]));
  let ingresos = 0;
  for (const r of reservas) {
    reservasPorEstado[r.estado] = (reservasPorEstado[r.estado] ?? 0) + 1;
    if (r.estado === 'EMITIDA') ingresos += Number(r.total_cop) || 0;
  }

  const porRuta = new Map();
  const porFecha = new Map();
  for (const v of resumen) {
    const r = porRuta.get(v.ruta) ?? { ruta: v.ruta, origen: v.origen, destino: v.destino, vendidos: 0 };
    r.vendidos += v.vendidos;
    porRuta.set(v.ruta, r);
    porFecha.set(v.fecha, (porFecha.get(v.fecha) ?? 0) + v.vendidos);
  }

  return {
    generado_at: ahora.toISOString(),
    vuelos: resumen.length,
    asientos: { total, vendidos, retenidos: suma('retenidos'), libres: suma('libres'), bloqueados: suma('bloqueados') },
    ocupacion_pct: porcentaje(vendidos, total),
    reservas_por_estado: reservasPorEstado,
    ingresos_cop: ingresos,
    top_rutas: [...porRuta.values()]
      .sort((a, b) => b.vendidos - a.vendidos || a.ruta.localeCompare(b.ruta))
      .slice(0, TOP_RUTAS),
    serie_vendidos_por_fecha: [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, n]) => ({ fecha, vendidos: n })),
  };
}
