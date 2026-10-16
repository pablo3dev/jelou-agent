# Reserva y pago por WhatsApp: agente conversacional y reglas de reserva

> Este documento es el **artefacto de aprobación del USUARIO** (ver `spec.md`, sección "Artefacto de aprobación del USUARIO"). Es autosuficiente: todo lo necesario para aprobar el alcance, los objetivos y los criterios de éxito del spec está aquí, sin necesidad de leer `design.md` ni `tasks.md`.

- **Spec:** `reserva-pago-whatsapp-agent`
- **Unidad:** `apps/agent` (dueña del modelo de dominio de la capacidad: [domain-model.md](../domain-model.md))

## Resumen

Aerolínea DEMO que vende vuelos nacionales entre BOG, MDE, CLO y CTG. Este spec cubre el lado conversacional y de reglas: un agente por WhatsApp guía al cliente desde la elección del trayecto hasta la entrega del localizador (PNR), y los servicios del agente validan, cotizan, retienen asientos, crean la transacción de pago y aplican el resultado del pago. La base de datos única es Jelou Datum.

## Problema

El cliente necesita reservar un vuelo nacional por WhatsApp sin salir de la conversación, con pago y confirmación en el mismo canal. Hoy no existe un flujo que haga la reserva completa (pasajeros, fechas, equipaje, mascota, asientos, total y pago) con inventario de asientos consistente y con precios que el cliente no pueda manipular desde el chat.

## Solución

- **En qué consiste:** un agente conversacional por WhatsApp que conduce el flujo: trayecto, pasajeros (1 a 9), fechas de ida y de vuelta, vuelos, por pasajero equipaje y mascota, asientos de ida y de vuelta, resumen con total, transacción, enlace de pago y, según el resultado del pago, PNR, rechazo o expiración. Los servicios del agente validan cada dato, calculan los precios, retienen los asientos y aplican el resultado del pago sobre asientos, reserva y transacción.
- **Cómo resuelve el problema:** todo el flujo ocurre en el mismo chat; los precios y totales los calcula el servidor (el agente solo transmite lo que dice el cliente); los asientos se validan y se retienen por 15 minutos para evitar ventas dobles dentro de la reserva; y el resultado del pago reanuda la conversación con la confirmación del PNR o el aviso de fallo.

## Objetivos y criterios de éxito

- **Objetivo 1:** un cliente completa por WhatsApp una reserva de ida y vuelta (con equipaje, mascota y asientos) y recibe su PNR en el mismo chat cuando el pago es aprobado.
- **Objetivo 2:** ningún asiento queda vendido sin pago aprobado: un pago rechazado o vencido deja los asientos libres y la conversación informa el resultado.
- **Objetivo 3:** el total que ve el cliente es el calculado por el servidor con las tarifas, la temporada y los parámetros vigentes, redondeado por línea a pesos enteros.
- **Objetivo 4:** los datos base (6 rutas, 12 temporadas, 12 parámetros y 372 vuelos con 174 asientos cada uno) se cargan de forma repetible y las colecciones de la base coinciden con el diseño publicado.

---

## Actores de negocio y flujo de valor

- **Cliente (WhatsApp):** reserva y paga un vuelo y recibe su PNR. Flujo: trayecto, número de pasajeros, fechas de ida y de vuelta, vuelos, por pasajero equipaje y mascota, asientos de ida y de vuelta, resumen y total, transacción, pago, confirmación con PNR o aviso de rechazo o expiración.
- **Agente conversacional (Brain Studio):** conduce la conversación, transmite al servidor lo que dice el cliente y espera el resultado del pago para continuar.
- **Pasarela de pago (simulada):** informa al sistema si el pago fue aprobado o rechazado. Su comportamiento propio pertenece a su spec; aquí solo se define cómo el sistema recibe y aplica su notificación.
- **Operador de la aerolínea:** consulta el estado de vuelos y ocupación en el dashboard; el dashboard pertenece a su propio spec.

---

