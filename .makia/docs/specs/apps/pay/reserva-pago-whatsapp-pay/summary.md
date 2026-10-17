# Pasarela de pago simulada para reservas por WhatsApp

> El cliente abre el enlace de pago del chat, ve el monto de su reserva y aprueba o rechaza el pago, y la pasarela informa el resultado a Jelou con una firma verificable.

## Estado

| Estado global | Última actualización |
|:---:|:---:|
| `Completado` | `2026-10-17` |

## Objetivo

Permite cerrar la reserva de un vuelo sin salir del flujo de WhatsApp: el cliente ve cuánto va a pagar y decide, sin mover dinero real. Jelou recibe un resultado auténtico, que no se puede falsificar ni duplicar con efecto, para emitir o liberar la reserva.

## Avance

| Fase | Estado |
|:---|:---:|
| Phase 1: Contrato | `Completado` |
| Phase 2: Implementación sin credenciales | `Completado` |
| Phase 3: Datum en vivo | `Completado` |
| AUDIT | `Hecho — PASA_CON_OBSERVACIONES` |

**Progreso global:** `100%` (6 de 6 tareas completadas)

## Qué puede hacer ya el usuario / Qué falta

- [x] Abrir el enlace de pago de una transacción pendiente y vigente y ver el monto a pagar con las acciones aprobar y rechazar; en otros casos ver el estado sin acciones o el error correspondiente.
- [x] Aprobar o rechazar el pago y que Jelou reciba la notificación firmada, con reintentos ante fallos transitorios.
- [x] Verificado en vivo: transacción real leída por id, notificación firmada aceptada, evento duplicado respondido sin efecto y firma inválida rechazada.
- [x] AUDIT del DEPLOY.
- [x] Aprobación del USUARIO de `requirements.md` (2026-10-17).
- [ ] REQ-04 (contrato sin desvío) sin test automatizado: se verifica solo por comando `sha256sum -c`.
- [ ] El enlace de pago solo abre en localhost (máquina del USUARIO que ejecuta la demo).

### Coordinación multi-unidad

Este spec es la unidad `apps/pay` de la capacidad de reserva y pago por WhatsApp. Specs hermanos:

- [reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/summary.md) (`apps/agent`)
- [dashboard-aerolinea-crm](../../crm/dashboard-aerolinea-crm/summary.md) (`apps/crm`)
- [entorno-local-infrastructure](../../infrastructure/entorno-local-infrastructure/summary.md) (`apps/infrastructure`)

Orden entre unidades: `apps/agent` (contrato primero), luego `apps/pay` y `apps/crm` en paralelo, luego `apps/infrastructure` integra y por último el E2E.

Done conjunto: todas las tareas hermanas `[x]`, TEST/AUDIT por unidad y E2E cross-unidad.

## Actualizaciones incrementales recibidas

Ninguna: este spec no fue declarado sujeto a actualización futura.
