# Aerolínea DEMO: reservas por WhatsApp con pago y dashboard (PoC)

> Instrucciones para el LLM implementador: este documento contiene todo el contexto,
> las decisiones y las especificaciones necesarias para implementar esta funcionalidad
> de principio a fin. No asumas, no inventes ni deduzcas nada que no esté aquí. Si existe
> un archivo `db-design.dbml` junto a este documento, es el diseño de base de datos
> obligatorio a seguir. Sigue el stack y la arquitectura indicados exactamente como se
> describen. Las decisiones marcadas como cerradas en "Decisiones tomadas" no se reabren.

## Resumen ejecutivo

Se construye una aerolínea DEMO que vende vuelos nacionales entre BOG, MDE, CLO y CTG por WhatsApp. El cliente elige trayecto, pasajeros, fechas, vuelos, equipaje, mascotas y asientos; paga con una pasarela simulada y recibe un localizador PNR. Un dashboard web muestra vuelos, asientos vendidos por vuelo y destino, mapa de asientos y estadísticas. El desarrollo se entrega como PoC en `makia/dev/aerolinea-reservas-whatsapp` con `docker compose up` y un único e2e.

## Contexto

- **Clasificación:** `app` nueva; `app completa / multi-feature` (N=2: `reserva-pago-whatsapp` y `dashboard-aerolinea`, que comparten dominio de vuelos y reservas); `capacidad multi-unidad` (RN-04: la capacidad toca 3 unidades de código con límites de despliegue distintos, más una unidad transversal de arranque); modo PoC.
- **Negocio:** aerolínea DEMO, solo vuelos nacionales entre BOG, MDE, CLO y CTG. Seis trayectos bidireccionales: BOG-MDE, MDE-BOG, BOG-CLO, CLO-BOG, BOG-CTG, CTG-BOG.
- **Vuelos:** un vuelo diario por trayecto, de 2026-12-01 a 2027-01-31 inclusive (62 días x 6 trayectos = 372 vuelos), salida 07:00.
- **Aeronave:** Boeing 737-8 MAX, 174 asientos. Premium: filas 1–3, letras A, C, D, F (12 asientos). Extended: filas 4–7, letras A–F (24). Economy: filas 8–30, letras A–F (138). Exit row: filas 13 y 14. Código de asiento: `<fila><letra>`, p. ej. `12A`.
- **Datos:** Jelou Datum es la única base de datos. No hay contenedor de base de datos.
- **Ventana de conversación:** el flujo completo cabe en menos de 15 minutos (el hold de asientos dura 15 min); no se usan plantillas de WhatsApp (HSM).

## Carriles (unidades)

Cada unidad es una carpeta autocontenida con su `Dockerfile` (usuario no root, healthcheck) salvo `apps/infrastructure`, que es de arranque. Hay una única unidad dueña de la base de datos: `apps/agent`.

- **`apps/agent`** (dueña de la DB y de su contrato `db-design.dbml`). Aporta:
  - Agente de Brain Studio: nodo AI Agent con prompt, pestañas Tools y Pause interaction, y workflow de la conversación.
  - Jelou Functions (TypeScript, runtime Deno vía CLI): `rutas-listar`, `vuelos-buscar`, `cotizar`, `equipaje-calcular`, `asientos-validar-retener`, `transaccion-crear`, `pago-notificacion`, y opcionalmente `liberar-holds` por cron.
  - Migraciones: colecciones de Datum creadas con `jelou databases collections create`.
  - Seed: Node 24 contra la REST de Datum.
  - `Dockerfile` del CLI (`@jelou/cli` 4.13.1 sobre `node:24.22.0-bookworm-slim`). La versión del CLI se fija en esta unidad porque el CLI despliega sus artefactos (functions, workflows, esquema).
  - Contrato primero: colecciones, IDs y endpoints de functions.
- **`apps/pay`** (pasarela simulada). Express 5.3.0 sobre Node 24.22.0, puerto `PORT_PAY` (default 3001). Consume una copia del contrato de `apps/agent` verificada por hash. Lee la transacción por id desde la REST de Datum, muestra el monto, ofrece botones aprobar y rechazar (mock), y notifica a Jelou la function `pago-notificacion` con firma HMAC.
- **`apps/crm`** (dashboard, solo lectura). Express 5.3.0 sirve HTML y JS estáticos, `/health` y endpoints JSON que lee Datum desde el servidor. Chart.js 4.5.1 por CDN fijada. Muestra vuelos, asientos vendidos por vuelo y destino, mapa de asientos y estadísticas. Puerto `PORT_CRM` (default 3000). Consume una copia del contrato de `apps/agent` verificada por hash.
- **`apps/infrastructure`** (unidad transversal de habilitación, un solo bloque de tareas). Aporta `compose.yaml`, `.env.example`, `.gitattributes` y el README de arranque.

**Orden de construcción:** `apps/agent` (contrato primero: colecciones, IDs, endpoints de functions) → `apps/pay` y `apps/crm` en paralelo (consumen copias del contrato) → `apps/infrastructure` integra → e2e al final.

## Problema

El cliente necesita reservar un vuelo nacional por WhatsApp sin salir de la conversación, con pago y confirmación en el mismo canal. La aerolínea necesita ver en tiempo real vuelos, ocupación y asientos vendidos. Hoy no existe un flujo que haga ambas cosas con inventario de asientos consistente.

