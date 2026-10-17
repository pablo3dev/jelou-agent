# Entorno local de la aerolínea DEMO: arranque con un comando y prueba de punta a punta

> Permite levantar la demo completa de la aerolínea en la máquina del usuario con un solo comando y probar la reserva por WhatsApp de principio a fin.

## Estado

| Estado global | Última actualización |
|:---:|:---:|
| `Completado` | `2026-10-17` |

## Objetivo

El USUARIO levanta el dashboard y la pasarela de pago simulada con un comando, sin instalar nada en su máquina salvo el motor de contenedores, y con credenciales fuera del repositorio. Puede comprobar de punta a punta los desenlaces de una reserva: aprobada con PNR, rechazada, expirada y notificación duplicada ignorada, con el dashboard coherente con las ventas.

## Avance

| Fase | Estado |
|:---|:---:|
| Phase 1: Habilitación de arranque | `Completado` |
| Phase 2: Compose y README | `Completado` |
| Phase 4: Arranque e integración | `Completado` |
| AUDIT | `Hecho — PASA_CON_OBSERVACIONES` |

**Progreso global:** `100%` (4 de 4 tareas completadas)

## Qué puede hacer ya el usuario / Qué falta

- [x] Levantar `crm` y `pay` con `docker compose up`, ambos con su comprobación de salud en verde, en `127.0.0.1` y con puertos definidos en `.env`.
- [x] Usar el CLI de Jelou (`agent-cli`) bajo demanda con el perfil `tools`, sin que arranque por defecto.
- [x] Recorrido E2E verificado con evidencia: reserva de ida y vuelta aprobada (PNR, asientos vendidos), rechazada (asientos libres), expirada (asientos libres, el agente avisa) y notificación duplicada sin efecto; dashboard coherente con las reservas emitidas.
- [x] Fin de línea LF en los archivos versionados y hash del contrato idéntico en `apps/agent`, `apps/pay` y `apps/crm`.
- [x] AUDIT del DEPLOY.
- [x] Aprobación del USUARIO de `requirements.md` (2026-10-17).
- [ ] E2E automatizado como script versionado: hoy la evidencia es manual.
- [ ] Mensaje real desde un teléfono por WhatsApp: solo se verificó el canal sandbox (falta agregar el teléfono como probador).
- [ ] Enlace de pago accesible fuera de la máquina local: hoy solo abre en `localhost`.

### Coordinación multi-unidad

Este spec integra las otras tres unidades de la capacidad:

- [reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/summary.md) (`apps/agent`)
- [reserva-pago-whatsapp-pay](../../pay/reserva-pago-whatsapp-pay/summary.md) (`apps/pay`)
- [dashboard-aerolinea-crm](../../crm/dashboard-aerolinea-crm/summary.md) (`apps/crm`)

Orden entre unidades: `apps/agent` (contrato primero) -> `apps/pay` y `apps/crm` en paralelo -> `apps/infrastructure` integra -> E2E.

Done conjunto: todas las tareas hermanas `[x]`, TEST y AUDIT por unidad, y el E2E cross-unidad.

## Actualizaciones incrementales recibidas

Ninguna: este spec no fue declarado sujeto a actualización futura.
