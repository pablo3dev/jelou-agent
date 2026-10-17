# Implementation Tasks: Entorno local de la aerolínea DEMO (Docker Compose)

## 1. Metadata & Traceability
- **Spec:** `entorno-local-infrastructure`
- **Requirements Ref:** `requirements.md` (spec: `entorno-local-infrastructure`)
- **Design Ref:** `design.md` (spec: `entorno-local-infrastructure`)

`[P]`: puede ejecutarse en paralelo (archivos distintos, sin dependencias).

---

## 2. Execution Guidelines
- **Sequential Ordering:** ejecutar las fases en orden estricto; dentro de cada fase, las subtareas atómicas se completan antes de pasar a la siguiente.
- **Test-Verified:** esta unidad no tiene suite automatizada versionada; cada tarea se verifica con un comando determinista (tareas 1.4, 2.18 y 2.19) o con el recorrido E2E manual con evidencia (tarea 4.1) antes de marcarse `[x]`.
- **Traceability Tags:** cada tarea referencia su origen en `requirements.md` (ej. `[REQ-1.1]`) y su componente en `design.md` (ej. `[DESIGN §5]`).
- **Dependencias cross-unidad:** la unidad `apps/infrastructure` integra las otras tres; las tareas `Depende de:` nombran tareas de `apps/agent`, `apps/pay` y `apps/crm` (sus propios `tasks.md`).
- **Comandos Docker en Git Bash:** anteponer `MSYS_NO_PATHCONV=1` cuando el comando monte rutas de Windows.

---

## 3. Phase Breakdown & Actionable Tasks

### Phase 1: Habilitación de arranque
- [x] **Task 1.4: Habilitación de arranque (fin de línea LF, plantilla `.env.example` y exclusión de `.env`)** `[REQ-2.1, REQ-2.2, REQ-2.4, REQ-3.1, REQ-3.2, REQ-3.3]` `[DESIGN §4.1, §5, §7.2, §8.1]`
  - Archivos: `apps/infrastructure/.gitattributes`, `apps/infrastructure/.env.example`, `apps/infrastructure/.gitignore`
  - Depende de: ninguna.
  - Verificación: `git check-ignore -v apps/infrastructure/.env` (devuelve la regla de `apps/infrastructure/.gitignore`) y `git ls-files --eol` (ningún archivo `.sh`, `.yaml`, `.yml`, `.js` ni `Dockerfile` con `i/crlf`); revisión de `.env.example` (solo nombres de variable; traen valor únicamente los puertos 3000/3001, `PAY_PUBLIC_URL`, `CRM_PUBLIC_URL` y `PAGO_NOTIFICACION_URL`, ninguno sensible).
  - Evidencia: commit 1087e5d; resultados de TEST 2026-10-16 (salida 0): `.env` ignorado por `apps/infrastructure/.gitignore`; `git ls-files --eol` 54 archivos, 0 con `i/crlf` (53 en el E2E: cambió el conjunto de archivos versionados, no es un fallo); `.env.example` sin valores sensibles. Historial: `git log --grep="^makia(entorno-local-infrastructure):"`.

### Phase 2: Compose y README
- [x] **Task 2.18: `compose.yaml` con servicios `crm`, `pay` y `agent-cli`** `[REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5, REQ-2.1, REQ-2.3]` `[DESIGN §2.1, §2.2, §4.1, §7.1]`
  - Archivos: `apps/infrastructure/compose.yaml`
  - Depende de: Task 1.4 (variables y `.env`); Task 2.9 de `apps/agent` (imagen de `agent-cli`); Task 2.13 de `apps/pay` (imagen de `pay`); Task 2.17 de `apps/crm` (imagen de `crm`).
  - Verificación: `docker compose --profile tools config --services` desde `apps/infrastructure` (debe listar `agent-cli`, `crm` y `pay`) y `docker compose --env-file .env.example config -q`.
  - Evidencia: commits 53c12b6 (compose con nombre `aerolinea-reservas-whatsapp`, red `reservas-net`, puertos en `127.0.0.1`, healthcheck Node, perfil `tools`) y 5e31321 (ajuste: `DATUM_URL` y `DATUM_API_KEY` para `crm` y `pay`; se quitan `JELOU_CLIENT_*` y `DATABASE_ID` de esos servicios); resultado de TEST 2026-10-16 (salida 0): lista `agent-cli`, `crm` y `pay`. Historial: `git log --grep="^makia(entorno-local-infrastructure):"`.

- [x] **Task 2.19: README de arranque** `[REQ-1.2, REQ-1.3, REQ-1.5, REQ-2.2, REQ-2.3, REQ-5.6]` `[DESIGN §2.6, §4.2, §7.1, §8.3]`
  - Archivos: `apps/infrastructure/README.md`
  - Depende de: Task 2.18.
  - Verificación: revisión del contenido de `apps/infrastructure/README.md` contra `compose.yaml` y `.env.example` (servicios, `cp .env.example .env`, tabla de variables con el servicio que las consume, arranque `docker compose up --build -d`, apagado `docker compose down`, CLI `docker compose --profile tools run --rm agent-cli <comando>`, seguridad) y `docker compose --profile tools config --services`.
  - Evidencia: commit 6691ac5; el arranque descrito en el README se ejecutó en la Task 4.1. Historial: `git log --grep="^makia(entorno-local-infrastructure):"`.