## Solución propuesta

Un agente conversacional en Brain Studio guía la reserva. Las functions de Jelou validan cada entrada, calculan precios y retienen asientos. Al crear la transacción, el agente se pausa y espera el resultado de la pasarela. La pasarela notifica el resultado a `pago-notificacion`, que aplica el efecto sobre asientos, reserva y transacción, y luego reanuda el agente con el estado final. El agente confirma el PNR o informa el fallo. Un dashboard de solo lectura consume Datum para mostrar el estado de los vuelos.

## Alcance

- **Dentro del alcance:**
  - Búsqueda de vuelos de ida y vuelta entre los 6 trayectos, con 1 a 9 pasajeros.
  - Equipaje de cabina (sin costo) y de bodega, con medidas y peso.
  - Una mascota por reserva, en cabina.
  - Selección y retención de asientos, validada en servidor.
  - Pago simulado con firma HMAC, transacción, PNR y reanudación del agente.
  - Expiración de transacciones y liberación de asientos.
  - Dashboard de solo lectura.
  - Seed de rutas, temporada, parámetros y vuelos.
  - `docker compose up` y un único e2e.
- **Fuera del alcance (non-goals):**
  - Cancelaciones, reemisiones, check-in y equipaje de regreso.
  - Más de un proveedor de pago.
  - Plantillas HSM.
  - Vuelos internacionales y más de los 6 trayectos.
  - Producción: SLA, tenancy, compare-and-set o transacciones en Datum.
  - Unidades `host-native`.

## Actores y flujo de valor

- **Cliente (WhatsApp):** reserva y paga un vuelo, y recibe su PNR. Flujo: trayecto → nº de pasajeros (1–9) → fecha de ida y de vuelta → vuelos → por pasajero: equipaje → mascotas → asientos de ida y de vuelta → resumen y total → transacción → pago → confirmación con PNR, o fallo o expiración con liberación de asientos.
- **Pasarela de pago (simulada):** recibe la transacción, muestra el monto, aprueba o rechaza, y notifica el resultado a Jelou.
- **Operador de la aerolínea (dashboard):** consulta vuelos, asientos vendidos y estadísticas. Solo lectura.
- **Brain Studio / agente:** conduce la conversación, pasa texto a las functions y espera la reanudación.

## Reglas de negocio

- **RN-01 [Tarifa]:** tarifa plana por pasajero y trayecto: `rutas.tarifa_base_cop` (BOG-MDE y MDE-BOG 350000; BOG-CLO y CLO-BOG 380000; BOG-CTG y CTG-BOG 420000; moneda COP) multiplicada por el multiplicador de temporada del mes de la fecha de viaje del trayecto. Valores DEMO, parametrizables.
- **RN-02 [Temporada]:** multiplicador 1.30 para los meses 1, 6, 7 y 12; 1.00 para el resto. Se aplica a pasaje, equipaje y mascotas según el mes de `vuelos.fecha` de cada trayecto, no según la fecha de compra.
- **RN-03 [Equipaje de cabina]:** sin costo y sin medidas.
- **RN-04 [Equipaje de bodega]:**
  - Medidas: largo, ancho y alto en cm; peso en kg.
  - `cobrable_kg = ceil(max(peso_kg, L*A*H/6000))`.
  - `precio = max(cargo_minimo_bodega_cop, cobrable_kg * tarifa_kg_bodega_cop) * multiplicador_temporada`.
  - Límites: L+A+H ≤ 158 cm (DEMO, supuesto de interpretación); peso ≤ 32 kg; 1 pieza de bodega por pasajero.
  - Valores DEMO: `tarifa_kg_bodega_cop` = 12000; `cargo_minimo_bodega_cop` = 40000.
- **RN-05 [Mascota]:** máximo 1 por reserva; peso ≤ 8 kg; viaja en cabina; no ocupa asiento. Precio = `tarifa_mascota_cop` (150000) × multiplicador de temporada.
- **RN-06 [Asientos]:** formato `12A 12B` o `12A,12B`, validado en servidor: formato, existencia en el mapa del vuelo, estado LIBRE, cantidad igual al número de pasajeros. Exit row (filas 13 y 14) solo para pasajeros de edad ≥ 15 años.
- **RN-07 [Pago]:** monto = suma de pasajes (ida y, si aplica, vuelta) + equipaje + mascotas. Redondeo: cada línea (pasaje por pasajero y trayecto, equipaje, mascota) se redondea a COP entero con `Math.round` (mitad hacia arriba para positivos); el monto es la suma de líneas ya redondeadas. Se persisten `reservas.total_cop`, `equipaje.precio_cop` y `mascotas.precio_cop`; el pasaje por pasajero y trayecto se recalcula de forma determinística desde `rutas.tarifa_base_cop`, temporada y parámetros.
- **RN-08 [Hold de asientos]:** `hold_minutos` = 15. Un hold es válido solo si `estado = RETENIDO` y `hold_expira > ahora`. Un hold vencido equivale a LIBRE. La liberación es efectiva por lectura; no depende de cron. El cron es opcional, solo para limpieza.
- **RN-09 [Transacción]:** estados PENDIENTE → APROBADA | RECHAZADA | EXPIRADA. Solo se transiciona desde PENDIENTE. Expira 15 minutos después de su creación: `transacciones.expira_at` = `reservas.hold_expira` = instante de creación de la transacción + `hold_minutos` (15); ambos vencen juntos. Una notificación de aprobación que llega después de la expiración deja la transacción en EXPIRADA, no en APROBADA.
- **RN-10 [Aprobación]:** asientos → VENDIDO con el PNR; reserva → EMITIDA; transacción → APROBADA; luego reanudar el agente con status `paid`.
- **RN-11 [Rechazo]:** asientos → LIBRE; reserva → PAGO_RECHAZADO; transacción → RECHAZADA; reanudar el agente con status `rejected`. El agente informa y no reintenta solo.
- **RN-12 [Expiración]:** asientos → LIBRE; reserva → EXPIRADA; reanudar el agente con status `expired`. Ocurre cuando llega una notificación tarde o cuando actúa el cron.
- **RN-13 [PNR]:** 6 caracteres de `[A-Z2-9]`, sin O, I, 0 ni 1. Se genera al crear la reserva. Es único: se verifica por lectura antes de escribir. Riesgo residual documentado en Riesgos.
- **RN-14 [Ventana]:** toda fecha de viaje está entre 2026-12-01 y 2027-01-31 inclusive.
- **RN-15 [Cantidad]:** entre 1 y 9 pasajeros por reserva.

