// application: carga idempotente. Lista antes, omite filas con clave natural existente, crea el resto.
import { clasificar, generarColecciones } from "./datos.mjs";

export function contar(colecciones = generarColecciones()) {
  return Object.fromEntries(colecciones.map((c) => [c.nombre, c.filas.length]));
}

// Idempotencia: la clave natural (rutas.id, temporada.mes, parametros.clave, vuelos.id = ruta+fecha)
// se consulta en Datum antes de escribir; una segunda ejecucion no crea nada.
// `cliente` = { listarTodo(), crear(fields) }. `log` recibe solo conteos, nunca credenciales.
export async function cargar(cliente, { colecciones = generarColecciones(), log = () => {} } = {}) {
  const existentes = new Set((await cliente.listarTodo()).map((f) => clasificar(f.fields)).filter(Boolean).map((c) => `${c.nombre}:${c.clave}`));
  const resumen = {};
  for (const col of colecciones) {
    let creadas = 0;
    let omitidas = 0;
    for (const fila of col.filas) {
      const clave = `${col.nombre}:${col.clave(fila)}`;
      if (existentes.has(clave)) {
        omitidas++;
        continue;
      }
      await cliente.crear(fila);
      existentes.add(clave);
      creadas++;
    }
    resumen[col.nombre] = { creadas, omitidas };
    log(`${col.nombre}: ${creadas} creadas, ${omitidas} omitidas`);
  }
  return resumen;
}