### Phase 4: Arranque e integración
- [x] **Task 4.1: E2E único con `docker compose up`** `[REQ-1.2, REQ-1.3, REQ-3.1, REQ-4.1, REQ-4.2, REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5]` `[DESIGN §8.1, §8.2, §8.3]`
  - Archivos: `apps/infrastructure/compose.yaml` (entorno del E2E; sin cambios propios de esta tarea más allá de los de la Task 2.18).
  - Depende de: Tasks 1.4, 2.18 y 2.19; Task 3.4 de `apps/agent`; Task 3.5 de `apps/pay`; Task 3.6 de `apps/crm`.
  - Verificación: verificación manual E2E con evidencia (no hay script versionado) más estos comandos deterministas: `docker compose --profile tools config --services`, `docker compose ps` (`crm` y `pay` en `healthy`), `git ls-files --eol` y `sha256sum -c CONTRACT.sha256` en el directorio del contrato de `apps/agent`, `apps/pay` y `apps/crm` (OK en las tres; `CONTRACT.sha256` idéntico, y `db-design.dbml` y `endpoints.md` con el mismo sha256 en las tres copias).
  - Evidencia (2026-10-16; commits 1d3cc35, 289e60f, d257860, 631350d):
    - Ida y vuelta BOG-MDE 2026-12-10/14, 2 pasajeros, asientos 12A/12B, 1 maleta de bodega y 1 perro: total COP 2.639.000; asientos RETENIDO a VENDIDO con PNR, reserva EMITIDA, transacción APROBADA (REQ-5.1).
    - Rechazada: asiento 14A LIBRE, reserva PAGO_RECHAZADO (REQ-5.2).
    - Expiración (15 minutos reales): asientos LIBRE, reserva EXPIRADA, el agente avisa (REQ-5.3).
    - Duplicada: 200 DUPLICADO; RECHAZADA tras APROBADA: SIN_EFECTO (REQ-5.4).
    - Dashboard `crm`: 6 vendidos e ingresos COP 3.549.000, igual a la suma de las 3 reservas EMITIDA (REQ-5.5).
    - `git ls-files --eol`: 53 archivos `i/lf w/lf` en el E2E (TEST 2026-10-16: 54 archivos, 0 con `i/crlf`) (REQ-3.1).
    - `CONTRACT.sha256` idéntico y `sha256sum -c` OK en `apps/agent`, `apps/pay` y `apps/crm` (REQ-4.1, REQ-4.2).
    - `crm` y `pay` en `healthy` tras `docker compose up` (REQ-1.2); `agent-cli` no arranca sin el perfil `tools` (REQ-1.3).
    - Reverificación independiente por canal sandbox de WhatsApp (`jelou test send`): total COP 2.483.000, aprobar con PNR, rechazar con asientos libres, expiración con asientos libres, duplicada con DUPLICADO.
    - Datos de prueba eliminados; seed con su contenido base.
    - Commits relacionados bajo el identificador de la idea: 53c12b6, 5e31321, 6691ac5, 1d3cc35, 289e60f, d257860, 631350d. Historial del spec: `git log --grep="^makia(entorno-local-infrastructure):"`.
    - **NO verificado:** (1) mensaje real desde un teléfono (falta agregar el teléfono como probador del sandbox); (2) la mascota se cotiza solo en la ida; (3) respuestas 503 y 422 al notificar muy tarde una ejecución inactiva; (4) la señal de reanudación al agente viaja como texto; (5) el E2E no está automatizado como script versionado.

---

## 4. Execution Progress Tracker
| Fase | Total Tareas | Completadas | Estado |
|:---|:---:|:---:|:---|
| **Phase 1: Habilitación de arranque** | 1 | 1 | `Done` |
| **Phase 2: Compose y README** | 2 | 2 | `Done` |
| **Phase 4: Arranque e integración** | 1 | 1 | `Done` |
| **Total Global** | **4** | **4** | **100%** |

---

## 5. Definition of Done (DoD) Gate
- [x] Todas las tareas están marcadas como completadas (`[x]`).
- [ ] Todos los criterios EARS de `requirements.md` pasan las pruebas asociadas. REQ-01 a REQ-04 verificados por comando; REQ-05 en divergencia (E2E manual, sin script versionado ni envío real desde un teléfono).
- [x] La estructura de archivos coincide con el mapeo de `design.md` (los archivos y carpetas de §5).
- [ ] Todos los tests unitarios, de integración y E2E pasan sin advertencias críticas. No hay suite automatizada en esta unidad; los comandos de verificación terminaron con salida 0 y el E2E manual quedó registrado. AUDIT ejecutado: ciclo 1, `PASA_CON_OBSERVACIONES` (2026-10-17).
- [x] La fila del spec en el `INDEX.md` de specs (`.makia/docs/specs/<categoría>/INDEX.md`) está sincronizada con el `Estado global` de `summary.md`.

---

> IMPLEMENT ejecuta este documento tarea por tarea. Cada tarea se valida con un TEST acotado a sus propios archivos (no la suite completa) antes de marcarse `[x]`. Máximo 2 iteraciones de corrección por tarea antes de cancelar y escalar (ver sub-orchestrator.md del Orquestador).
