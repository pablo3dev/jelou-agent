# Audit Report: Entorno local de la aerolínea DEMO (Docker Compose)

## 1. Metadata
- **Spec Auditado:** `entorno-local-infrastructure`
- **Ruta:** `.makia/docs/specs/apps/infrastructure/entorno-local-infrastructure`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `1`

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos). Revisado: `apps/infrastructure/compose.yaml`, `.env.example`, `.gitattributes`, `.gitignore`, `README.md`, `MIGRAR-CUENTA.md` y `docs/`.
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (de `apps/agent`), con los specs hermanos (agent, pay, crm) y con `## Global` y `## Unidad: apps/infrastructure` de la constitución. La unidad no define entidades ni estructuras de datos (design §3); no se creó ni alteró ninguna.
- [x] Principios de trabajo (`orchestrator.md` § "Principios de trabajo"): sin anticipación de funcionalidad futura (no hay mocks, stubs, flags, `depends_on` ni ramas especulativas; §2.8 declara "sin actualizaciones futuras"); sin dependencia de un spec futuro.
- [x] Secretos: `.env` ignorado (`git check-ignore -v` devuelve `apps/infrastructure/.gitignore:1:.env`); `git ls-files` solo versiona `.env.example` (y el de `apps/e2e`, sin valores sensibles); `compose.yaml` usa solo `${VAR}`; búsqueda de patrones de token/clave en archivos versionados sin coincidencias reales (único valor literal: `PAY_WEBHOOK_SECRET=probe-secret-123` de un probe documentado en `apps/agent/spike/hmac-probe/README.md`, fuera de este spec, valor de prueba declarado). `git ls-files --eol`: 0 archivos con `i/crlf`.
- [x] Constitución: puertos en `127.0.0.1` desde `PORT_CRM`/`PORT_PAY`; `agent-cli` bajo perfil `tools`; healthchecks de crm y pay con CMD de Node contra `/health`; proyecto `aerolinea-reservas-whatsapp`; red `reservas-net`; sin contenedor de DB; `.gitattributes` con `eol=lf`; imágenes Node 24.22.0 (declarado en los Dockerfile de las otras unidades, fuera del alcance de este archivo).

Divergencias ya aceptadas, no re-reportadas como hallazgo: D-04 (REQ-05 manual sin script, sin mensaje real desde teléfono), D-01 (mascota solo en la ida), D-02 (señal de reanudación como texto), D-05 (`docs/` movido a `apps/infrastructure/docs/`, `check-units` en 0), D-08 (`PAY_PUBLIC_URL` local, EC-23), D-13 (503/422 en notificación tardía), D-16 (commits con slug de la idea), D-18 (53 vs 54 archivos).

---

## 3. Hallazgos y Desviaciones
| ID | Descripción | Severidad | Referencia (REQ/DESIGN/domain-model) |
|:---|:---|:---:|:---|
| **H-01** | `design.md` §5 (mapeo de archivos) lista 5 archivos, pero la unidad versiona además `MIGRAR-CUENTA.md` (guía de réplica en otra cuenta, enlazada desde el README) y `docs/` (capturas y `asientos-avion.webp`, movidas por D-05). Ninguno figura en el diseño ni en el alcance de `requirements.md`. No son funcionalidad ni dato nuevo; es deriva documental. La tarea 4.1 y el DoD ("los 5 archivos de §5") quedan desactualizados. | `Menor` | DESIGN §5; REQ alcance "Guía de arranque"; D-05 |
| **H-02** | `.env.example` incluye `CRM_PUBLIC_URL=http://localhost:3000` con valor, y `README.md` la documenta. `design.md` §4.1 enumera las variables y afirma que solo traen valor los puertos, `PAY_PUBLIC_URL` y `PAGO_NOTIFICACION_URL`. La variable no es sensible ni la consume `compose.yaml` (es de las functions en Jelou). Divergencia de documentación, no de comportamiento. | `Menor` | DESIGN §4.1, §8.1 (revisión de `.env.example`); REQ-2.2 |
| **H-03** | `.gitattributes` cubre `*.sh`, `*.yaml`, `*.js`, `*.ts` y `Dockerfile`, pero no `*.yml`, que sí incluye el comando de verificación de TEST (`git ls-files --eol` con `*.yml`) y que REQ-3.1 abarca como "configuración YAML". Hoy ningún `.yml` tiene CRLF (0 con `i/crlf`), por lo que no hay incumplimiento observable. | `Menor` | REQ-3.1, REQ-3.2; DESIGN §5 |

*(Ningún hallazgo bloqueante.)*

---

## 4. Supuestos Detectados
- DESIGN §7.1 y REQ-1.5/EC-19 asumen que un servicio con variable obligatoria vacía (p. ej. `PAY_WEBHOOK_SECRET`, `DATUM_API_KEY`) "no queda en `healthy`". El healthcheck solo consulta `/health`; si el servidor responde `ok` sin validar la configuración, el servicio puede quedar `healthy` con credenciales vacías, y `compose.yaml` no usa `${VAR:?}`. La afirmación no está respaldada por evidencia en el spec (la tarea 4.1 solo probó la configuración completa). Depende del comportamiento de `/health` en `apps/crm` y `apps/pay`.
- `MIGRAR-CUENTA.md` asume `apps/e2e` (con `uv run`), unidad que no pertenece a este spec ni a la constitución citada; cita además "1.116 vuelos" mientras el spec registra un seed de 372 vuelos (el seed difiere por configuración o por fecha; no se verificó contra el seed).

---

## 5. Preguntas Abiertas
- Sin preguntas abiertas.

---

## 6. Recomendaciones
- Actualizar `design.md` §5 (y el DoD de `tasks.md`) para incluir `MIGRAR-CUENTA.md` y `docs/`, y §4.1/§8.1 para incluir `CRM_PUBLIC_URL`, vía EDITOR/SPEC (H-01, H-02).
- Agregar `*.yml text eol=lf` a `apps/infrastructure/.gitattributes` (H-03).
- Para cerrar el supuesto de EC-19, validar en `/health` de crm/pay las variables obligatorias, o usar `${VAR:?}` en `compose.yaml` para variables obligatorias; alternativamente, reescribir §7.1 para no afirmar que quedan no saludables. Reevaluar al promover el spec; requeriría decisión del USUARIO, pues cambiaría el arranque con `.env` incompleto.
- Aclarar en `MIGRAR-CUENTA.md` que el e2e (`uv run`) debe ejecutarse en contenedor para cumplir "nada instalado en el host", y reconciliar la cifra de vuelos sembrados con el seed.
- La constitución de la unidad no menciona `MIGRAR-CUENTA.md` ni `docs/`; no es necesario editarla (no se edita para directrices del proyecto).

---

## 7. Veredicto Final

**Veredicto:** `PASA_CON_OBSERVACIONES`

Las observaciones son no bloqueantes: ningún secreto versionado, sin anticipación de funcionalidad futura, sin estructura de datos nueva, y compose/`.env.example`/`.gitattributes`/README cumplen las directrices de la constitución. No se disparan D-02 (RECHAZADA) en esta auditoría; las observaciones H-01 a H-03 son documentales y resolubles por EDITOR/SPEC (H-03 con un cambio de configuración trivial), por lo que quedan a criterio de una futura iteración. Las divergencias D-04 y relacionadas ya están aceptadas por el USUARIO.
