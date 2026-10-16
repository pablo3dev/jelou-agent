# Hoja de divergencias de la PoC aerolinea-reservas-whatsapp

Fecha: 2026-10-16. Rama: `makia/dev/aerolinea-reservas-whatsapp`.

- Qué es: hoja priorizada de divergencias, notas y observaciones surgidas al crear los 4 specs de la PoC; el USUARIO la aprueba junto con los `requirements.md` de los 4 specs (etapa S).
- Estado: specs creados con Creación sin aprobar; AUDIT pendiente.
- Cómo leerla: prioridad P1 alta, P2 media, P3 baja. Clase: Divergencia = el resultado difiere de lo especificado o falta verificación; Nota = hecho a registrar sin acción; Observación no confirmada = no establecido.

## 1. Hoja priorizada

| ID | Prioridad | Clase | Hallazgo (con cita) | Recomendación | Decisión del USUARIO (sí/no) |
|----|-----------|-------|---------------------|---------------|------------------------------|
| D-01 | P1 | Divergencia abierta (decisión del USUARIO) | Mascota cobrada solo en la ida: línea Mascota ida (Luis) COP 195.000 = 150.000 x 1,30 (diciembre) y ninguna línea de mascota en el regreso. No es bug respecto del texto literal; la intención no es concluyente. Ver [D-01](#d-01). | Decidir entre (A) una sola línea de mascota por reserva o (B) cobro por trayecto. Hasta decidir, rige (A). | |
| D-02 | P1 | Riesgo de seguridad residual (decisión del USUARIO) | La señal de reanudación `paid`, `rejected` o `expired` llega al agente como texto; en pausa, un cliente podría escribir `paid` y recibir el PNR sin pagar (evidencia de la tarea 4.1). El prompt (paso 10) acepta la señal envuelta y trata otros mensajes como estado no claro, pero no la autentica. | Antes de entregar el PNR, consultar el estado real de la transacción con una tool de solo lectura (o que la reanudación lleve un valor no adivinable derivado de la transacción), como iteración posterior; aceptable solo en la DEMO. | |
| D-03 | P1 | Divergencia (REQ sin test verde) | Spec reserva-pago-whatsapp-agent: REQ-09 (confirmación con PNR en el chat) sin test automatizado; evidencia manual E2E (commits 1d3cc35, 289e60f, d257860). REQ-10 (enlace de pago): la construcción del enlace tiene test (transaccion-crear), la entrega por WhatsApp solo manual (fix 631350d). REQ-12: el test automatizado cubre el comparador dbml-colecciones; la comparación en vivo es manual (conformidad.sh, 4ae8456). | Pruebas de conversación con transcripciones de referencia (agente simulado o evaluación del prompt) en la etapa TEST o AUDIT; mientras tanto, la evidencia manual de las tareas 2.8 y 4.1. | |
| D-04 | P1 | Divergencia (REQ sin test verde) | Spec entorno-local-infrastructure: REQ-05 (E2E de punta a punta) es manual, sin script versionado. REQ-01 a REQ-04 se verifican con comandos deterministas que TEST ejecutó el 2026-10-16 con salida 0 (`docker compose --profile tools config --services`; `git check-ignore`; `git ls-files --eol`; `sha256sum -c`), pero no existe suite automatizada versionada. NO se verificó un mensaje real desde un teléfono (solo canal sandbox con `jelou test send`; la lista de testers del sandbox está vacía). | Versionar un script de E2E (compose más simulación de pago) y agregar el teléfono del USUARIO como tester para una prueba real. | |
| D-05 | P2 | Gate fallido (causa conocida) | `makia check-units` sale 1 por el directorio `docs/` en la raíz del repo (`docs/asientos-avion.webp`, versionado desde el commit de instalación de MakIA d5136e5, anterior a la PoC; nada del proyecto lo referencia). La regla de unidad exige que todo cuelgue de una unidad. No se movió por no ser un archivo de la PoC. | El USUARIO decide: moverlo a una unidad (p. ej. `apps/crm/public/` o `apps/crm/docs/` si sirve de referencia del mapa de asientos) o eliminarlo; con eso `check-units` sale 0. | |
| D-06 | P2 | Divergencia (contrato obsoleto) | `apps/agent/contract/endpoints.md` (y sus copias en `apps/pay` y `apps/crm`, verificadas por hash) afirma autenticación Bearer/MCP de las tools, marca nombres de campos como SUPUESTO y tiene una línea Fuente que remite a documentos de IDEA; el código real usa Tools HTTP de Brain Studio con un secreto de organización. | Actualizar el original y regenerar `CONTRACT.sha256` y las copias en una iteración (contrato primero). | |
| D-07 | P2 | Divergencia de requisitos y diseño de IDEA frente al código | Datum es PocketBase: autenticación con cabecera `X-Api-Key` y endpoint por colección `GET\|POST /collections/{c}/records` y `GET\|PATCH /records/{id}` (PUT no existe). El draft y la tarea 2.3 hablaban de Authorization Basic con `JELOU_CLIENT_ID` y `JELOU_CLIENT_SECRET` y de `/v2/databases/{DATABASE_ID}/rows` con PUT; la tarea 1.4 listaba `JELOU_CLIENT_ID`, `JELOU_CLIENT_SECRET` y `DATABASE_ID` en `.env.example` (hoy `DATUM_URL` y `DATUM_API_KEY`). También resultó falso que Datum no tuviera filtros (las functions filtran en servidor) y los ids físicos son determinísticos (`bogmde`, `mes01`, `bogmde20261201`, `eventos_pago` con id determinista). Los specs reflejan el código (as-built); los documentos de IDEA quedan obsoletos y se excluyen al promover. La descripción de la tarea 2.3 en `poc/tasks.md` describe lo anterior. | No actualizar IDEA; dejar nota en el DEPLOY. | |
| D-08 | P3 | Nota (limitación de la demo) | `PAY_PUBLIC_URL` es `http://localhost:3001`: el enlace de pago solo abre en la máquina del USUARIO. | Para probar desde otro dispositivo, exponer pay con un túnel o URL pública y cambiar la variable en `.env`. | |
| D-09 | P3 | Nota | `@jelou/functions` fijado en 1.5.0 (el draft decía la versión generada por `functions init`); el spike también probó 1.6.1 con `ctx.verifyHmac`. Functions está en vista previa. | Subir de versión solo por decisión del USUARIO con prueba de `verifyHmac`. | |
| D-10 | P2 | Divergencia (artefactos obsoletos) | `apps/agent/workflow/workflow.json` y `apps/agent/workflow/validar.mjs` (y `apps/agent/workflow/README.md`, que los describe con un montaje MCP que no es el real) son obsoletos; la fuente real del agente de Brain Studio es `apps/agent/brain/` (se genera con `workflow/generar-tools.mjs` y `workflow/generar-brain.mjs` desde `workflow/agent.prompt.md`). No se borraron ni se modificaron. `validar.mjs` valida un archivo que ya no es la fuente. | Eliminarlos y reescribir el README en una iteración de limpieza. | |
| D-11 | P3 | Divergencia (invariante de datos) | Cuando una aprobación llega vencida, el evento en `eventos_pago` y `transacciones.ultimo_evento` conservan el estado recibido (APROBADA) aunque la transacción termina EXPIRADA; el invariante de `db-design.dbml` dice que el estado del último evento coincide con el de la transacción. | Ajustar el invariante (`ultimo_evento` = último evento recibido y aplicado, no el estado final) en domain-model y db-design, regenerando hash y copias. | |
| D-12 | P3 | Nota | Firma inválida: la intención pide registrar el rechazo por firma; el código lo registra solo como log de la function (`ctx.log`), sin fila en `eventos_pago`, y no toca datos. Reanudación sin `execution_id`: el código aplica el efecto sin reanudar (log) en vez de fallar, aunque transaccion-crear siempre lo guarda. Ambos con test. | Sin acción. | |
| D-13 | P3 | Nota | Notificación tardía: una vez, al notificar unos 15 min tarde una ejecución de test inactiva, pago-notificacion devolvió 503 (reanudación HTTP 422); los efectos ya estaban aplicados y la transacción quedó PENDIENTE; el reintento reaplica y reanuda (diseñado así, cada paso es idempotente). | Sin acción. | |
| D-14 | P3 | Observación no confirmada | Un EXPIRADO tardío visto durante la prueba real parece provenir de un escenario del E2E 4.1 (la expiración real a los 15 minutos de una transacción de prueba anterior), pero no se ha confirmado la correlación. | Si reaparece, correlacionar por `transaccion_id` y `execution_id` en los logs de la function. | |
| D-15 | P3 | Nota | Directorio vacío espurio `apps/pay;C` (sin archivos, no versionado por git; creado el 2026-10-16 16:27, probablemente por un comando con ruta mal escapada). No se borró. | Eliminarlo a mano (`rmdir`). | |
| D-16 | P3 | Nota (trazabilidad) | Algunos commits de tareas se hicieron con el slug de la idea (`makia(aerolinea-reservas-whatsapp)`) en vez del slug del spec: 2.18, 2.19 (infrastructure), 3.5 (pay), 3.6 (crm), 4.1 y los fixes d257860 y 631350d. `git log --grep` por slug de spec no los captura; los `tasks.md` citan los hashes. Los commits de marcado `[x]` del plan también van con el slug de la idea. | Sin acción. | |
| D-17 | P3 | Nota | Consistencia de versiones: `apps/crm` declara engines node 24 en `package.json` mientras `apps/pay` fija 24.22.0 (las imágenes usan `node:24.22.0-bookworm-slim` en ambas). | Sin acción. | |
| D-18 | P3 | Nota | El conteo de archivos de la verificación de fin de línea cambió de 53 (E2E 4.1) a 54 (TEST 2026-10-16, filtro `*.sh`, `*.yaml`, `*.yml`, `*.js`, `Dockerfile` bajo `apps/`); 0 con `i/crlf` en ambos. | Sin acción. | |

### D-01

Mascota cobrada solo en la ida (P1, divergencia abierta, decisión del USUARIO).

- Evidencia de la prueba real: línea Mascota ida (Luis) COP 195.000 = 150.000 x 1,30 (diciembre) y ninguna línea de mascota en el regreso.
- Análisis de la regla:
  - RN-05 de la intención: máximo 1 por reserva, peso <= 8 kg, en cabina, precio = `tarifa_mascota_cop` x multiplicador de temporada.
  - RN-02: la temporada se aplica a pasaje, equipaje y mascotas según el mes de `vuelos.fecha` de cada trayecto.
  - RN-07 enumera las líneas (pasaje por pasajero y trayecto, equipaje, mascota) como una sola línea de mascota.
  - La tabla `mascotas` del diseño de datos no referencia vuelos ni trayecto (a diferencia de equipaje, que sí tiene trayecto IDA o REGRESO) y trae un solo `precio_cop`.
  - La función `cotizar` tiene un comentario explícito de supuesto: la temporada de la mascota es la del vuelo de ida porque el draft no fija el trayecto.
- Conclusión: NO es un bug respecto del texto literal (1 mascota, 1 línea, 1 precio por reserva), pero la intención no es concluyente sobre si una ida y vuelta debe cobrar la mascota también en el regreso. RN-02 con la expresión "cada trayecto" sugiere cobro por trayecto; `mascotas` sin trayecto y RN-07 sugieren una línea única.
- Citas: `draft.md` RN-02, RN-05, RN-07, REQ-04; `db-design.dbml` tabla `mascotas`; `apps/agent/functions/cotizar/logica.ts` (comentario del supuesto).
- Recomendación: el USUARIO decide entre:
  - (A) Mantener una sola línea de mascota por reserva. Queda documentado como regla vigente en REQ-04 y en domain-model RN-05.
  - (B) Cobrar la mascota por trayecto (dos líneas). Requiere agregar trayecto a `mascotas` o persistir dos precios: cambio de datos primero en domain-model y db-design, regenerar hash de contrato y copias, cambiar `cotizar`, `transaccion-crear` y el prompt, más tests.
- Hasta decidir, la regla vigente es (A).

## 2. REQ sin test verde (por spec)

| Spec | REQ sin test verde | REQ verdes |
|------|--------------------|------------|
| reserva-pago-whatsapp-agent | REQ-09 (sin test; manual), REQ-10 (parcial), REQ-12 (parcial: comparador) | REQ-04 verde, con decisión abierta D-01 |
| reserva-pago-whatsapp-pay | REQ-04 (contrato por hash: solo comando) | REQ-01 a REQ-03 (26 tests) |
| dashboard-aerolinea-crm | REQ-06 (contrato por hash: solo comando; existe `verify-contract.sh`) | REQ-01 a REQ-05 (47 tests) |
| entorno-local-infrastructure | REQ-05 (E2E manual; divergencia D-04) | REQ-01 a REQ-04 por comando determinista (verde el 2026-10-16, sin suite versionada) |

## 3. Entidades del código ausentes del domain-model

Revisión hecha; el domain-model del agent ya está actualizado y se comprobó contra `.makia/docs/specs/apps/agent/domain-model.md`.

- Agregadas como value objects no persistidos: Cotización, Línea de cotización (concepto `PASAJE`, `EQUIPAJE` o `MASCOTA`; trayecto `IDA` o `REGRESO`; índice del pasajero; monto en COP), Enlace de pago (`PAY_PUBLIC_URL` + `/pay/` + id de la transacción) y Resultado de notificación (`APLICADO`, `EXPIRADO`, `DUPLICADO` o `SIN_EFECTO`).
- Agregado: glosario de id lógico frente a id físico (rutas `bogmde`, temporada `mes01`..`mes12`, parámetros sin guiones bajos, vuelos `bogmde20261201`, `eventos_pago` con id determinista).
- Reglas agregadas o corregidas:
  - RN-20 Compensación de creación: la reserva huérfana pasa a CANCELADA (mejor esfuerzo) y la operación responde 503.
  - RN-05 Mascota: una línea por reserva, asignada al trayecto IDA y con la temporada del vuelo de ida.
  - RN-16 corregida: la creación del evento es atómica por PK única de Datum y un duplicado simultáneo (400 `validation_not_unique`) se trata como DUPLICADO.
- Sin cambio: los límites de bodega y mascota se leen de la tabla `parametros` (los valores coinciden con el seed); RN-08 y RN-09 verificadas contra el código.

## 4. Resultado de los gates

SPEC los ejecutó el 2026-10-16 antes de comitear los specs.

| Comando | Salida | Resultado |
|---------|--------|-----------|
| `makia check-plan .makia/idea/aerolinea-reservas-whatsapp/poc/tasks.md` | 0 | OK |
| `makia check-project --sin-audit` | 0 | 4 specs, OK |
| `makia check-units` | 1 | Hallazgo único D-05 (`docs/` en la raíz) |

## 5. Pruebas ejecutadas por TEST el 2026-10-16

Todas en Docker, todas verdes.

| Alcance | Pasadas | Falladas |
|---------|---------|----------|
| apps/agent/functions (Deno 2.9.7) | 110 | 0 |
| apps/agent seed (node:test) | 18 | 0 |
| apps/agent/contract | 9 | 0 |
| apps/pay | 26 | 0 |
| apps/crm | 47 | 0 |
| Total | 210 | 0 |

Comandos de infraestructura: ver D-04 (salida 0).

## 6. Evidencia de commits

- Por spec: `git log --grep` con el patrón de slug de spec (por ejemplo `^makia(reserva-pago-whatsapp-agent):`).
- Más los commits bajo el slug de la idea listados en D-16.
- Los `tasks.md` de cada spec citan los hashes por tarea.