## Delimitación del Alcance (Scope Boundaries)
- **Dentro del Alcance (In Scope - Fase Actual):**
  - Búsqueda de vuelos de ida y de ida y vuelta entre los 6 trayectos, con 1 a 9 pasajeros, dentro de la ventana 2026-12-01 a 2027-01-31.
  - Cotización de pasaje, equipaje de bodega y mascota, con total calculado por el servidor.
  - Equipaje de cabina sin costo y de bodega con medidas y peso; una mascota por reserva en cabina.
  - Validación y retención de asientos (hold de 15 minutos), incluida la regla de salida de emergencia.
  - Creación de la transacción de pago con enlace de pago, reserva en PENDIENTE_PAGO y PNR único.
  - Recepción de la notificación de pago con firma verificable: aprobación, rechazo y expiración, con idempotencia.
  - Reanudación de la conversación con el resultado (`paid`, `rejected`, `expired`) y mensaje final al cliente.
  - Carga base (seed) de rutas, temporadas, parámetros y vuelos, y verificación de conformidad de las colecciones con el diseño publicado.
- **Fuera del Alcance (Out of Scope / Non-Goals):**
  - Cancelaciones, reemisiones, check-in y equipaje de regreso.
  - Más de un proveedor de pago y plantillas de WhatsApp (HSM).
  - Vuelos internacionales y más de los 6 trayectos.
  - Garantías de producción (SLA, multi-tenencia, escritura atómica o transacciones en la base): la DEMO acepta tráfico bajo.
  - La pasarela de pago simulada y el dashboard de solo lectura (cada uno tiene su propio spec).
  - Limpieza periódica automática de retenciones: la liberación de un hold vencido es efectiva por lectura.

---

## Reglas de Negocio y Políticas del Dominio
- **RN-01 Tarifa:** tarifa plana por pasajero y trayecto: BOG-MDE y MDE-BOG 350000; BOG-CLO y CLO-BOG 380000; BOG-CTG y CTG-BOG 420000 (COP), multiplicada por el multiplicador de temporada del mes de la fecha de viaje del trayecto. Valores DEMO, parametrizables.
- **RN-02 Temporada:** multiplicador 1.30 para los meses 1, 6, 7 y 12; 1.00 para el resto. Se aplica a pasaje, equipaje y mascota según el mes de la fecha del vuelo de cada trayecto, no según la fecha de compra.
- **RN-03 Equipaje de cabina:** sin costo y sin medidas.
- **RN-04 Equipaje de bodega:** medidas largo, ancho y alto en cm y peso en kg. `cobrable_kg = ceil(max(peso_kg, L*A*H/6000))`; `precio = max(cargo mínimo, cobrable_kg * tarifa por kg) * multiplicador de temporada`, con tarifa por kg 12000 y cargo mínimo 40000 (valores DEMO). Límites: L+A+H <= 158 cm (supuesto de interpretación DEMO), peso <= 32 kg y 1 pieza de bodega por pasajero.
- **RN-05 Mascota:** máximo 1 por reserva; peso <= 8 kg; viaja en cabina y no ocupa asiento. Precio: 150000 por el multiplicador de temporada. Aplicación en el regreso: ver la divergencia abierta en REQ-04.
- **RN-06 Asientos:** formato `12A 12B` o `12A,12B`, validado en el servidor: formato, existencia en el mapa del vuelo, estado LIBRE y cantidad igual al número de pasajeros. La salida de emergencia (filas 13 y 14) solo admite pasajeros de 15 años o más. Aeronave: Boeing 737-8 MAX, 174 asientos; Premium filas 1 a 3 (letras A, C, D, F), Extended filas 4 a 7 (A a F), Economy filas 8 a 30 (A a F).
- **RN-07 Pago:** monto = suma de pasajes (ida y, si aplica, vuelta) + equipaje + mascota. Cada línea (pasaje por pasajero y trayecto, equipaje, mascota) se redondea a COP entero (mitad hacia arriba) y el monto es la suma de líneas ya redondeadas.
- **RN-08 Hold de asientos:** dura 15 minutos. Un hold es válido solo si el asiento está RETENIDO y su vencimiento es posterior a ahora. Un hold vencido equivale a LIBRE, por lectura.
- **RN-09 Transacción:** estados PENDIENTE a APROBADA, RECHAZADA o EXPIRADA; solo se transiciona desde PENDIENTE. Expira 15 minutos después de su creación y vence junto con el hold de la reserva. Una aprobación que llega después del vencimiento deja la transacción en EXPIRADA.
- **RN-10 Aprobación:** asientos a VENDIDO con el PNR; reserva a EMITIDA; transacción a APROBADA; luego se reanuda la conversación con `paid`.
- **RN-11 Rechazo:** asientos a LIBRE; reserva a PAGO_RECHAZADO; transacción a RECHAZADA; se reanuda con `rejected`. El agente informa y no reintenta solo el pago.
- **RN-12 Expiración:** asientos a LIBRE; reserva a EXPIRADA; transacción a EXPIRADA; se reanuda con `expired`. Ocurre cuando llega una notificación tarde.
- **RN-13 PNR:** 6 caracteres de `[A-Z2-9]` sin O, I, 0 ni 1; se genera al crear la reserva y es único (se verifica por lectura antes de escribir).
- **RN-14 Ventana:** toda fecha de viaje está entre 2026-12-01 y 2027-01-31 inclusive.
- **RN-15 Cantidad:** entre 1 y 9 pasajeros por reserva.

