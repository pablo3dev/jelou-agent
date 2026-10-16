# Entorno local de la aerolínea DEMO: arranque con un comando y prueba de punta a punta

> Este documento es el **artefacto de aprobación del USUARIO**. Es autosuficiente: todo lo necesario para aprobar el alcance, los objetivos y los criterios de éxito del spec está aquí, sin necesidad de leer `design.md` ni `tasks.md`.

- **Spec:** `entorno-local-infrastructure`
- **Unidad:** `apps/infrastructure` (unidad de arranque: no contiene código de producto ni modelo de dominio propio; el modelo de dominio de la capacidad es [domain-model.md](../../agent/domain-model.md), dueña `apps/agent`).
- **Depende de:** [reserva-pago-whatsapp-agent](../../agent/reserva-pago-whatsapp-agent/summary.md), [reserva-pago-whatsapp-pay](../../pay/reserva-pago-whatsapp-pay/summary.md) y [dashboard-aerolinea-crm](../../crm/dashboard-aerolinea-crm/summary.md). Este spec arranca los servicios de esos specs y prueba su integración.

## Resumen

La aerolínea DEMO vende vuelos nacionales por WhatsApp (pasarela de pago simulada y dashboard de solo lectura). Este spec entrega lo que permite al USUARIO levantar la demo completa en su máquina con un solo comando, sin instalar nada en ella salvo el motor de contenedores, y comprobar de punta a punta que la reserva funciona: reserva aprobada con localizador PNR, rechazada con asientos liberados, expirada con asientos liberados, notificación duplicada ignorada y dashboard coherente con las ventas.

## Problema

Las piezas de la demo (agente conversacional, pasarela simulada, dashboard) se construyen por separado. Sin un arranque común, el USUARIO tendría que preparar cada pieza a mano, decidir puertos y credenciales por su cuenta, y no tendría un procedimiento único para demostrar que la reserva funciona completa. Además, en Windows los archivos de configuración pueden guardarse con un fin de línea incompatible con los contenedores, lo que rompe el arranque de forma difícil de diagnosticar, y existe el riesgo de que credenciales queden escritas en el repositorio.

## Solución

- **En qué consiste:** un arranque local único que levanta el dashboard y la pasarela simulada con comprobación de salud; una herramienta de línea de comandos de Jelou disponible solo bajo demanda; configuración (puertos y credenciales) tomada de un archivo local no versionado con una plantilla pública sin valores sensibles; fin de línea uniforme en todos los archivos versionados; verificación de que el contrato de datos es el mismo en todas las unidades; y un recorrido de prueba de punta a punta con evidencia.
- **Cómo resuelve el problema:** un solo comando reemplaza la preparación manual (REQ-01); las credenciales nunca se escriben en el repositorio y los puertos se eligen por entorno (REQ-02); los archivos se mantienen con el fin de línea correcto en Windows (REQ-03); las unidades no pueden divergir en el contrato de datos sin que se detecte (REQ-04); y el recorrido de prueba demuestra el valor de negocio completo (REQ-05).

## Objetivos y criterios de éxito

- **Objetivo 1:** el USUARIO levanta la demo con un comando y obtiene el dashboard y la pasarela en estado saludable, sin pasos manuales adicionales distintos de copiar la plantilla de configuración y completar sus valores.
- **Objetivo 2:** el USUARIO puede ejecutar y observar los cuatro desenlaces de una reserva (aprobada, rechazada, expirada, notificación duplicada) y ver el dashboard coherente con las ventas.
- **Objetivo 3:** no queda ningún secreto en el repositorio ni archivo versionado con fin de línea incompatible, y el contrato de datos es idéntico en las tres unidades.

---

## Actores de negocio y flujo de valor

- **USUARIO (responsable de la demo):** copia la plantilla de configuración, completa sus propios valores, levanta la demo con un comando y ejecuta el recorrido de prueba. Obtiene una demo funcional y verificable en su máquina.
- **Cliente de la aerolínea (WhatsApp):** reserva y paga un vuelo durante el recorrido de prueba; recibe su PNR o el aviso de fallo o expiración.
- **Operador de la aerolínea (dashboard):** consulta vuelos, asientos vendidos e ingresos; verifica que reflejan las reservas emitidas.

