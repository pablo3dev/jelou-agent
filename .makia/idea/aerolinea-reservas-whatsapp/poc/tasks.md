# Plan de tareas: Aerolínea DEMO: reservas por WhatsApp con pago y dashboard

> Ubicación: `.makia/idea/aerolinea-reservas-whatsapp/poc/tasks.md` (lo crea la etapa L de `poc`). Usa la gramática de `tasks.md` de MakIA (`makia task mark` funciona sobre ella) más cuatro campos por tarea que valida `makia check-plan`.

## 1. Metadata & Traceability
- **Idea:** `aerolinea-reservas-whatsapp`
- **Draft Ref:** `draft.md`

## 2. Reglas del plan
- Cada tarea pertenece a **exactamente una** unidad (`apps/<x>` o `extensions/<tipo>/<x>`).
- Tareas de unidades distintas corren en paralelo; las de una misma unidad, en serie (por número de tarea).
- `Rutas` queda dentro de la carpeta de la unidad. `Depende de` lista números de tarea o `—`.
- La primera tarea de cada unidad dependiente es el contrato que consume.
- `Spec` es el slug del spec al que pertenecerá la tarea: `<feature>-<unidad>`.

## 3. Phase Breakdown & Actionable Tasks

### Phase 1: Contratos y datos
- [x] **Task 1.1: Dominio y contrato de datos del dueño: `domain-model.md` en `.makia/docs/specs/apps/agent/`, `db-design.dbml` copiado sin cambios a `apps/agent/contract/`, migraciones de las 10 colecciones de Datum en `apps/agent/migrations/` (rutas, temporada, parametros, vuelos, reservas, pasajeros, equipaje, mascotas, transacciones, eventos_pago) y contrato de endpoints de functions (entrada zod, salida; solo `pago-notificacion` pública con HMAC); `.gitignore` con `.env`** `[DRAFT §Modelo de dominio]` `[DRAFT §Diseño de datos]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: —
  - Rutas: `apps/agent/contract/`, `apps/agent/migrations/`, `apps/agent/.gitignore`
- [x] **Task 1.2: Copia del contrato de apps/agent en `apps/pay/contract/` con hash verificable frente al original; `.gitignore` con `.env`** `[DRAFT §Carriles]` `[DRAFT §Arquitectura y stack técnico]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: 1.1
  - Rutas: `apps/pay/contract/`, `apps/pay/.gitignore`
- [x] **Task 1.3: Copia del contrato de apps/agent en `apps/crm/contract/` con hash verificable frente al original; `.gitignore` con `.env`** `[DRAFT §Carriles]` `[DRAFT §Arquitectura y stack técnico]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: 1.1
  - Rutas: `apps/crm/contract/`, `apps/crm/.gitignore`
- [x] **Task 1.4: Habilitación de arranque: `.gitattributes` con `eol=lf` para `.sh`, `.yaml`, `.js` y `Dockerfile`; `.env.example` con `PORT_CRM=3000`, `PORT_PAY=3001` y las variables `JELOU_TOKEN`, `JELOU_CLIENT_ID`, `JELOU_CLIENT_SECRET`, `JELOU_API_KEY`, `PAY_WEBHOOK_SECRET` y `DATABASE_ID` vacías, sin valores; `.gitignore` con `.env`** `[DRAFT §Stack técnico]` `[DRAFT §Estrategia de seguridad]`
  - Unidad: `apps/infrastructure`
  - Spec: `entorno-local-infrastructure`
  - Depende de: —
  - Rutas: `apps/infrastructure/`

### Phase 2: Implementación sin credenciales
- [x] **Task 2.1: Lógica pura de precios: tarifa por pasajero y trayecto desde `rutas.tarifa_base_cop` × temporada de `vuelos.fecha`; equipaje de bodega `ceil(max(peso, L·A·H/6000))` con mínimo 40000 y 12000 COP por kg, límites 158 cm, 32 kg y 1 pieza; mascota 150000 × temporada, ≤ 8 kg, 1 por reserva; redondeo por línea con `Math.round` y total como suma de líneas; tests `deno test`** `[REQ-02]` `[REQ-03]` `[REQ-04]` `[DRAFT §Reglas de negocio RN-01, RN-02, RN-04, RN-05, RN-07]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 1.1
  - Rutas: `apps/agent/functions/`