## Requerimientos funcionales (EARS)

### REQ-01: Búsqueda de vuelos
- **Como** cliente **quiero** elegir trayecto, pasajeros y fechas **para** ver los vuelos disponibles.
- `EL SISTEMA DEBE` aceptar solo los 6 trayectos de RN-01 y entre 1 y 9 pasajeros.
- `CUANDO` el cliente indica fecha de ida y de vuelta `EL SISTEMA DEBE` devolver los vuelos de ambos trayectos dentro de la ventana de RN-14.
- `SI` la fecha está fuera de la ventana o el trayecto no existe `EL SISTEMA DEBE` rechazar la entrada con error de validación.

### REQ-02: Cotización
- **Como** cliente **quiero** ver el total antes de pagar **para** decidir.
- `EL SISTEMA DEBE` calcular pasaje, equipaje y mascotas con RN-01, RN-02, RN-04, RN-05 y RN-07.
- `EL SISTEMA DEBE` calcular el precio de equipaje de bodega solo con medidas y peso validados.

### REQ-03: Equipaje
- **Como** cliente **quiero** declarar mi equipaje **para** pagar solo lo que llevo.
- `EL SISTEMA DEBE` registrar equipaje de cabina sin costo y sin medidas.
- `CUANDO` el cliente declara bodega `EL SISTEMA DEBE` validar medidas, peso y 1 pieza por pasajero con RN-04.
- `SI` las medidas o el peso exceden los límites `EL SISTEMA DEBE` rechazar la entrada con error de validación.

### REQ-04: Mascota
- **Como** cliente **quiero** llevar una mascota en cabina **para** viajar con ella.
- `EL SISTEMA DEBE` aceptar como máximo 1 mascota por reserva, con peso ≤ 8 kg, sin asiento asignado.
- `SI` se solicita una segunda mascota o el peso excede 8 kg `EL SISTEMA DEBE` rechazar la entrada.

### REQ-05: Asientos
- **Como** cliente **quiero** elegir mis asientos **para** viajar con la ubicación deseada.
- `CUANDO` el cliente envía asientos de ida y de vuelta `EL SISTEMA DEBE` validar formato, existencia, estado LIBRE, cantidad igual al número de pasajeros y regla de exit row (RN-06).
- `CUANDO` la validación es correcta `EL SISTEMA DEBE` retener los asientos con `hold_token` y `hold_expira` = ahora + 15 min.
- `SI` un asiento no existe, no está LIBRE o no cumple la exit row `EL SISTEMA DEBE` rechazar la selección e indicar los asientos inválidos.

### REQ-06: Transacción
- **Como** sistema **quiero** crear una transacción por reserva **para** cobrar el monto final.
- `CUANDO` se crea la transacción `EL SISTEMA DEBE` guardar `execution_id` con el valor `{{$context.executionId}}` del agente.
- `EL SISTEMA DEBE` permitir una sola transacción PENDIENTE por reserva; si ya existe, devolver la existente.
- `EL SISTEMA DEBE` dejar la transacción en PENDIENTE y exponer el monto a la pasarela.
- `transaccion-crear` crea la fila de la transacción en PENDIENTE en Datum; `transacciones.id` = `_id` que devuelve el POST de la fila; la function devuelve ese id junto con el enlace de pago.

### REQ-07: Notificación de pago
- **Como** pasarela **quiero** notificar el resultado de un pago **para** que Jelou aplique el efecto.
- `CUANDO` llega una notificación `EL SISTEMA DEBE` verificar la firma HMAC sobre el cuerpo crudo antes de tocar datos.
- `SI` la firma no es válida `EL SISTEMA DEBE` rechazar la notificación y registrar el evento de rechazo por firma.
- `SI` el `event_id` ya existe en `eventos_pago` `EL SISTEMA DEBE` responder 200 sin efecto.
- `CUANDO` la transacción está en PENDIENTE y dentro de los 15 min `EL SISTEMA DEBE` aplicar el efecto de RN-10 o RN-11 y reanudar el agente.
- `CUANDO` la transacción ya expiró `EL SISTEMA DEBE` aplicar el efecto de RN-12.

