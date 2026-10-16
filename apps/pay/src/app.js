import express from 'express';
import { CSP, renderPago, resolveLang } from './pagina.js';

export const DEFAULT_PORT = 3001;

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export function resolvePort(env = process.env) {
  const port = Number.parseInt(env.PORT_PAY ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

// `datum` (opcional) expone getRow(rowId); sin él no se publican las rutas de pago.
// `now` es inyectable para las pruebas de expiración.
export function createApp({ datum, now = () => new Date() } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  if (!datum) return app;

  function validarId(req, res, next) {
    if (!ID_VALIDO.test(req.params.id)) {
      res.status(400).type('text/plain').send('id inválido');
      return;
    }
    next();
  }

  // El contrato publica el enlace como /pay/:id; /pagar/:id es el alias del formulario.
  // Lectura pura: sin efecto de lado, no requiere idempotencia.
  app.get(['/pay/:id', '/pagar/:id'], validarId, async (req, res) => {
    const lang = resolveLang(req.get('accept-language'));
    try {
      const tx = await datum.getRow(req.params.id);
      if (!tx) {
        res.status(404).type('text/plain').send('transacción no encontrada');
        return;
      }
      const expira = new Date(tx.expira_at);
      const pagable = tx.estado === 'PENDIENTE' && expira > now();
      // Una PENDIENTE vencida se muestra como EXPIRADA (pay no escribe en Datum).
      const estado = tx.estado === 'PENDIENTE' && !pagable ? 'EXPIRADA' : tx.estado;
      let totalCop;
      if (pagable) {
        const reserva = await datum.getRow(tx.reserva_id);
        totalCop = reserva?.total_cop;
        if (!Number.isInteger(totalCop) || totalCop < 0) {
          res.status(502).type('text/plain').send('datos de reserva inválidos');
          return;
        }
      }
      res
        .status(200)
        .set({
          'Content-Security-Policy': CSP,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        .type('html')
        .send(renderPago({ id: req.params.id, estado, totalCop, pagable, lang }));
    } catch {
      res.status(502).type('text/plain').send('no se pudo consultar la transacción');
    }
  });

  // Gancho de la tarea 2.12 (notificación a pago-notificacion). Por ahora no hay efecto.
  for (const accion of ['aprobar', 'rechazar']) {
    app.post(`/pagar/:id/${accion}`, validarId, (_req, res) => {
      res.status(501).type('text/plain').send('pendiente de tarea 2.12');
    });
  }

  return app;
}
