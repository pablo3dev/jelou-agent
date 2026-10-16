# Contrato de endpoints de Jelou Functions (apps/agent)

Fuente: `draft.md` (RN-01..RN-15, REQ-01..REQ-12, EC-01..EC-18, decisiones 31-38) y `learning.md` §4, §7. Las copias de este directorio en `apps/pay` y `apps/crm` se verifican por hash contra el original.

## Convenciones

- Cada function se define con `define({ name, description, input, output, handler })` de `@jelou/functions`. La entrada se valida con zod antes del handler; si falla: HTTP 400, "Validation failed" (el campo `details` o `error` del cuerpo 400 es SUPUESTO, se confirma en el spike 3.1/3.2).
- Autenticación: solo `pago-notificacion` es pública (`config.public = true`), protegida por HMAC. El resto no es pública: solo la llama el agente de Brain Studio por MCP con la cabecera `Authorization: Bearer ${JELOU_FUNCTIONS_TOKEN}` (token `sk_...`; se configura en Brain Studio como `${VAR}`/placeholder, nunca con el valor en el repo).
- Variables de entorno requeridas por las functions/agente: `PAY_WEBHOOK_SECRET` (HMAC de `pago-notificacion`) y `PAY_PUBLIC_URL` (base pública de apps/pay, ej. `http://localhost:3001`; se usa para construir `enlace_pago`).
- El LLM solo pasa texto: todo valor llega como `string` o `number` crudo y se valida en la function. Los precios y totales los calcula el servidor; ninguna entrada los trae.
- Errores comunes de salida: 400 validación (o regla de negocio violada, con lista de motivos), 503 fallo de write-then-verify tras 3 intentos o fallo de reanudación (sin efecto parcial visible), 500 inesperado.
- Logs con `ctx.log`; el documento se enmascara.
- Dinero: COP enteros. Fechas de viaje: `YYYY-MM-DD`. Instantes: ISO 8601 UTC.
- SUPUESTOS (el draft no los fija): nombres de campos de entrada y salida de cada function, códigos 401 y `resultado` de `pago-notificacion`, y `enlace_pago`; se ajustan en tareas 2.4 a 2.6 manteniendo este archivo como fuente (cambiar aquí cambia el hash del contrato).

## Esquemas zod compartidos

```typescript
import { z } from "@jelou/functions";

export const RutaId = z.enum(["BOG-MDE", "MDE-BOG", "BOG-CLO", "CLO-BOG", "BOG-CTG", "CTG-BOG"]);

// RN-14: ventana 2026-12-01 .. 2027-01-31 inclusive (la fecha debe existir en el calendario)
export const FechaViaje = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((f) => f >= "2026-12-01" && f <= "2027-01-31");

export const NumPasajeros = z.number().int().min(1).max(9); // RN-15

export const Bodega = z.object({ // RN-04
  largo_cm: z.number().int().positive(),
  ancho_cm: z.number().int().positive(),
  alto_cm: z.number().int().positive(),
  peso_kg: z.number().positive().max(32),
}).refine((b) => b.largo_cm + b.ancho_cm + b.alto_cm <= 158);

export const Mascota = z.object({ // RN-05
  pasajero_indice: z.number().int().min(0).max(8),
  especie: z.string().min(1).max(50),
  peso_kg: z.number().positive().max(8),
});

export const PasajeroEntrada = z.object({
  nombre: z.string().min(1).max(120),
  documento: z.string().min(1).max(30),
  edad: z.number().int().min(0).max(120),
  cabina: z.boolean().default(true), // cabina: sin costo y sin medidas (RN-03)
  bodega_ida: Bodega.optional(),     // 1 pieza de bodega por pasajero y trayecto
  bodega_regreso: Bodega.optional(), // solo si hay vuelo de regreso
});
```

## rutas-listar

- Entrada: `z.object({})`.
- Salida: `{ rutas: Array<{ id: string, origen: string, destino: string, tarifa_base_cop: number }> }` (6 elementos).
- Lectura pura; sin efecto.

## vuelos-buscar (REQ-01)

- Entrada:
  ```typescript
  z.object({
    ruta_id: RutaId,
    fecha_ida: FechaViaje,
    fecha_regreso: FechaViaje.optional(), // si existe, debe ser >= fecha_ida
    pasajeros: NumPasajeros,
  })
  ```
- Salida:
  ```typescript
  z.object({
    ida: z.array(VueloResumen),
    regreso: z.array(VueloResumen).optional(), // ruta inversa de ruta_id
  })
  // VueloResumen = { vuelo_id: string, ruta_id: string, fecha: string, hora_salida: "07:00",
  //                  asientos_libres: number, tarifa_pasajero_cop: number }
  ```
- `asientos_libres` cuenta LIBRE más RETENIDO con `hold_expira <= ahora` (RN-08). `tarifa_pasajero_cop` ya incluye temporada y redondeo (RN-01, RN-02, RN-07).
- Lectura pura; sin efecto.

