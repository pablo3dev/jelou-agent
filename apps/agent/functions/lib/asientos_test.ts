import assert from "node:assert/strict";
import {
  type Asiento,
  cantidadPasajerosValida,
  clavesMapa,
  esExitRow,
  fechaEnVentana,
  generarPnr,
  holdValido,
  type MapaAsientos,
  parsearAsientos,
  PNR_RE,
  validarSeleccion,
} from "./asientos.ts";

const AHORA = new Date("2026-12-10T12:00:00Z");
const LIBRE: Asiento = { estado: "LIBRE", pnr: null, hold_token: null, hold_expira: null };

function mapaLibre(): MapaAsientos {
  return Object.fromEntries(clavesMapa().map((c) => [c, { ...LIBRE }]));
}

Deno.test("mapa: 174 claves unicas con las clases del draft", () => {
  const claves = clavesMapa();
  assert.equal(claves.length, 174);
  assert.equal(new Set(claves).size, 174);
  assert.equal(claves.filter((c) => parseInt(c) <= 3).length, 12);
  assert.equal(claves.filter((c) => parseInt(c) >= 4 && parseInt(c) <= 7).length, 24);
  assert.equal(claves.filter((c) => parseInt(c) >= 8).length, 138);
  assert.ok(claves.includes("1A") && claves.includes("1F") && claves.includes("30F"));
  assert.ok(!claves.includes("1B") && !claves.includes("1E")); // Premium sin B/E
  assert.ok(!claves.includes("31A") && !claves.includes("12G"));
});

Deno.test("parseo: separadores espacio y coma", () => {
  assert.deepEqual(parsearAsientos("12A 12B"), { ok: true, asientos: ["12A", "12B"] });
  assert.deepEqual(parsearAsientos("12A,12B"), { ok: true, asientos: ["12A", "12B"] });
  assert.deepEqual(parsearAsientos(" 12a ,  12b  5C "), { ok: true, asientos: ["12A", "12B", "5C"] });
  assert.deepEqual(parsearAsientos("1A"), { ok: true, asientos: ["1A"] });
});

Deno.test("parseo: formato invalido y duplicados", () => {
  assert.deepEqual(parsearAsientos("99Z 12A"), { ok: false, invalidos: ["99Z"] });
  assert.deepEqual(parsearAsientos("12A 12A"), { ok: false, invalidos: ["12A"] });
  assert.deepEqual(parsearAsientos("0A"), { ok: false, invalidos: ["0A"] });
  assert.deepEqual(parsearAsientos("12"), { ok: false, invalidos: ["12"] });
  assert.deepEqual(parsearAsientos("   "), { ok: false, invalidos: [] });
  assert.deepEqual(parsearAsientos(",,"), { ok: false, invalidos: [] });
});

Deno.test("exit row: filas 13 y 14", () => {
  assert.ok(esExitRow("13A") && esExitRow("14F"));
  assert.ok(!esExitRow("12A") && !esExitRow("15A") && !esExitRow("1A"));
});

Deno.test("seleccion: valida contra mapa, cantidad y exit row por edad", () => {
  const mapa = mapaLibre();
  assert.deepEqual(validarSeleccion("12A 12B", [30, 8], mapa, AHORA), { ok: true, asientos: ["12A", "12B"] });
  // existencia: 1B no existe en Premium
  assert.deepEqual(validarSeleccion("1B", [30], mapa, AHORA), { ok: false, invalidos: ["1B"], motivo: "inexistente" });
  // cantidad
  assert.deepEqual(validarSeleccion("12A", [30, 30], mapa, AHORA), { ok: false, invalidos: [], motivo: "cantidad" });
  // exit row: edad 15 permitida, 14 rechazada
  assert.equal(validarSeleccion("13A", [15], mapa, AHORA).ok, true);
  assert.deepEqual(validarSeleccion("13A", [14], mapa, AHORA), { ok: false, invalidos: ["13A"], motivo: "exit_row" });
  assert.deepEqual(validarSeleccion("12A 14C", [40, 10], mapa, AHORA), { ok: false, invalidos: ["14C"], motivo: "exit_row" });
  // formato
  assert.equal(validarSeleccion("99Z", [30], mapa, AHORA).ok, false);
});