Flujo de valor: configurar -> levantar con un comando -> comprobar salud -> reservar por WhatsApp -> pagar (aprobar, rechazar o dejar vencer) -> confirmar resultado -> consultar el dashboard.

---

## Delimitación del Alcance (Scope Boundaries)
- **Dentro del Alcance (In Scope - Fase Actual):**
  - Arranque local con un solo comando del dashboard y de la pasarela simulada, con comprobaciones de salud.
  - Herramienta de línea de comandos de Jelou disponible solo bajo demanda (perfil `tools`), ejecutada en contenedor.
  - Red propia de la demo, puertos publicados solo en la máquina local y definidos por entorno.
  - Configuración por entorno: plantilla pública de variables sin valores y archivo local no versionado con los valores reales.
  - Fin de línea uniforme (LF) en los archivos versionados.
  - Verificación de identidad del contrato de datos entre las tres unidades.
  - Guía de arranque para el USUARIO.
  - Recorrido de prueba de punta a punta con evidencia manual: reserva de ida y vuelta con asientos, equipaje y mascota; pago aprobado, rechazado y expirado; notificación duplicada; dashboard coherente.
- **Fuera del Alcance (Out of Scope / Non-Goals):**
  - Producción (SLA, multi-tenencia, alta disponibilidad).
  - Ejecución de las unidades directamente en el host, fuera de contenedores (`host-native`).
  - Integración continua (CI) y automatización del recorrido de prueba como script versionado.
  - Despliegue en la nube.
  - Contenedor de base de datos: los datos viven únicamente en Jelou Datum (servicio remoto).
  - Que el enlace de pago abra desde un dispositivo distinto de la máquina del USUARIO.

---

## Reglas de Negocio y Políticas del Dominio
> Los identificadores RN y EC conservan la numeración global de la capacidad; aquí solo figuran los que aplican a este spec.

- **RN-09 [Transacción y expiración]:** una transacción pasa de PENDIENTE a APROBADA, RECHAZADA o EXPIRADA, y solo desde PENDIENTE. Vence 15 minutos después de su creación. Una aprobación que llega después del vencimiento deja la transacción en EXPIRADA.
- **RN-10 [Aprobación]:** asientos a VENDIDO con el PNR, reserva a EMITIDA, transacción a APROBADA, y el agente confirma el PNR al cliente.
- **RN-11 [Rechazo]:** asientos a LIBRE, reserva a PAGO_RECHAZADO, transacción a RECHAZADA; el agente informa y no reintenta solo.
- **RN-12 [Expiración]:** asientos a LIBRE, reserva a EXPIRADA; el agente informa al cliente.
- **RN-16 [Secretos fuera del repositorio]:** ninguna credencial ni valor sensible se escribe en archivos versionados ni en documentos; solo existen nombres de variable. Los valores viven en un archivo local no versionado.
- **RN-17 [Exposición local]:** los servicios de la demo solo son accesibles desde la máquina del USUARIO.
- **RN-18 [Fin de línea]:** los archivos de configuración y de código versionados usan LF; ninguno puede usar CRLF.
- **RN-19 [Contrato único]:** el contrato de datos de `apps/agent` es el único; las copias en `apps/pay` y `apps/crm` deben ser idénticas a él.

---

## Requerimientos Funcionales y Criterios EARS