- [x] **Task 2.2: Lógica pura de asientos, exit row, PNR, hold y ventana: parseo `12A 12B` o `12A,12B`, validación contra las 174 claves del mapa, exit row solo con edad ≥ 15; PNR de 6 caracteres de `[A-Z2-9]` sin O, I, 0 ni 1; hold válido solo si RETENIDO y `hold_expira > ahora`; fechas entre 2026-12-01 y 2027-01-31; 1 a 9 pasajeros; tests `deno test`** `[REQ-01]` `[REQ-05]` `[DRAFT §Reglas de negocio RN-06, RN-08, RN-13, RN-14, RN-15]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 1.1
  - Rutas: `apps/agent/functions/`
- [x] **Task 2.3: Cliente REST de Datum y write-then-verify: `Authorization: Basic` con `JELOU_CLIENT_ID:JELOU_CLIENT_SECRET` en base64; listar, crear, actualizar y leer por id sobre `/v2/databases/{DATABASE_ID}/rows`; escritura de `vuelos.mapa_asientos` con `version + 1`, releer y verificar `hold_token` o `pnr` propios, 3 intentos con backoff, si falla 503 sin efecto parcial; tests con HTTP simulado** `[REQ-05]` `[EC-17]` `[DRAFT §Diseño de datos]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 1.1
  - Rutas: `apps/agent/functions/`
- [x] **Task 2.4: Functions de búsqueda y cotización: `rutas-listar`, `vuelos-buscar` (ida y vuelta dentro de la ventana), `cotizar` (pasaje, equipaje y mascotas) y `equipaje-calcular`; esquema zod de entrada con error 400 "Validation failed" antes del handler; `ctx.log` con el documento enmascarado; tests con cliente simulado** `[REQ-01]` `[REQ-02]` `[REQ-03]` `[DRAFT §Arquitectura y stack técnico]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.1, 2.3
  - Rutas: `apps/agent/functions/`
- [ ] **Task 2.5: Functions de asientos y transacción: `asientos-validar-retener` (validación completa, sin retención parcial, `hold_token` y `hold_expira` = ahora + 15 min) y `transaccion-crear` (reserva PENDIENTE_PAGO con PNR y `total_cop`; transacción PENDIENTE con `expira_at` = `hold_expira` y `execution_id` = `{{$context.executionId}}`; devuelve la PENDIENTE existente si la hay; responde `_id` y enlace de pago); tests con cliente simulado** `[REQ-05]` `[REQ-06]` `[EC-01]` `[EC-16]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.2, 2.3
  - Rutas: `apps/agent/functions/`
- [ ] **Task 2.6: Function `pago-notificacion`: `ctx.verifyHmac` sobre el cuerpo crudo con cabecera `X-Webhook-Signature` y `PAY_WEBHOOK_SECRET` antes de tocar datos (EC-05); idempotencia con `eventos_pago` por `id_evento` = `<transaccion_id>:<estado>`, registrado antes de aplicar el efecto (EC-04, EC-07); RN-10, RN-11 o RN-12 según PENDIENTE y `expira_at`; reanudación a `POST https://gateway.jelou.ai/workflows/v1/skills/resume` con `x-api-key: ${JELOU_API_KEY}`, `executionId`, `message` (paid, rejected o expired) y `pauseInteraction: false`; tests con cliente simulado** `[REQ-07]` `[REQ-08]` `[EC-03]` `[EC-06]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.3, 2.5
  - Rutas: `apps/agent/functions/`
- [ ] **Task 2.7: Seed de datos base en `apps/agent/seed/`: script Node 24 contra la REST de Datum que carga 6 rutas, 12 filas de temporada, 12 parámetros y 372 vuelos (salida 07:00, 174 asientos en LIBRE), idempotente por clave natural (ruta; número de vuelo), carga a ritmo bajo con backoff; tests con cliente simulado** `[REQ-12]` `[DRAFT §Diseño de datos]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 1.1, 2.3
  - Rutas: `apps/agent/seed/`
- [ ] **Task 2.8: Agente de Brain Studio en `apps/agent/workflow/`: nodo AI Agent con prompt, pestaña Tools con las functions de 2.4 a 2.6 y pestaña Pause interaction; workflow trayecto → pasajeros (1–9) → fechas de ida y vuelta → vuelos → por pasajero: equipaje → mascotas → asientos de ida y de vuelta → resumen y total → transacción → pago → PNR, fallo o expiración; el LLM solo pasa texto; enlace de pago en texto plano; sin plantillas HSM** `[REQ-01]` `[REQ-09]` `[REQ-10]` `[DRAFT §Solución propuesta]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.4, 2.5, 2.6
  - Rutas: `apps/agent/workflow/`
- [ ] **Task 2.9: Dockerfile del CLI: base `node:24.22.0-bookworm-slim`, `@jelou/cli` 4.13.1 instalado globalmente, usuario no root, healthcheck; sin `.env` en la imagen** `[DRAFT §Carriles]` `[DRAFT §Stack técnico]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: —
  - Rutas: `apps/agent/Dockerfile`
