# Specs: apps/infrastructure

> Entorno local que levanta y conecta todos los servicios de la reserva y el pago de vuelos por WhatsApp.

## Grafo de specs

```mermaid
graph LR
  E[entorno-local-infrastructure]
  A[reserva-pago-whatsapp-agent<br/>otra unidad]
  P[reserva-pago-whatsapp-pay<br/>otra unidad]
  C[dashboard-aerolinea-crm<br/>otra unidad]

  E -->|depende de| A
  E -->|depende de| P
  E -->|depende de| C

  classDef externo stroke-dasharray: 5 5
  class A,P,C externo
```

## Tabla de specs

| Spec | Estado | Creación | Paralelizable con | Ruta | Depende de |
|---|:---:|:---:|:---:|---|---|
| entorno-local-infrastructure | `En progreso` | `Creado — pendiente aprobación` | `—` | `entorno-local-infrastructure/summary.md` | [reserva-pago-whatsapp-agent](../agent/reserva-pago-whatsapp-agent/summary.md), [reserva-pago-whatsapp-pay](../pay/reserva-pago-whatsapp-pay/summary.md), [dashboard-aerolinea-crm](../crm/dashboard-aerolinea-crm/summary.md) |

> Unidad de arranque sin modelo de dominio propio (el de la capacidad está en [domain-model.md](../agent/domain-model.md)); se construye al final porque integra las imágenes de las otras unidades.
