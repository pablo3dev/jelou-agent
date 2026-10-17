// domain (puro): datos base de la aerolinea DEMO. Sin I/O, sin red, sin reloj.
// Fuente: draft.md RN-01, RN-02, RN-04, RN-05, RN-08, RN-15 y db-design.dbml.

export const HORA_SALIDA = "07:00"; // horario base: conserva el id fisico original (ruta+fecha)
// Varios horarios por ruta y fecha para que la lista de vuelos del chat se vea completa en la demo.
export const HORARIOS = ["07:00", "12:30", "18:45"];
export const VENTANA_INICIO = "2026-12-01";
export const VENTANA_FIN = "2027-01-31";

const TARIFAS = { "BOG-MDE": 350000, "MDE-BOG": 350000, "BOG-CLO": 380000, "CLO-BOG": 380000, "BOG-CTG": 420000, "CTG-BOG": 420000 };

// Ids fisicos DETERMINISTAS ([a-z0-9]): la PK de Datum (PocketBase) es unica y atomica, de modo que
// un POST repetido con el mismo id responde 400 validation_not_unique en vez de duplicar.
const plano = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
export const idFisico = {
  rutas: (ruta) => plano(ruta), // "BOG-MDE" -> "bogmde"
  temporada: (mes) => `mes${String(mes).padStart(2, "0")}`,
  parametros: (clave) => plano(clave), // "tarifa_kg_bodega_cop" -> "tarifakgbodegacop"
  // "bogmde20261201" (07:00, id original) y "bogmde202612011230" (los demas horarios: se agrega hhmm)
  vuelos: (ruta, fecha, hora = HORA_SALIDA) => `${plano(ruta)}${plano(fecha)}${hora === HORA_SALIDA ? "" : plano(hora)}`,
};

// Cada fila es { id, campos }: el id fisico va en el POST, nunca dentro de campos.
export function generarRutas() {
  return Object.entries(TARIFAS).map(([ruta, tarifa_base_cop]) => {
    const [origen, destino] = ruta.split("-");
    return { id: idFisico.rutas(ruta), campos: { origen, destino, tarifa_base_cop } };
  });
}

const MESES_ALTOS = new Set([1, 6, 7, 12]);

export function generarTemporada() {
  return Array.from({ length: 12 }, (_, i) => ({
    id: idFisico.temporada(i + 1),
    campos: { mes: i + 1, multiplicador: MESES_ALTOS.has(i + 1) ? 1.3 : 1.0 },
  }));
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
  }).map(([clave, valor]) => ({ id: idFisico.parametros(clave), campos: { clave, valor } }));
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

// vuelos.ruta_id guarda la ruta LOGICA ("BOG-MDE"); el id fisico del vuelo es ruta+fecha sin separadores.
export function generarVuelos(rutas = generarRutas()) {
  return rutas.flatMap(({ campos: { origen, destino } }) => {
    const ruta_id = `${origen}-${destino}`;
    return fechasVentana().flatMap((fecha) =>
      HORARIOS.map((hora_salida) => ({
        id: idFisico.vuelos(ruta_id, fecha, hora_salida),
        campos: { ruta_id, fecha, hora_salida, mapa_asientos: mapaLibre(), version: 1 },
      }))
    );
  });
}

// Colecciones en orden de carga.
export function generarColecciones() {
  return [
    { nombre: "rutas", filas: generarRutas() },
    { nombre: "temporada", filas: generarTemporada() },
    { nombre: "parametros", filas: generarParametros() },
    { nombre: "vuelos", filas: generarVuelos() },
  ];
}