- [x] **Task 2.10: Servidor base de apps/pay: Express 5.3.0 sobre Node 24.22.0, puerto `PORT_PAY` (default 3001) desde `.env`, `GET /health`** `[DRAFT §Carriles]` `[DRAFT §Stack técnico]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: 1.2
  - Rutas: `apps/pay/src/`
- [x] **Task 2.11: Pay: lectura de la transacción por id desde Datum con la copia del contrato; página con el monto a pagar y botones aprobar y rechazar (mock); tests con cliente simulado** `[REQ-07]` `[DRAFT §Carriles]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: 1.2, 2.10
  - Rutas: `apps/pay/src/`
- [x] **Task 2.12: Pay: notificación a `pago-notificacion` con cuerpo `{"transaccion_id", "estado": "APROBADA" | "RECHAZADA", "event_id": "<transaccion_id>:<estado>", "emitido_at"}` y cabecera `X-Webhook-Signature: sha256=<hex>`, donde `<hex>` es HMAC-SHA256 del cuerpo crudo con `PAY_WEBHOOK_SECRET`; sin EXPIRADA; tests con receptor simulado** `[REQ-07]` `[DRAFT §Estrategia de seguridad]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: 2.11
  - Rutas: `apps/pay/src/`
- [x] **Task 2.13: Dockerfile de apps/pay: base `node:24.22.0-bookworm-slim`, usuario no root, healthcheck con CMD de Node contra `/health`** `[DRAFT §Carriles]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: —
  - Rutas: `apps/pay/Dockerfile`
- [x] **Task 2.14: Servidor base de apps/crm: Express 5.3.0 sobre Node 24.22.0, puerto `PORT_CRM` (default 3000) desde `.env`, `GET /health`, sirve HTML y JS estáticos** `[DRAFT §Carriles]` `[DRAFT §Stack técnico]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: 1.3
  - Rutas: `apps/crm/src/`
- [ ] **Task 2.15: Crm: endpoints JSON de solo lectura que leen Datum desde el servidor (vuelos, asientos vendidos por vuelo y destino, mapa de asientos de un vuelo, estadísticas); ninguna escritura a Datum; tests con cliente simulado** `[REQ-11]` `[DRAFT §Carriles]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: 1.3
  - Rutas: `apps/crm/src/`
- [ ] **Task 2.16: Crm: frontend estático con vistas de vuelos, asientos vendidos por vuelo y destino, mapa de asientos y estadísticas; Chart.js 4.5.1 cargado por CDN con versión fija** `[REQ-11]` `[DRAFT §Stack técnico]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: 2.15
  - Rutas: `apps/crm/public/`
- [x] **Task 2.17: Dockerfile de apps/crm: base `node:24.22.0-bookworm-slim`, usuario no root, healthcheck con CMD de Node contra `/health`** `[DRAFT §Carriles]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: —
  - Rutas: `apps/crm/Dockerfile`
- [ ] **Task 2.18: compose.yaml: `name: aerolinea-reservas-whatsapp`; servicios `crm` y `pay` con healthcheck CMD de Node contra `/health`; `agent-cli` con build context `../agent` y profile `tools`; red `reservas-net`; puertos publicados en `127.0.0.1` desde `.env`; verificar con `docker compose config --services` con el profile `tools`** `[DRAFT §Stack técnico]`
  - Unidad: `apps/infrastructure`
  - Spec: `entorno-local-infrastructure`
  - Depende de: 1.4, 2.9, 2.13, 2.17
  - Rutas: `apps/infrastructure/compose.yaml`
- [ ] **Task 2.19: README de arranque de apps/infrastructure: `docker compose up`, variables de `.env` a partir de `.env.example`, perfil `tools` y puertos** `[DRAFT §Stack técnico]`
  - Unidad: `apps/infrastructure`
  - Spec: `entorno-local-infrastructure`
  - Depende de: 2.18
  - Rutas: `apps/infrastructure/README.md`