---

## Requerimientos Funcionales y Criterios EARS

### REQ-01: Búsqueda de vuelos
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** elegir trayecto, número de pasajeros y fechas
  - **Para:** ver los vuelos disponibles con sus asientos libres

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-1.1 (Ubicuo):**
  - `EL SISTEMA DEBE` aceptar solo los 6 trayectos de RN-01 y entre 1 y 9 pasajeros (RN-15).
- **REQ-1.2 (Evento, solo ida):**
  - `CUANDO` el cliente indica trayecto y fecha de ida dentro de la ventana de RN-14
  - `EL SISTEMA DEBE` devolver el vuelo de ese día con su salida, sus asientos libres y la temporada aplicable.
- **REQ-1.3 (Evento, ida y vuelta):**
  - `CUANDO` el cliente indica además una fecha de regreso
  - `EL SISTEMA DEBE` devolver también el vuelo del regreso, que recorre la ruta inversa, con una fecha igual o posterior a la de ida.
- **REQ-1.4 (Estado):**
  - `MIENTRAS` un asiento tenga un hold vencido `CUANDO` se cuenten los asientos libres de un vuelo
  - `EL SISTEMA DEBE` contarlo como libre.
- **REQ-1.5 (Excepción):**
  - `SI` la fecha está fuera de la ventana, el trayecto no existe, no hay vuelo en la fecha, el regreso es anterior a la ida, el regreso no es la ruta inversa o los pasajeros están fuera de 1 a 9 `CUANDO` el cliente intenta buscar
  - `EL SISTEMA DEBE` rechazar la entrada indicando el motivo y sin devolver vuelos.

**Verificación:** `vuelos-buscar/logica_test.ts` (8 tests: ventana y bordes, fechas fuera, regreso anterior/pasajeros/ruta, solo ida con temporada, ida y vuelta con ruta inversa, fecha sin vuelo, asientos_libres con hold vencido como libre, catálogo por colección); `rutas-listar/logica_test.ts` (2 tests); `lib/asientos_test.ts` «ventana: 2026-12-01..2027-01-31 inclusive» y «pasajeros: 1 a 9».

### REQ-02: Cotización
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** ver el total antes de pagar
  - **Para:** decidir si continúo con la reserva

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-2.1 (Ubicuo):**
  - `EL SISTEMA DEBE` calcular pasaje, equipaje de bodega y mascota en el servidor con RN-01, RN-02, RN-04, RN-05 y RN-07; el agente no decide precios.
- **REQ-2.2 (Evento):**
  - `CUANDO` el cliente solicita la cotización de su reserva
  - `EL SISTEMA DEBE` devolver el detalle por línea (pasaje por pasajero y trayecto, equipaje, mascota) y un total igual a la suma de las líneas ya redondeadas (RN-07).
- **REQ-2.3 (Condicional):**
  - `MIENTRAS` el equipaje sea de bodega `CUANDO` se cotice
  - `EL SISTEMA DEBE` calcular su precio solo con medidas y peso validados.
