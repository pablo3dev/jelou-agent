# Pasarela de pago simulada para reservas por WhatsApp

> Este documento es el **artefacto de aprobación del USUARIO** (ver `spec.md`, sección "Artefacto de aprobación del USUARIO"). Debe ser autosuficiente: todo lo necesario para aprobar el alcance, los objetivos y los criterios de éxito del spec está aquí, sin necesidad de leer `design.md` ni `tasks.md`.

- **Spec:** `reserva-pago-whatsapp-pay`

## Resumen

Pasarela de pago simulada (mock) de la aerolínea DEMO que vende vuelos nacionales por WhatsApp. El cliente abre el enlace de pago recibido en el chat, ve el monto de su reserva y aprueba o rechaza el pago; la pasarela informa el resultado a Jelou con una notificación de firma verificable. No se mueve dinero real. El modelo de dominio de la capacidad es el de [domain-model](../../agent/domain-model.md) (dueña: `apps/agent`); esta unidad no define otro y solo lee los datos de transacción y reserva, sin escribirlos.

## Problema

Para que una reserva por WhatsApp se cierre sin salir del canal, el cliente necesita un lugar donde ver cuánto va a pagar y confirmar o rechazar el pago, y la aerolínea necesita que el resultado de ese pago llegue de forma confiable y no falsificable a Jelou, que es quien emite o libera la reserva. Sin esa pieza no se puede demostrar el flujo completo de reserva, pago y confirmación.

## Solución

- **En qué consiste:** una página de pago a la que se llega por el enlace del chat. Muestra el monto total de la reserva y dos acciones, aprobar y rechazar. Al elegir una, la pasarela notifica el resultado a Jelou con una firma que Jelou puede verificar, reintenta si Jelou no responde y deja de mostrar acciones cuando la transacción ya no admite pago. El servicio reporta su disponibilidad y consume el mismo contrato de datos que el agente.
- **Cómo resuelve el problema:** el cliente ve el monto exacto de su reserva antes de decidir (página de pago); Jelou recibe un resultado que no puede ser falsificado ni duplicado con efecto (notificación firmada con identificador estable por evento); el cliente nunca puede pagar una transacción ya resuelta o vencida (estado sin botones); y el servicio es operable y verificable (disponibilidad y contrato sin desvío).

## Objetivos y criterios de éxito

- **Objetivo 1:** el cliente que abre el enlace de una transacción pendiente y vigente ve el monto correcto y puede aprobar o rechazar; cualquier otro caso (resuelta, vencida, inexistente, identificador inválido, fallo del almacén) se comunica con claridad y sin ofrecer pago.
- **Objetivo 2:** cada aprobación o rechazo llega a Jelou exactamente con el contenido y la firma esperados, el mismo evento repetido conserva su identificador, y un fallo transitorio de Jelou no pierde el resultado (hasta 3 intentos).
- **Objetivo 3:** la pasarela arranca en el puerto configurado, responde su estado de salud y publica el enlace de pago con la ruta acordada.
- **Objetivo 4:** el servicio usa el contrato de datos del agente sin desvío, comprobable por huella.

---

## Actores de negocio y flujo de valor

- **Cliente (WhatsApp):** recibe el enlace de pago en el chat, lo abre, ve el monto y aprueba o rechaza. Valor: paga o descarta su reserva sin salir del flujo.
- **Jelou (receptor de la notificación):** recibe el resultado del pago, verifica la firma y aplica los efectos sobre la reserva y los asientos. Valor: recibe un resultado auténtico y trazable.
- **Operador de la demo (USUARIO):** levanta el servicio y ejecuta la demostración en su máquina. Valor: demuestra el ciclo reserva, pago y confirmación sin pagos reales.

Flujo: enlace de pago en el chat, página con monto, aprobar o rechazar, notificación firmada a Jelou, Jelou aplica los efectos y continúa la conversación.

---

## Delimitación del Alcance (Scope Boundaries)
- **Dentro del Alcance (In Scope - Fase Actual):**
  - Página de pago con monto total de la reserva y acciones aprobar y rechazar, en español o inglés según el idioma del navegador.
  - Presentación del estado, sin acciones, cuando la transacción ya no está pendiente o venció; respuestas diferenciadas para transacción inexistente, identificador inválido y fallo del almacén de datos.
  - Notificación firmada del resultado (APROBADA o RECHAZADA) a Jelou, con identificador de evento estable, reintentos con espera creciente y tratamiento definitivo del rechazo de firma.
  - Disponibilidad del servicio: puerto configurable, salud y enlace de pago `/pay/ID` (alias `/pagar/ID`).
  - Consumo del contrato de datos del agente sin desvío, verificable por huella.
  - Lectura de transacciones y reservas sin escribir en el almacén de datos.
