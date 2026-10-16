// Raíz del proyecto de despliegue (jelou.json: entrypoint index.ts). Registra las 7 tools con su nombre del contrato
// (claves con guiones: la ruta y el nombre MCP coinciden con contract/endpoints.md). pago-notificacion conserva su
// `config.path` ("/pago-notificacion") y `public: true`.
import { app } from "@jelou/functions";
import asientosValidarRetener from "./asientos-validar-retener/index.ts";
import cotizar from "./cotizar/index.ts";
import equipajeCalcular from "./equipaje-calcular/index.ts";
import pagoNotificacion from "./pago-notificacion/index.ts";
import rutasListar from "./rutas-listar/index.ts";
import transaccionCrear from "./transaccion-crear/index.ts";
import vuelosBuscar from "./vuelos-buscar/index.ts";

export default app({
  tools: {
    "rutas-listar": rutasListar,
    "vuelos-buscar": vuelosBuscar,
    "cotizar": cotizar,
    "equipaje-calcular": equipajeCalcular,
    "asientos-validar-retener": asientosValidarRetener,
    "transaccion-crear": transaccionCrear,
    "pago-notificacion": pagoNotificacion,
  },
});
