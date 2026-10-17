# Implementation Tasks: Dashboard de la aerolínea (solo lectura)

## 1. Metadata & Traceability
- **Spec:** `dashboard-aerolinea-crm`
- **Requirements Ref:** `requirements.md` (spec: `dashboard-aerolinea-crm`)
- **Design Ref:** `design.md` (spec: `dashboard-aerolinea-crm`)

`[P]`: puede ejecutarse en paralelo (archivos distintos, sin dependencias).

---

## 2. Execution Guidelines
- **Sequential Ordering:** ejecutar las fases en orden estricto; dentro de cada fase, las subtareas atómicas se completan antes de pasar a la siguiente.
- **Test-Verified:** cada funcionalidad debe tener su prueba correspondiente antes de marcarse `[x]`.
- **Traceability Tags:** cada tarea referencia su origen en `requirements.md` (ej. `[REQ-1.1]`) y su componente en `design.md` (ej. `[DESIGN §5]`).
- **Docker:** toda verificación se ejecuta en contenedor; en Git Bash anteponer `MSYS_NO_PATHCONV=1`. Los commits de este spec se listan con `git log --grep="^makia(dashboard-aerolinea-crm):"`.
- **Dependencia entre unidades:** `apps/agent` es dueña del contrato; su tarea 1.1 (contrato de datos y endpoints en `apps/agent/contract/`) precede a este spec (ver [reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/summary.md)).

---

## 3. Phase Breakdown & Actionable Tasks

### Phase 1: Contrato
- [x] **Task 1.3: Copia verificable del contrato en apps/crm** `[REQ-6.1, REQ-6.2]` `[DESIGN §3, §8.3]`
  - Archivos: `apps/crm/contract/CONTRACT.sha256`, `apps/crm/contract/verify-contract.sh`, `apps/crm/contract/db-design.dbml`, `apps/crm/contract/endpoints.md`.
  - Depende de: tarea 1.1 de `apps/agent` (contrato original en `apps/agent/contract/`).
  - Verificación: `MSYS_NO_PATHCONV=1 docker run --rm -v C:/repos/jelou-agent:/repo:ro -w /repo/apps/crm node:24.22.0-bookworm-slim sh contract/verify-contract.sh`. Divergencia: sin test `node:test` versionado; se ejecuta por comando.
  - Evidencia: commit `4179ab5`; el comando se ejecutó también en la verificación E2E.

### Phase 2: Implementación sin credenciales
- [x] **Task 2.14: Servidor base Express con /health y estáticos** `[REQ-5.1, REQ-5.2, REQ-5.3]` `[DESIGN §4.2, §5]`
  - Archivos: `apps/crm/.gitignore`, `apps/crm/.gitattributes`, `apps/crm/package.json`, `apps/crm/package-lock.json`, `apps/crm/src/config.js`, `apps/crm/src/app.js`, `apps/crm/src/server.js`, `apps/crm/tests/server.test.js`.
  - Depende de: 1.3.
  - Verificación: `MSYS_NO_PATHCONV=1 docker run --rm -v C:/repos/jelou-agent/apps/crm:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && node --test tests/server.test.js'` (5 pruebas).
  - Evidencia: commit `88dcf4c`; `tests/server.test.js` verde (`/health`, estáticos, 404, cabeceras de seguridad, puerto 3000 y `PORT_CRM`).
- [x] **Task 2.15: API JSON de solo lectura y cliente Datum** `[REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5, REQ-1.6, REQ-2.1, REQ-2.3, REQ-2.4, REQ-2.5, REQ-3.1, REQ-3.2, REQ-3.3, REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.4, REQ-4.5]` `[DESIGN §3.1, §4.1, §4.2, §7]`
  - Archivos: `apps/crm/src/datum.js`, `apps/crm/src/api.js`, `apps/crm/src/agregados.js`, `apps/crm/src/asientos.js`, `apps/crm/tests/fixtures.js`, `apps/crm/tests/api.test.js`, `apps/crm/tests/datum.test.js`, `apps/crm/README.md`.
  - Depende de: 2.14; tarea 1.1 de `apps/agent` (esquema y endpoints consumidos).
  - Verificación: `MSYS_NO_PATHCONV=1 docker run --rm -v C:/repos/jelou-agent/apps/crm:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && node --test tests/api.test.js tests/datum.test.js'` (14 + 9 pruebas).
  - Evidencia: commit `fad0325`; `tests/api.test.js` (contadores con holds vencidos como LIBRE, filtros, ventas por vuelo y destino, estadísticas, mapa de 174, 404, sin `hold_token`, 405, 502, 503, sin escrituras) y `tests/datum.test.js` verdes.
