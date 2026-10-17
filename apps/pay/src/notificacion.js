import { createHmac } from 'node:crypto';

export class NotificacionError extends Error {
  constructor(message, { configuracion = false } = {}) {
    super(message);
    this.configuracion = configuracion;
  }
}

const ESPERAS_MS = [1000, 2000]; // 3 intentos, backoff de 1 s y 2 s (contrato, GAP-14)

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cliente de la notificación a `pago-notificacion`. Nunca envía EXPIRADA.
// `fetchFn` y `sleep` son inyectables para las pruebas; el secreto solo se lee de `env`
// y nunca se incluye en mensajes de error ni en logs.
export function createNotificador({ env = process.env, fetchFn = fetch, sleep = dormir, now = () => new Date() } = {}) {
  // Idempotencia: event_id = "<transaccion_id>:<estado>" es estable; reenviar el mismo
  // evento es válido porque el receptor deduplica por event_id.
  async function notificar(transaccionId, estado) {
    const secreto = env.PAY_WEBHOOK_SECRET;
    const url = env.PAGO_NOTIFICACION_URL;
    if (!secreto || !url) throw new NotificacionError('notificación no configurada', { configuracion: true });
    if (estado !== 'APROBADA' && estado !== 'RECHAZADA') throw new Error('estado no notificable');

    // Se serializa UNA vez; se firman y envían exactamente estos bytes.
    const cuerpo = JSON.stringify({
      transaccion_id: transaccionId,
      estado,
      event_id: `${transaccionId}:${estado}`,
      emitido_at: now().toISOString(),
    });
    const firma = createHmac('sha256', secreto).update(cuerpo).digest('hex');
    const headers = { 'Content-Type': 'application/json', 'X-Webhook-Signature': `sha256=${firma}` };

    for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
      if (intento > 0) await sleep(ESPERAS_MS[intento - 1]);
      let res;
      try {
        res = await fetchFn(url, { method: 'POST', headers, body: cuerpo, signal: AbortSignal.timeout(5000) });
      } catch {
        continue; // fallo de red: reintenta
      }
      if (res.ok) return;
      // Solo 5xx y 429 se reintentan; otro 4xx (p. ej. 401) es definitivo.
      if (res.status < 500 && res.status !== 429) break;
    }
    throw new NotificacionError('el receptor no aceptó la notificación');
  }

  return { notificar };
}