### REQ-08: Reanudación del agente
- **Como** agente **quiero** continuar la conversación tras el pago **para** confirmar o informar el resultado.
- `CUANDO` una transición se aplica `EL SISTEMA DEBE` reanudar la ejecución con `executionId` = `execution_id` de la transacción, `message` = status (`paid`, `rejected` o `expired`) y `pauseInteraction: false`.
- `SI` la reanudación falla `EL SISTEMA DEBE` registrar el fallo y permitir el reintento de la notificación.

### REQ-09: Confirmación
- **Como** cliente **quiero** recibir mi PNR **para** presentarme en el aeropuerto.
- `CUANDO` el agente recibe status `paid` `EL SISTEMA DEBE` confirmar al cliente el PNR de la reserva en el mismo chat.
- `CUANDO` el agente recibe status `rejected` o `expired` `EL SISTEMA DEBE` informar el resultado sin reintentar el pago.

### REQ-10: Enlace de pago
- **Como** cliente **quiero** un enlace de pago en el chat **para** pagar.
- `EL SISTEMA DEBE` enviar el enlace de pago como texto plano en el mensaje de WhatsApp, con el host de la pasarela. El tipo exacto de mensaje de texto se verifica en el spike (ver Recomendaciones).

### REQ-11: Dashboard
- **Como** operador **quiero** ver vuelos y ocupación **para** tomar decisiones.
- `EL SISTEMA DEBE` mostrar vuelos, asientos vendidos por vuelo y destino, mapa de asientos y estadísticas.
- `EL SISTEMA DEBE` ser de solo lectura: no escribe en Datum.

### REQ-12: Seed
- **Como** desarrollador **quiero** cargar datos base **para** probar el flujo.
- `EL SISTEMA DEBE` cargar 6 rutas, 12 filas de temporada, 12 parámetros y 372 vuelos.
- `EL SISTEMA DEBE` ser idempotente por clave natural (ruta; número de vuelo).

## Edge cases y condiciones límite

| ID | Escenario | Comportamiento esperado |
|---|---|---|
| EC-01 | Asiento ocupado por otra reserva al validar | Rechazo con los asientos inválidos; no hay retención parcial |
| EC-02 | Hold vencido antes de pagar | El asiento cuenta como LIBRE por lectura; la notificación tardía aplica RN-12 |
| EC-03 | Notificación de aprobación después de 15 min | Transacción → EXPIRADA; asientos → LIBRE; reserva → EXPIRADA; reanudar con `expired` |
| EC-04 | Notificación duplicada (mismo `event_id`) | Responder 200 sin efecto; registrar evento duplicado |
| EC-05 | Firma HMAC inválida | Rechazar; no tocar datos; registrar rechazo por firma |
| EC-06 | Notificación de rechazo | Asientos → LIBRE; reserva → PAGO_RECHAZADO; reanudar con `rejected` |
| EC-07 | Notificación para transacción no PENDIENTE | Sin transición; respuesta 200 sin efecto |
| EC-08 | Segunda mascota | Rechazo |
| EC-09 | Mascota > 8 kg | Rechazo |
| EC-10 | Bodega con L+A+H > 158 cm, peso > 32 kg o segunda pieza por pasajero | Rechazo |
| EC-11 | Pasajero menor de 15 años en fila 13 o 14 | Rechazo |
| EC-12 | Número de asientos distinto de número de pasajeros | Rechazo |
| EC-13 | Formato de asiento inválido (p. ej. `99Z`) o fila/letra fuera de la clase | Rechazo |
| EC-14 | Fecha fuera de 2026-12-01 a 2027-01-31 | Rechazo |
| EC-15 | Colisión de PNR | Se genera otro PNR; la verificación por lectura es el control (riesgo residual) |
| EC-16 | Reserva con transacción PENDIENTE existente | Se devuelve la transacción existente; no se crea otra |
| EC-17 | Escritura del mapa con conflicto de versión | Reintento con backoff; máximo 3 intentos (ver Diseño de datos) |
| EC-18 | Pasajeros > 9 | Rechazo |

## Modelo de dominio

Contexto delimitado de la capacidad: reservas y vuelos de la aerolínea DEMO.

- **Unidad dueña del modelo:** `apps/agent` (RN-07). Su `domain-model.md` vive en `.makia/docs/specs/apps/agent/domain-model.md` (ruta contrastada con RN-07 y RN-A1: incluye el segmento `specs/`). `apps/pay` y `apps/crm` consumen el contrato publicado por `apps/agent` mediante copias verificadas por hash; no crean su propio `domain-model.md`. `apps/infrastructure` es unidad de arranque y no tiene modelo de dominio.

Entidades y lenguaje:

- **Ruta:** trayecto `origen-destino` con tarifa base. Exactamente 6.
- **Temporada:** multiplicador por mes. Exactamente 12.
- **Parámetro:** valor comercial u operativo por clave. Exactamente 12.
- **Vuelo:** ruta + fecha, con `mapa_asientos`. Un vuelo por ruta y día.
- **Asiento:** clave `<fila><letra>` dentro del mapa del vuelo. Estados: LIBRE, RETENIDO, VENDIDO, BLOQUEADO.
- **Reserva:** agrupa pasajeros, vuelos de ida y de regreso opcional, y un PNR.
- **Pasajero:** nombre, documento, edad, asiento de ida y asiento de regreso.
- **Equipaje:** de cabina o de bodega, por pasajero y trayecto.
- **Mascota:** por pasajero; no ocupa asiento.
- **Transacción:** pago de una reserva, con su estado y `execution_id`.
- **Evento de pago:** notificación aplicada, identificada por `id_evento`.

