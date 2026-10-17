import { createApp } from './app.js';
import { resolvePort } from './config.js';

const port = resolvePort();
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`crm escuchando en 0.0.0.0:${port}`);
});

// Apagado limpio: deja de aceptar conexiones y termina al cerrar las activas.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  server.closeIdleConnections();
});