### REQ-01: Arranque con un comando
- **Historia de Usuario:**
  - **Como:** USUARIO responsable de la demo
  - **Quiero:** levantar el dashboard y la pasarela simulada con un solo comando
  - **Para:** tener la demo lista en mi máquina sin preparar cada pieza a mano

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-1.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` publicar los puertos de los servicios solo en la dirección local (`127.0.0.1`) de la máquina y tomar los números de puerto de la configuración por entorno.
- **REQ-1.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el USUARIO ejecuta el comando de arranque con la configuración completa
  - `EL SISTEMA DEBE` levantar el dashboard y la pasarela simulada, cada uno con su comprobación de salud, y reportarlos en estado saludable.
- **REQ-1.3 (Comportamiento Condicional / Basado en Estado):**
  - `MIENTRAS` el USUARIO no haya activado el perfil `tools` `CUANDO` ejecute el comando de arranque
  - `EL SISTEMA DEBE` no iniciar la herramienta de línea de comandos de Jelou, y ponerla a disposición solo bajo demanda con el perfil `tools`, en contenedor y sin instalar nada en la máquina del USUARIO.
- **REQ-1.4 (Redes y proyecto):**
  - `EL SISTEMA DEBE` agrupar los servicios en la red `reservas-net` bajo el nombre de proyecto `aerolinea-reservas-whatsapp`, sin contenedor de base de datos.
- **REQ-1.5 (Excepción o Manejo de Invalidez):**
  - `SI` falta alguna variable obligatoria o un puerto está ocupado `CUANDO` el USUARIO intenta levantar la demo
  - `EL SISTEMA DEBE` no dejar un servicio aparentando estar saludable y permitir al USUARIO identificar la causa (ver EC-19 y EC-20).

**Verificación:** comando determinista `docker compose --profile tools config --services` (debe listar `crm`, `pay` y `agent-cli`) ejecutado desde `apps/infrastructure`; y recorrido de prueba manual con evidencia (crm y pay en estado saludable tras `docker compose up`). No existe prueba automatizada versionada para este REQ: la verificación es por comando y por evidencia manual.

### REQ-02: Configuración por entorno sin secretos versionados
- **Historia de Usuario:**
  - **Como:** USUARIO responsable de la demo
  - **Quiero:** definir puertos y credenciales en un archivo local mío que nunca se sube al repositorio
  - **Para:** configurar la demo a mi entorno sin exponer secretos

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-2.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` tomar puertos y credenciales únicamente del archivo local `.env`, no versionado.
- **REQ-2.2 (Plantilla pública):**
  - `EL SISTEMA DEBE` ofrecer una plantilla `.env.example` que enumere todas las variables que el USUARIO debe completar (puertos del dashboard y de la pasarela, credenciales de Jelou y de Datum, secreto de la firma de notificación, URL pública de la pasarela, URL de notificación de pago, identificadores del proyecto y de la base de datos) sin ningún valor sensible, y marque como opcionales las que lo sean.
- **REQ-2.3 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el USUARIO copia `.env.example` a `.env` y completa sus valores
  - `EL SISTEMA DEBE` arrancar con esa configuración sin otro paso de preparación.
- **REQ-2.4 (Excepción o Manejo de Invalidez):**
  - `SI` el archivo `.env` aparece entre los cambios por versionar `CUANDO` el USUARIO prepara un commit
  - `EL SISTEMA DEBE` haberlo excluido del control de versiones de modo que no pueda agregarse por accidente.

**Verificación:** comandos deterministas `git check-ignore apps/infrastructure/.env` (debe devolver la ruta, es decir, ignorado) y revisión de `apps/infrastructure/.env.example` (solo nombres de variable, sin valores sensibles). Sin prueba automatizada versionada; la verificación es por comando y revisión.

### REQ-03: Fin de línea uniforme en Windows
- **Historia de Usuario:**
  - **Como:** USUARIO que trabaja en Windows
  - **Quiero:** que los archivos de configuración y de código mantengan siempre el fin de línea LF
  - **Para:** evitar fallos de arranque causados por CRLF

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-3.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener en LF todos los archivos versionados de scripts, configuración YAML, JavaScript y definiciones de imagen (`Dockerfile`), sin ningún archivo con CRLF.
- **REQ-3.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el USUARIO clona el repositorio o guarda archivos desde Windows
  - `EL SISTEMA DEBE` conservar LF en el árbol de trabajo mediante reglas versionadas de fin de línea.
- **REQ-3.3 (Excepción o Manejo de Invalidez):**
  - `SI` un archivo versionado de esos tipos aparece con CRLF `CUANDO` se revise el repositorio
  - `EL SISTEMA DEBE` hacerlo detectable con un comando determinista (ver EC-21).