Invariantes: los de `db-design.dbml` (sección de cada tabla). Los principales son:

- Transacción: transición solo desde PENDIENTE.
- Evento de pago: `id_evento` = `<transaccion_id>:<estado>`, único; se registra antes de aplicar el efecto.
- Asiento RETENIDO: `hold_expira` = instante de creación + 15 min.
- Asiento VENDIDO: `pnr` = PNR de la reserva que lo vendió.
- Exit row: edad ≥ 15.
- Mascota: no referencia vuelos ni mapa de asientos.

Contexto delimitado nuevo: no aplica; el dominio es el de la capacidad, ya formalizado en la unidad dueña.

## Diseño de datos

Obligatorio: el esquema vive en `db-design.dbml` (junto a este documento). Es el diseño de base de datos a seguir, sin desvíos. Resumen de colecciones de Datum:

- `rutas` (6), `temporada` (12), `parametros` (12): datos de referencia cargados por seed.
- `vuelos` (372): `id`, `ruta_id`, `fecha`, `hora_salida` (07:00), `mapa_asientos` (JSON con 174 claves, una por asiento), `version` (contador de escrituras del mapa).
- `reservas`: `id`, `pnr`, `estado`, `vuelo_ida_id`, `vuelo_regreso_id` (nulo si solo ida), `hold_expira`, `total_cop`.
- `pasajeros`, `equipaje`, `mascotas`: por reserva.
- `transacciones`: `id` (pk, asignado por Datum), `reserva_id`, `estado`, `expira_at`, `execution_id`, `ultimo_evento`.
- `eventos_pago`: `id_evento` único, `transaccion_id`, `estado`.

Estados de reserva (`estado_reserva`): PENDIENTE_PAGO, EMITIDA, PAGO_RECHAZADO, EXPIRADA, CANCELADA. CANCELADA existe en el enum; las cancelaciones están fuera de alcance.

Estado inicial: la reserva se crea directamente en PENDIENTE_PAGO al ejecutar `transaccion-crear`. No hay estado BORRADOR persistido: el borrador vive en la memoria del agente.

**Mapa de asientos (`vuelos.mapa_asientos`):** motivo: Datum no tiene filtros ni transacciones. Clave `<fila><letra>`; valor `{estado, pnr, hold_token, hold_expira}`. LIBRE: pnr, hold_token y hold_expira nulos. RETENIDO: hold_token y hold_expira presentes. VENDIDO: pnr presente. BLOQUEADO: sin pnr ni hold. `hold_token` es opaco y no se expone fuera del backend.

**Protocolo de escritura (write-then-verify):** leer la fila del vuelo con su contador `vuelos.version`; modificar el mapa en memoria; escribir con `version + 1`; releer; si el `hold_token` o el `pnr` propio no están, reintentar con backoff (3 intentos). Si tras 3 intentos la verificación falla, la operación falla sin efecto parcial visible: la function responde HTTP 503 a quien llamó (el agente informa "reintenta en un momento"; la pasarela reintenta la notificación). No hay estado intermedio: la reserva queda PENDIENTE_PAGO y la transacción PENDIENTE hasta que una notificación o la expiración la resuelva.

**Riesgo residual documentado:** no es atómico. Dos escrituras concurrentes sobre el mismo vuelo pueden provocar doble venta. Aceptado solo para DEMO con tráfico bajo.

**Idempotencia de la notificación de pago:** `event_id` = `<transaccion_id>:<estado>`. Se consulta `eventos_pago` antes de procesar; si existe, responder 200 sin efecto. Datum no fuerza unicidad: riesgo residual.

**Orden de efectos en aprobación:** asientos VENDIDO → reserva EMITIDA → transacción APROBADA → reanudar el agente. Cada paso se puede reejecutar. Si un paso falla, la notificación se reintenta.

**Campos personales:** nombre, documento y edad son datos personales. Retención de la PoC: demo, no producción. Los logs enmascaran el documento.

**Cálculo de montos:** Se persisten: `reservas.total_cop` (total), `equipaje.precio_cop` y `mascotas.precio_cop` (cada línea de equipaje y mascota). El pasaje por pasajero y trayecto no tiene columna propia: se recalcula determinísticamente desde `rutas.tarifa_base_cop`, `temporada` y `parametros`.

## Arquitectura y stack técnico

**Arquitectura:** cuatro unidades en `apps/` (agent, pay, crm, infrastructure), cada una autocontenida. Datum es el almacén único. `apps/pay` y `apps/crm` consumen copias del contrato de `apps/agent`.

**Stack con versiones fijas:**

