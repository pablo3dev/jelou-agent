import express from 'express';

export const DEFAULT_PORT = 3001;

export function resolvePort(env = process.env) {
  const port = Number.parseInt(env.PORT_PAY ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}