- [x] **Task 2.16: Frontend estático con vistas, i18n y formatos** `[REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5, REQ-2.2, REQ-2.3, REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4, REQ-4.3, REQ-5.3, REQ-5.4]` `[DESIGN §4.2 Frontend, §7.2]`
  - Archivos: `apps/crm/public/index.html`, `apps/crm/public/styles.css`, `apps/crm/public/js/main.js`, `apps/crm/public/js/api.js`, `apps/crm/public/js/dom.js`, `apps/crm/public/js/hash.js`, `apps/crm/public/js/i18n.js`, `apps/crm/public/js/format.js`, `apps/crm/public/js/charts.js`, `apps/crm/public/js/ui.js`, `apps/crm/public/js/seatmap-layout.js`, `apps/crm/public/js/views/resumen.js`, `apps/crm/public/js/views/vuelos.js`, `apps/crm/public/js/views/ventas.js`, `apps/crm/public/js/views/mapa.js`, `apps/crm/tests/frontend.test.js`, `apps/crm/tests/static.test.js`.
  - Depende de: 2.15.
  - Verificación: `MSYS_NO_PATHCONV=1 docker run --rm -v C:/repos/jelou-agent/apps/crm:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && node --test tests/frontend.test.js tests/static.test.js'` (7 pruebas de `static.test.js` más las de `frontend.test.js`).
  - Evidencia: commit `bfe00fc`; `tests/frontend.test.js` (layout de 174, bloques 2+2 y 3+3, filas 13-14, formateadores, filtros y orden, i18n) y `tests/static.test.js` (Chart.js 4.5.1, sin estilos inline ni `innerHTML`, solo GET) verdes.
- [x] **Task 2.17: Dockerfile sin root con healthcheck** `[REQ-5.1, REQ-5.2]` `[DESIGN §4.2 Estáticos y arranque, §5, §7.2]`
  - Archivos: `apps/crm/Dockerfile`, `apps/crm/.dockerignore`.
  - Depende de: 2.14, 2.16.
  - Verificación: `docker build -t crm C:/repos/jelou-agent/apps/crm`.
  - Evidencia: commit `d7c2fa0`; imagen `node:24.22.0-bookworm-slim`, usuario 1000:1000, HEALTHCHECK con Node, copia solo `package*.json`, `src/` y `public/`.

### Phase 3: Datum en vivo
- [x] **Task 3.6: Dashboard en vivo con el seed cargado (Datum v2)** `[REQ-1.2, REQ-2.1, REQ-3.1]` `[DESIGN §4.1, §8.3]`
  - Archivos: `apps/crm/README.md`.
  - Depende de: 2.15, 2.16, 2.17; tarea 1.1 de `apps/agent` (contrato) y seed cargado en Datum (372 vuelos).
  - Verificación: `docker build -t crm C:/repos/jelou-agent/apps/crm` y `docker run --rm -p 127.0.0.1:3000:3000 -e DATUM_URL -e DATUM_API_KEY crm` (consulta de `/api/estadisticas` y `/api/vuelos` contra Datum).
  - Evidencia: commit `9567994` (registrado bajo el slug `aerolinea-reservas-whatsapp`, no bajo `dashboard-aerolinea-crm`); cliente migrado a Datum v2 (`X-Api-Key`, `/collections/{c}/records`), 372 vuelos leídos.

---

## 4. Execution Progress Tracker
| Fase | Total Tareas | Completadas | Estado |
|:---|:---:|:---:|:---|
| **Phase 1: Contrato** | 1 | 1 | `Done` |
| **Phase 2: Implementación sin credenciales** | 4 | 4 | `Done` |
| **Phase 3: Datum en vivo** | 1 | 1 | `Done` |
| **Total Global** | **6** | **6** | **100%** |

---

## 5. Definition of Done (DoD) Gate
- [x] Todas las tareas están marcadas como completadas (`[x]`).
- [ ] Todos los criterios EARS de `requirements.md` pasan las pruebas asociadas: REQ-01 a REQ-05 con 47 pruebas verdes (2026-10-16); REQ-06 se verifica por comando, sin test `node:test` versionado (divergencia declarada).
- [x] La estructura de archivos coincide con el mapeo de `design.md` §5.
- [x] Los tests unitarios y de integración de `apps/crm` pasan (47 verdes); el E2E con Docker Compose lo cubre la integración de `apps/infrastructure`.
- [ ] La fila del spec en el `INDEX.md` de specs (`.makia/docs/specs/apps/crm/INDEX.md`) está sincronizada con el `Estado global` de `summary.md`.
- [ ] AUDIT pendiente (lo ejecuta el DEPLOY).

---

> IMPLEMENT ejecuta este documento tarea por tarea. Cada tarea se valida con un TEST acotado a sus propios archivos (no la suite completa) antes de marcarse `[x]`. Máximo 2 iteraciones de corrección por tarea antes de cancelar y escalar (ver sub-orchestrator.md del Orquestador).