**Verificación:** comando determinista `git ls-files --eol` (ningún archivo debe mostrar `i/crlf`; en el recorrido de prueba los 53 archivos versionados mostraron `i/lf w/lf`). Sin prueba automatizada versionada; la verificación es por comando.

### REQ-04: Contrato de datos idéntico en todas las unidades
- **Historia de Usuario:**
  - **Como:** USUARIO responsable de la demo
  - **Quiero:** comprobar que dashboard, pasarela y agente usan exactamente el mismo contrato de datos
  - **Para:** evitar que una diferencia silenciosa rompa la reserva o el dashboard

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-4.1 (Comportamiento Siempre Activo / Ubicuo):**
  - `EL SISTEMA DEBE` mantener una única huella (hash) del contrato de `apps/agent`, idéntica en las copias de `apps/pay` y `apps/crm`.
- **REQ-4.2 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el USUARIO verifica la huella en cada unidad
  - `EL SISTEMA DEBE` confirmar que el contrato de esa unidad coincide con la huella registrada.
- **REQ-4.3 (Excepción o Manejo de Invalidez):**
  - `SI` una copia del contrato difiere del original `CUANDO` se ejecute la verificación
  - `EL SISTEMA DEBE` fallar la verificación de esa unidad.

**Verificación:** comando determinista `sha256sum -c CONTRACT.sha256` ejecutado en el directorio del contrato de cada unidad (`apps/agent`, `apps/pay`, `apps/crm`) con resultado OK, y comparación de que el contenido de `CONTRACT.sha256` es idéntico en las tres. Sin prueba automatizada versionada propia de este spec; la verificación es por comando.

### REQ-05: Reserva de punta a punta verificada
- **Historia de Usuario:**
  - **Como:** USUARIO responsable de la demo
  - **Quiero:** ejecutar el recorrido completo de una reserva y observar sus desenlaces
  - **Para:** demostrar que la aerolínea DEMO vende, cobra, libera asientos y reporta ventas correctamente

#### Criterios de Aceptación y Comportamiento del Sistema (Sintaxis EARS)
- **REQ-5.1 (Flujo Principal / Basado en Eventos):**
  - `CUANDO` el cliente completa una reserva de ida y vuelta con asientos, equipaje y mascota y el pago es aprobado
  - `EL SISTEMA DEBE` marcar los asientos como VENDIDO con el PNR, dejar la reserva EMITIDA y la transacción APROBADA, y confirmar el PNR al cliente en el mismo chat (RN-10).
- **REQ-5.2 (Rechazo):**
  - `CUANDO` el pago es rechazado
  - `EL SISTEMA DEBE` dejar los asientos LIBRE, la reserva en PAGO_RECHAZADO y la transacción RECHAZADA, e informar al cliente sin reintentar el pago (RN-11).
- **REQ-5.3 (Expiración):**
  - `CUANDO` transcurren 15 minutos sin resultado de pago
  - `EL SISTEMA DEBE` dejar los asientos LIBRE y la reserva EXPIRADA, e informar al cliente (RN-09, RN-12).
- **REQ-5.4 (Notificación duplicada):**
  - `SI` la pasarela notifica dos veces el mismo resultado, o notifica un resultado contrario sobre una transacción ya resuelta `CUANDO` el sistema recibe la segunda notificación
  - `EL SISTEMA DEBE` responder sin aplicar ningún efecto nuevo (EC-04).
- **REQ-5.5 (Dashboard coherente):**
  - `CUANDO` el operador consulta el dashboard tras las reservas emitidas
  - `EL SISTEMA DEBE` mostrar los asientos vendidos y los ingresos que corresponden exactamente a la suma de las reservas en estado EMITIDA.
- **REQ-5.6 (Excepción o Manejo de Invalidez):**
  - `SI` el canal de WhatsApp no está conectado o el teléfono no está habilitado como probador `CUANDO` el USUARIO intenta reservar desde un teléfono real
  - `EL SISTEMA DEBE` no registrar ninguna reserva ni transacción y dejar la demo íntegra (ver EC-22).

