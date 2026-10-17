# Dashboard de la aerolínea (solo lectura)

> Este documento es el **artefacto de aprobación del USUARIO** (ver `spec.md`, sección "Artefacto de aprobación del USUARIO"). Debe ser autosuficiente: todo lo necesario para aprobar el alcance, los objetivos y los criterios de éxito del spec está aquí, sin necesidad de leer `design.md` ni `tasks.md`.

- **Spec:** `dashboard-aerolinea-crm`

## Resumen

Panel web de consulta para el operador de una aerolínea DEMO que vende vuelos nacionales entre BOG, MDE, CLO y CTG. Muestra vuelos, asientos vendidos por vuelo y por destino, el mapa de asientos de cada vuelo y estadísticas de ventas, siempre a partir de los datos vigentes. Es estrictamente de solo lectura. Los datos y el modelo de dominio pertenecen a la capacidad de reservas: ver [modelo de dominio](../../agent/domain-model.md).

## Problema

La aerolínea vende asientos por un canal conversacional y no tiene forma de ver, en el momento, cuántos asientos se han vendido en cada vuelo y destino, qué asientos están ocupados en un vuelo concreto ni cuánto ha ingresado por las ventas. Sin esa visibilidad el operador no puede evaluar la ocupación ni decidir con datos.

## Solución

- **En qué consiste:** un panel web que lista los vuelos con su ocupación, agrega las ventas por vuelo y por destino, dibuja el mapa de asientos de un vuelo y resume ingresos, ocupación y reservas por estado. Está disponible en español y en inglés, con montos en pesos colombianos (COP) y porcentajes.
- **Cómo resuelve el problema:** cada consulta refleja el estado vigente de vuelos y reservas (una retención de asientos vencida ya cuenta como asiento libre), de modo que el operador ve la ocupación real sin intervenir. El panel no modifica nada y no expone datos personales de los pasajeros.

## Objetivos y criterios de éxito

- **Objetivo 1:** el operador identifica en una sola consulta cuántos asientos se han vendido y qué porcentaje de ocupación tiene cada vuelo y cada destino. Éxito: los contadores del panel coinciden con las reservas emitidas y los asientos vendidos de todos los vuelos del calendario vigente.
- **Objetivo 2:** el operador ve para cualquier vuelo el estado de sus 174 asientos y las estadísticas globales de ventas. Éxito: el mapa muestra exactamente 174 asientos con su clase y estado efectivo, y las estadísticas cuadran con los contadores por vuelo.
- **Objetivo 3:** el panel es inocuo para el negocio. Éxito: ninguna operación modifica datos y ninguna respuesta incluye datos personales ni el identificador interno de retención de un asiento.

---

## Actores de negocio y flujo de valor

- **Operador de la aerolínea:** consulta vuelos, ocupación, mapa de asientos y estadísticas para tomar decisiones comerciales. Flujo: abre el panel, ve el resumen, filtra vuelos por ruta y fechas, revisa ventas por vuelo y destino, y abre el mapa de asientos de un vuelo.
- **Almacén de datos de la aerolínea:** fuente única de vuelos, asientos y reservas que alimenta el panel. El panel solo lo consulta.

---

## Delimitación del Alcance (Scope Boundaries)
- **Dentro del Alcance (In Scope - Fase Actual):**
  - Listado de vuelos con filtros por ruta y rango de fechas, con asientos vendidos y ocupación.
  - Ventas agregadas por vuelo y por destino.
  - Mapa de los 174 asientos de un vuelo con clase, salida de emergencia y estado efectivo.
  - Estadísticas: ingresos, vendidos, ocupación, reservas por estado y rutas destacadas.
  - Ventas con gráfica de asientos vendidos por periodo (día, semana o mes) y detalle por vuelo con pestañas y buscador.
  - Widget de selección de asientos compartible por enlace.
  - Tema visual claro u oscuro.
  - Operación en solo lectura y sin datos personales de pasajeros.
  - Servicio disponible en un puerto configurable, con comprobación de salud y cabeceras de seguridad.
  - Consumo, sin desvío, del contrato de datos de la capacidad de reservas.
- **Fuera del Alcance (Out of Scope / Non-Goals):**
  - Cualquier escritura: crear, modificar, cancelar o emitir reservas, vender o liberar asientos.
  - Autenticación o control de acceso del operador (el panel es una DEMO sin identificación de usuarios).
  - Edición de vuelos, rutas, tarifas o parámetros.
  - Consulta de datos personales de pasajeros (nombre, documento, edad).
  - Cancelaciones, reemisiones y check-in.

---

