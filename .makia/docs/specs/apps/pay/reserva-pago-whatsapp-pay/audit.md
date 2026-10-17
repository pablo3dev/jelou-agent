# Audit Report: Pasarela de pago simulada para reservas por WhatsApp (apps/pay)

## 1. Metadata
- **Spec Auditado:** `reserva-pago-whatsapp-pay`
- **Ruta:** `.makia/docs/specs/apps/pay/reserva-pago-whatsapp-pay`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `1`

Contrastado contra: `.makia/docs/specs/apps/agent/domain-model.md`, `design.md` del spec hermano `reserva-pago-whatsapp-agent` (contrato de `pago-notificacion`), `.makia/config/constitution.md` (`## Global` y `## Unidad: apps/pay`), `.makia/idea/aerolinea-reservas-whatsapp/poc/divergencias.md` (PoC aprobada por el USUARIO) y el código en `apps/pay/src/*.js` (sin ejecutar código).

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos).
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (lenguaje ubicuo, límites del Contexto Delimitado, entidades y reglas de negocio).

Verificado puntualmente:
- **RN-09 / regla de pago:** `app.js` trata como pagable solo `estado = PENDIENTE` y `expira_at > ahora`; una PENDIENTE vencida se muestra EXPIRADA sin escribir; el `POST` relee la transacción y no notifica si no es pagable (REQ-1.2, REQ-2.8).
- **Nunca emite EXPIRADA:** `notificacion.js` lanza error ante cualquier estado distinto de APROBADA/RECHAZADA, antes de enviar (REQ-2.3; constitución `apps/pay`).
- **HMAC:** `JSON.stringify` una sola vez; `HMAC-SHA256` hex del cuerpo crudo con `PAY_WEBHOOK_SECRET`; cabecera `X-Webhook-Signature: sha256=<hex>`; los reintentos reutilizan los mismos bytes. Coincide con el contrato de `pago-notificacion` del `design.md` hermano (cuerpo `{transaccion_id, estado, event_id, emitido_at}`, `event_id = <id>:<estado>`, RN-16).
- **Reintentos:** 3 intentos, esperas 1000/2000 ms, timeout 5 s; reintenta red, 5xx y 429; otro 4xx (401) corta con un solo intento (REQ-2.5 a 2.7).
- **Solo lectura de Datum:** `datum.js` solo emite `GET` por id con `X-Api-Key`; no hay ninguna otra operación sobre Datum. Cumple "la pasarela no escribe datos de negocio" (Global) y RN-10/RN-11 (los efectos los aplica Jelou).
- **Secretos:** `DATUM_API_KEY` y `PAY_WEBHOOK_SECRET` solo desde `env`; errores con mensaje fijo; el único log es el puerto de arranque; `.env` excluido en `.gitignore` y `.dockerignore`.
- **Enmascarado del documento:** pay no lee ni muestra `pasajeros.documento` (solo `transacciones.{id,estado,reserva_id,expira_at}` y `reservas.total_cop`) y no registra datos de pasajero; la directriz queda cumplida por construcción.
- **Monto (RN-A1):** `reservas.total_cop` entero no negativo, formateado COP; total inválido -> 502. No recalcula precios (consistente con "precios en servidor", Global).
- **Seguridad web:** `esc()` en todo valor interpolado, `encodeURIComponent` en URLs, CSP con hash del único script, `form-action 'self'`, `nosniff`, `no-store`, sin `X-Powered-By`; id validado con lista blanca antes de consultar Datum (REQ-1.4/1.6).
- **Puerto y enlace:** `PORT_PAY` válido 1..65535 o 3001; rutas `/pay/:id` y `/pagar/:id`; `/health`. Compose publica en `127.0.0.1` (Global).
- **Contrato (REQ-4):** `sha256sum -c CONTRACT.sha256` en `apps/pay/contract` da OK y los hashes coinciden con los de `apps/agent/contract/` (`db-design.dbml` e1bc1863..., `endpoints.md` 3717b336...). Contenedor no root, Node 24.22.0, Express 5.3.0.
- **Principios de trabajo:** sin mocks, stubs, flags ni ramas para funcionalidad futura. La inyección de `datum`, `fetchFn`, `sleep`, `now`, `notificador` sirve a las pruebas del comportamiento actual (declarado en `design.md` §9). Pay no crea ni altera estructuras de datos: usa solo campos de `transacciones` y `reservas` declarados en `db-design.dbml`/`domain-model.md`. Sin términos críticos ni cortes de migración afectados.

---

## 3. Hallazgos y Desviaciones

Sin hallazgos.

Divergencias ya aceptadas por el USUARIO que aplican a este spec (conocidas, no son hallazgos nuevos):
- **D-08** (`PAY_PUBLIC_URL` = localhost; el enlace solo abre en la máquina del USUARIO), reflejada en `design.md` §2.6 y `requirements.md`.
- **D-06** (`endpoints.md` obsoleto en cuanto a Bearer/MCP y SUPUESTOS; la copia de pay hereda la deuda por hash). No afecta al comportamiento de pay (la parte consumida por pay -- lectura y notificación -- es correcta).
- **REQ-04 sin prueba verde propia** (`divergencias.md` §2 y `requirements.md` REQ-04; verificado por comando, ver arriba).
- **D-13** (503 por notificación tardía; el reintento de pay reaplica, diseñado así) y **D-16** (commits bajo el slug de la idea, p. ej. 3.5).

---

## 4. Supuestos Detectados

- El spec supone que quien lleva una PENDIENTE vencida a EXPIRADA, libera los asientos y reanuda con `expired` (RN-12) es el receptor/agente y no pay: como pay no notifica cuando la transacción ya venció (REQ-2.8) y nunca emite EXPIRADA, el camino "aprobación posterior a la expiración deja EXPIRADA" (RN-09) solo se ejercita en la carrera de borde (aprobación enviada justo antes del vencimiento y recibida después). El spec lo declara (RN-09 y Fuera de Alcance) y es coherente con D-14, pero el mecanismo que expira de verdad vive fuera de pay.
- Un `POST` de aprobar y otro de rechazar casi simultáneos tienen `event_id` distintos (`<id>:APROBADA` vs `<id>:RECHAZADA`); `design.md` §7.2 delega la resolución en el receptor (solo transiciona desde PENDIENTE, `SIN_EFECTO` para el segundo). Supuesto razonable y respaldado por RN-09/RN-16 de `pago-notificacion`.

---

## 5. Preguntas Abiertas

Sin preguntas abiertas.

---

## 6. Recomendaciones

- (No bloqueante, ya declarada) Versionar una prueba de contrato en `apps/pay` equivalente al `verify-contract.sh` de `apps/crm`, para dar prueba verde a REQ-4.1 a 4.3 (`design.md` §9, último ítem sin marcar; `divergencias.md` §2).
- (No bloqueante) `createApp` conserva la rama `if (!datum) return app` (solo `/health`), que existe para `app.test.js`; si la pasarela nunca se arranca sin Datum, es una abstracción sin consumidor de producción. Observación de sobre-ingeniería menor, no anticipatoria.
- (No bloqueante) `tasks.md` DoD mantiene "AUDIT pendiente (lo ejecuta el DEPLOY)": marcarlo tras este ciclo.

---

## 7. Veredicto Final

**Veredicto:** `PASA_CON_OBSERVACIONES`

Sin hallazgos bloqueantes. Las observaciones de la sección 6 son no bloqueantes y corresponden a deuda ya declarada o a sobre-ingeniería menor sin impacto en el negocio.
