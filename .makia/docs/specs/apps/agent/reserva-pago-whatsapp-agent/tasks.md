# Implementation Tasks: Reserva y pago por WhatsApp (agente, functions y datos base)

## 1. Metadata & Traceability
- **Spec:** `reserva-pago-whatsapp-agent`
- **Requirements Ref:** `requirements.md` (spec: `reserva-pago-whatsapp-agent`)
- **Design Ref:** `design.md` (spec: `reserva-pago-whatsapp-agent`)

`[P]`: puede ejecutarse en paralelo (archivos distintos, sin dependencias).

Convenciones de este documento:
- Las rutas de `Archivos:` son relativas a `apps/agent/`; las de `functions/` se abrevian sin ese prefijo cuando se indica.
- Historial completo del spec: `git log --grep="^makia(reserva-pago-whatsapp-agent):"`. Los commits `d257860` y `631350d` están bajo el slug de la idea (`aerolinea-reservas-whatsapp`) y se citan por hash.
- Comandos de verificación: se ejecutan en contenedor; en Git Bash se antepone `MSYS_NO_PATHCONV=1`. Pruebas de functions (110 verdes el 2026-10-16): `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net <ruta del test>`.

---

## 2. Execution Guidelines
- **Sequential Ordering:** ejecutar las fases en orden estricto; dentro de cada fase, las subtareas atómicas se completan antes de pasar a la siguiente.
- **Test-Verified:** cada funcionalidad debe tener su prueba correspondiente antes de marcarse `[x]`.
- **Traceability Tags:** cada tarea referencia su origen en `requirements.md` (ej. `[REQ-1.1]`) y su componente en `design.md` (ej. `[DESIGN §5]`).

---

## 3. Phase Breakdown & Actionable Tasks

### Phase 1: Contratos y datos
- [x] **Task 1.1: Dominio y contrato de datos del dueño (db-design.dbml, migraciones, endpoints.md, .gitignore)** `[REQ-12.1, REQ-06, REQ-07]` `[DESIGN §3.2, §4.2]`
  - Archivos: `.gitignore`, `contract/db-design.dbml`, `contract/endpoints.md`, `contract/CONTRACT.sha256`, `migrations/01-rutas.sh` a `migrations/10-eventos_pago.sh` (10 archivos), `migrations/apply.sh`, `migrations/README.md`. El modelo de dominio es `.makia/docs/specs/apps/agent/domain-model.md`.
  - Depende de: —
  - Verificación: manual (migraciones son scripts del CLI contra Datum real; se comprueban en la tarea 3.2 y 3.4). El contrato se valida con `docker run --rm -v C:/repos/jelou-agent/apps/agent:/app -w /app node:24.22.0-bookworm-slim sh -c 'cd contract && node --test'` (9 verdes, comparador del REQ-12).
  - Evidencia: commit `716543d`.

### Phase 2: Implementación sin credenciales
- [x] **Task 2.1: Lógica pura de precios (tarifa, temporada, bodega, mascota, total)** `[REQ-02, REQ-03, REQ-04]` `[DESIGN §4.2, §7.1]`
  - Archivos: `functions/lib/precios.ts`, `functions/lib/precios_test.ts`
  - Depende de: 1.1
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net lib/precios_test.ts`
  - Evidencia: commit `d9e892c`; tests de `lib/precios_test.ts`: «temporada», «pasaje», «total: suma de lineas ya redondeadas», «peso volumetrico», «bodega: minimo...», «bodega: limites...», «bodega: entradas invalidas», «mascota: <= 8 kg, 1 por reserva, 150000 x temporada».
- [x] **Task 2.2: Lógica pura de asientos, exit row, PNR, hold y ventana de fechas** `[REQ-01, REQ-05]` `[DESIGN §4.2, §7.1]`
  - Archivos: `functions/lib/asientos.ts`, `functions/lib/asientos_test.ts`, `functions/lib/hold.ts`
  - Depende de: 1.1
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net lib/asientos_test.ts`
  - Evidencia: commit `cc2e734`; 10 tests de `lib/asientos_test.ts`, entre ellos «ventana: 2026-12-01..2027-01-31 inclusive» y «pasajeros: 1 a 9».
