// domain (puro): datos base de la aerolinea DEMO. Sin I/O, sin red, sin reloj.
// Fuente: draft.md RN-01, RN-02, RN-04, RN-05, RN-08, RN-15 y db-design.dbml.

export const HORA_SALIDA = "07:00";
export const VENTANA_INICIO = "2026-12-01";
export const VENTANA_FIN = "2027-01-31";

const TARIFAS = { "BOG-MDE": 350000, "MDE-BOG": 350000, "BOG-CLO": 380000, "CLO-BOG": 380000, "BOG-CTG": 420000, "CTG-BOG": 420000 };

export function generarRutas() {
  return Object.entries(TARIFAS).map(([id, tarifa_base_cop]) => {
    const [origen, destino] = id.split("-");
    return { id, origen, destino, tarifa_base_cop };
  });
}

const MESES_ALTOS = new Set([1, 6, 7, 12]);

export function generarTemporada() {
  return Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, multiplicador: MESES_ALTOS.has(i + 1) ? 1.3 : 1.0 }));
}

// Las 12 claves de clave_parametro (dbml). tarifa_kg_bodega_cop, cargo_minimo_bodega_cop y tarifa_mascota_cop
// salen del draft (RN-04, RN-05); el dbml dice "sin valor especificado" porque lo fija el draft.
export function generarParametros() {
  return Object.entries({
    tarifa_kg_bodega_cop: 12000,
    cargo_minimo_bodega_cop: 40000,
    divisor_volumetrico: 6000,
    max_lineal_bodega_cm: 158,
    max_peso_bodega_kg: 32,
    tarifa_mascota_cop: 150000,
    peso_max_mascota_kg: 8,
    max_mascotas_reserva: 1,
    hold_minutos: 15,
    edad_min_exit_row: 15,
    max_pasajeros: 9,
    max_piezas_bodega_pasajero: 1,
  }).map(([clave, valor]) => ({ clave, valor }));
}

// Boeing 737-8 MAX: filas 1-3 letras A,C,D,F; filas 4-30 letras A-F => 12 + 162 = 174.
// (Mismas claves que clavesMapa() en functions/lib/asientos.ts; el seed es Node y no importa TS.)
export function clavesMapa() {
  const claves = [];
  for (let fila = 1; fila <= 30; fila++) {
    for (const letra of fila <= 3 ? ["A", "C", "D", "F"] : ["A", "B", "C", "D", "E", "F"]) claves.push(`${fila}${letra}`);
  }
  return claves;
}

export function mapaLibre() {
  return Object.fromEntries(clavesMapa().map((c) => [c, { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null }]));
}

export function fechasVentana() {
  const fechas = [];
  const fin = Date.parse(VENTANA_FIN);
  for (let t = Date.parse(VENTANA_INICIO); t <= fin; t += 86400000) fechas.push(new Date(t).toISOString().slice(0, 10));
  return fechas;
}

// Clave natural del vuelo: (ruta_id, fecha) unica en el dbml; el dbml no define "numero de vuelo",
// asi que vuelos.id = `<ruta_id>-<fecha>` (p. ej. BOG-MDE-2026-12-01). Es el vuelo_id que buscarVuelo acepta (fields.id).
export const idVuelo = (ruta_id, fecha) => `${ruta_id}-${fecha}`;

export function generarVuelos(rutas = generarRutas()) {
  return rutas.flatMap((r) =>
    fechasVentana().map((fecha) => ({
      id: idVuelo(r.id, fecha),
      ruta_id: r.id,
      fecha,
      hora_salida: HORA_SALIDA,
      mapa_asientos: mapaLibre(),
      version: 1,
    }))
  );
}

// Colecciones en orden de carga, con la clave natural de cada una.
export function generarColecciones() {
  return [
    { nombre: "rutas", clave: (f) => f.id, filas: generarRutas() },
    { nombre: "temporada", clave: (f) => String(f.mes), filas: generarTemporada() },
    { nombre: "parametros", clave: (f) => f.clave, filas: generarParametros() },
    { nombre: "vuelos", clave: (f) => f.id, filas: generarVuelos() },
  ];
}

// Clasifica una fila existente por su forma (igual que functions/lib/catalogo.ts) y devuelve { nombre, clave } o null.
export function clasificar(f) {
  if (f.mapa_asientos !== undefined && f.ruta_id !== undefined) return { nombre: "vuelos", clave: String(f.id ?? "") };
  if (f.tarifa_base_cop !== undefined && f.origen !== undefined) return { nombre: "rutas", clave: String(f.id ?? `${f.origen}-${f.destino}`) };
  if (f.mes !== undefined && f.multiplicador !== undefined) return { nombre: "temporada", clave: String(f.mes) };
  if (f.clave !== undefined && f.valor !== undefined) return { nombre: "parametros", clave: String(f.clave) };
  return null;
}