- **REQ-2.4 (Excepción):**
  - `SI` los datos de la cotización incumplen una regla de negocio (RN-04, RN-05, RN-14, RN-15) `CUANDO` se solicita la cotización
  - `EL SISTEMA DEBE` rechazarla con el motivo y sin devolver total.

**Verificación:** `cotizar/logica_test.ts` (5 tests); `lib/precios_test.ts` «temporada», «pasaje» y «total: suma de lineas ya redondeadas».

### REQ-03: Equipaje
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** declarar el equipaje de cada pasajero
  - **Para:** pagar solo lo que llevo

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-3.1 (Ubicuo):**
  - `EL SISTEMA DEBE` registrar el equipaje de cabina sin costo y sin medidas (RN-03).
- **REQ-3.2 (Evento):**
  - `CUANDO` el cliente declara equipaje de bodega con medidas y peso
  - `EL SISTEMA DEBE` calcular los kilos cobrables, el precio con el cargo mínimo y la temporada del trayecto (RN-04) y devolverlos al cliente.
- **REQ-3.3 (Excepción):**
  - `SI` L+A+H supera 158 cm, el peso supera 32 kg, se declara más de 1 pieza de bodega por pasajero o las entradas no son válidas `CUANDO` el cliente declara la bodega
  - `EL SISTEMA DEBE` rechazar la entrada explicando el límite incumplido.

**Verificación:** `equipaje-calcular/logica_test.ts` (6 tests); `lib/precios_test.ts` «peso volumetrico», «bodega: minimo...», «bodega: limites...» y «bodega: entradas invalidas».

### REQ-04: Mascota
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** llevar una mascota en cabina
  - **Para:** viajar con ella

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-4.1 (Ubicuo):**
  - `EL SISTEMA DEBE` aceptar como máximo 1 mascota por reserva, con peso de hasta 8 kg, en cabina y sin asiento asignado (RN-05).
- **REQ-4.2 (Evento):**
  - `CUANDO` el cliente declara una mascota válida
  - `EL SISTEMA DEBE` cobrar 150000 por el multiplicador de temporada del vuelo de ida e incluirlo en el total.
- **REQ-4.3 (Excepción):**
  - `SI` se solicita una segunda mascota en la reserva o el peso excede 8 kg `CUANDO` el cliente la declara
  - `EL SISTEMA DEBE` rechazar la entrada con el motivo.

**Divergencia (abierta, decisión del USUARIO pendiente):** la regla vigente en el código cobra la mascota UNA sola vez por reserva, solo en el trayecto de ida y con la temporada del vuelo de ida; el regreso no la cobra. RN-05 dice "1 por reserva" y que la temporada se aplica según el mes de cada trayecto, pero no precisa si la mascota se cobra también en el regreso. Hasta que el USUARIO decida, rige el comportamiento descrito en REQ-4.2.

**Verificación:** `lib/precios_test.ts` «mascota: <= 8 kg, 1 por reserva, 150000 x temporada»; `cotizar/logica_test.ts` «entrada: ... mascota <= 8 kg ...» y «reglas de negocio -> ErrorNegocio (400)». La divergencia del cobro en el regreso no tiene test porque la regla no está definida.

### REQ-05: Asientos
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** elegir mis asientos de ida y de vuelta
  - **Para:** viajar con la ubicación deseada

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-5.1 (Evento, validación):**
  - `CUANDO` el cliente envía los asientos de ida y de vuelta (formato `12A 12B` o `12A,12B`)
  - `EL SISTEMA DEBE` validar formato, existencia en el mapa del vuelo, estado LIBRE, cantidad igual al número de pasajeros y regla de salida de emergencia (RN-06).
- **REQ-5.2 (Evento, retención):**
  - `CUANDO` la validación es correcta
  - `EL SISTEMA DEBE` retener todos los asientos con un identificador de retención y un vencimiento de ahora más 15 minutos (RN-08).
- **REQ-5.3 (Estado):**
  - `MIENTRAS` un asiento tenga un hold vencido `CUANDO` otra selección lo solicite
  - `EL SISTEMA DEBE` tratarlo como LIBRE.