## Reglas de Negocio y Políticas del Dominio
- **RN-08 [Hold de asientos]:** una retención de asiento es válida solo si el asiento está retenido y su vencimiento es posterior al instante de la consulta. Una retención vencida equivale a un asiento libre, por lectura, sin depender de ningún proceso de limpieza. Una retención vigente todavía no es una venta.
- **RN-16 [Aeronave]:** cada vuelo se opera con un Boeing 737-8 MAX de 174 asientos, identificados como `<fila><letra>` (p. ej. `12A`). Premium: filas 1 a 3, letras A, C, D y F (12 asientos). Extended: filas 4 a 7, letras A a F (24). Economy: filas 8 a 30, letras A a F (138). Salida de emergencia (exit row): filas 13 y 14.
- **RN-17 [Ocupación]:** ocupación de un vuelo = asientos vendidos / 174, expresada como porcentaje. Solo cuentan como vendidos los asientos en estado vendido.
- **RN-18 [Privacidad del panel]:** el panel no muestra ni transmite datos personales de pasajeros ni el identificador interno de retención de los asientos.

---

## Requerimientos Funcionales y Criterios EARS

### REQ-01: Vuelos y ventas
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** listar los vuelos con sus asientos vendidos y ocupación, y ver las ventas agregadas por vuelo y por destino
  - **Para:** conocer qué vuelos y destinos se están vendiendo y cuáles tienen baja ocupación

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-1.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` calcular la ocupación de cada vuelo como asientos vendidos / 174 (RN-17) y contar como libre todo asiento con retención vencida (RN-08).
- **REQ-1.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta los vuelos
  - `EL SISTEMA DEBE` listar cada vuelo con su ruta, fecha, asientos vendidos y ocupación.
- **REQ-1.3 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador filtra por ruta, por fecha inicial o por fecha final
  - `EL SISTEMA DEBE` devolver solo los vuelos que cumplen todos los filtros indicados.
- **REQ-1.4 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta las ventas por vuelo
  - `EL SISTEMA DEBE` presentar los asientos vendidos y la ocupación de cada vuelo.
- **REQ-1.5 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta las ventas por destino
  - `EL SISTEMA DEBE` agregar los asientos vendidos y la ocupación de todos los vuelos de cada destino.
- **REQ-1.6 (Comportamiento Condicional / Basado en Estado):**
  - `MIENTRAS` un asiento tenga una retención vigente (RN-08)
  - `EL SISTEMA DEBE` no contarlo como vendido, de modo que no suma a los asientos vendidos ni a la ocupación.
- **REQ-1.7 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador abre la vista Ventas
  - `EL SISTEMA DEBE` dibujar una gráfica de línea de los asientos vendidos agrupados por periodo, con granularidad seleccionable día, semana (inicio en lunes) o mes, resaltando los picos de ventas y mostrando por periodo los vuelos con ventas y el vuelo con más vendidos.
- **REQ-1.8 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador elige la pestaña Todos, Con ventas o Sin ventas del detalle por vuelo, o escribe palabras clave en el buscador
  - `EL SISTEMA DEBE` mostrar solo los vuelos que cumplen la pestaña y contienen todas las palabras (sin distinguir mayúsculas ni tildes) en su identificador, ruta o fecha, mostrar el número de vuelos de cada pestaña, ordenar «Con ventas» por vendidos descendente e informar cuando no hay resultados. La pestaña y el texto se conservan al refrescar los datos.

**Verificación:** `apps/crm/tests/api.test.js` («GET /api/vuelos calcula contadores y ocupacion con holds vencidos como LIBRE», «GET /api/vuelos aplica filtros ruta, desde y hasta», «GET /api/ventas/por-vuelo», «GET /api/ventas/por-destino agrega vendidos y ocupacion»); `apps/crm/tests/frontend.test.js` («filtros y orden de vuelos», «ventas: pestanas con/sin ventas y buscador por palabra clave», «ventas: agrupa por dia/semana/mes y detecta picos»).

### REQ-02: Mapa de asientos
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** ver el mapa de asientos de un vuelo con la clase y el estado de cada asiento
  - **Para:** saber qué asientos están ocupados y cuáles disponibles en ese vuelo

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-2.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mostrar para cada vuelo exactamente los 174 asientos de la aeronave, cada uno con su clase (Premium, Extended o Economy), su indicación de salida de emergencia (filas 13 y 14) y su estado efectivo (RN-16).
- **REQ-2.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador abre el mapa de un vuelo existente
  - `EL SISTEMA DEBE` dibujar los asientos por filas, con bloques 2+2 en Premium y 3+3 en Extended y Economy, y resaltar la salida de emergencia en las filas 13 y 14.
- **REQ-2.3 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mostrar como libre todo asiento con retención vencida (RN-08) y calcular los contadores del mapa por estado y por clase con los mismos datos que el listado de vuelos.
- **REQ-2.4 (Excepción o Manejo de Invalidez):**
  - `SI` el vuelo solicitado no existe `CUANDO` el operador pide su mapa
  - `EL SISTEMA DEBE` responder que no fue encontrado, sin devolver un mapa.
- **REQ-2.5 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` no exponer en ninguna respuesta el identificador interno de retención de los asientos (RN-18).
- **REQ-2.6 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador o un pasajero abre el enlace `#/asientos/<vuelo>/<n>` (compartido desde el chat; `<n>` opcional)
  - `EL SISTEMA DEBE` mostrar el mapa del vuelo como widget de selección, con los asientos LIBRE elegibles y los demás estados no elegibles, el contador de elegidos, y un botón que copia la lista de elegidos al portapapeles en orden natural fila-letra (p. ej. `8A 8B 12C`).
