# Reporte de PoC: aerolinea-reservas-whatsapp

> Ubicación: `.makia/idea/aerolinea-reservas-whatsapp/poc/reporte.md`.

**Resultado:** `Hecho`
**Rama:** `makia/dev/aerolinea-reservas-whatsapp`; la PoC se promovió a `main` por solicitud del USUARIO. Las iteraciones posteriores (datos de muestra, GUI del CRM, README) se hicieron en `makia/dev/cierre-mvp-aerolinea`.

## Carriles
| Unidad | Tareas | Estado | Bloqueada por |
|:---|:---:|:---|:---|
| `apps/agent` | 14/14 | `Hecho` | — |
| `apps/pay` | 6/6 | `Hecho` | — |
| `apps/crm` | 6/6 | `Hecho` | — |
| `apps/infrastructure` | 4/4 | `Hecho` | — |
| Total | 30/30 | `Hecho` | — |

`apps/e2e` es una herramienta de pruebas de punta a punta fuera de los specs; no pertenece a ningún carril del plan.

## Verificación
- `docker compose up`: `ok` — `docker compose up --build -d` en `apps/infrastructure` (proyecto `aerolinea-reservas-whatsapp`), `crm` y `pay` en `healthy` (tarea 4.1).
- e2e: `verde` — tarea 4.1 y reverificación independiente por el canal sandbox de WhatsApp: ida y vuelta aprobada con PNR, rechazada y expirada con asientos libres, notificación duplicada sin efecto, dashboard coherente. No se verificó un mensaje real desde un teléfono.
- TEST por carril (2026-10-16, en Docker, 210 pasadas y 0 falladas): agent/functions 110, agent seed 18, agent/contract 9, pay 26, crm 47; infraestructura por comandos deterministas con salida 0 (`git ls-files --eol` sin `i/crlf`, `sha256sum -c` de contratos).
- Verificadores (2026-10-17): `check-units` 0, `check-plan` (`poc/tasks.md`) 0, `check-project --sin-audit` 0

## Fuente de verdad
- Specs generados: `reserva-pago-whatsapp-agent`, `reserva-pago-whatsapp-pay`, `dashboard-aerolinea-crm`, `entorno-local-infrastructure`.
- Hoja de divergencias: `poc/divergencias.md` (18 hallazgos: REQ sin test verde, entidades del domain-model, resultado de gates).
- Aprobación: el USUARIO aprobó el paquete único (los 4 `requirements.md` y la hoja de divergencias) el 2026-10-17; los 4 specs quedan con `Creación: Aprobado` y `Estado: Completado` tras AUDIT.
- AUDIT (2026-10-17): los 4 specs `PASA_CON_OBSERVACIONES`; `reserva-pago-whatsapp-agent` y `dashboard-aerolinea-crm` en ciclo 2, `reserva-pago-whatsapp-pay` y `entorno-local-infrastructure` en ciclo 1.

## Siguiente paso
Merge a `main`.
