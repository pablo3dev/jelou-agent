// application: carga idempotente y reanudable. Lista los ids existentes por coleccion, omite los presentes
// y crea el resto; el id fisico determinista hace atomica la unicidad (duplicado => omitida).
import { generarColecciones } from "./datos.mjs";

export function contar(colecciones = generarColecciones()) {
  return Object.fromEntries(colecciones.map((c) => [c.nombre, c.filas.length]));
}

// `cliente` = { listarIds(coleccion), crear(coleccion, campos, id) }. `log` recibe solo conteos.
export async function cargar(cliente, { colecciones = generarColecciones(), log = () => {} } = {}) {
  const resumen = {};
  for (const col of colecciones) {
    const existentes = await cliente.listarIds(col.nombre);
    let creadas = 0;
    let omitidas = 0;
    for (const { id, campos } of col.filas) {
      if (existentes.has(id)) {
        omitidas++;
        continue;
      }
      const r = await cliente.crear(col.nombre, campos, id);
      if (r?.duplicado) omitidas++; // carrera: otra ejecucion lo creo entre el listado y el POST
      else creadas++;
    }
    resumen[col.nombre] = { creadas, omitidas };
    log(`${col.nombre}: ${creadas} creadas, ${omitidas} omitidas`);
  }
  return resumen;
}