### Phase 3: Datum en vivo (bloqueado por credenciales)
- [ ] **Task 3.1: BLOQUEADA POR CREDENCIALES (`JELOU_TOKEN`, `JELOU_CLIENT_ID`, `JELOU_CLIENT_SECRET`, `DATABASE_ID`, `JELOU_API_KEY` aún no disponibles). Spike go/no-go de Datum: auth y CRUD con curl (Basic, GET por id, POST, PUT) con códigos HTTP y cabeceras de límite de tasa; firma HMAC sobre cuerpo crudo con el header confirmado; `ctx.verifyHmac` en `jelou functions dev`; `functions check` en `node:24.22.0-bookworm-slim`; mensaje de texto por WhatsApp con el tipo confirmado; resultado go/no-go registrado en `apps/agent/spike/`** `[DRAFT §Recomendaciones de implementación]` `[DRAFT §Riesgos y mitigaciones]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.6, 2.9
  - Rutas: `apps/agent/spike/`
- [ ] **Task 3.2: BLOQUEADA POR CREDENCIALES. Despliegue en Datum: colecciones con `jelou databases collections create` desde `apps/agent/migrations/`; functions y workflow con `@jelou/cli` 4.13.1 en el contenedor del CLI** `[REQ-06]` `[DRAFT §Carriles]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.8, 3.1
  - Rutas: `apps/agent/migrations/`, `apps/agent/functions/`, `apps/agent/workflow/`
- [ ] **Task 3.3: BLOQUEADA POR CREDENCIALES. Carga del seed en Datum a ritmo bajo con backoff; verificar 6 rutas, 12 temporadas, 12 parámetros y 372 vuelos; una segunda ejecución no duplica filas** `[REQ-12]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 2.7, 3.2
  - Rutas: `apps/agent/seed/`
- [ ] **Task 3.4: BLOQUEADA POR CREDENCIALES. Conformidad de `db-design.dbml` con una base de prueba creada con `jelou databases create`; en verde** `[DRAFT §Estrategia de pruebas]`
  - Unidad: `apps/agent`
  - Spec: `reserva-pago-whatsapp-agent`
  - Depende de: 3.2
  - Rutas: `apps/agent/contract/`
- [ ] **Task 3.5: BLOQUEADA POR CREDENCIALES. Pay en vivo: transacción real leída por id desde Datum; notificación a `pago-notificacion` con HMAC aceptada, reanudación del agente verificada y evento duplicado respondido con 200 sin efecto** `[REQ-07]` `[REQ-08]`
  - Unidad: `apps/pay`
  - Spec: `reserva-pago-whatsapp-pay`
  - Depende de: 2.12, 2.13, 3.2
  - Rutas: `apps/pay/src/`
- [ ] **Task 3.6: BLOQUEADA POR CREDENCIALES. Dashboard en vivo con el seed cargado: muestra vuelos, asientos vendidos por vuelo y destino, mapa de asientos y estadísticas** `[REQ-11]`
  - Unidad: `apps/crm`
  - Spec: `dashboard-aerolinea-crm`
  - Depende de: 2.17, 3.3
  - Rutas: `apps/crm/src/`

### Phase 4: Arranque e integración
- [ ] **Task 4.1: BLOQUEADA POR CREDENCIALES. E2E único con `docker compose up` (proyecto `aerolinea-reservas-whatsapp`, healthchecks de `crm`, `pay` y `agent-cli` en verde): reserva de ida y vuelta con asientos, equipaje y mascota aprobada → PNR; rechazada → asientos libres; expiración → asientos libres; notificación duplicada ignorada; `git ls-files --eol` sin `i/crlf` en `.sh`, `.yaml`, `.js` y `Dockerfile`; hash del contrato de apps/agent igual en las copias de apps/pay y apps/crm** `[DRAFT §Estrategia de pruebas]` `[DRAFT §Criterios de aceptación / Definition of Done]`
  - Unidad: `apps/infrastructure`
  - Spec: `entorno-local-infrastructure`
  - Depende de: 2.18, 3.4, 3.5, 3.6
  - Rutas: `apps/infrastructure/`

---

## 4. Execution Progress Tracker
| Fase | Total Tareas | Completadas | Estado |
|:---|:---:|:---:|:---|
| **Phase 1: Contratos y datos** | 4 | 4 | `Done` |
| **Phase 2: Implementación sin credenciales** | 19 | 10 | `In Progress` |
| **Phase 3: Datum en vivo (bloqueado por credenciales)** | 6 | 0 | `Pending` |
| **Phase 4: Arranque e integración** | 1 | 0 | `Pending` |
| **Total Global** | **30** | **14** | **47%** |