- **REQ-2.7 (Comportamiento Condicional / Basado en Estado):**
  - `MIENTRAS` `<n>` sea un entero mayor o igual que 1
  - `EL SISTEMA DEBE` limitar la selección a `<n>` asientos, con un máximo de 9, y avisar al superarlo; sin `<n>` válido no fija límite.
- **REQ-2.8 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener la selección solo como estado local de la página, sin escribir datos, y retirar de la selección todo asiento que deje de estar LIBRE al refrescar.

**Verificación:** `apps/crm/tests/api.test.js` («mapa canonico: 174 asientos, clases y exit row», «GET /api/vuelos/:id/asientos devuelve 174 asientos ...», «... responde 404 si no existe», «ningun endpoint filtra hold_token»); `apps/crm/tests/frontend.test.js` (layout de 174 asientos, bloques 2+2 y 3+3, salida de emergencia en filas 13-14, coincidencia con la respuesta del servicio, «hash del widget de asientos: vuelo y limite de seleccion», «asientos elegidos se copian en orden natural fila-letra»).

### REQ-03: Estadísticas
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** ver ingresos, asientos vendidos, ocupación, reservas por estado y rutas destacadas
  - **Para:** evaluar el desempeño comercial de la aerolínea de un vistazo

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-3.1 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta las estadísticas
  - `EL SISTEMA DEBE` presentar los ingresos, los asientos vendidos y la ocupación global (RN-17).
- **REQ-3.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta las estadísticas
  - `EL SISTEMA DEBE` presentar el número de reservas por cada estado: PENDIENTE_PAGO, EMITIDA, PAGO_RECHAZADO, EXPIRADA y CANCELADA.
- **REQ-3.3 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el operador consulta las estadísticas
  - `EL SISTEMA DEBE` presentar las rutas destacadas.
- **REQ-3.4 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` formatear los montos en pesos colombianos (COP), los enteros y los porcentajes según el idioma elegido (español es-CO o inglés en-US).
- **REQ-3.5 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` ofrecer un tema visual claro y otro oscuro, alternable por el operador desde la barra superior, recordar la elección en el navegador y, sin elección guardada, usar la preferencia de color del sistema (oscuro si no hay preferencia por claro).

**Verificación:** `apps/crm/tests/api.test.js` («GET /api/estadisticas»); `apps/crm/tests/frontend.test.js` («formateadores COP, enteros y porcentaje», «contadores por estado y por clase con el mapa de fixtures», «tema: preferencia guardada o la del sistema»).

### REQ-04: Solo lectura y privacidad
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** que el panel solo consulte y nunca modifique ni exponga datos sensibles
  - **Para:** consultar con tranquilidad sin riesgo de alterar el inventario ni filtrar información de pasajeros

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-4.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` operar en solo lectura: ninguna operación del panel escribe, modifica ni elimina datos del almacén.
- **REQ-4.2 (Excepción o Manejo de Invalidez):**
  - `SI` se intenta una operación que no sea de consulta `CUANDO` el panel recibe la solicitud
  - `EL SISTEMA DEBE` rechazarla indicando que el método no está permitido, sin efecto alguno sobre los datos.
- **REQ-4.3 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` no incluir datos personales de pasajeros en ninguna respuesta ni vista (RN-18).
- **REQ-4.4 (Excepción o Manejo de Invalidez):**
  - `SI` el almacén de datos falla `CUANDO` el operador consulta
  - `EL SISTEMA DEBE` informar que el servicio no está disponible, sin revelar detalles internos del fallo ni credenciales.
- **REQ-4.5 (Excepción o Manejo de Invalidez):**
  - `SI` el panel no tiene configurado el acceso al almacén de datos `CUANDO` el operador consulta
  - `EL SISTEMA DEBE` informar que la configuración de datos no está disponible, sin revelar credenciales.