## cotizar (REQ-02)

- Entrada:
  ```typescript
  z.object({
    vuelo_ida_id: z.string().min(1),
    vuelo_regreso_id: z.string().min(1).optional(),
    pasajeros: z.array(PasajeroEntrada.pick({ edad: true, bodega_ida: true, bodega_regreso: true })).min(1).max(9),
    mascota: Mascota.optional(),
  })
  ```
- Salida:
  ```typescript
  z.object({
    lineas: z.array(z.object({
      concepto: z.enum(["PASAJE", "EQUIPAJE", "MASCOTA"]),
      trayecto: z.enum(["IDA", "REGRESO"]).optional(),
      pasajero_indice: z.number().int().optional(),
      monto_cop: z.number().int(),
    })),
    total_cop: z.number().int(), // suma de líneas ya redondeadas (RN-07)
  })
  ```
- Lectura pura; sin efecto.

## equipaje-calcular (REQ-03)

- Entrada: `z.object({ vuelo_id: z.string().min(1), bodega: Bodega })`.
- Salida: `{ peso_volumetrico_kg: number, cobrable_kg: number, precio_cop: number }`. `cobrable_kg = ceil(max(peso_kg, L*A*H/6000))`; `precio_cop = round(max(40000, cobrable_kg * 12000) * temporada(mes de vuelos.fecha))` (RN-04).
- Lectura pura; sin efecto.

## asientos-validar-retener (REQ-05)

- Entrada:
  ```typescript
  z.object({
    vuelo_ida_id: z.string().min(1),
    vuelo_regreso_id: z.string().min(1).optional(),
    edades: z.array(z.number().int().min(0).max(120)).min(1).max(9), // una por pasajero, en orden
    asientos_ida: z.string().min(1).max(100),                         // "12A 12B" o "12A,12B"
    asientos_regreso: z.string().min(1).max(100).optional(),          // obligatorio si hay vuelo_regreso_id
  })
  ```
- Salida 200: `{ hold_token: string, hold_expira: string }` con `hold_expira` = ahora + 15 min. `hold_token` es opaco: el agente solo lo reenvía a `transaccion-crear`, nunca se muestra al cliente.
- Salida 400: `{ error: "Asientos inválidos", asientos_invalidos: string[] }` (formato, inexistente, no LIBRE, cantidad distinta de pasajeros, exit row con edad < 15). Sin retención parcial (EC-01, EC-11, EC-12, EC-13).
- Efecto: asientos LIBRE -> RETENIDO en `vuelos.mapa_asientos` con write-then-verify (3 intentos; fallo -> 503). Idempotente por `hold_token`.

## transaccion-crear (REQ-06)

- Entrada:
  ```typescript
  z.object({
    hold_token: z.string().min(1),
    vuelo_ida_id: z.string().min(1),
    vuelo_regreso_id: z.string().min(1).optional(),
    pasajeros: z.array(PasajeroEntrada.extend({
      asiento_ida: z.string().min(2).max(3),
      asiento_regreso: z.string().min(2).max(3).optional(),
    })).min(1).max(9),
    mascota: Mascota.optional(),
    execution_id: z.string().min(1), // valor de {{$context.executionId}}
  })
  ```
- Salida 200:
  ```typescript
  z.object({
    transaccion_id: z.string(), // _id que devuelve el POST de la fila de transacciones
    reserva_id: z.string(),
    pnr: z.string().length(6),  // el agente lo retiene y lo confirma al recibir "paid"
    total_cop: z.number().int(),
    expira_at: z.string(),
    enlace_pago: z.string().url(), // `${PAY_PUBLIC_URL}/pay/<transaccion_id>`; texto plano (REQ-10)
    existente: z.boolean(),        // true si ya había una transacción PENDIENTE (EC-16)
  })
  ```
- Efecto: crea reserva en PENDIENTE_PAGO (con PNR único, `total_cop`, `hold_expira`), pasajeros, equipaje, mascota y transacción PENDIENTE (`expira_at` = `hold_expira`, `execution_id`). Si la reserva ya tiene PENDIENTE, devuelve esa. Idempotente por reserva y `hold_token`. Fallo de verificación -> 503.
- Vencimiento único (REQ-05 vs RN-09): `asientos-validar-retener` fija el hold en ahora+15 min. Al crear la transacción, `transaccion-crear` RE-FIJA a creación+15 min, como un solo instante, `reservas.hold_expira`, `transacciones.expira_at` y el hold de los asientos en `vuelos.mapa_asientos` (el vencimiento es el de RN-09). Extender el hold de los asientos solo con write-then-verify. En la re-fijación, `expira_at` de la salida es ese instante.
- Enlace de pago: `enlace_pago` = `${PAY_PUBLIC_URL}/pay/<transaccion_id>`. apps/pay debe publicar la ruta `GET /pay/:transaccion_id`.

