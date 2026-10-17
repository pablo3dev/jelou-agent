# Implementation Tasks: Pasarela de pago simulada (apps/pay)

## 1. Metadata & Traceability
- **Spec:** `reserva-pago-whatsapp-pay`
- **Requirements Ref:** `requirements.md` (spec: `reserva-pago-whatsapp-pay`)
- **Design Ref:** `design.md` (spec: `reserva-pago-whatsapp-pay`)

`[P]`: puede ejecutarse en paralelo (archivos distintos, sin dependencias).

Comando base de verificación (Docker; en Git Bash anteponer `MSYS_NO_PATHCONV=1`). Para acotar una tarea se añade `-- src/<archivo>.test.js` a `npm test`:

```
docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test'
```

La tarea 1.1 de la unidad `apps/agent` es la copia fuente del contrato: [tasks.md de reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/tasks.md).

---

## 2. Execution Guidelines
- **Sequential Ordering:** ejecutar las fases en orden estricto; dentro de cada fase, las subtareas atómicas se completan antes de pasar a la siguiente.
- **Test-Verified:** cada funcionalidad debe tener su prueba correspondiente antes de marcarse `[x]`.
- **Traceability Tags:** cada tarea referencia su origen en `requirements.md` (ej. `[REQ-1.1]`) y su componente en `design.md` (ej. `[DESIGN §5]`).

---

## 3. Phase Breakdown & Actionable Tasks

### Phase 1: Contrato
- [x] **Task 1.2: Copia del contrato de apps/agent con huella verificable** `[REQ-4.1, REQ-4.2, REQ-4.3]` `[DESIGN §5]` `[DESIGN §8.3]`
  - Archivos: `apps/pay/contract/CONTRACT.sha256`, `apps/pay/contract/db-design.dbml`, `apps/pay/contract/endpoints.md`, `apps/pay/.gitignore`
  - Depende de: Task 1.1 de `apps/agent` (contrato original en `apps/agent/contract/`).
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay/contract:/c:ro node:24.22.0-bookworm-slim sh -c 'cd /c && sha256sum -c CONTRACT.sha256'` (sin diferencias). No hay test versionado en `apps/pay` (divergencia declarada en `requirements.md` REQ-04).
  - Evidencia: commit `105989c`; `git log --grep="^makia(reserva-pago-whatsapp-pay):"`; comprobación de huella ejecutada con resultado correcto en la verificación E2E de infraestructura.

### Phase 2: Implementación sin credenciales
- [x] **Task 2.10: Servidor base Express con /health y puerto configurable** `[REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4]` `[DESIGN §4.1]` `[DESIGN §4.2]` `[DESIGN §5]`
  - Archivos: `apps/pay/src/app.js`, `apps/pay/src/server.js`, `apps/pay/package.json`, `apps/pay/package-lock.json`, `apps/pay/src/app.test.js`
  - Depende de: Task 1.2.
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test -- src/app.test.js'` (4 pruebas verdes).
  - Evidencia: commit `f725d1e`; `git log --grep="^makia(reserva-pago-whatsapp-pay):"`; `app.test.js` (4 verdes el 2026-10-16).
  - Nota: `package-lock.json` pertenece a esta tarea y la tabla de §5 de `design.md` debe listarlo.

- [x] **Task 2.11: Lectura de transacción desde Datum y página de pago mock** `[REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5, REQ-1.6, REQ-1.7]` `[DESIGN §3.1]` `[DESIGN §4.2]` `[DESIGN §7.2]`
  - Archivos: `apps/pay/src/datum.js`, `apps/pay/src/pagina.js`, `apps/pay/src/datum.test.js`, `apps/pay/src/pagar.test.js`
  - Depende de: Task 2.10.
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test -- src/datum.test.js src/pagar.test.js'` (4 + 8 pruebas verdes).
  - Evidencia: commit `3546c04`; `git log --grep="^makia(reserva-pago-whatsapp-pay):"`; `datum.test.js` (4) y `pagar.test.js` (8) verdes el 2026-10-16.