- **REQ-5.4 (Excepción):**
  - `SI` un asiento no existe, no está LIBRE, tiene formato inválido, está en filas 13 o 14 y el pasajero es menor de 15 años, o la cantidad no coincide con los pasajeros `CUANDO` se intenta retener
  - `EL SISTEMA DEBE` rechazar la selección completa, indicar los asientos inválidos y no dejar ninguna retención parcial.
- **REQ-5.5 (Excepción, concurrencia):**
  - `SI` la escritura del mapa de asientos de un vuelo no se confirma al releerla (conflicto de versión) `CUANDO` se retiene o se vende
  - `EL SISTEMA DEBE` reintentar hasta 3 veces con espera creciente y, si no se confirma, responder un error de servicio no disponible sin efecto parcial visible, de modo que se pueda reintentar.

**Verificación:** `asientos-validar-retener/logica_test.ts` (10 tests); `lib/asientos_test.ts` (10 tests); `lib/datum_test.ts` «write-then-verify: ...» (5 tests: éxito, relectura distinta, conflicto de negocio, agotamiento de 3 intentos con 503, errores HTTP).

### REQ-06: Transacción
- **Historia de Usuario:**
  - **Como:** sistema
  - **Quiero:** crear una transacción de pago por reserva
  - **Para:** cobrar el monto final y entregar al cliente el enlace de pago

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-6.1 (Evento):**
  - `CUANDO` el cliente confirma el resumen
  - `EL SISTEMA DEBE` crear la reserva en PENDIENTE_PAGO con PNR único (RN-13) y total calculado, crear la transacción en PENDIENTE y devolver el identificador de la transacción y el enlace de pago.
- **REQ-6.2 (Ubicuo):**
  - `EL SISTEMA DEBE` guardar, al crear la transacción, el identificador de la ejecución de la conversación, y exigirlo como obligatorio.
- **REQ-6.3 (Ubicuo):**
  - `EL SISTEMA DEBE` fijar `expira_at` de la transacción y `hold_expira` de la reserva en el mismo instante: creación más 15 minutos, re-fijando el hold de los asientos retenidos (RN-09).
- **REQ-6.4 (Condicional):**
  - `MIENTRAS` la reserva ya tenga una transacción PENDIENTE `CUANDO` se solicite crear otra
  - `EL SISTEMA DEBE` devolver la existente y no crear una nueva.
- **REQ-6.5 (Excepción):**
  - `SI` falta el identificador de la ejecución o los datos incumplen una regla de negocio `CUANDO` se intenta crear la transacción
  - `EL SISTEMA DEBE` rechazar la operación sin crear reserva ni transacción.

**Verificación:** `transaccion-crear/logica_test.ts` (13 tests).

### REQ-07: Notificación de pago
- **Historia de Usuario:**
  - **Como:** pasarela de pago
  - **Quiero:** notificar el resultado de un pago
  - **Para:** que el sistema aplique el efecto sobre asientos, reserva y transacción

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-7.1 (Ubicuo, seguridad):**
  - `EL SISTEMA DEBE` verificar la firma de la notificación sobre el cuerpo tal como llegó, antes de leer o modificar cualquier dato.
- **REQ-7.2 (Excepción, firma):**
  - `SI` la firma no es válida `CUANDO` llega una notificación
  - `EL SISTEMA DEBE` rechazarla (no autorizada) sin ningún efecto sobre los datos.
- **REQ-7.3 (Excepción, duplicado):**
  - `SI` el identificador del evento (`<transaccion_id>:<estado>`) ya fue registrado `CUANDO` llega la notificación
  - `EL SISTEMA DEBE` responder correctamente sin aplicar ningún efecto.
- **REQ-7.4 (Estado, vigente):**
  - `MIENTRAS` la transacción esté PENDIENTE y dentro de sus 15 minutos `CUANDO` llega una aprobación o un rechazo
  - `EL SISTEMA DEBE` aplicar el efecto de RN-10 o de RN-11 en ese orden y reanudar la conversación.
