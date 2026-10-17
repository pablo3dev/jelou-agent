// adapter: in — CLI. Carga datos DEMO (reservas, pasajeros, equipaje, mascotas, pagos y mapas de asientos)
// para que el CRM luzca con operacion real (capturas del README). NO forma parte del seed base.
// Uso: node demo.mjs [--dry-run | --force]
// Entorno: DATUM_URL, DATUM_API_KEY (nunca se imprimen). Determinista (RNG con semilla), salvo la hora actual.
// Se niega a correr si ya hay mas de UMBRAL reservas (evita duplicar la carga); --force lo ignora.
import { pathToFileURL } from "node:url";
import { clavesMapa, mapaLibre } from "./datos.mjs";

const UMBRAL = 20;
const HOLD_DEMO_MS = 3 * 3600 * 1000; // las retenciones demo duran 3 h para poder tomar las capturas
const INTERVALO_MS = 260;
const TARIFAS = { "BOG-MDE": 350000, "MDE-BOG": 350000, "BOG-CLO": 380000, "CLO-BOG": 380000, "BOG-CTG": 420000, "CTG-BOG": 420000 };
const MESES_ALTOS = new Set([1, 6, 7, 12]);
const HORARIOS = ["07:00", "12:30", "18:45"];
const ALFABETO_PNR = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const NOMBRES = ["Camila", "Santiago", "Valentina", "Mateo", "Isabella", "Sebastián", "Sofía", "Daniel", "Mariana", "Andrés", "Laura", "Felipe", "Carolina", "Juan", "Natalia", "David", "Paula", "Nicolás", "Daniela", "Alejandro", "Luisa", "Camilo", "Juliana", "Esteban", "Manuela", "Julián", "Catalina", "Tomás", "Gabriela", "Samuel"];
const APELLIDOS = ["Gómez", "Rodríguez", "Martínez", "López", "García", "Hernández", "Ramírez", "Torres", "Vargas", "Castro", "Ortiz", "Rojas", "Moreno", "Jiménez", "Álvarez", "Restrepo", "Cardona", "Mejía", "Arango", "Ospina", "Pérez", "Muñoz", "Salazar", "Quintero", "Giraldo", "Patiño", "Duque", "Zapata"];
const MASCOTAS = [["Perro", 3, 8], ["Gato", 3, 7]];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mk = (rng) => ({
  rnd: rng,
  int: (a, b) => a + Math.floor(rng() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(rng() * arr.length)],
  peso(pares) { // [[valor, peso], ...]
    const total = pares.reduce((s, [, w]) => s + w, 0);
    let x = rng() * total;
    for (const [v, w] of pares) if ((x -= w) < 0) return v;
    return pares.at(-1)[0];
  },
});

const idVuelo = (ruta, fecha, hora) => `${ruta.replace("-", "").toLowerCase()}${fecha.replaceAll("-", "")}${hora === "07:00" ? "" : hora.replace(":", "")}`;
const mult = (fecha) => (MESES_ALTOS.has(Number(fecha.slice(5, 7))) ? 1.3 : 1.0);
const sumarDias = (fecha, d) => new Date(Date.parse(fecha) + d * 86400000).toISOString().slice(0, 10);
const inversa = (ruta) => ruta.split("-").reverse().join("-");