- **Fuera del Alcance (Out of Scope / Non-Goals):**
  - Pagos reales o conexión con un proveedor de pago.
  - Emisión del resultado EXPIRADA por la pasarela: la expiración la determina el receptor.
  - Autenticación de usuario en la pasarela (es un mock).
  - Aplicar efectos sobre asientos, reserva o transacción, y reanudar al agente: lo hace Jelou.

---

## Reglas de Negocio y Políticas del Dominio
- **RN-09 [Transacción]:** los estados de una transacción son PENDIENTE y, desde ella, APROBADA, RECHAZADA o EXPIRADA; solo se transiciona desde PENDIENTE y la transacción vence 15 minutos después de su creación. La pasarela solo notifica APROBADA o RECHAZADA; la expiración la determina el receptor. Una transacción pendiente cuyo vencimiento ya pasó se trata como EXPIRADA y no admite pago.
- **RN-10 / RN-11 [Efectos de aprobación y rechazo]:** los efectos sobre asientos, reserva y transacción, y la reanudación del agente, los aplica Jelou al recibir la notificación; la pasarela no escribe sobre los datos.
- **RN-A1 [Monto]:** el monto que la pasarela muestra es el total de la reserva asociada a la transacción, en COP.

---

## Requerimientos Funcionales y Criterios EARS

### REQ-01: Página de pago
- **Historia de Usuario:**
  - **Como:** cliente que reserva por WhatsApp
  - **Quiero:** abrir el enlace de pago y ver el monto de mi reserva con las opciones de aprobar o rechazar
  - **Para:** decidir el pago con la información correcta, sin riesgo de pagar una transacción que ya no es válida

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-1.1 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el cliente abre el enlace de pago de una transacción PENDIENTE y vigente
  - `EL SISTEMA DEBE` mostrar el monto a pagar (total de la reserva en COP) y las dos acciones, aprobar y rechazar.
- **REQ-1.2 (Comportamiento Condicional / Basado en Estado):**
  - `MIENTRAS` la transacción esté APROBADA, RECHAZADA o EXPIRADA, o su vencimiento ya haya pasado `CUANDO` el cliente abra el enlace
  - `EL SISTEMA DEBE` mostrar su estado (una pendiente vencida se muestra como EXPIRADA) sin ofrecer las acciones de aprobar ni rechazar.
- **REQ-1.3 (Excepción o Manejo de Invalidez):**
  - `SI` la transacción no existe `CUANDO` el cliente abre el enlace
  - `EL SISTEMA DEBE` indicar que no fue encontrada, sin ofrecer acciones.
- **REQ-1.4 (Excepción o Manejo de Invalidez):**
  - `SI` el identificador del enlace no es válido `CUANDO` el cliente abre el enlace
  - `EL SISTEMA DEBE` rechazar la solicitud sin consultar el almacén de datos con ese valor.
- **REQ-1.5 (Excepción o Manejo de Invalidez):**
  - `SI` el almacén de datos falla (transacción o reserva) o el total de la reserva no es válido `CUANDO` el cliente abre el enlace
  - `EL SISTEMA DEBE` informar un error de servicio, sin ofrecer acciones y sin revelar la clave de acceso al almacén.
- **REQ-1.6 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` presentar todo valor proveniente de los datos de forma escapada, de modo que ningún contenido inyectado se ejecute en el navegador del cliente.
- **REQ-1.7 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` presentar la página en español o en inglés según el idioma preferido del navegador, y publicar el enlace tanto como `/pay/ID` como `/pagar/ID`.

**Verificación:** `apps/pay/src/pagar.test.js` (8 pruebas: "PENDIENTE vigente: muestra monto COP y los dos formularios", "el enlace del contrato /pay/:id también funciona y Accept-Language en usa inglés", "estado no PENDIENTE: muestra el estado sin botones", "PENDIENTE vencida: se muestra como expirada sin botones", "404 si no existe", "400 si el id es inválido", "502 si Datum falla (transacción o reserva) o el total es inválido", "escapa los valores renderizados (XSS)") y `apps/pay/src/datum.test.js` (4 pruebas: lectura por identificador con clave de acceso, fechas normalizadas, inexistente devuelve nulo, fallos sin filtrar la clave). Verdes el 2026-10-16.

### REQ-02: Notificación firmada del resultado
- **Historia de Usuario:**
  - **Como:** cliente que decide el pago, y Jelou como receptor del resultado
  - **Quiero:** que al aprobar o rechazar, el resultado llegue a Jelou de forma auténtica, sin duplicar efectos y sin perderse ante fallos transitorios
  - **Para:** que la reserva se emita o se libere según mi decisión, sin que nadie pueda falsificar el resultado

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-2.1 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el cliente aprueba o rechaza el pago de una transacción PENDIENTE y vigente
  - `EL SISTEMA DEBE` notificar a Jelou el identificador de la transacción, el resultado (APROBADA o RECHAZADA), un identificador de evento con la forma `<transaccion_id>:<estado>` y la fecha-hora de emisión.
