# Audit Report: Reserva y pago por WhatsApp (agente, functions y datos base)

## 1. Metadata
- **Spec Auditado:** `reserva-pago-whatsapp-agent`
- **Ruta:** `.makia/docs/specs/apps/agent/reserva-pago-whatsapp-agent`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `1`

Contexto: PoC convertida en fuente de verdad; el producto es el aprobado por el USUARIO. Las divergencias ya aceptadas en `.makia/idea/aerolinea-reservas-whatsapp/poc/divergencias.md` se citan por ID como conocidas y no cuentan como hallazgos nuevos. Constitución leída: `## Global` y `## Unidad: apps/agent`.

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos). **Parcial: ver H-01, H-02, H-03 y H-04.**
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (lenguaje ubicuo, límites del Contexto Delimitado, entidades y reglas de negocio). **Alineado, salvo la ambigüedad de piezas de bodega y de equipaje por pasajero (H-04, sección 4).**

Reglas verificadas en código y sin desvío:
- RN-01/02: tarifa x temporada del mes de `vuelos.fecha` (`lib/precios.ts`, `cotizar`).
- RN-03: cabina con precio 0 y sin medidas.
- RN-04: `ceil(max(peso, LxAxH/6000))`, `max(40000, kg x 12000)` x temporada, límites 158 cm y 32 kg.
- RN-05: <= 8 kg y 1 por reserva (salvo H-02).
- RN-06: formato, existencia, LIBRE, cantidad y exit row 13-14 con edad >= 15, validado en servidor antes de retener y sin retención parcial.
- RN-07: `Math.round` por línea y total como suma.
- RN-08/09: hold de 15 min; `expira_at` = `hold_expira` = un solo instante; re-fijación con write-then-verify.
- RN-10/11/12: efecto sobre asientos, reserva y transacción; expiración estricta (`ahora > expira_at`) aun con APROBADA.
- RN-13: alfabeto sin O, I, 0 ni 1, y lectura previa de unicidad.
- RN-14/15: ventana y 1..9 en zod.
- RN-16: evento con id determinista; `validation_not_unique` se trata como DUPLICADO.
- RN-17: 3 intentos, backoff 200/400 ms, 503.
- RN-18: `sanitizarParaLog` en cotizar, vuelos-buscar, asientos-validar-retener y transaccion-crear; `pago-notificacion` solo registra `transaccion_id` y `estado`.
- RN-20: compensación a CANCELADA.
- HMAC: `ctx.verifyHmac` sobre el cuerpo crudo antes de toda lectura, escritura o llamada de red; cualquier excepción cuenta como firma inválida (401).
- Inyección y secretos: filtros con `literalFiltro`, rutas con `encodeURIComponent`, sin secretos en el repositorio, `@jelou/functions` fijado en 1.5.0.

---

## 3. Hallazgos y Desviaciones
| ID | Descripción | Severidad | Referencia (REQ/DESIGN/domain-model) |
|:---|:---|:---:|:---|
| **H-01** | El seed carga **1116 vuelos** (3 horarios por ruta y día: 07:00, 12:30 y 18:45) en vez de los 372 declarados (un vuelo por ruta y día, 07:00). Evidencia: `apps/agent/seed/datos.mjs` (`HORARIOS`, `generarVuelos`, id físico con sufijo `hhmm` para los horarios distintos de 07:00) y `apps/agent/seed/seed.test.mjs` (aserciones sobre 1116). Contradice el invariante `vuelos (ruta_id, fecha) [unique]` y "hora_salida fija en 07:00" de `db-design.dbml`, el id físico del vuelo del domain-model, REQ-11.1 y el Objetivo 4, e introduce un formato de id (`bogmde202612011230`) no declarado. No figura en `divergencias.md`. Consecuencia de negocio: `vuelos-buscar` puede devolver hasta 3 vuelos por fecha, mientras REQ-1.2 describe un único vuelo de ese día. | `Bloqueante` | `REQ-1.2, REQ-11.1, Objetivo 4; domain-model.md (Vuelo, Id lógico/físico); db-design.dbml (vuelos)` |
| **H-02** | La mascota admite `trayecto` `IDA` o `REGRESO` (`apps/agent/functions/lib/esquemas.ts` `Mascota.trayecto`, default `IDA`; `cotizar/logica.ts` usa el vuelo de regreso y su temporada cuando es `REGRESO`; `workflow/agent.prompt.md` §5.3 pregunta el tramo al cliente). Domain-model RN-05, REQ-4.2, `design.md` §4.2 (cotizar: única línea `MASCOTA` trayecto `IDA`, temporada del vuelo de ida) y D-01 (aceptado: rige la opción A, cobro en la ida) dicen que la mascota se cobra siempre en la ida. Con `REGRESO` el precio puede cambiar por temporada (ida en noviembre, regreso en diciembre). `trayecto` de la mascota no se persiste (`mascotas` no tiene ese campo), así que es un parámetro y una rama no declarados en el modelo. No es la opción B de D-01 (dos líneas); es una tercera variante no aprobada. | `Bloqueante` | `domain-model.md RN-05; REQ-4.2; design.md §4.2 cotizar; divergencias D-01; orchestrator § Principios de trabajo` |
| **H-03** | `vuelos-buscar` devuelve el campo `mapa_url` y lee la variable `CRM_PUBLIC_URL` (`vuelos-buscar/logica.ts`, `index.ts`); el prompt (paso 6) depende de él. Ni `VueloResumen` en `design.md` §4.2 ni la lista de variables de entorno (§4.2 y §7.2) los declaran. Es un contrato cross-unidad (widget de asientos del CRM) no documentado. | `Menor` | `design.md §4.2 vuelos-buscar y variables de entorno; Global (contrato primero)` |
| **H-04** | Referencias del diseño que no coinciden con el código: (a) `design.md` §2.1, §4.2 y §7.2 nombran el secreto de organización `JELOU_FN_INVOKE_KEY`, pero las 6 Tools HTTP (`brain/tools/*.json`) usan el secreto `JELOU_FN_TOKEN`; (b) `apps/agent/seed/demo.mjs` (carga de reservas, pasajeros, pagos y mapas DEMO para capturas, con tarifas, horarios y retenciones de 3 h propios) no figura en el mapeo de §5 ni en REQ-11; (c) la relación Pasajero 1:0..2 Equipaje del domain-model no cuadra con lo que persiste `transaccion-crear` (cabina más bodega por trayecto: hasta 4 filas por pasajero en ida y vuelta). | `Menor` | `design.md §2.1, §5, §7.2; domain-model.md Relaciones` |