- Node.js 24.22.0, imagen `node:24.22.0-bookworm-slim`. Node 24 entra en mantenimiento según nodejs.org; se fija 24.22.0 para la PoC. Subir de versión es decisión del USUARIO.
- Express 5.3.0 en `apps/pay` y `apps/crm`.
- Chart.js 4.5.1 por CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`.
- `@jelou/cli` 4.13.1 en `apps/agent` (instalado globalmente en su `Dockerfile`, sobre `node:24.22.0-bookworm-slim`). Auth por `JELOU_TOKEN`.
- Jelou Functions: runtime Deno vía CLI. Paquete `@jelou/functions`; su versión se fija con la generada por `jelou functions init`.
- Docker Compose v5.6.0.
- Jelou Datum (cloud).

**Jelou Functions:** cada function se define con `define()` y un esquema zod de entrada (`input`). La validación ocurre antes del handler; si falla, responde HTTP 400 "Validation failed". Timeout por defecto 30 s, máximo 120 s. Contexto usado: `ctx.env.get`, `ctx.log`, `ctx.verifyHmac(request, { secretEnv, header })`. No existe `ctx.db`: Datum se consume solo por REST.

**Acceso a Datum:** REST `https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows`, con header `Authorization: Basic` (`JELOU_CLIENT_ID:JELOU_CLIENT_SECRET` en base64). Operaciones:

- Listar: `GET .../rows?limit=&page=`.
- Crear: `POST .../rows` con body `{"fields":{...}}`.
- Actualizar: `PUT .../rows/{rowId}` con body `{"fields":{...}}`.
- Leer por id: `GET .../rows/{rowId}`. Su confirmación es parte del spike.

Decisión: es la única API de filas con ejemplo literal. El spike confirma GET, POST y PUT por id. Plan B documentado: header `X-Api-Key`.

**Gateway de reanudación:** `POST https://gateway.jelou.ai/workflows/v1/skills/resume` con header `x-api-key: ${JELOU_API_KEY}`.

**Mensajería WhatsApp:** el agente envía las confirmaciones con sus nodos de Brain Studio; no hay código propio de envío. El enlace de pago va como texto plano en el mensaje.

**Compose (`apps/infrastructure/compose.yaml`):**

- `name: aerolinea-reservas-whatsapp`.
- Servicios: `crm`, `pay` y `agent-cli`. `agent-cli` tiene build context `../agent` y profile `tools`; no arranca con `docker compose up`.
- Red: `reservas-net`.
- Puertos publicados en `127.0.0.1`, desde `.env`.
- Healthcheck en `crm` y `pay` con CMD de Node contra `/health`.
- `.env.example`: `PORT_CRM=3000`, `PORT_PAY=3001`.

**Formato de archivos (Windows):** `.gitattributes` con `eol=lf` por unidad. Sin CRLF en `.sh`, `.yaml`, `.js` ni `Dockerfile`. `git config core.autocrlf false` en el repo.

**Configuración de verificación local (lefthook):** no aplica en esta PoC. Gap declarado para cualquier flujo no PoC: mapeo linter/formatter→glob pendiente.

## Estrategia de seguridad

**Amenazas relevantes:** falsificación de notificaciones de pago; doble venta de asientos; manipulación de precios desde el chat; inyección por entrada de texto del cliente; fuga de datos personales en logs; fuga de secretos en el repositorio.

**Medidas:**

- Toda entrada (asientos, medidas, peso, edad, fechas) se valida en la function con esquema zod antes de tocar datos. El LLM solo pasa texto.
- Precios y totales se calculan en servidor; el agente no los decide.
- La notificación de pasarela exige HMAC: `X-Webhook-Signature: sha256=<hex>`, donde `<hex>` es el HMAC-SHA256 hex del cuerpo crudo con secreto `PAY_WEBHOOK_SECRET`. Cuerpo JSON: `{"transaccion_id": "<id>", "estado": "APROBADA" | "RECHAZADA", "event_id": "<transaccion_id>:<estado>", "emitido_at": "<ISO8601>"}`. La pasarela no envía EXPIRADA: la function determina la expiración por `transacciones.expira_at` y la lectura.
- Autenticación de endpoints: solo `pago-notificacion` es pública (protegida por HMAC). El resto solo lo llama el agente con el token de Brain Studio.
- Secretos: solo `${VAR}` en `.env` no versionado. `.env` en `.gitignore` de cada unidad y de la raíz. Ningún valor en docs.
- Logs: el documento se enmascara.

**Operaciones con efecto e idempotencia:**

| Operación | Efecto | Idempotencia |
|---|---|---|
| Crear transacción | Crea transacción PENDIENTE | Una PENDIENTE por reserva; si existe, se devuelve la existente |
| Notificación de pasarela (`pago-notificacion`) | Transiciona transacción y aplica efectos | Clave `event_id` = `<transaccion_id>:<estado>`; HMAC obligatorio; consulta previa de `eventos_pago` |
| Reanudación del agente | Reanuda la ejecución | Una vez por transición; clave `event_id` |
| Retención de asientos | Asiento LIBRE → RETENIDO | Idempotente por `hold_token` |
| Liberación por expiración | Asiento RETENIDO → LIBRE | Idempotente: solo si RETENIDO y expirado |
| Seed | Crea filas de referencia | Idempotente por clave natural (ruta; número de vuelo) |
| Lectura (todas) | Ninguno | Naturalmente idempotente; no requiere mecanismo |

## Observabilidad