- **REQ-7.5 (Estado, vencida):**
  - `MIENTRAS` la transacción esté PENDIENTE y ya haya vencido `CUANDO` llega cualquier notificación
  - `EL SISTEMA DEBE` aplicar el efecto de RN-12 (expiración) y reanudar con `expired`.
- **REQ-7.6 (Estado, no pendiente):**
  - `SI` la transacción no está PENDIENTE `CUANDO` llega una notificación
  - `EL SISTEMA DEBE` responder correctamente sin transición ni efecto.

**Nota (interpretación vigente, observabilidad):** el rechazo por firma inválida se registra como entrada del registro operativo de la function (log con firma inválida), no como fila de eventos de pago; los datos no se tocan.

**Verificación:** `pago-notificacion/logica_test.ts` (22 tests).

### REQ-08: Reanudación del agente
- **Historia de Usuario:**
  - **Como:** agente conversacional
  - **Quiero:** continuar la conversación tras el pago
  - **Para:** confirmar o informar el resultado al cliente

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-8.1 (Evento):**
  - `CUANDO` se aplica una transición de la transacción
  - `EL SISTEMA DEBE` reanudar la ejecución pausada del agente, identificada con el identificador de ejecución guardado en la transacción, con el mensaje `paid`, `rejected` o `expired` según la transición y sin mantener la pausa de interacción.
- **REQ-8.2 (Excepción):**
  - `SI` la reanudación falla (error de red o respuesta no exitosa) `CUANDO` se intenta reanudar
  - `EL SISTEMA DEBE` responder error de servicio no disponible, dejar la transacción en PENDIENTE y permitir que el reintento de la notificación reaplique el efecto.

**Verificación:** `pago-notificacion/logica_test.ts` «CRITICA reanudación: URL, cabecera x-api-key y cuerpo exactos», «fallo de reanudación => 503...». Comportamiento vigente (no requerido por el negocio): si falta el identificador de ejecución, el sistema aplica el efecto sin reanudar (solo log y la transacción se cierra); cubierto por el test «transacción sin execution_id: aplica el efecto sin reanudar».

### REQ-09: Confirmación en el chat
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** recibir mi PNR en el mismo chat tras pagar
  - **Para:** presentarme en el aeropuerto

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-9.1 (Evento, aprobado):**
  - `CUANDO` el agente recibe `paid`
  - `EL SISTEMA DEBE` confirmar al cliente el PNR de su reserva en el mismo chat.
- **REQ-9.2 (Evento, fallido):**
  - `CUANDO` el agente recibe `rejected` o `expired`
  - `EL SISTEMA DEBE` informar el resultado al cliente sin reintentar el pago por su cuenta.

**Divergencia:** este requerimiento no tiene test automatizado verde; el comportamiento del agente en WhatsApp se verificó con evidencia manual de extremo a extremo (commits `1d3cc35`, `289e60f`, `d257860`: pago aprobado, rechazado, expirado y notificación duplicada, canal sandbox).

### REQ-10: Enlace de pago en el chat
- **Historia de Usuario:**
  - **Como:** cliente
  - **Quiero:** recibir un enlace de pago en el chat
  - **Para:** pagar mi reserva

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-10.1 (Evento):**
  - `CUANDO` se crea la transacción
  - `EL SISTEMA DEBE` entregar al cliente el enlace de pago, formado por la dirección pública de la pasarela más la identificación de la transacción, como texto plano en el mensaje de WhatsApp.

**Divergencia (parcial):** la construcción del enlace está probada por `transaccion-crear/logica_test.ts` «crea reserva PENDIENTE_PAGO con PNR y total, transacción PENDIENTE y enlace de pago». La entrega del mensaje con el enlace en el chat de WhatsApp no tiene test automatizado; se verificó manualmente (commit `631350d`).

### REQ-11: Datos base (seed)
- **Historia de Usuario:**
  - **Como:** desarrollador
  - **Quiero:** cargar los datos base de la aerolínea
  - **Para:** probar el flujo completo

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-11.1 (Evento):**
  - `CUANDO` se ejecuta la carga base
  - `EL SISTEMA DEBE` crear 6 rutas, 12 filas de temporada, 12 parámetros y 372 vuelos (uno diario por trayecto, 07:00) cada uno con 174 asientos LIBRE.