- **REQ-2.2 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` acompañar cada notificación de una firma verificable por Jelou, calculada sobre el contenido exacto enviado con el secreto compartido, en la cabecera `X-Webhook-Signature` con el prefijo `sha256=`.
- **REQ-2.3 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` notificar únicamente los resultados APROBADA o RECHAZADA y nunca EXPIRADA.
- **REQ-2.4 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` conservar el mismo identificador de evento cada vez que se re-notifica el mismo resultado de la misma transacción.
- **REQ-2.5 (Comportamiento Condicional / Basado en Estado):**
  - `MIENTRAS` Jelou falle de forma transitoria `CUANDO` la pasarela notifique un resultado
  - `EL SISTEMA DEBE` reintentar hasta 3 intentos en total, con espera creciente (1 s y 2 s entre intentos), y aceptar el resultado si algún intento es aceptado.
- **REQ-2.6 (Excepción o Manejo de Invalidez):**
  - `SI` Jelou agota los 3 intentos con fallo, o es inalcanzable `CUANDO` la pasarela notifica
  - `EL SISTEMA DEBE` informar al cliente un error de servicio claro, sin dar el pago por entregado.
- **REQ-2.7 (Excepción o Manejo de Invalidez):**
  - `SI` Jelou rechaza la notificación por firma inválida (401) `CUANDO` la pasarela notifica
  - `EL SISTEMA DEBE` tratar el rechazo como definitivo: un único intento, sin reintentos, e informar un error de servicio al cliente.
- **REQ-2.8 (Excepción o Manejo de Invalidez):**
  - `SI` la transacción no está PENDIENTE o su vencimiento ya pasó `CUANDO` el cliente intenta aprobar o rechazar
  - `EL SISTEMA DEBE` no emitir ninguna notificación.
- **REQ-2.9 (Excepción o Manejo de Invalidez):**
  - `SI` falta el secreto compartido o la dirección del receptor `CUANDO` el cliente intenta aprobar o rechazar
  - `EL SISTEMA DEBE` informar un error de servicio y no emitir ninguna notificación.
- **REQ-2.10 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener el secreto compartido fuera de toda respuesta al cliente y de todo registro (log).

**Verificación:** `apps/pay/src/notificacion.test.js` (10 pruebas: "aprobar: cuerpo exacto, firma válida sobre el cuerpo crudo y event_id", "rechazar: estado RECHAZADA y event_id correspondiente", "re-notificar produce el mismo event_id", "receptor con 5xx: 3 intentos con backoff 1 s y 2 s y luego 502 con mensaje al usuario", "receptor que falla y luego acepta: éxito en el reintento", "401 del receptor es definitivo: un intento y 502", "receptor inalcanzable: 502", "no notifica si la transacción no está PENDIENTE o está vencida", "sin secreto o sin URL: 500 sin filtrar el secreto ni notificar", "el secreto no aparece en respuestas ni en logs") y `apps/pay/src/pagar.test.js` (flujo de la página). Verdes el 2026-10-16. Verificado además en vivo contra Jelou: notificación firmada aceptada, evento duplicado respondido 200 sin efecto, firma inválida rechazada con 401.

### REQ-03: Servicio disponible
- **Historia de Usuario:**
  - **Como:** operador de la demo
  - **Quiero:** levantar la pasarela en un puerto configurable y comprobar que está viva
  - **Para:** integrarla en el entorno de la demo y detectar rápidamente si no responde

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-3.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` escuchar en el puerto definido por el entorno (`PORT_PAY`) y, si no está definido, en el 3001.
- **REQ-3.2 (Excepción o Manejo de Invalidez):**
  - `SI` el puerto del entorno no es válido `CUANDO` el servicio arranca
  - `EL SISTEMA DEBE` usar el puerto por defecto 3001.
- **REQ-3.3 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` se consulta `/health`
  - `EL SISTEMA DEBE` responder 200 con estado `ok`.
- **REQ-3.4 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` publicar el enlace de pago como `/pay/ID` (con alias `/pagar/ID`).

**Verificación:** `apps/pay/src/app.test.js` (4 pruebas: "GET /health responde 200 {"status":"ok"}", "el puerto por defecto es 3001", "PORT_PAY del entorno sobrescribe el puerto", "PORT_PAY inválido cae al puerto por defecto") y `apps/pay/src/pagar.test.js` ("el enlace del contrato /pay/:id también funciona..."). Verdes el 2026-10-16.