// ---- cliente Datum minimo (lectura, alta y PATCH) con ritmo bajo y reintentos ----
function crearCliente({ url, apiKey }) {
  const base = url.replace(/\/+$/, "");
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let ultimo = 0;
  async function pedir(metodo, ruta, cuerpo) {
    for (let intento = 0; ; intento++) {
      const espera = ultimo + INTERVALO_MS - Date.now();
      if (espera > 0) await dormir(espera);
      ultimo = Date.now();
      let resp;
      try {
        resp = await fetch(`${base}${ruta}`, {
          method: metodo,
          headers: { "X-Api-Key": apiKey, Accept: "application/json", ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
          body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
      } catch {
        if (intento >= 5) throw new Error(`${metodo} ${ruta.split("?")[0]}: error de red`);
        await dormir(Math.min(500 * 2 ** intento, 30000));
        continue;
      }
      if (resp.ok) return resp.json();
      await resp.body?.cancel?.();
      if ((resp.status === 429 || resp.status >= 500) && intento < 5) {
        await dormir(Math.min(500 * 2 ** intento, 30000));
        continue;
      }
      throw new Error(`${metodo} ${ruta.split("?")[0]}: Datum respondio ${resp.status}`);
    }
  }
  const reg = (c) => `/collections/${encodeURIComponent(c)}/records`;
  return {
    async listar(col) {
      const items = [];
      for (let p = 1; ; p++) {
        const r = await pedir("GET", `${reg(col)}?page=${p}&perPage=200`);
        items.push(...(r.items ?? []));
        if (p >= (r.totalPages ?? 1) || !(r.items ?? []).length) return items;
      }
    },
    crear: (col, campos, id) => pedir("POST", reg(col), id ? { id, ...campos } : campos),
    actualizar: (col, id, campos) => pedir("PATCH", `${reg(col)}/${id}`, campos),
  };
}

// ---- generacion en memoria (pura salvo `ahora`) ----
export function generar({ vuelosExistentes, pnrsExistentes, ahora = Date.now(), semilla = 2026 }) {
  const R = mk(mulberry32(semilla));
  const claves = clavesMapa();
  const vuelos = new Map();
  for (const v of vuelosExistentes) {
    const mapa = typeof v.mapa_asientos === "string" ? JSON.parse(v.mapa_asientos) : v.mapa_asientos ?? mapaLibre();
    vuelos.set(v.id, { id: v.id, ruta: v.ruta_id, fecha: String(v.fecha).slice(0, 10), hora: v.hora_salida, mapa, version: Number(v.version) || 1, tocado: false });
  }
  const pnrs = new Set(pnrsExistentes);
  const reservas = [];

  const pnrNuevo = () => {
    for (;;) {
      let p = "";
      for (let i = 0; i < 6; i++) p += ALFABETO_PNR[Math.floor(R.rnd() * ALFABETO_PNR.length)];
      if (!pnrs.has(p)) return pnrs.add(p), p;
    }
  };
  const libres = (v) => claves.filter((c) => v.mapa[c]?.estado === "LIBRE");
  const vendidos = (v) => claves.filter((c) => v.mapa[c]?.estado === "VENDIDO").length;

  // Elige n asientos libres contiguos (misma fila) cuando se puede; evita exit rows con menores.
  function elegirAsientos(v, n, hayMenor) {
    const libs = libres(v).filter((c) => !(hayMenor && [13, 14].includes(parseInt(c))));
    if (libs.length < n) return null;
    const porFila = new Map();
    for (const c of libs) {
      const f = parseInt(c);
      porFila.set(f, [...(porFila.get(f) ?? []), c]);
    }
    const filas = [...porFila.keys()];
    const out = [];
    let intentos = 0;
    while (out.length < n && intentos++ < 40) {
      const f = R.pick(filas);
      const fila = (porFila.get(f) ?? []).filter((c) => !out.includes(c));
      for (const c of fila.slice(0, n - out.length)) out.push(c);
    }
    if (out.length < n) for (const c of libs.filter((c) => !out.includes(c)).slice(0, n - out.length)) out.push(c);
    return out.length === n ? out : null;
  }

  function pasajeros(n, familia) {
    const apellido = R.pick(APELLIDOS);
    const menores = n >= 3 && R.rnd() < 0.55 ? R.int(1, Math.min(2, n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => {
      const menor = i >= n - menores;
      return {
        nombre: `${R.pick(NOMBRES)} ${familia || R.rnd() < 0.5 ? apellido : R.pick(APELLIDOS)}`,
        documento: String(R.int(10_000_000, 1_999_999_999)),
        edad: menor ? R.int(2, 14) : R.int(18, 68),
      };
    });
  }

  function lineaBodega(fechaVuelo) {
    const largo = R.int(55, 80), ancho = R.int(32, 48), alto = R.int(20, 36);
    const peso = Math.round((R.int(120, 310)) / 10 * 100) / 100;
    const vol = (largo * ancho * alto) / 6000;
    const kg = Math.ceil(Math.max(peso, vol));
    return { largo_cm: largo, ancho_cm: ancho, alto_cm: alto, peso_real_kg: peso, peso_volumetrico_kg: Math.round(vol * 100) / 100, precio_cop: Math.round(Math.max(40000, kg * 12000) * mult(fechaVuelo)) };
  }

  // Crea una reserva en el estado pedido. Devuelve false si no hay cupo.
  function crearReserva({ ida, regreso = null, estado, n, familia }) {
    const pax = pasajeros(n, familia);
    const hayMenor = pax.some((p) => p.edad < 15);
    const conAsientos = estado === "EMITIDA" || estado === "PENDIENTE_PAGO" || estado === "CANCELADA_EMITIDA";
    let asIda = null, asReg = null;
    if (conAsientos) {
      asIda = elegirAsientos(ida, n, hayMenor);
      if (!asIda) return false;
      if (regreso) {
        asReg = elegirAsientos(regreso, n, hayMenor);
        if (!asReg) return false;
      }
    }
    const pnr = pnrNuevo();
    const estadoRes = estado === "CANCELADA_EMITIDA" ? "CANCELADA" : estado;
    const holdToken = estado === "PENDIENTE_PAGO" ? `h${R.int(1e8, 9e8)}${R.int(1e8, 9e8)}` : null;
    const holdExpira = new Date(ahora + (estado === "PENDIENTE_PAGO" ? HOLD_DEMO_MS : -R.int(2, 30) * 3600 * 1000)).toISOString();
    const marcar = (v, asientos) => {
      if (!asientos) return;
      v.tocado = true;
      for (const c of asientos) {
        v.mapa[c] = estado === "PENDIENTE_PAGO"
          ? { estado: "RETENIDO", pnr: null, hold_token: holdToken, hold_expira: holdExpira }
          : { estado: "VENDIDO", pnr, hold_token: null, hold_expira: null };
      }
    };
    // CANCELADA libera los asientos (no se marca nada); EMITIDA los vende; PENDIENTE los retiene.
    if (estado === "EMITIDA" || estado === "PENDIENTE_PAGO") { marcar(ida, asIda); marcar(regreso, asReg); }

    const equipaje = [];
    let mascota = null;
    pax.forEach((p, i) => {
      if (R.rnd() < 0.42) equipaje.push({ pax: i, trayecto: "IDA", ...lineaBodega(ida.fecha) });
      if (regreso && R.rnd() < 0.42) equipaje.push({ pax: i, trayecto: "REGRESO", ...lineaBodega(regreso.fecha) });
    });
    if (R.rnd() < 0.09) {
      const [especie, min, max] = R.pick(MASCOTAS);
      mascota = { pax: 0, especie, peso_kg: R.int(min * 10, max * 10) / 10, precio_cop: Math.round(150000 * mult(ida.fecha)) };
    }
    const tarifaIda = Math.round(TARIFAS[ida.ruta] * mult(ida.fecha));
    const tarifaReg = regreso ? Math.round(TARIFAS[regreso.ruta] * mult(regreso.fecha)) : 0;
    const total = n * (tarifaIda + tarifaReg) + equipaje.reduce((s, e) => s + e.precio_cop, 0) + (mascota?.precio_cop ?? 0);
    pax.forEach((p, i) => { p.asiento_ida = asIda?.[i] ?? null; p.asiento_regreso = asReg?.[i] ?? null; });

    const txEstado = { EMITIDA: "APROBADA", CANCELADA: "APROBADA", CANCELADA_EMITIDA: "APROBADA", PENDIENTE_PAGO: "PENDIENTE", PAGO_RECHAZADO: "RECHAZADA", EXPIRADA: "EXPIRADA" }[estado];
    reservas.push({
      campos: { pnr, estado: estadoRes, vuelo_ida_id: ida.id, vuelo_regreso_id: regreso?.id ?? null, hold_expira: holdExpira, total_cop: total },
      pasajeros: pax, equipaje, mascota, txEstado,
    });
    return true;
  }

  // Escoge un vuelo concreto por ruta+fecha+franja
  const vuelo = (ruta, fecha, hora) => vuelos.get(idVuelo(ruta, fecha, hora));
  const regresoDe = (ida) => {
    const f = sumarDias(ida.fecha, R.int(3, 16));
    return f <= "2027-01-31" ? vuelo(inversa(ida.ruta), f, R.peso([["07:00", 3], ["12:30", 3], ["18:45", 4]])) : null;
  };
  const ocupacion = (v) => vendidos(v) / 174;

  // 1) vuelos "estrella" casi llenos (para el mapa de asientos y los picos del grafico)
  const estrellas = [
    ["BOG-MDE", "2026-12-23", "07:00", 0.88], ["BOG-CTG", "2026-12-20", "18:45", 0.93], ["CTG-BOG", "2026-12-28", "07:00", 0.82],
    ["BOG-CLO", "2027-01-04", "12:30", 0.74], ["CLO-BOG", "2027-01-03", "18:45", 0.66], ["MDE-BOG", "2027-01-05", "12:30", 0.58],
    ["BOG-MDE", "2026-12-19", "12:30", 0.5], ["MDE-BOG", "2026-12-27", "18:45", 0.46],
  ];
  for (const [ruta, fecha, hora, meta] of estrellas) {
    const v = vuelo(ruta, fecha, hora);
    if (!v) continue;
    let cortar = 0;
    while (ocupacion(v) < meta && cortar++ < 400) {
      const n = R.peso([[2, 20], [3, 25], [4, 25], [5, 12], [6, 10], [7, 4], [8, 2], [9, 2]]);
      crearReserva({ ida: v, regreso: R.rnd() < 0.45 ? regresoDe(v) : null, estado: "EMITIDA", n, familia: n > 2 });
    }
  }

  // 2) demanda de fondo con picos de temporada
  const todas = [...vuelos.values()];
  const pesoFecha = (f) => {
    const d = f.slice(5);
    if (f >= "2026-12-15" && f <= "2026-12-24") return 3;
    if (f >= "2026-12-26" && f <= "2026-12-31") return 2.5;
    if (f >= "2027-01-02" && f <= "2027-01-06") return 3;
    return f >= "2027-01-07" ? 0.8 : 1;
  };
  const pesoRuta = { "BOG-MDE": 4, "MDE-BOG": 3, "BOG-CLO": 3, "CLO-BOG": 2.5, "BOG-CTG": 3.5, "CTG-BOG": 3 };
  const candidatos = todas.map((v) => [v, pesoFecha(v.fecha) * pesoRuta[v.ruta]]);
  const sorteaVuelo = () => R.peso(candidatos);
  const tamanoFondo = () => R.peso([[1, 30], [2, 30], [3, 15], [4, 14], [5, 5], [6, 3], [7, 1], [8, 1], [9, 1]]);
  let creadas = 0;
  for (let i = 0; i < 700 && creadas < 95; i++) {
    const v = sorteaVuelo();
    if (v.fecha > "2027-01-31" || ocupacion(v) > 0.6) continue;
    const n = tamanoFondo();
    if (crearReserva({ ida: v, regreso: R.rnd() < 0.45 ? regresoDe(v) : null, estado: "EMITIDA", n, familia: n > 2 })) creadas++;
  }

  // 3) otros estados de reserva (no venden asientos, salvo PENDIENTE_PAGO que los retiene)
  const otros = [["PENDIENTE_PAGO", 5], ["PAGO_RECHAZADO", 7], ["EXPIRADA", 9], ["CANCELADA", 5]];
  for (const [estado, cuantas] of otros) {
    let hechas = 0;
    for (let i = 0; i < 300 && hechas < cuantas; i++) {
      const v = sorteaVuelo();
      const n = tamanoFondo();
      const conRegreso = R.rnd() < 0.4 ? regresoDe(v) : null;
      if (crearReserva({ ida: v, regreso: conRegreso, estado: estado === "CANCELADA" ? "CANCELADA_EMITIDA" : estado, n, familia: n > 2 })) hechas++;
    }
  }

  // 4) algunos asientos bloqueados por operacion (crew rest, peso y balance)
  const bloqueables = todas.filter((v) => libres(v).length > 100);
  for (let i = 0; i < 14; i++) {
    const v = R.pick(bloqueables);
    const libs = libres(v);
    for (let k = 0; k < R.int(2, 6); k++) {
      const c = R.pick(libs);
      if (v.mapa[c].estado === "LIBRE") v.mapa[c] = { estado: "BLOQUEADO", pnr: null, hold_token: null, hold_expira: null };
    }
    v.tocado = true;
  }
  return { reservas, vuelos: todas.filter((v) => v.tocado) };
}

export function resumen({ reservas, vuelos }) {
  const porEstado = {};
  let pax = 0, req = 0;
  for (const r of reservas) {
    porEstado[r.campos.estado] = (porEstado[r.campos.estado] ?? 0) + 1;
    pax += r.pasajeros.length;
    req += 1 + r.pasajeros.length + r.equipaje.length + (r.mascota ? 1 : 0) + 1 + (r.txEstado === "PENDIENTE" ? 0 : 1);
  }
  req += vuelos.length;
  return { reservas: reservas.length, pasajeros: pax, vuelosTocados: vuelos.length, peticiones: req, minutos: Math.ceil((req * INTERVALO_MS) / 60000), porEstado };
}

export async function main(argv, env, log = console.log) {
  const dry = argv.includes("--dry-run");
  if (!dry) {
    const faltan = ["DATUM_URL", "DATUM_API_KEY"].filter((k) => !env[k]);
    if (faltan.length) return log(`Faltan variables de entorno: ${faltan.join(", ")}`), 2;
  }
  const cli = dry ? null : crearCliente({ url: env.DATUM_URL, apiKey: env.DATUM_API_KEY });
  let vuelosExistentes, pnrsExistentes = [];
  if (dry) {
    vuelosExistentes = [];
    for (const r of ["BOG-MDE", "MDE-BOG", "BOG-CLO", "CLO-BOG", "BOG-CTG", "CTG-BOG"]) {
      for (let t = Date.parse("2026-12-01"); t <= Date.parse("2027-01-31"); t += 86400000) {
        for (const h of HORARIOS) vuelosExistentes.push({ id: idVuelo(r, new Date(t).toISOString().slice(0, 10), h), ruta_id: r, fecha: new Date(t).toISOString().slice(0, 10), hora_salida: h, mapa_asientos: mapaLibre(), version: 1 });
      }
    }
  } else {
    log("Leyendo vuelos y reservas actuales...");
    const reservasActuales = await cli.listar("reservas");
    if (reservasActuales.length > UMBRAL && !argv.includes("--force")) {
      log(`Ya hay ${reservasActuales.length} reservas; abortado para no duplicar (usa --force).`);
      return 1;
    }
    pnrsExistentes = reservasActuales.map((r) => r.pnr);
    vuelosExistentes = await cli.listar("vuelos");
  }
  const plan = generar({ vuelosExistentes, pnrsExistentes });
  const r = resumen(plan);
  log(`Plan: ${r.reservas} reservas, ${r.pasajeros} pasajeros, ${r.vuelosTocados} vuelos modificados, ~${r.peticiones} peticiones (~${r.minutos} min). Estados: ${JSON.stringify(r.porEstado)}`);
  if (dry) return 0;

  let hechas = 0;
  for (const res of plan.reservas) {
    const reserva = await cli.crear("reservas", res.campos);
    const ids = [];
    for (const p of res.pasajeros) ids.push((await cli.crear("pasajeros", { reserva_id: reserva.id, ...p })).id);
    for (const e of res.equipaje) {
      const { pax, ...campos } = e;
      await cli.crear("equipaje", { pasajero_id: ids[pax], reserva_id: reserva.id, tipo: "BODEGA", ...campos });
    }
    if (res.mascota) {
      const { pax, ...campos } = res.mascota;
      await cli.crear("mascotas", { pasajero_id: ids[pax], reserva_id: reserva.id, ...campos });
    }
    const tx = await cli.crear("transacciones", { reserva_id: reserva.id, estado: res.txEstado, expira_at: res.campos.hold_expira, ultimo_evento: null });
    if (res.txEstado !== "PENDIENTE") {
      const idEvento = `${tx.id}:${res.txEstado}`;
      await cli.crear("eventos_pago", { transaccion_id: tx.id, id_evento: idEvento, estado: res.txEstado }, `${tx.id}${res.txEstado.toLowerCase()}`);
      await cli.actualizar("transacciones", tx.id, { ultimo_evento: idEvento });
    }
    if (++hechas % 20 === 0) log(`  reservas: ${hechas}/${plan.reservas.length}`);
  }
  let n = 0;
  for (const v of plan.vuelos) {
    await cli.actualizar("vuelos", v.id, { mapa_asientos: v.mapa, version: v.version + 1 });
    if (++n % 25 === 0) log(`  vuelos: ${n}/${plan.vuelos.length}`);
  }
  log("Listo. Las retenciones demo vencen en ~3 h: toma las capturas pronto.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2), process.env);