- **REQ-11.2 (Ubicuo):**
  - `EL SISTEMA DEBE` ser idempotente por clave natural: una segunda ejecución no duplica filas.
- **REQ-11.3 (Ubicuo):**
  - `EL SISTEMA DEBE` cargar a ritmo bajo con reintento y espera creciente ante límites de la base.

**Verificación:** `seed/seed.test.mjs` (18 tests; `node --test` en `apps/agent/seed`).

### REQ-12: Conformidad de datos
- **Historia de Usuario:**
  - **Como:** desarrollador
  - **Quiero:** comprobar que las colecciones de la base coinciden con el diseño publicado
  - **Para:** que los demás componentes consuman un esquema fiable

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-12.1 (Ubicuo):**
  - `EL SISTEMA DEBE` mantener las colecciones de Datum coincidentes con el diseño de base de datos publicado por la unidad dueña.
- **REQ-12.2 (Evento):**
  - `CUANDO` se ejecuta la verificación de conformidad
  - `EL SISTEMA DEBE` comparar colecciones y campos reales contra el diseño y reportar cada diferencia.

**Verificación:** `contract/conformidad.test.mjs` (9 tests sobre el comparador). El test automatizado verifica el comparador, no la base en vivo; la comparación contra Datum real se ejecutó con `contract/conformidad.sh` (commit `4ae8456`).

---

## Edge Cases & Boundary Conditions
| ID | Escenario / Condición Límite | Comportamiento Esperado del Sistema | Test que lo prueba |
|:---|:---|:---|:---|
| **EC-01** | Asiento ocupado por otra reserva al validar | Rechazo con los asientos inválidos; ninguna retención parcial | `asientos-validar-retener/logica_test.ts`; `lib/asientos_test.ts` |
| **EC-02** | Hold vencido antes de pagar | El asiento cuenta como LIBRE por lectura; la notificación tardía aplica RN-12 | `lib/asientos_test.ts`; `vuelos-buscar/logica_test.ts` «asientos_libres con hold vencido=libre»; `pago-notificacion/logica_test.ts` |
| **EC-03** | Notificación de aprobación después de 15 min | Transacción, reserva y asientos pasan a EXPIRADA, EXPIRADA y LIBRE; se reanuda con `expired` | `pago-notificacion/logica_test.ts` |
| **EC-04** | Notificación duplicada (mismo identificador de evento) | Respuesta correcta sin efecto | `pago-notificacion/logica_test.ts` |
| **EC-05** | Firma inválida | Rechazo no autorizado; no se tocan datos; se deja registro en el log de la function | `pago-notificacion/logica_test.ts` |
| **EC-06** | Notificación de rechazo | Asientos LIBRE; reserva PAGO_RECHAZADO; transacción RECHAZADA; se reanuda con `rejected` | `pago-notificacion/logica_test.ts` |
| **EC-07** | Notificación para transacción no PENDIENTE | Sin transición; respuesta correcta sin efecto | `pago-notificacion/logica_test.ts` |
| **EC-08** | Segunda mascota en la reserva | Rechazo | `lib/precios_test.ts` «mascota: <= 8 kg, 1 por reserva, 150000 x temporada»; `cotizar/logica_test.ts` «reglas de negocio -> ErrorNegocio (400)» |
| **EC-09** | Mascota de más de 8 kg | Rechazo | `lib/precios_test.ts` «mascota: ...»; `cotizar/logica_test.ts` «entrada: ... mascota <= 8 kg ...» |
| **EC-10** | Bodega con L+A+H > 158 cm, peso > 32 kg o segunda pieza por pasajero | Rechazo explicando el límite | `equipaje-calcular/logica_test.ts`; `lib/precios_test.ts` «bodega: limites...» |
| **EC-11** | Pasajero menor de 15 años en fila 13 o 14 | Rechazo | `asientos-validar-retener/logica_test.ts`; `lib/asientos_test.ts` |
| **EC-12** | Número de asientos distinto del número de pasajeros | Rechazo | `asientos-validar-retener/logica_test.ts`; `lib/asientos_test.ts` |
| **EC-13** | Formato de asiento inválido (p. ej. `99Z`) o fila o letra fuera de la clase | Rechazo | `asientos-validar-retener/logica_test.ts`; `lib/asientos_test.ts` |
| **EC-14** | Fecha fuera de 2026-12-01 a 2027-01-31 | Rechazo | `vuelos-buscar/logica_test.ts` (ventana y bordes, fechas fuera); `lib/asientos_test.ts` «ventana: 2026-12-01..2027-01-31 inclusive» |
| **EC-15** | Colisión de PNR | Se genera otro PNR; la verificación por lectura es el control (riesgo residual) | `transaccion-crear/logica_test.ts`; `lib/asientos_test.ts` |
| **EC-16** | Reserva con transacción PENDIENTE existente | Se devuelve la existente; no se crea otra | `transaccion-crear/logica_test.ts` |
| **EC-17** | Escritura del mapa con conflicto de versión | Reintento con espera creciente; máximo 3 intentos y error de servicio no disponible si no se confirma | `lib/datum_test.ts` «write-then-verify: ...» |
| **EC-18** | Más de 9 pasajeros | Rechazo | `lib/asientos_test.ts` «pasajeros: 1 a 9»; `vuelos-buscar/logica_test.ts` |