- **Eventos:** hold creado, expirado y liberado; transacción creada, notificada, duplicada y rechazada por firma; reanudación OK y fallida; errores de validación.
- **Correlación:** por `pnr`, `transaccion_id`, `execution_id` y `event_id`.
- **Formato:** `ctx.log` en las functions; JSON por línea en los servicios Node.
- **Privacidad:** el documento se enmascara en todos los logs.

## Estrategia de pruebas

- **Unitarias:** cálculo de precio y tarifas con temporada; parseo y validación de asientos; reglas de exit row; cálculo de bodega. Con `node:test` en Node y `deno test` para functions.
- **Contrato:** hash de las copias del contrato de `apps/agent` en `apps/pay` y `apps/crm`, comparado con el original.
- **Conformidad:** `db-design.dbml` contra una base de prueba de Datum creada con `jelou databases create`.
- **E2E único** con `docker compose up`: reserva aprobada (ida y vuelta, con asientos, equipaje, mascota) → PNR; reserva rechazada → asientos libres; expiración → asientos libres; notificación duplicada ignorada.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Autenticación de Datum contradictoria (`Basic` frente a `X-Api-Key`) | Bloquea acceso a datos | Spike go/no-go; plan B con `X-Api-Key` |
| Sin transacciones ni compare-and-set en Datum | Doble venta con escrituras concurrentes | Write-then-verify; aceptado solo para DEMO con tráfico bajo; CAS en producción |
| Jelou Functions en vista previa | Cambios de comportamiento | Fijar CLI 4.13.1; spike de `functions dev` |
| Node 24 en mantenimiento | Riesgo de ciclo de vida | Fijado 24.22.0; subir es decisión del USUARIO |
| Enlace de pago en localhost | Solo accesible desde el host | Host configurable por `.env` |
| Sin filtros en Datum | Lectura completa de colecciones | Colecciones pequeñas (6 rutas, 372 vuelos) |
| Límites de tasa no documentados | Fallos de carga del seed | Carga a ritmo bajo con backoff |
| Firma sobre cuerpo crudo frente a `JSON.stringify` | Firma rechazada o aceptada indebidamente | Spike de firma antes de implementar la verificación |
| `functions check` puede requerir Deno local | Bloquea verificación | Ejecutar dentro del contenedor |
| PNR duplicado | Dos reservas con el mismo código | Verificación por lectura antes de escribir; riesgo residual |
| Notificación de pago duplicada | Efecto doble | `event_id` y consulta previa de `eventos_pago`; unicidad no forzada por Datum (riesgo residual) |

## Directrices del proyecto

- **Global:** contenedorización obligatoria del CLI; nada se instala en el host.
- **Global:** secretos solo como `${VAR}` en `.env` no versionado.
- **Global:** `.gitattributes` con `eol=lf` por unidad.
- **Global:** nombre de compose derivado del idea-slug (`aerolinea-reservas-whatsapp`).
- **Global:** puertos desde `.env`.
- **Unidad: `apps/agent`:** CLI fijado en 4.13.1; Node 24.22.0.
- **Unidad: `apps/pay` y `apps/crm`:** Express 5.3.0.

## Decisiones tomadas

