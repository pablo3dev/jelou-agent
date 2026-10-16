const DEFAULT_PORT = 3000;

// Puerto de escucha: PORT_CRM si es un entero valido (1-65535); si no, 3000.
export function resolvePort(env = process.env) {
  const port = Number(env.PORT_CRM);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}