- [x] **Task 2.3: Cliente REST de Datum y write-then-verify** `[REQ-05, REQ-5.5]` `[DESIGN §4.1, §7.1]`
  - Archivos: `functions/lib/datum.ts`, `functions/lib/datum_test.ts`, `functions/lib/datum_simulado.ts`
  - Depende de: 1.1
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net lib/datum_test.ts`
  - Evidencia: commits `7c33b4f` (cliente inicial) y `faf8175` (reescrito a Datum v2 PocketBase). Tests críticos de `lib/datum_test.ts`: «write-then-verify: éxito al primer intento con version + 1 (colección vuelos, PATCH)», «write-then-verify: relectura no coincide (otro escritor pisó) y el reintento tiene éxito», «write-then-verify: conflicto de negocio en el reintento (asiento ya tomado) sube sin ser 503», «write-then-verify: agotamiento de 3 intentos lanza DatumNoDisponible (503) con backoff», «write-then-verify: errores HTTP de Datum cuentan como intento y agotan en 503; deshacer revierte marcas propias». Suite completa: `110 passed, 0 failed` (2026-10-16).
- [x] **Task 2.4: Functions de lectura rutas-listar, vuelos-buscar, cotizar y equipaje-calcular, con lib de soporte** `[REQ-01, REQ-02, REQ-03, REQ-04]` `[DESIGN §2.1, §4.2]`
  - Archivos: `functions/deno.json`, `functions/jelou.json`, `functions/.gitignore`, `functions/rutas-listar/index.ts`, `functions/rutas-listar/logica.ts`, `functions/rutas-listar/logica_test.ts`, `functions/vuelos-buscar/index.ts`, `functions/vuelos-buscar/logica.ts`, `functions/vuelos-buscar/logica_test.ts`, `functions/cotizar/index.ts`, `functions/cotizar/logica.ts`, `functions/cotizar/logica_test.ts`, `functions/equipaje-calcular/index.ts`, `functions/equipaje-calcular/logica.ts`, `functions/equipaje-calcular/logica_test.ts`, `functions/lib/catalogo.ts`, `functions/lib/esquemas.ts`, `functions/lib/enmascarar.ts`, `functions/lib/enmascarar_test.ts`, `functions/lib/errores.ts`, `functions/lib/http.ts`, `functions/lib/http_test.ts`
  - Depende de: 2.1, 2.2, 2.3
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net rutas-listar/logica_test.ts vuelos-buscar/logica_test.ts cotizar/logica_test.ts equipaje-calcular/logica_test.ts lib/enmascarar_test.ts lib/http_test.ts`
  - Evidencia: commit `e6be68c`; tests: `rutas-listar/logica_test.ts` (2), `vuelos-buscar/logica_test.ts` (8), `cotizar/logica_test.ts` (5), `equipaje-calcular/logica_test.ts` (6).
- [x] **Task 2.5: Functions de efecto asientos-validar-retener y transaccion-crear** `[REQ-05, REQ-06, REQ-10]` `[DESIGN §4.2, §7.2]`
  - Archivos: `functions/asientos-validar-retener/index.ts`, `functions/asientos-validar-retener/logica.ts`, `functions/asientos-validar-retener/logica_test.ts`, `functions/transaccion-crear/index.ts`, `functions/transaccion-crear/logica.ts`, `functions/transaccion-crear/logica_test.ts`, `functions/lib/reservas.ts`
  - Depende de: 2.4
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net asientos-validar-retener/logica_test.ts transaccion-crear/logica_test.ts`
  - Evidencia: commit `259d727`; `asientos-validar-retener/logica_test.ts` (10) y `transaccion-crear/logica_test.ts` (13, incluye «crea reserva PENDIENTE_PAGO con PNR y total, transacción PENDIENTE y enlace de pago»).
- [x] **Task 2.6: Function pública pago-notificacion (seguridad HMAC, idempotencia, expiración, reanudación)** `[REQ-07, REQ-08]` `[DESIGN §4.2, §7.2]`
  - Archivos: `functions/index.ts`, `functions/pago-notificacion/index.ts`, `functions/pago-notificacion/logica.ts`, `functions/pago-notificacion/logica_test.ts`
  - Depende de: 2.3, 2.5
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net pago-notificacion/logica_test.ts`
  - Evidencia: commit `c829bf9`; 22 tests de `pago-notificacion/logica_test.ts`. Tests críticos: «CRITICA seguridad: firma inválida o ausente => 401 y cero lecturas, escrituras y reanudaciones», «CRITICA seguridad: la verificación de firma ocurre antes de tocar Datum (orden)», «CRITICA expiración (RN-12, EC-03): APROBADA después de expira_at => EXPIRADA, libera, resume 'expired'», «CRITICA idempotencia (EC-04): evento duplicado => 200 DUPLICADO sin efecto y un solo resume», «CRITICA EC-07: APROBADA después de RECHAZADA no reabre la reserva ni los asientos», «CRITICA reanudación: URL, cabecera x-api-key y cuerpo exactos», «CRITICA secreto no logueado: ni logs ni mensajes de error contienen el secreto, la API key ni la firma», «CRITICA idempotencia atómica: dos entregas simultáneas del mismo evento => una APLICADO y una DUPLICADO, un solo resume». Suite completa: `110 passed, 0 failed` (2026-10-16).