1. Aerolínea DEMO; solo vuelos nacionales entre BOG, MDE, CLO y CTG; 6 trayectos bidireccionales.
2. Vuelos: un vuelo diario por trayecto, de 2026-12-01 a 2027-01-31 (372 vuelos), salida 07:00.
3. Aeronave Boeing 737-8 MAX, 174 asientos; Premium filas 1–3 (A, C, D, F); Extended filas 4–7 (A–F); Economy filas 8–30 (A–F); exit row filas 13 y 14; asiento `<fila><letra>`.
4. Flujo conversacional: trayecto → pasajeros (1–9) → fechas → vuelos → equipaje → mascotas → asientos → resumen y total → transacción → pago → PNR o fallo o expiración.
5. Tarifa plana por pasajero y trayecto con los valores de RN-01, por multiplicador de temporada de RN-02 (aplicado también a equipaje y mascotas). Valores DEMO, parametrizables.
6. Bodega: fórmula y límites de RN-04 (158 cm lineales como supuesto de interpretación DEMO; 32 kg; 1 pieza por pasajero). Valores DEMO: tarifa_kg_bodega_cop 12000; cargo_minimo_bodega_cop 40000.
7. Mascota: 1 por reserva; ≤ 8 kg; cabina; tarifa_mascota_cop 150000 × temporada.
8. Asientos validados en servidor (RN-06).
9. Monto = pasajes + equipaje + mascotas; redondeo a COP entero; se persisten `reservas.total_cop`, `equipaje.precio_cop` y `mascotas.precio_cop`.
10. Hold de 15 min; liberación efectiva por lectura; cron opcional para limpieza.
11. Transacción: PENDIENTE → APROBADA | RECHAZADA | EXPIRADA; solo desde PENDIENTE; expira a los 15 min de creación.
12. Aprobada, rechazada y expirada: efectos de RN-10, RN-11 y RN-12, con reanudación del agente.
13. PNR: 6 caracteres de `[A-Z2-9]` sin O, I, 0, 1; generado al crear la reserva; único por verificación de lectura (riesgo residual).
14. Inventario de asientos en `vuelos.mapa_asientos` (JSON por vuelo); protocolo write-then-verify con 3 intentos.
15. Idempotencia de la notificación por `event_id` = `<transaccion_id>:<estado>` con consulta previa de `eventos_pago`.
16. Orden de efectos en aprobación: asientos VENDIDO → reserva EMITIDA → transacción APROBADA → reanudar.
17. `execution_id` se asigna al crear la transacción y es obligatorio desde ese momento.
18. Stack con versiones fijas: Node.js 24.22.0; Express 5.3.0; Chart.js 4.5.1 por CDN; `@jelou/cli` 4.13.1; Docker Compose v5.6.0; Datum (cloud); Jelou Functions.
19. Acceso a Datum por REST con Basic; plan B con `X-Api-Key`.
20. Reanudación por `POST https://gateway.jelou.ai/workflows/v1/skills/resume` con `x-api-key: ${JELOU_API_KEY}`.
21. Mensajes por nodos de Brain Studio; enlace de pago como texto plano.
22. Carriles por unidad, con orden: `apps/agent` → `apps/pay` y `apps/crm` en paralelo → `apps/infrastructure` → e2e.
23. `apps/agent` es dueña de la DB y de su contrato; no hay contenedor de DB.
24. La versión del CLI se fija en `apps/agent`, porque sus artefactos los despliega el CLI.
25. Tests de conformidad dbml ↔ Datum contra una base de prueba creada con `jelou databases create`.
26. Datos personales: retención de la PoC = demo, no producción; logs enmascaran el documento.
27. Autenticación: solo `pago-notificacion` es pública (HMAC); el resto lo llama el agente con el token de Brain Studio.
28. Seed idempotente por clave natural (ruta; número de vuelo).
29. Node 24 y Express 5 se fijan en la PoC; subir de versión es decisión del USUARIO.
30. Lefthook no aplica en la PoC; gap declarado para flujos no PoC.
31. ID de transacción: lo asigna Datum al crear la fila (`_id` del POST de rows). `transaccion-crear` crea la fila en PENDIENTE, toma su `_id` como `transacciones.id` y lo devuelve junto con el enlace de pago.
32. Protocolo write-then-verify con la columna `vuelos.version`, incrementada en cada escritura del mapa.
33. Payload de `pago-notificacion`: cuerpo `{"transaccion_id", "estado": APROBADA | RECHAZADA, "event_id": "<transaccion_id>:<estado>", "emitido_at"}` con cabecera `X-Webhook-Signature: sha256=<HMAC-SHA256 hex del cuerpo crudo con PAY_WEBHOOK_SECRET>`. EXPIRADA no la envía la pasarela: la function la determina por `expira_at` y la lectura.
34. Reanudación al agente: `message` = `paid` (aprobada), `rejected` (rechazada) o `expired` (expirada); `pauseInteraction: false`; `executionId` = `transacciones.execution_id`.
35. Fallo tras 3 intentos del write-then-verify: la operación falla sin efecto parcial visible; la function devuelve error 503 a quien llamó (el agente informa "reintenta en un momento"; la pasarela reintenta la notificación). Sin estado intermedio: reserva PENDIENTE_PAGO y transacción PENDIENTE hasta que una notificación o la expiración la resuelva.
36. Redondeo: cada línea (pasaje por pasajero y trayecto, equipaje, mascota) se redondea a COP entero con `Math.round` (mitad hacia arriba para positivos); el total es la suma de líneas ya redondeadas.
37. Estado inicial: la reserva se crea directamente en PENDIENTE_PAGO al ejecutar `transaccion-crear`; no hay estado BORRADOR persistido (el borrador vive en la memoria del agente).
38. Vinculación: `transacciones.expira_at` = `reservas.hold_expira` = instante de creación de la transacción + `hold_minutos` (15). Ambos vencen juntos.

## Recomendaciones de implementación

- **Orden de tareas:** lo define la etapa L de la PoC, dentro de `poc/tasks.md`, derivado de este documento.
- **Primer hito: spike go/no-go.** Debe pasar antes de dar la PoC por viable:
  1. Auth y CRUD de Datum con curl (Basic sobre `api.jelou.ai/v2/databases/{id}/rows`), incluido GET por id.
  2. Firma HMAC sobre el cuerpo crudo, con header de firma confirmado.
  3. `ctx.verifyHmac` en `jelou functions dev`.
  4. `functions check` dentro de `node:24.22.0-bookworm-slim`.
  5. Envío de mensaje de texto por WhatsApp, con el tipo de mensaje confirmado.
- Registrar en el spike los códigos HTTP y la respuesta de límite de tasa (429 y cabeceras).
- Carga del seed (372 vuelos) a ritmo bajo, con backoff.
- Verificar `docker compose config --services` con el profile `tools`.

## Criterios de aceptación / Definition of Done

- `docker compose up` levanta `crm`, `pay` y la unidad CLI con healthchecks en verde.
- E2E:
  - Reserva de ida y vuelta con asientos, equipaje y mascota; pago aprobado → PNR.
  - Pago rechazado → asientos libres.
  - Expiración → asientos libres.
  - Notificación duplicada → ignorada.
- El dashboard muestra vuelos y asientos vendidos.
- `git ls-files --eol` sin `i/crlf` en `.sh`, `.yaml`, `.js` y `Dockerfile`.
- Ningún secreto versionado; todo valor sensible como `${VAR}`.
- Tests de conformidad dbml ↔ base de prueba de Datum en verde.
- Hash del contrato de `apps/agent` igual en las copias de `apps/pay` y `apps/crm`.
