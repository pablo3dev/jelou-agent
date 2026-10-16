// Lógica pura de precios (RN-01, RN-02, RN-04, RN-05, RN-07). Sin I/O ni dependencias.
// Los valores comerciales llegan como parámetros (tabla `parametros` / `temporada`), no se fijan aquí.
// Supuesto: los multiplicadores se aplican sobre COP enteros y cada línea se redondea con Math.round.

export interface ParametrosPrecio {
  tarifa_kg_bodega_cop: number;
  cargo_minimo_bodega_cop: number;
  tarifa_mascota_cop: number;
  max_lineal_bodega_cm: number;
  max_peso_bodega_kg: number;
  peso_max_mascota_kg: number;
  max_mascotas_reserva: number;
  max_piezas_bodega_pasajero: number;
  divisor_volumetrico: number;
}

export interface MedidasBodega {
  largo_cm: number;
  ancho_cm: number;
  alto_cm: number;
  peso_kg: number;
}

export type ResultadoPrecio =
  | { ok: true; precio_cop: number }
  | { ok: false; error: string };

export type ResultadoBodega =
  | { ok: true; precio_cop: number; cobrable_kg: number; peso_volumetrico_kg: number }
  | { ok: false; error: string };

// RN-02: multiplicador por mes de `vuelos.fecha` (YYYY-MM-DD). `temporada` = mes (1..12) -> multiplicador.
export function multiplicadorDeFecha(
  fecha: string,
  temporada: Record<number, number>,
): number {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(fecha);
  const mes = m ? Number(m[1]) : NaN;
  const mult = temporada[mes];
  if (mult === undefined) throw new Error(`Sin multiplicador de temporada para la fecha ${fecha}`);
  return mult;
}

// RN-01: pasaje por pasajero y trayecto.
export function precioPasaje(tarifaBaseCop: number, multiplicador: number): number {
  return Math.round(tarifaBaseCop * multiplicador);
}

// RN-04: peso volumétrico y kilos cobrables.
export function pesoVolumetricoKg(m: MedidasBodega, divisor: number): number {
  return (m.largo_cm * m.ancho_cm * m.alto_cm) / divisor;
}

export function cobrableKg(m: MedidasBodega, divisor: number): number {
  return Math.ceil(Math.max(m.peso_kg, pesoVolumetricoKg(m, divisor)));
}

// RN-04: valida límites (L+A+H <= 158, peso <= 32, 1 pieza por pasajero) y calcula el precio.
// `piezasDelPasajero` = piezas de bodega ya declaradas para ese pasajero (sin contar esta).
export function precioBodega(
  m: MedidasBodega,
  p: ParametrosPrecio,
  multiplicador: number,
  piezasDelPasajero = 0,
): ResultadoBodega {
  const dims = [m.largo_cm, m.ancho_cm, m.alto_cm, m.peso_kg];
  if (!dims.every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, error: "Medidas y peso deben ser números positivos" };
  }
  if (piezasDelPasajero + 1 > p.max_piezas_bodega_pasajero) {
    return { ok: false, error: `Máximo ${p.max_piezas_bodega_pasajero} pieza(s) de bodega por pasajero` };
  }
  if (m.largo_cm + m.ancho_cm + m.alto_cm > p.max_lineal_bodega_cm) {
    return { ok: false, error: `Largo + ancho + alto excede ${p.max_lineal_bodega_cm} cm` };
  }
  if (m.peso_kg > p.max_peso_bodega_kg) {
    return { ok: false, error: `El peso excede ${p.max_peso_bodega_kg} kg` };
  }
  const vol = pesoVolumetricoKg(m, p.divisor_volumetrico);
  const kg = cobrableKg(m, p.divisor_volumetrico);
  const base = Math.max(p.cargo_minimo_bodega_cop, kg * p.tarifa_kg_bodega_cop);
  return {
    ok: true,
    precio_cop: Math.round(base * multiplicador),
    cobrable_kg: kg,
    peso_volumetrico_kg: vol,
  };
}

// RN-05: mascota <= 8 kg, 1 por reserva. `mascotasEnReserva` = ya declaradas (sin contar esta).
export function precioMascota(
  pesoKg: number,
  p: ParametrosPrecio,
  multiplicador: number,
  mascotasEnReserva = 0,
): ResultadoPrecio {
  if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
    return { ok: false, error: "El peso de la mascota debe ser positivo" };
  }
  if (mascotasEnReserva + 1 > p.max_mascotas_reserva) {
    return { ok: false, error: `Máximo ${p.max_mascotas_reserva} mascota(s) por reserva` };
  }
  if (pesoKg > p.peso_max_mascota_kg) {
    return { ok: false, error: `La mascota excede ${p.peso_max_mascota_kg} kg` };
  }
  return { ok: true, precio_cop: Math.round(p.tarifa_mascota_cop * multiplicador) };
}

// RN-07: el total es la suma de líneas ya redondeadas.
export function totalCop(lineasCop: number[]): number {
  return lineasCop.reduce((acc, l) => acc + l, 0);
}
