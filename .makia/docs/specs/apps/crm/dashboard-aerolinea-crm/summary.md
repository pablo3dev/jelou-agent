# Dashboard de la aerolínea (solo lectura)

> Panel web para que el operador de la aerolínea consulte vuelos, asientos vendidos, mapa de asientos y estadísticas de ventas, sin poder modificar nada.

## Estado

| Estado global | Última actualización |
|:---:|:---:|
| `Completado` | `2026-10-17` |

## Objetivo

El operador de la aerolínea necesita ver en el momento cuántos asientos se han vendido por vuelo y por destino, qué asientos están ocupados en un vuelo y cuánto ha ingresado por las ventas. Este spec entrega ese panel de consulta, estrictamente de solo lectura y sin datos personales de pasajeros, para que el operador evalúe la ocupación y decida con datos.

## Avance

| Fase | Estado |
|:---|:---:|
| Phase 1: Contrato | `Completado` |
| Phase 2: Implementación sin credenciales | `Completado` |
| Phase 3: Datum en vivo | `Completado` |
| AUDIT | `Hecho — PASA_CON_OBSERVACIONES` |

**Progreso global:** `100%` (6 de 6 tareas completadas)

## Qué puede hacer ya el usuario / Qué falta

- [x] Listar vuelos con filtros por ruta y rango de fechas, con asientos vendidos y ocupación, y ver las ventas agregadas por vuelo y por destino.
- [x] Abrir el mapa de los 174 asientos de un vuelo con clase, salida de emergencia y estado efectivo.
- [x] Consultar estadísticas: ingresos, vendidos, ocupación, reservas por estado y rutas destacadas, en español o inglés.
- [x] Operar en solo lectura y sin datos personales de pasajeros.
- [x] Verificado en vivo contra el almacén de datos con el seed cargado y con las pruebas automatizadas de `apps/crm` verdes.
- [x] AUDIT del DEPLOY.
- [x] Aprobación del USUARIO de `requirements.md` (2026-10-17).
- [ ] REQ-06 (copia verificable del contrato) sin test automatizado versionado: se verifica por comando.
- [ ] Autenticación del operador: no existe; el panel es una DEMO de uso local.

### Coordinación multi-unidad

Este spec pertenece a `apps/crm` y consume el contrato que define `apps/agent`.

- Specs hermanos:
  - [reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/summary.md) (`apps/agent`, dueña del contrato y del modelo de dominio).
  - [reserva-pago-whatsapp-pay](../../pay/reserva-pago-whatsapp-pay/summary.md) (`apps/pay`).
  - [entorno-local-infrastructure](../../infrastructure/entorno-local-infrastructure/summary.md) (`apps/infrastructure`).
- Orden entre unidades: `apps/agent` (contrato primero) -> `apps/pay` y `apps/crm` en paralelo -> `apps/infrastructure` integra -> E2E.
- Done conjunto: todas las tareas hermanas `[x]` + TEST/AUDIT por unidad + E2E cross-unidad.

## Actualizaciones incrementales recibidas

Ninguna: este spec no fue declarado sujeto a actualización futura.
