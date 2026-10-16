// adapter: in — endpoints JSON de SOLO LECTURA (GET/HEAD/OPTIONS) bajo /api.
import express from 'express';
import { DatumNoConfigurado } from './datum.js';
import { detalleAsientos, contarEstados, porcentaje, TOTAL_ASIENTOS } from './asientos.js';
import { resumirVuelos, filtrarVuelos, ventasPorVuelo, ventasPorDestino, estadisticas } from './agregados.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApi({ datum, now = () => new Date() }) {
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!SAFE.has(req.method)) {
      res.set('Allow', 'GET, HEAD, OPTIONS');
      return res.status(405).json({ error: 'metodo_no_permitido' });
    }
    next();
  });

  // Lectura pura: ninguna ruta escribe en Datum.
  const resumen = async (ahora) => resumirVuelos(await datum.list('vuelos'), await datum.list('rutas'), ahora);
  const ruta = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req, now()));
    } catch (e) {
      next(e);
    }
  };

  api.get('/vuelos', async (req, res, next) => {
    try {
      const { ruta: r, desde, hasta } = req.query;
      for (const f of [desde, hasta]) {
        if (f !== undefined && !(typeof f === 'string' && FECHA.test(f))) return res.status(400).json({ error: 'fecha_invalida' });
      }
      if (r !== undefined && typeof r !== 'string') return res.status(400).json({ error: 'ruta_invalida' });
      const vuelos = filtrarVuelos(await resumen(now()), { ruta: r, desde, hasta });
      res.json({ vuelos });
    } catch (e) {
      next(e);
    }
  });

  api.get('/vuelos/:id/asientos', async (req, res, next) => {
    try {
      const ahora = now();
      const vuelos = await datum.list('vuelos');
      const vuelo = vuelos.find((v) => v.id === req.params.id || v._id === req.params.id);
      if (!vuelo) return res.status(404).json({ error: 'vuelo_no_encontrado' });
      const c = contarEstados(vuelo, ahora);
      res.json({
        vuelo_id: vuelo.id,
        ruta: vuelo.ruta_id,
        fecha: String(vuelo.fecha ?? '').slice(0, 10),
        resumen: { total_asientos: TOTAL_ASIENTOS, ...c, ocupacion_pct: porcentaje(c.vendidos, TOTAL_ASIENTOS) },
        asientos: detalleAsientos(vuelo, ahora),
      });
    } catch (e) {
      next(e);
    }
  });

  api.get('/ventas/por-vuelo', ruta(async (_req, ahora) => ventasPorVuelo(await resumen(ahora))));
  api.get('/ventas/por-destino', ruta(async (_req, ahora) => ventasPorDestino(await resumen(ahora))));
  api.get('/estadisticas', ruta(async (_req, ahora) => estadisticas(await resumen(ahora), await datum.list('reservas'), ahora)));

  api.use((_req, res) => res.status(404).json({ error: 'no_encontrado' }));

  // Datum sin configurar -> 503; cualquier otro fallo -> 502 sin detalles.
  // eslint-disable-next-line no-unused-vars
  api.use((err, _req, res, _next) => {
    if (err instanceof DatumNoConfigurado) return res.status(503).json({ error: 'datum_no_configurado' });
    res.status(502).json({ error: 'datum_no_disponible' });
  });
  return api;
}
