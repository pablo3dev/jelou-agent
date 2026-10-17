# Reserva y pago por WhatsApp: agente conversacional y reglas de reserva

> Un agente por WhatsApp que guía al cliente para reservar un vuelo, pagarlo y recibir su localizador (PNR) en el mismo chat.

## Estado

| Estado global | Última actualización |
|:---:|:---:|
| `Completado` | `2026-10-17` |

## Objetivo

Permite que un cliente de la aerolínea DEMO reserve un vuelo nacional de ida o de ida y vuelta sin salir de WhatsApp: elige trayecto, fechas, equipaje, mascota y asientos, ve el total calculado por el sistema y paga con un enlace. Si el pago se aprueba recibe su PNR; si se rechaza o vence, los asientos quedan libres y el chat informa el resultado. Importa porque evita ventas sin pago y precios manipulables desde la conversación.

## Avance

| Fase | Estado |
|:---|:---:|
| Phase 1: Contratos y datos | `Completado` |
| Phase 2: Implementación sin credenciales | `Completado` |
| Phase 3: Datum en vivo | `Completado` |
| AUDIT | `Hecho — PASA_CON_OBSERVACIONES` |

**Progreso global:** `100%` (14 de 14 tareas completadas)

El 100% mide solo las tareas del plan.

## Qué puede hacer ya el usuario / Qué falta

- [x] Buscar vuelos de ida y de ida y vuelta entre los 6 trayectos, con 1 a 9 pasajeros, dentro de la ventana 2026-12-01 a 2027-01-31 (110 pruebas de functions, 18 de seed y 9 de contrato verdes el 2026-10-16).
- [x] Cotizar pasaje, equipaje de bodega y mascota con el total calculado por el servidor, redondeado por línea.
- [x] Elegir asientos de ida y de vuelta, con validación, regla de salida de emergencia y retención de 15 minutos.
- [x] Crear la transacción de pago con enlace de pago, reserva en PENDIENTE_PAGO y PNR único.
- [x] Pago aprobado: asientos vendidos y PNR confirmado en el mismo chat (verificado de extremo a extremo con el canal sandbox).
- [x] Pago rechazado o expirado: asientos liberados y aviso al cliente sin reintentar el pago (verificado de extremo a extremo; notificación duplicada sin efecto).
- [x] Cargar los datos base (rutas, temporadas, parámetros y vuelos base) de forma repetible y comprobar que las colecciones coinciden con el diseño publicado.
- [x] AUDIT del DEPLOY.
- [x] Aprobación del USUARIO de `requirements.md` (2026-10-17).
- [ ] Prueba con un mensaje real desde un teléfono (hasta ahora solo el canal sandbox).
- [ ] REQ-09 (confirmación en el chat) y REQ-10 (entrega del enlace por WhatsApp) sin prueba automatizada; solo evidencia manual.
- [x] Mascota: rige una sola línea por reserva, cobrada en la ida (aceptado por el USUARIO el 2026-10-17).

### Coordinación multi-unidad

Esta unidad (`apps/agent`) es dueña del modelo de dominio y del contrato de datos; las demás dependen de ella.

- Pasarela de pago: [reserva-pago-whatsapp-pay](../../pay/reserva-pago-whatsapp-pay/summary.md)
- Dashboard: [dashboard-aerolinea-crm](../../crm/dashboard-aerolinea-crm/summary.md)
- Entorno local: [entorno-local-infrastructure](../../infrastructure/entorno-local-infrastructure/summary.md)

Orden entre unidades: `apps/agent` (contrato primero) -> `apps/pay` y `apps/crm` en paralelo -> `apps/infrastructure` integra -> prueba de extremo a extremo.

Done conjunto: todas las tareas de los specs hermanos en `[x]`, más TEST y AUDIT de cada unidad y la prueba de extremo a extremo entre unidades.

## Actualizaciones incrementales recibidas

Ninguna: este spec no fue declarado sujeto a actualización futura.