**Verificación:** `apps/crm/tests/api.test.js` («metodos distintos de GET/HEAD/OPTIONS responden 405», «el cliente simulado no recibio ninguna escritura», «errores del cliente Datum -> 502 sin filtrar detalles», «sin configuracion de Datum responde 503 datum_no_configurado»); `apps/crm/tests/datum.test.js` (9 pruebas: solo lectura, paginación, caché breve, sin filtrar secretos); `apps/crm/tests/static.test.js` («solo lectura: ningun JS publico declara un verbo distinto de GET»).

### REQ-05: Servicio disponible y seguro
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** que el panel arranque de forma confiable, informe su salud y se sirva con protecciones de seguridad
  - **Para:** acceder siempre a una consulta estable y segura

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-5.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` escuchar en un puerto configurable por entorno, con el 3000 por defecto.
- **REQ-5.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` se consulta la comprobación de salud
  - `EL SISTEMA DEBE` responder que el servicio está activo, sin consultar el almacén de datos.
- **REQ-5.3 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` servir el panel web con una política de seguridad de contenido que permita como único origen externo `cdn.jsdelivr.net` y cargue la librería de gráficos Chart.js en su versión exacta 4.5.1.
- **REQ-5.4 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` presentar el panel sin estilos en línea ni inserción de HTML dinámico.

**Verificación:** `apps/crm/tests/server.test.js` (5 pruebas); `apps/crm/tests/static.test.js` (7 pruebas).

### REQ-06: Contrato consumido sin desvío
- **Historia de Usuario:**
  - **Como:** operador de la aerolínea
  - **Quiero:** que el panel lea los datos con exactamente el mismo contrato que usa la capacidad de reservas
  - **Para:** que lo que veo corresponda siempre a lo que el agente de reservas escribe

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-6.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener una copia del contrato de datos de la capacidad de reservas (esquema y endpoints) idéntica al original.
- **REQ-6.2 (Excepción o Manejo de Invalidez):**
  - `SI` la copia del contrato difiere del original `CUANDO` se verifica su huella
  - `EL SISTEMA DEBE` reportar la discrepancia como fallo de la verificación.

**Divergencia:** sin test automatizado versionado con `node:test`. La verificación se ejecuta por comando (`sh contract/verify-contract.sh` en `apps/crm`, equivalente a `sha256sum -c` sobre `CONTRACT.sha256`) y se ejecutó en la verificación de extremo a extremo; no forma parte de `npm test`.

---

## Edge Cases & Boundary Conditions
| ID | Escenario / Condición Límite | Comportamiento Esperado del Sistema |
|:---|:---|:---|
| **EC-02** | Un asiento tiene una retención vencida (no se pagó a tiempo) | El asiento cuenta como libre en listados, ocupación, mapa y estadísticas, sin esperar a ningún proceso de limpieza (RN-08). |
| **EC-19** | El operador pide el mapa de un vuelo que no existe | Respuesta de no encontrado; no se devuelve ningún mapa. |
| **EC-20** | El almacén de datos no está disponible o falla | Respuesta de servicio no disponible sin detalles internos ni credenciales; el panel no escribe nada. |
| **EC-21** | El panel no tiene configurado el acceso al almacén de datos | Respuesta de configuración no disponible; sin exponer credenciales. |
| **EC-22** | Las reservas contienen nombre, documento y edad de pasajeros | Ninguna respuesta ni vista los incluye (RN-18). |
| **EC-23** | Se envía una operación distinta de consulta (crear, modificar, eliminar) | Rechazo por método no permitido; ningún dato cambia. |

---

## Restricciones Operativas y de Cumplimiento (Nivel Negocio)
- **Tiempo de Respuesta Operativo (SLA de Usuario):** no se define un SLA. Para evitar lecturas repetidas, el panel puede reutilizar brevemente datos recién consultados, por lo que una venta puede tardar unos segundos en reflejarse.
- **Privacidad y Cumplimiento Normativo:** el panel no maneja datos personales de pasajeros ni el identificador interno de retención de asientos (RN-18). Las credenciales de acceso al almacén de datos nunca se muestran ni se registran.
- **Continuidad de Negocio:** al ser de solo lectura, una falla del panel no afecta las ventas ni el inventario. No tiene autenticación de operador: es una DEMO para uso local y no debe publicarse como servicio abierto.
- **Compatibilidad:** requiere Node 24 (Express 5.3.0) y carga Chart.js 4.5.1 desde `cdn.jsdelivr.net`; sin conexión a ese origen los gráficos no se dibujan.