### REQ-04: Contrato consumido sin desvío
- **Historia de Usuario:**
  - **Como:** operador de la demo
  - **Quiero:** que la pasarela use exactamente el contrato de datos y endpoints del agente
  - **Para:** evitar que un desvío de contrato rompa la lectura de transacciones o la notificación

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-4.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener una copia del contrato de datos y endpoints del agente, idéntica al original.
- **REQ-4.2 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` acompañar la copia de una huella verificable (`CONTRACT.sha256`) que permita comprobar que coincide con el contrato del agente.
- **REQ-4.3 (Excepción o Manejo de Invalidez):**
  - `SI` la copia difiere del original `CUANDO` se comprueba su huella
  - `EL SISTEMA DEBE` hacer fallar la comprobación.

**Divergencia:** sin prueba automatizada versionada en `apps/pay` (el script de verificación `verify-contract.sh` existe solo en `apps/crm`). La verificación es solo por comando: `sha256sum -c` sobre `CONTRACT.sha256`, ejecutado con resultado correcto en la verificación E2E de la unidad de infraestructura. Los criterios REQ-4.1 a REQ-4.3 no tienen prueba verde propia en esta unidad.

---

## Edge Cases & Boundary Conditions
| ID | Escenario / Condición Límite | Comportamiento Esperado del Sistema |
|:---|:---|:---|
| **EC-04** | Notificación duplicada (se re-notifica el mismo resultado de la misma transacción) | La pasarela emite el mismo identificador de evento `<transaccion_id>:<estado>` en cada re-notificación, de modo que Jelou pueda reconocer el duplicado y responder 200 sin efecto. Test: `notificacion.test.js` "re-notificar produce el mismo event_id". |
| **EC-05** | Firma inválida (el receptor rechaza la firma con 401) | La notificación se firma sobre el contenido exacto enviado; ante un 401 del receptor la pasarela no reintenta (un solo intento) e informa un error de servicio. Test: `notificacion.test.js` "aprobar: cuerpo exacto, firma válida sobre el cuerpo crudo y event_id" y "401 del receptor es definitivo: un intento y 502". |
| **EC-07** | Intento de pago sobre una transacción que no está PENDIENTE (o que ya venció) | La página no ofrece acciones y la pasarela no emite notificación; no hay transición. Test: `pagar.test.js` "estado no PENDIENTE: muestra el estado sin botones" y "PENDIENTE vencida: se muestra como expirada sin botones"; `notificacion.test.js` "no notifica si la transacción no está PENDIENTE o está vencida". |
| **EC-A1** | Receptor de la notificación con fallo transitorio (5xx o inalcanzable) | Hasta 3 intentos con espera de 1 s y 2 s; si todos fallan, se muestra un error de servicio al cliente. Test: `notificacion.test.js` "receptor con 5xx: 3 intentos con backoff 1 s y 2 s y luego 502 con mensaje al usuario", "receptor que falla y luego acepta: éxito en el reintento" y "receptor inalcanzable: 502". |
| **EC-A2** | Falla del almacén de datos o total de reserva inválido al abrir el enlace | Error de servicio sin acciones de pago y sin revelar la clave de acceso. Test: `pagar.test.js` "502 si Datum falla (transacción o reserva) o el total es inválido"; `datum.test.js` (fallos sin filtrar la clave). |
| **EC-A3** | Contenido inyectado en los datos mostrados | Se presenta escapado; no se ejecuta. Test: `pagar.test.js` "escapa los valores renderizados (XSS)". |

---

## Restricciones Operativas y de Cumplimiento (Nivel Negocio)
- **Seguridad de la notificación:** toda notificación lleva firma verificable con el secreto compartido; el secreto jamás se expone en respuestas ni en registros, y la clave de acceso al almacén de datos tampoco.
- **Acceso al enlace de pago en la demo:** el enlace de pago apunta a la máquina local del USUARIO (`http://localhost:3001` por defecto, configurable por entorno), por lo que solo es accesible desde la máquina del USUARIO que ejecuta la demo.
- **Sin autenticación de usuario:** la pasarela es un mock; cualquiera que tenga el enlace de una transacción pendiente y vigente puede aprobarla o rechazarla.
- **Solo lectura sobre los datos:** la pasarela lee transacciones y reservas y nunca escribe en el almacén de datos.
- **Sin dinero real:** ningún cobro real se realiza en ningún caso.
- **Dependencia del receptor:** la notificación solo surte efecto si Jelou acepta la firma con el secreto compartido; ante un fallo persistente del receptor el cliente ve un error de servicio.

---

> **Reglas de redacción:** este documento habla el lenguaje del negocio y del stakeholder; evita el detalle de implementación que corresponde a `design.md` (contratos de API, esquemas de datos, código concreto). Los nombres de sintaxis (`REQ`, `RN`, `EC`) se mantienen en inglés por estándar; todo el contenido se redacta en español.