- [x] **Task 2.12: Notificación firmada a pago-notificacion** `[REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5, REQ-2.6, REQ-2.7, REQ-2.8, REQ-2.9, REQ-2.10]` `[DESIGN §4.2]` `[DESIGN §7.1]` `[DESIGN §7.2]`
  - Archivos: `apps/pay/src/notificacion.js`, `apps/pay/src/notificacion.test.js`
  - Depende de: Task 2.11.
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test -- src/notificacion.test.js'` (10 pruebas verdes).
  - Evidencia: commit `331cfb3`; `git log --grep="^makia(reserva-pago-whatsapp-pay):"`; `notificacion.test.js` (10) verdes el 2026-10-16.

- [x] **Task 2.13: Dockerfile no root con healthcheck, .dockerignore y .gitattributes** `[REQ-3.1, REQ-3.3]` `[DESIGN §5]` `[DESIGN §7.2]`
  - Archivos: `apps/pay/Dockerfile`, `apps/pay/.dockerignore`, `apps/pay/.gitattributes`
  - Depende de: Task 2.10.
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test -- src/app.test.js'` (comportamiento de `/health` y puerto que consume el `HEALTHCHECK`). La construcción de la imagen y su healthcheck se ejercitaron en la verificación E2E de infraestructura.
  - Evidencia: commit `0266bac`; `git log --grep="^makia(reserva-pago-whatsapp-pay):"`.

### Phase 3: Datum en vivo
- [x] **Task 3.5: Pay en vivo con cliente Datum v2** `[REQ-1.1, REQ-1.5, REQ-2.1, REQ-2.2, REQ-2.4, REQ-2.7]` `[DESIGN §4.2]` `[DESIGN §8.3]`
  - Archivos: `apps/pay/src/datum.js`, `apps/pay/src/datum.test.js` (cliente con `X-Api-Key` y `/collections/{c}/records/{id}`).
  - Depende de: Tasks 2.11 y 2.12; función pública `pago-notificacion` de `apps/agent` (contrato de la Task 1.1 de `apps/agent`) y Datum v2 con credenciales.
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/pay:/src:ro node:24.22.0-bookworm-slim sh -c 'mkdir /w && cd /src && tar cf - --exclude=./node_modules . | tar xf - -C /w && cd /w && npm ci && npm test -- src/datum.test.js'` (4 verdes) más la verificación en vivo.
  - Evidencia: commit `6e84bf0` (registrado bajo el slug de la idea `aerolinea-reservas-whatsapp`); `git log --grep="^makia(reserva-pago-whatsapp-pay):"`. En vivo: transacción real leída por id, notificación HMAC aceptada, evento duplicado respondido `200 DUPLICADO` sin efecto y firma inválida rechazada con `401`. La reanudación del agente se verificó en el E2E de infraestructura.

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
- [x] Todos los criterios EARS de `requirements.md` pasan las pruebas asociadas. (REQ-01 a REQ-03: 26 pruebas verdes el 2026-10-16. REQ-04: verificación por comando `sha256sum -c`, sin prueba versionada; divergencia declarada.)
- [x] La estructura de archivos coincide con el mapeo de `design.md`.
- [x] Todos los tests unitarios, de integración y E2E pasan sin advertencias críticas.
- [x] La fila del spec en el `INDEX.md` de specs (`.makia/docs/specs/<categoría>/INDEX.md`) está sincronizada con el `Estado global` de `summary.md`.
- [x] AUDIT ejecutado: ciclo 1, `PASA_CON_OBSERVACIONES` (2026-10-17); sin hallazgos y con observaciones no bloqueantes (ver `audit.md`).

---

> IMPLEMENT ejecuta este documento tarea por tarea. Cada tarea se valida con un TEST acotado a sus propios archivos (no la suite completa) antes de marcarse `[x]`. Máximo 2 iteraciones de corrección por tarea antes de cancelar y escalar (ver sub-orchestrator.md del Orquestador).