- [x] **Task 2.7: Seed idempotente de datos base** `[REQ-11]` `[DESIGN §3.2, §7.2]`
  - Archivos: `seed/seed.mjs`, `seed/cargar.mjs`, `seed/cliente.mjs`, `seed/datos.mjs`, `seed/package.json`, `seed/seed.test.mjs`
  - Depende de: 1.1
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent:/app -w /app node:24.22.0-bookworm-slim sh -c 'cd seed && node --test'` (18 verdes)
  - Evidencia: commits `69ae9cf` y `853d89c`; 18 tests de `seed/seed.test.mjs`.
- [x] **Task 2.8: Agente de Brain Studio (prompt, generadores y workflow real)** `[REQ-09, REQ-10, REQ-9.1, REQ-9.2, REQ-10.1]` `[DESIGN §2.1, §4.2]`
  - Archivos: `workflow/agent.prompt.md`, `workflow/generar-tools.mjs`, `workflow/generar-brain.mjs`, `brain/jelou.yml`, `brain/jelou.lock`, `brain/.gitignore`, `brain/.vscode/settings.json`, `brain/tools/.schema.json`, `brain/tools/rutas-listar.json`, `brain/tools/vuelos-buscar.json`, `brain/tools/cotizar.json`, `brain/tools/equipaje-calcular.json`, `brain/tools/asientos-validar-retener.json`, `brain/tools/transaccion-crear.json`, `brain/workflows/.schema.json`, `brain/workflows/mi-primer-workflow.whatsapp.json`. Obsoletos (divergencia vigente, no parte del diseño, sin modificar ni borrar): `workflow/workflow.json`, `workflow/validar.mjs`, `workflow/README.md`.
  - Depende de: 2.4, 2.5
  - Verificación: manual (sin test automatizado para REQ-09 ni para la entrega del enlace de REQ-10): regenerar con `node workflow/generar-tools.mjs` y `node workflow/generar-brain.mjs` (cwd `apps/agent`) y E2E en WhatsApp con el canal sandbox. La construcción del enlace tiene test: `docker run --rm -v C:/repos/jelou-agent/apps/agent/functions:/app -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net transaccion-crear/logica_test.ts`.
  - Evidencia: commits `fd236ae`, `924a983`, `d257860` (paso 10 del prompt acepta la señal de reanudación envuelta; E2E aprobada, rechazada, expirada y duplicada) y `631350d` (transaccion-crear sin `action: pause`; prompt cotiza y resume en el mismo turno; verificado el mensaje con el enlace de pago y la reanudación `paid`). E2E manual: `1d3cc35`, `289e60f`.
- [x] **Task 2.9: Dockerfile del CLI de Jelou y archivos de contexto** `[REQ-12.2]` `[DESIGN §3.2, §7.2]`
  - Archivos: `Dockerfile`, `.dockerignore`, `.gitattributes`
  - Depende de: 1.1
  - Verificación: manual: construir la imagen (`docker build -t jelou-cli apps/agent`) y ejecutar el CLI en contenedor; el uso en vivo queda evidenciado en las tareas 3.1 a 3.4.
  - Evidencia: commits `aba7ebe` y `59e6dbd`.

### Phase 3: Datum en vivo
- [x] **Task 3.1: Spike go/no-go contra Datum real** `[REQ-07]` `[DESIGN §3.2, §4.2]`
  - Archivos: `spike/RESULTADO.md`, `spike/datum-crud.sh`, `spike/hmac-probe/README.md`, `spike/hmac-probe/deno.json`, `spike/hmac-probe/index.ts`
  - Depende de: 2.3, 2.6, 2.9
  - Verificación: manual en vivo (requiere credenciales); resultado en `spike/RESULTADO.md`: GO condicionado el 2026-10-16; Datum v2 es PocketBase con `X-Api-Key` y filtros; HMAC con prefijo `sha256=`; `ctx.verifyHmac` correcto con `@jelou/functions` 1.5.0; `functions check` offline correcto. El mensaje de WhatsApp se verificó después con el canal sandbox (E2E).
  - Evidencia: commits `936106f`, `5d18441`, `59e6dbd`, `faf8175`, `853d89c`.
- [x] **Task 3.2: Despliegue de migraciones, functions y workflow** `[REQ-06, REQ-07, REQ-08]` `[DESIGN §3.2, §4.2]`
  - Archivos: `migrations/apply.sh`, `functions/jelou.json`, `functions/index.ts`, `brain/jelou.yml`, `brain/jelou.lock`
  - Depende de: 2.6, 2.8, 3.1
  - Verificación: manual en vivo: `DATABASE_ID=<id> bash migrations/apply.sh` dentro del contenedor del CLI, despliegue de las 7 functions y publicación del workflow; la reanudación se comprobó en el E2E.
  - Evidencia: commits `7ab2770` y `924a983`; E2E manual `1d3cc35`, `289e60f`, `d257860`, `631350d`.
- [x] **Task 3.3: Carga del seed en Datum (rutas, temporadas, parámetros y vuelos base)** `[REQ-11]` `[DESIGN §3.2, §7.2]`
  - Archivos: `seed/seed.mjs`, `seed/cargar.mjs`
  - Depende de: 2.7, 3.2
  - Verificación: manual en vivo: ejecutar la carga y luego `node seed.mjs --verificar`; una segunda ejecución no duplica. Sin commit propio.
  - Evidencia: verificación en vivo con el código del commit `853d89c`.
- [x] **Task 3.4: Conformidad de db-design.dbml contra las colecciones reales** `[REQ-12]` `[DESIGN §3.2]`
  - Archivos: `contract/conformidad.mjs`, `contract/conformidad.test.mjs`, `contract/conformidad.sh`
  - Depende de: 1.1, 3.2
  - Verificación: `docker run --rm -v C:/repos/jelou-agent/apps/agent:/app -w /app node:24.22.0-bookworm-slim sh -c 'cd contract && node --test'` (9 verdes, solo comparador); la comparación contra Datum real es la ejecución manual de `contract/conformidad.sh`.
  - Evidencia: commit `4ae8456`.

---

## 4. Execution Progress Tracker
| Fase | Total Tareas | Completadas | Estado |
|:---|:---:|:---:|:---|
| **Phase 1: Contratos y datos** | 1 | 1 | `Done` |
| **Phase 2: Implementación sin credenciales** | 9 | 9 | `Done` |
| **Phase 3: Datum en vivo** | 4 | 4 | `Done` |
| **Total Global** | **14** | **14** | **100%** |

---

## 5. Definition of Done (DoD) Gate
- [x] Todas las tareas están marcadas como completadas (`[x]`).
- [x] Todos los criterios EARS de `requirements.md` pasan las pruebas asociadas (REQ-09, REQ-10 en la entrega por WhatsApp y REQ-12 en vivo se verificaron manualmente: ver Divergencias vigentes en `design.md`).
- [x] La estructura de archivos coincide con el mapeo de `design.md`.
- [x] Todos los tests unitarios, de integración y E2E pasan sin advertencias críticas (110 Deno, 18 seed y 9 contract verdes el 2026-10-16; E2E manual en WhatsApp).
- [x] La fila del spec en el `INDEX.md` de specs (`.makia/docs/specs/<categoría>/INDEX.md`) está sincronizada con el `Estado global` de `summary.md` (ambos en `En progreso`).

- [x] AUDIT ejecutado: ciclo 2, `PASA_CON_OBSERVACIONES` (2026-10-17); ver `audit.md`.

---

> IMPLEMENT ejecuta este documento tarea por tarea. Cada tarea se valida con un TEST acotado a sus propios archivos (no la suite completa) antes de marcarse `[x]`. Máximo 2 iteraciones de corrección por tarea antes de cancelar y escalar (ver sub-orchestrator.md del Orquestador).
