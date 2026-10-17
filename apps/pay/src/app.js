import express from 'express';
import { CSP, renderConfirmacion, renderFallo, renderPago, resolveLang } from './pagina.js';
import { createNotificador, NotificacionError } from './notificacion.js';

export const DEFAULT_PORT = 3001;

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export function resolvePort(env = process.env) {
  const port = Number.parseInt(env.PORT_PAY ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

// `datum` (opcional) expone getRecord(coleccion, id); sin él no se publican las rutas de pago.
// `now` es inyectable para las pruebas de expiración.
// `notificador` expone notificar(transaccionId, estado); por defecto el real (env + fetch).
export function createApp({ datum, now = () => new Date(), notificador = createNotificador() } = {}) {
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
      const tx = await datum.getRecord('transacciones', req.params.id);
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
        const reserva = await datum.getRecord('reservas', tx.reserva_id);
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

  function html(res, status, cuerpo) {
    res
      .status(status)
      .set({
        'Content-Security-Policy': CSP,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .type('html')
      .send(cuerpo);
  }

  // Pay no escribe en Datum: notifica a pago-notificacion, que aplica el efecto.
  // Idempotencia: solo se notifica una PENDIENTE vigente y el event_id es estable
  // ("<id>:<estado>"), así que reintentar el POST es seguro (el receptor deduplica).
  for (const [accion, estadoNuevo] of [['aprobar', 'APROBADA'], ['rechazar', 'RECHAZADA']]) {
    app.post(`/pagar/:id/${accion}`, validarId, async (req, res) => {
      const lang = resolveLang(req.get('accept-language'));
      const id = req.params.id;
      let tx;
      try {
        tx = await datum.getRecord('transacciones', id);
      } catch {
        res.status(502).type('text/plain').send('no se pudo consultar la transacción');
        return;
      }
      if (!tx) {
        res.status(404).type('text/plain').send('transacción no encontrada');
        return;
      }
      if (!(tx.estado === 'PENDIENTE' && new Date(tx.expira_at) > now())) {
        const estado = tx.estado === 'PENDIENTE' ? 'EXPIRADA' : tx.estado;
        html(res, 200, renderPago({ id, estado, pagable: false, lang }));
        return;
      }
      try {
        await notificador.notificar(id, estadoNuevo);
      } catch (err) {
        if (err instanceof NotificacionError && err.configuracion) {
          res.status(500).type('text/plain').send('error de configuración');
        } else {
          html(res, 502, renderFallo({ id, lang }));
        }
        return;
      }
      html(res, 200, renderConfirmacion({ estado: estadoNuevo, lang }));
    });
  }

  return app;
}