Divergencias ya aceptadas y conocidas (no son hallazgos nuevos): D-01 (mascota cobrada solo en la ida; ver H-02 por la variante detectada), D-02 (señal de reanudación `paid` en texto), D-03 (REQ-09, REQ-10 y REQ-12 sin test verde), D-06 (contrato `endpoints.md` obsoleto), D-07, D-10 (artefactos `workflow/workflow.json`, `validar.mjs` y `README.md` obsoletos), D-11 (`ultimo_evento` con el estado recibido en una expiración tardía), D-12 (firma inválida solo en log; reanudación sin `execution_id`) y D-13 (503 por notificación tardía).

---

## 4. Supuestos Detectados
- IMPLEMENT asumió que el asiento i-ésimo de la lista corresponde al pasajero i-ésimo (`edades[i]`) para la regla de exit row (comentado en `lib/asientos.ts`); `requirements.md` no lo declara como regla.
- Los topes de bodega y mascota se declaran dos veces: en `Bodega` y `Mascota` (zod, con 158, 32 y 8 fijos) y en `parametros` (usados por `precioBodega` y `precioMascota`). `edad_min_exit_row` (15) y `max_pasajeros` (9) son filas de `parametros` pero están fijos en código. Hoy coinciden con el seed; el spec no declara cuál manda.
- La pieza de bodega se limita a una por pasajero y trayecto (prompt, regla 5), mientras RN-04 y `db-design.dbml` dicen una pieza por pasajero. Ningún código cuenta piezas entre trayectos (`cotizar` llama `precioBodega` siempre con 0 piezas previas).

---

## 5. Preguntas Abiertas
- H-01: ¿El USUARIO aprobó los 3 horarios por día (1116 vuelos)? Si sí, actualizar `domain-model.md`, `db-design.dbml` (unique `(ruta_id, fecha, hora_salida)`, hora ya no fija) y REQ-11.1 (contrato primero, con hash y copias). Si no, el seed debe volver a 372 vuelos.
- H-02: ¿El USUARIO aprobó que el cliente elija el tramo de la mascota (IDA o REGRESO)? Si sí, actualizar RN-05, REQ-4.2 y el diseño; si no, quitar `trayecto` del esquema y el paso del prompt.
- RN-04: ¿una pieza por pasajero significa por reserva completa o por trayecto? El código y el prompt aplican por trayecto.

---

## 6. Recomendaciones
- Documentar `mapa_url` y `CRM_PUBLIC_URL` en `design.md` §4.2 y en el contrato (H-03).
- Corregir la referencia al secreto (`JELOU_FN_TOKEN`) y listar `seed/demo.mjs` como artefacto fuera del seed base (H-04).
- Dejar `parametros` como única fuente de los topes de bodega y mascota, o declarar la duplicación en el diseño. Hoy `Bodega` rechaza en zod con un "Validation failed" genérico un exceso de L+A+H o de peso, y no explica el límite incumplido (REQ-3.3 pide explicarlo).
- El código reanuda antes de cerrar la transacción (documentado en §2.6 del diseño); alinear el orden de RN-10 del domain-model con ese comportamiento.

---

## 7. Veredicto Final

**Veredicto:** `RECHAZADA`

Hay dos hallazgos bloqueantes (H-01 y H-02): el código diverge del spec, del domain-model y de `db-design.dbml` en datos (vuelos por día y horario) y en una regla de precio (mascota por trayecto), y ninguno figura en la hoja de divergencias aceptadas. Se resuelven alineando el código, o actualizando primero los documentos de dominio, según decida el USUARIO (sección 5). El resto del negocio (precios, temporadas, equipaje, asientos, validaciones en servidor, enmascarado de documento y HMAC) está correctamente aplicado.

Evidencia para error-report (D-02): H-01 en `apps/agent/seed/datos.mjs` y `apps/agent/seed/seed.test.mjs`; H-02 en `apps/agent/functions/lib/esquemas.ts`, `apps/agent/functions/cotizar/logica.ts` y `apps/agent/workflow/agent.prompt.md`. Rama `makia/dev/audit-mvp-aerolinea`, HEAD `9895999`.