## pago-notificacion (REQ-07, REQ-08) — PÚBLICA

- Configuración: `public: true`, método POST.
- Autenticación: cabecera `X-Webhook-Signature: sha256=<hex>`, HMAC-SHA256 hex del cuerpo crudo con `PAY_WEBHOOK_SECRET`; se verifica con `ctx.verifyHmac(request, { secretEnv: "PAY_WEBHOOK_SECRET", header: "x-webhook-signature" })` antes de tocar datos. El cuerpo crudo frente a `JSON.stringify` y el nombre de la cabecera quedan como SUPUESTO por confirmar en el spike 3.1/3.2 (GAP-13; GAP-12 igual).
- Entrada (cuerpo JSON):
  ```typescript
  z.object({
    transaccion_id: z.string().min(1),
    estado: z.enum(["APROBADA", "RECHAZADA"]), // la pasarela nunca envía EXPIRADA
    event_id: z.string().min(1),               // "<transaccion_id>:<estado>"
    emitido_at: z.string().datetime(),
  }).refine((b) => b.event_id === `${b.transaccion_id}:${b.estado}`)
  ```
- Salida:
  - 200 `{ resultado: "APLICADO" | "EXPIRADO" | "DUPLICADO" | "SIN_EFECTO" }`. `DUPLICADO`: `event_id` ya existe en `eventos_pago`. `SIN_EFECTO`: transacción no PENDIENTE (EC-07). `EXPIRADO`: llegó después de `expira_at`; aplica RN-12 (EC-03).
  - 401 firma inválida (se registra el rechazo por firma; sin cambios en datos).
  - 503 fallo de write-then-verify o de la reanudación; la pasarela reintenta.
- Efecto: registra `id_evento` en `eventos_pago` antes del efecto; aprobada: asientos VENDIDO -> reserva EMITIDA -> transacción APROBADA -> reanuda con `paid`; rechazada: asientos LIBRE, reserva PAGO_RECHAZADO, transacción RECHAZADA, reanuda con `rejected`; expirada: asientos LIBRE, reserva EXPIRADA, transacción EXPIRADA, reanuda con `expired`.
- Reanudación: `POST https://gateway.jelou.ai/workflows/v1/skills/resume`, cabecera `x-api-key: ${JELOU_API_KEY}`, cuerpo `{ "executionId": <transacciones.execution_id>, "message": "paid" | "rejected" | "expired", "pauseInteraction": false }`.
- Idempotente por `event_id` y transición solo desde PENDIENTE.

## Lectura de la transacción por id (consumida por apps/pay)

- No es una function: `apps/pay` lee Datum por REST con Basic (`JELOU_CLIENT_ID`:`JELOU_CLIENT_SECRET`): `GET https://api.jelou.ai/v2/databases/${DATABASE_ID}/rows/{rowId}`, con `rowId` = `transacciones.id` (el `_id` devuelto por `transaccion-crear`). SUPUESTO: el GET por id no está confirmado (GAP-09); se verifica en la tarea 3.1.
- Campos que pay lee de `transacciones`: `estado`, `reserva_id`, `expira_at`. Para mostrar el monto lee `reservas.total_cop` por `reserva_id` (`GET .../rows/{reserva_id}`). SUPUESTO: la forma exacta del envoltorio de la respuesta (`fields` frente a campos planos) se confirma en el spike.
- Pay solo ofrece pagar si `estado = PENDIENTE` y `expira_at > ahora`; no escribe en Datum: el efecto lo aplica `pago-notificacion`.
- Pay notifica a `pago-notificacion` (ver arriba) con cuerpo crudo firmado. Reintentos de pay: 3 intentos con backoff de 1 s y 2 s (decisión IDEA, GAP-14). Nunca envía EXPIRADA.

## Colecciones y campos que lee apps/crm (solo lectura)

- `vuelos`: `id`, `ruta_id`, `fecha`, `hora_salida`, `mapa_asientos` (por asiento: `estado`, `pnr`; nunca se expone `hold_token`), `version`.
- `rutas`: `id`, `origen`, `destino`, `tarifa_base_cop`.
- `reservas`: `id`, `pnr`, `estado`, `vuelo_ida_id`, `vuelo_regreso_id`, `total_cop`.
- `pasajeros`: `reserva_id`, `asiento_ida`, `asiento_regreso` (no se muestran nombre ni documento: PII).
- Derivados: asientos vendidos por vuelo y por destino = claves del mapa con `estado = VENDIDO`; un RETENIDO con `hold_expira <= ahora` cuenta como LIBRE (RN-08). Datum no filtra: crm lista las colecciones completas con `limit` y `page` y agrega en el servidor. Crm no escribe en Datum (REQ-11).

## Fuera de este contrato

`liberar-holds` (cron) es opcional en el draft y no se contrata en la PoC (YAGNI): la liberación es efectiva por lectura (RN-08).