Deno.test("seleccion: estados no LIBRE y hold vencido equivale a LIBRE", () => {
  const mapa = mapaLibre();
  mapa["12A"] = { estado: "VENDIDO", pnr: "ABC234", hold_token: null, hold_expira: null };
  mapa["12B"] = { estado: "BLOQUEADO", pnr: null, hold_token: null, hold_expira: null };
  mapa["12C"] = { estado: "RETENIDO", pnr: null, hold_token: "t", hold_expira: "2026-12-10T12:05:00Z" };
  mapa["12D"] = { estado: "RETENIDO", pnr: null, hold_token: "t", hold_expira: "2026-12-10T11:59:00Z" };
  assert.deepEqual(validarSeleccion("12A 12B 12C", [30, 30, 30], mapa, AHORA), {
    ok: false,
    invalidos: ["12A", "12B", "12C"],
    motivo: "no_libre",
  });
  assert.equal(validarSeleccion("12D", [30], mapa, AHORA).ok, true);
});

Deno.test("hold: valido solo si RETENIDO y hold_expira > ahora", () => {
  const ret = (exp: string | null): Asiento => ({ estado: "RETENIDO", pnr: null, hold_token: "t", hold_expira: exp });
  assert.equal(holdValido(ret("2026-12-10T12:00:01Z"), AHORA), true);
  assert.equal(holdValido(ret("2026-12-10T12:00:00Z"), AHORA), false); // igual a ahora: vencido
  assert.equal(holdValido(ret("2026-12-10T11:59:59Z"), AHORA), false);
  assert.equal(holdValido(ret(null), AHORA), false);
  assert.equal(holdValido(ret("no-es-fecha"), AHORA), false);
  for (const estado of ["LIBRE", "VENDIDO", "BLOQUEADO"] as const) {
    assert.equal(holdValido({ estado, pnr: null, hold_token: "t", hold_expira: "2027-01-01T00:00:00Z" }, AHORA), false);
  }
});

Deno.test("PNR: 6 caracteres [A-Z2-9] sin O, I, 0, 1", () => {
  for (let i = 0; i < 2000; i++) {
    const pnr = generarPnr();
    assert.match(pnr, PNR_RE);
    assert.equal(pnr.length, 6);
    assert.ok(!/[OI01]/.test(pnr));
  }
  // RNG determinista: extremos del alfabeto (32 simbolos)
  assert.equal(generarPnr(() => 0), "AAAAAA");
  assert.equal(generarPnr(() => 0.999999), "999999");
  const seq = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  let i = 0;
  assert.equal(generarPnr(() => seq[i++]), "ADGKNS");
  // el alfabeto completo no contiene O, I, 0, 1 y cubre 32 simbolos
  const vistos = new Set<string>();
  for (let k = 0; k < 32; k++) vistos.add(generarPnr(() => k / 32)[0]);
  assert.equal(vistos.size, 32);
  assert.ok(!vistos.has("O") && !vistos.has("I") && !vistos.has("0") && !vistos.has("1"));
  assert.ok(!PNR_RE.test("ABCDE0") && !PNR_RE.test("ABCDEO") && !PNR_RE.test("ABCDEI") && !PNR_RE.test("ABCDE1"));
  assert.ok(!PNR_RE.test("ABCDE") && !PNR_RE.test("ABCDEFG") && !PNR_RE.test("abcdef"));
});

Deno.test("ventana: 2026-12-01..2027-01-31 inclusive", () => {
  assert.equal(fechaEnVentana("2026-12-01"), true);
  assert.equal(fechaEnVentana("2027-01-31"), true);
  assert.equal(fechaEnVentana("2026-12-31"), true);
  assert.equal(fechaEnVentana("2027-01-01"), true);
  assert.equal(fechaEnVentana("2026-11-30"), false);
  assert.equal(fechaEnVentana("2027-02-01"), false);
  assert.equal(fechaEnVentana("2026-12-32"), false);
  assert.equal(fechaEnVentana("2027-1-5"), false);
  assert.equal(fechaEnVentana("hoy"), false);
});

Deno.test("pasajeros: 1 a 9", () => {
  assert.equal(cantidadPasajerosValida(1), true);
  assert.equal(cantidadPasajerosValida(9), true);
  assert.equal(cantidadPasajerosValida(0), false);
  assert.equal(cantidadPasajerosValida(10), false);
  assert.equal(cantidadPasajerosValida(2.5), false);
  assert.equal(cantidadPasajerosValida(NaN), false);
});
