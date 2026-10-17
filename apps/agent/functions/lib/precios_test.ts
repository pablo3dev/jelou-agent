import assert from "node:assert/strict";
import {
  cobrableKg,
  multiplicadorDeFecha,
  type ParametrosPrecio,
  pesoVolumetricoKg,
  precioBodega,
  precioMascota,
  precioPasaje,
  totalCop,
} from "./precios.ts";

const P: ParametrosPrecio = {
  tarifa_kg_bodega_cop: 12000,
  cargo_minimo_bodega_cop: 40000,
  tarifa_mascota_cop: 150000,
  max_lineal_bodega_cm: 158,
  max_peso_bodega_kg: 32,
  peso_max_mascota_kg: 8,
  max_mascotas_reserva: 1,
  max_piezas_bodega_pasajero: 1,
  divisor_volumetrico: 6000,
};
const TEMPORADA: Record<number, number> = {
  1: 1.3, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1.3, 7: 1.3, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1.3,
};

Deno.test("temporada: multiplicador por mes de la fecha del vuelo", () => {
  assert.equal(multiplicadorDeFecha("2026-12-01", TEMPORADA), 1.3);
  assert.equal(multiplicadorDeFecha("2027-01-31", TEMPORADA), 1.3);
  assert.equal(multiplicadorDeFecha("2026-11-30", TEMPORADA), 1);
  assert.throws(() => multiplicadorDeFecha("basura", TEMPORADA));
});

Deno.test("pasaje: tarifa base x temporada con Math.round", () => {
  assert.equal(precioPasaje(350000, 1), 350000);
  assert.equal(precioPasaje(350000, 1.3), 455000);
  assert.equal(precioPasaje(380000, 1.3), 494000);
  assert.equal(precioPasaje(420000, 1.3), 546000);
  assert.equal(precioPasaje(1, 1.5), 2); // mitad hacia arriba
});

Deno.test("peso volumetrico L*A*H/6000 con ceil", () => {
  const m = { largo_cm: 60, ancho_cm: 50, alto_cm: 40, peso_kg: 10 };
  assert.equal(pesoVolumetricoKg(m, 6000), 20);
  assert.equal(cobrableKg(m, 6000), 20); // volumetrico > real
  assert.equal(cobrableKg({ ...m, peso_kg: 25 }, 6000), 25); // real > volumetrico
  assert.equal(cobrableKg({ ...m, peso_kg: 20.2 }, 6000), 21); // ceil del real
  assert.equal(cobrableKg({ largo_cm: 61, ancho_cm: 50, alto_cm: 40, peso_kg: 1 }, 6000), 21); // ceil del volumetrico
});

Deno.test("bodega: minimo 40000 y 12000 por kg", () => {
  // peso real 3 kg pero volumetrico 4 kg -> cobrable 4 -> 48000
  const liviana = precioBodega({ largo_cm: 40, ancho_cm: 30, alto_cm: 20, peso_kg: 3 }, P, 1);
  assert.deepEqual(liviana, { ok: true, precio_cop: 48000, cobrable_kg: 4, peso_volumetrico_kg: 4 });
  // 4 kg * 12000 = 48000 > 40000
  const cuatro = precioBodega({ largo_cm: 40, ancho_cm: 30, alto_cm: 20, peso_kg: 4 }, P, 1);
  assert.ok(cuatro.ok && cuatro.precio_cop === 48000);
  // 3 kg -> 36000 < 40000: aplica el minimo
  const tres = precioBodega({ largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 3 }, P, 1);
  assert.ok(tres.ok && tres.precio_cop === 40000);
  // temporada multiplica el cargo minimo y el cargo por kg
  const alta = precioBodega({ largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 3 }, P, 1.3);
  assert.ok(alta.ok && alta.precio_cop === 52000);
  const alta2 = precioBodega({ largo_cm: 60, ancho_cm: 50, alto_cm: 40, peso_kg: 10 }, P, 1.3);
  assert.ok(alta2.ok && alta2.precio_cop === Math.round(20 * 12000 * 1.3));
});

Deno.test("bodega: limites 158 cm, 32 kg y 1 pieza", () => {
  const ok158 = precioBodega({ largo_cm: 58, ancho_cm: 50, alto_cm: 50, peso_kg: 10 }, P, 1);
  assert.ok(ok158.ok);
  const mas158 = precioBodega({ largo_cm: 59, ancho_cm: 50, alto_cm: 50, peso_kg: 10 }, P, 1);
  assert.equal(mas158.ok, false);
  const ok32 = precioBodega({ largo_cm: 50, ancho_cm: 40, alto_cm: 30, peso_kg: 32 }, P, 1);
  assert.ok(ok32.ok && ok32.precio_cop === 32 * 12000);
  const mas32 = precioBodega({ largo_cm: 50, ancho_cm: 40, alto_cm: 30, peso_kg: 32.01 }, P, 1);
  assert.equal(mas32.ok, false);
  const m = { largo_cm: 50, ancho_cm: 40, alto_cm: 30, peso_kg: 10 };
  assert.ok(precioBodega(m, P, 1, 0).ok);
  assert.equal(precioBodega(m, P, 1, 1).ok, false); // segunda pieza
});

Deno.test("bodega: entradas invalidas", () => {
  assert.equal(precioBodega({ largo_cm: 0, ancho_cm: 40, alto_cm: 30, peso_kg: 10 }, P, 1).ok, false);
  assert.equal(precioBodega({ largo_cm: 50, ancho_cm: 40, alto_cm: 30, peso_kg: -1 }, P, 1).ok, false);
  assert.equal(precioBodega({ largo_cm: NaN, ancho_cm: 40, alto_cm: 30, peso_kg: 1 }, P, 1).ok, false);
});

Deno.test("mascota: <= 8 kg, 1 por reserva, 150000 x temporada", () => {
  assert.deepEqual(precioMascota(8, P, 1), { ok: true, precio_cop: 150000 });
  assert.deepEqual(precioMascota(5, P, 1.3), { ok: true, precio_cop: 195000 });
  assert.equal(precioMascota(8.01, P, 1).ok, false);
  assert.equal(precioMascota(0, P, 1).ok, false);
  assert.equal(precioMascota(4, P, 1, 1).ok, false); // segunda mascota
});

Deno.test("total: suma de lineas ya redondeadas", () => {
  const lineas = [precioPasaje(350000, 1.3), precioPasaje(350000, 1.3), 52000, 195000];
  assert.equal(totalCop(lineas), 455000 * 2 + 52000 + 195000);
  assert.equal(totalCop([]), 0);
  // el redondeo es por linea, no sobre la suma: 3 x round(0.75)=3, no round(2.25)=2
  assert.equal(totalCop([precioPasaje(1, 0.75), precioPasaje(1, 0.75), precioPasaje(1, 0.75)]), 3);
});
