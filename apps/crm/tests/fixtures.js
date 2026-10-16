// Fixtures y cliente Datum simulado para las pruebas (sin red).
import { ASIENTOS } from '../src/asientos.js';
import { DatumNoConfigurado } from '../src/datum.js';

export const AHORA = new Date('2026-12-01T12:00:00Z');
const VENCIDO = '2026-12-01T11:00:00.000Z';
const VIGENTE = '2026-12-01T13:00:00.000Z';
export const TOKEN_SECRETO = 'SECRET-HOLD-TOKEN';

const libre = () => ({ estado: 'LIBRE', pnr: null, hold_token: null, hold_expira: null });

export function mapaCompleto(overrides = {}) {
  const mapa = Object.fromEntries(ASIENTOS.map((a) => [a.asiento, libre()]));
  return { ...mapa, ...overrides };
}

const vendido = (pnr) => ({ estado: 'VENDIDO', pnr, hold_token: null, hold_expira: null });
const retenido = (expira) => ({ estado: 'RETENIDO', pnr: null, hold_token: TOKEN_SECRETO, hold_expira: expira });

// V1: 5 vendidos, 2 retenidos vencidos (-> LIBRE), 3 retenidos vigentes, 1 bloqueado.
export const V1_MAPA = mapaCompleto({
  '1A': vendido('ABC234'), '1C': vendido('ABC234'), '13A': vendido('XYZ789'), '13B': vendido('XYZ789'), '30F': vendido('QWE456'),
  '2A': retenido(VENCIDO), '14A': retenido(VENCIDO),
  '5A': retenido(VIGENTE), '5B': retenido(VIGENTE), '13C': retenido(VIGENTE),
  '8A': { estado: 'BLOQUEADO', pnr: null, hold_token: null, hold_expira: null },
});

const diez = Object.fromEntries(['4A', '4B', '4C', '4D', '4E', '4F', '6A', '6B', '6C', '6D'].map((k) => [k, vendido('TEN222')]));

export function fixtures() {
  return {
    rutas: [
      { _id: 'r1', fields: { id: 'BOG-MDE', origen: 'BOG', destino: 'MDE', tarifa_base_cop: 200000 } },
      { _id: 'r2', fields: { id: 'BOG-CTG', origen: 'BOG', destino: 'CTG', tarifa_base_cop: 300000 } },
      { _id: 'r3', fields: { id: 'MDE-BOG', origen: 'MDE', destino: 'BOG', tarifa_base_cop: 200000 } },
    ].map(plano),
    vuelos: [
      { _id: 'v1', id: 'v1', ruta_id: 'BOG-MDE', fecha: '2026-12-01', hora_salida: '07:00', mapa_asientos: V1_MAPA, version: 3 },
      { _id: 'v2', id: 'v2', ruta_id: 'BOG-CTG', fecha: '2026-12-02', hora_salida: '07:00', mapa_asientos: mapaCompleto(diez), version: 1 },
      { _id: 'v3', id: 'v3', ruta_id: 'MDE-BOG', fecha: '2026-12-03', hora_salida: '07:00', mapa_asientos: mapaCompleto(), version: 1 },
      { _id: 'v4', id: 'v4', ruta_id: 'BOG-MDE', fecha: '2026-12-03', hora_salida: '07:00', mapa_asientos: JSON.stringify(mapaCompleto({ '9A': vendido('STR111') })), version: 1 },
    ],
    reservas: [
      { id: 'a', pnr: 'ABC234', estado: 'EMITIDA', vuelo_ida_id: 'v1', total_cop: 100000 },
      { id: 'b', pnr: 'XYZ789', estado: 'EMITIDA', vuelo_ida_id: 'v1', total_cop: 250000 },
      { id: 'c', pnr: 'PEN333', estado: 'PENDIENTE_PAGO', vuelo_ida_id: 'v2', total_cop: 80000 },
      { id: 'd', pnr: 'EXP444', estado: 'EXPIRADA', vuelo_ida_id: 'v2', total_cop: 50000 },
    ],
  };
}

function plano(fila) {
  return { ...fila.fields, _id: fila._id };
}

// Cliente simulado: solo lectura. Los metodos de escritura existen unicamente para registrar
// si alguien los llamara; la prueba exige que `writes` quede vacio.
export function mockDatum(data = fixtures(), { fallo = false } = {}) {
  const calls = [];
  const writes = [];
  const registrar = (nombre) => (...args) => {
    writes.push([nombre, ...args]);
    throw new Error('escritura no permitida');
  };
  return {
    calls,
    writes,
    async list(coleccion) {
      calls.push(['list', coleccion]);
      if (fallo) throw new Error('boom: token=supersecreto');
      return (data[coleccion] ?? []).map((f) => ({ id: f._id, ...f }));
    },
    async getById(_coleccion, id) {
      calls.push(['getById', id]);
      return null;
    },
    create: registrar('create'),
    insert: registrar('insert'),
    update: registrar('update'),
    put: registrar('put'),
    post: registrar('post'),
    delete: registrar('delete'),
  };
}

export const datumSinConfig = {
  async list() {
    throw new DatumNoConfigurado('Datum no configurado');
  },
  async getById() {
    throw new DatumNoConfigurado('Datum no configurado');
  },
};
