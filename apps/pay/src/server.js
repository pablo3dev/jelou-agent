import { createApp, resolvePort } from './app.js';
import { createDatumClient } from './datum.js';

// El .env lo inyecta compose; en ejecución local es opcional.
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usa el entorno del proceso
}

const port = resolvePort();
const server = createApp({ datum: createDatumClient() }).listen(port, () => {
  console.log(`pay escuchando en el puerto ${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