**Verificación:** recorrido manual con evidencia, ejecutado el 2026-10-16 y registrado en `tasks.md` (Tarea 4.1; commits 1d3cc35, 289e60f, d257860, 631350d): ida y vuelta BOG-MDE 2026-12-10/14, 2 pasajeros, asientos 12A/12B, 1 maleta de bodega y 1 perro, total COP 2.639.000; aprobada con PNR y reserva EMITIDA; rechazada con asiento 14A LIBRE y reserva PAGO_RECHAZADO; expirada a los 15 minutos reales con asientos LIBRE, reserva EXPIRADA y aviso del agente; duplicada con respuesta DUPLICADO y rechazo posterior a una aprobación sin efecto; dashboard con 6 asientos vendidos e ingresos COP 3.549.000 igual a la suma de las 3 reservas EMITIDA; reverificación independiente por canal sandbox de WhatsApp (envío de prueba de Jelou) con los mismos cuatro desenlaces. Los datos de prueba se eliminaron y el seed quedó en 6 rutas, 12 temporadas, 12 parámetros y 372 vuelos.

**Divergencia:** el recorrido no está automatizado como script versionado; la evidencia es manual. El envío real de un mensaje desde un teléfono por WhatsApp no se verificó: solo se verificó el canal sandbox. Tampoco se verificó la cotización de la mascota en la vuelta (se cotiza solo en la ida), ni la respuesta del sistema al notificar muy tarde una ejecución ya inactiva (503 y 422); la señal de reanudación al agente viaja como texto.

---

## Edge Cases & Boundary Conditions
| ID | Escenario / Condición Límite | Comportamiento Esperado del Sistema |
|:---|:---|:---|
| **EC-03** | Notificación de aprobación después de 15 minutos | Transacción a EXPIRADA, asientos a LIBRE, reserva a EXPIRADA; el agente informa la expiración. |
| **EC-04** | Notificación duplicada (mismo resultado de la misma transacción) | Respuesta correcta sin efecto; el resultado ya aplicado no cambia. |
| **EC-19** | Variables obligatorias faltantes en `.env` al levantar la demo | El servicio afectado no queda aparentando estar saludable; el USUARIO puede ver qué variable falta y la plantilla `.env.example` indica cuáles son obligatorias. |
| **EC-20** | Puerto del dashboard o de la pasarela ya ocupado en la máquina | El arranque de ese servicio falla de forma visible y el USUARIO resuelve cambiando el número en `.env`, sin editar otros archivos. |
| **EC-21** | Archivo versionado con CRLF por edición en Windows | La verificación de fin de línea lo detecta; las reglas versionadas de fin de línea evitan que ocurra al clonar o guardar. |
| **EC-22** | Canal de WhatsApp no conectado, o teléfono no habilitado como probador del canal sandbox | No se crea reserva ni transacción; el USUARIO debe conectar el canal o agregar su teléfono como probador antes de probar con un teléfono real. |
| **EC-23** | Enlace de pago abierto desde un dispositivo distinto de la máquina del USUARIO | Limitación de la demo: el enlace apunta a la máquina local y solo abre en ella. |

---

## Restricciones Operativas y de Cumplimiento (Nivel Negocio)
- **Tiempo de Respuesta Operativo (SLA de Usuario):** el arranque debe dejar el dashboard y la pasarela saludables sin pasos manuales posteriores al comando. El recorrido completo de una reserva debe caber en menos de 15 minutos (duración del bloqueo de asientos).
- **Privacidad y Cumplimiento Normativo:** ningún secreto en el repositorio ni en documentos (solo nombres de variable); los datos de prueba del recorrido son de demostración y se eliminan al terminar. Los documentos de personas se enmascaran en los registros.
- **Continuidad de Negocio:** solo demostración local; sin compromisos de disponibilidad. Una interrupción del arranque se resuelve repitiendo el comando sin pérdida de datos, porque la información reside en Jelou Datum.
