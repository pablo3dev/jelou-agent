import path from 'node:path';
import express from 'express';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../public');

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
  });
  next();
}

// Sin escuchar: server.js llama a listen; las pruebas lo hacen en puerto efimero.
// `deps` queda reservado para los endpoints JSON de tareas posteriores.
export function createApp(_deps = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use(express.static(PUBLIC_DIR));
  return app;
}