---

## Restricciones Operativas y de Cumplimiento (Nivel Negocio)
- **Tiempo de Respuesta Operativo (SLA de Usuario):** el flujo completo de reserva y pago debe caber en la ventana de conversación de WhatsApp: el hold de asientos y la transacción duran 15 minutos y no se usan plantillas de WhatsApp (HSM). La DEMO no declara otro SLA.
- **Privacidad y Cumplimiento Normativo:** nombre, documento y edad son datos personales; la retención de la PoC es de demo, no de producción. Todos los registros operativos (logs) enmascaran el documento del pasajero. No se escriben secretos en documentos ni en el repositorio: solo nombres de variable (`${PAY_WEBHOOK_SECRET}`, `${PAY_PUBLIC_URL}`, `${JELOU_API_KEY}`, `${DATUM_URL}`, `${DATUM_API_KEY}`).
- **Seguridad:** solo la notificación de pago es pública y está protegida por firma verificable; el resto de los servicios solo lo invoca el agente. Los precios y totales se calculan en el servidor y toda entrada del cliente se valida antes de tocar datos.
- **Continuidad de Negocio:** las operaciones con efecto son idempotentes (una transacción PENDIENTE por reserva, un evento de pago por identificador, carga base repetible); si falla la escritura de asientos o la reanudación, la reserva queda PENDIENTE_PAGO y la transacción PENDIENTE hasta que el reintento de la notificación o la expiración la resuelva.
- **Riesgo residual aceptado (DEMO):** la base no ofrece escritura atómica; dos escrituras concurrentes sobre el mismo vuelo pueden provocar una venta doble. Se mitiga con escritura y verificación (3 intentos) y se acepta solo con tráfico bajo.

### Divergencias vigentes
- **Mascota en el regreso (REQ-04):** abierta; la regla vigente cobra la mascota una sola vez, en el trayecto de ida. Decisión del USUARIO pendiente.
- **Registro de firma inválida (REQ-07):** se registra en el log de la function, no como fila de eventos de pago. Interpretación vigente de observabilidad.
- **Confirmación en el chat (REQ-09):** sin test automatizado; verificada con evidencia manual de extremo a extremo.
- **Enlace de pago en el chat (REQ-10):** la construcción del enlace tiene test; su entrega por WhatsApp se verificó manualmente.
- **Conformidad en vivo (REQ-12):** el test automatizado cubre el comparador; la comparación contra la base real es una ejecución manual del script de conformidad.
- **Señal de reanudación (riesgo residual):** la señal `paid`, `rejected` o `expired` llega al agente como texto; mientras el agente está en pausa, un cliente podría escribir ese mismo texto y obtener una confirmación sin pago. Riesgo residual aceptado en la DEMO.
- **Notificación tardía (REQ-08):** si se notifica muy tarde una ejecución que ya no está activa, la reanudación puede fallar con servicio no disponible; la transacción queda PENDIENTE y el reintento reaplica el efecto.
