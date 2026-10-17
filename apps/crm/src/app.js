import path from 'node:path';
import express from 'express';
import { createApi } from './api.js';
import { createDatumClient } from './datum.js';

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
// `deps.datum` (cliente de solo lectura) y `deps.now` son inyectables para las pruebas.
export function createApp({ datum = createDatumClient(), now } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api', createApi({ datum, now }));

  app.use(express.static(PUBLIC_DIR));
  return app;
}
