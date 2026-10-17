# Audit Report: Reserva y pago por WhatsApp (agente, functions y datos base)

## 1. Metadata
- **Spec Auditado:** `reserva-pago-whatsapp-agent`
- **Ruta:** `.makia/docs/specs/apps/agent/reserva-pago-whatsapp-agent`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `2`

Contexto: el código aprobado por el USUARIO es la fuente de verdad y los datos del seed son dinámicos (los documentos no declaran cifras de datos). Los documentos se alinearon al código y el contrato se regeneró. Las divergencias ya aceptadas en `.makia/idea/aerolinea-reservas-whatsapp/poc/divergencias.md` se citan por ID como conocidas. Constitución leída: `## Global` y `## Unidad: apps/agent`.

Verificaciones del ciclo 2: `sha256sum -c CONTRACT.sha256` OK en `apps/agent/contract`, `apps/pay/contract` y `apps/crm/contract`; `db-design.dbml` del spec idéntico a `apps/agent/contract/db-design.dbml` y a las copias de pay y crm.

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos). **Cumple.**
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (lenguaje ubicuo, límites del Contexto Delimitado, entidades y reglas de negocio). **Alineado.**

Reflejo fiel del código en los documentos de dominio, verificado:
- Vuelos: clave única `(ruta_id, fecha, hora_salida)` en `db-design.dbml`, domain-model (Vuelo, Ruta 1:N Vuelo) y REQ-1.2/REQ-11.1; id físico `<ruta><fecha>` para el horario base y `<ruta><fecha><hhmm>` para los demás, igual que `idFisico.vuelos` en `seed/datos.mjs`; `vuelos-buscar` devuelve todos los vuelos del día. Sin cifras de vuelos ni de filas del seed en domain-model, dbml, requirements ni design.
- Mascota por trayecto: `trayecto` (`IDA` por defecto o `REGRESO`) en `Mascota` (`lib/esquemas.ts`), la entrada de `cotizar` y la línea `MASCOTA`; `transaccion-crear` persiste en `mascotas` solo `pasajero_id`, `reserva_id`, `especie`, `peso_kg` y `precio_cop`, sin trayecto. Domain-model (RN-05, glosario Línea de cotización), dbml (`mascotas`, nota de `precio_cop`), REQ-4.2/4.4, decisión de REQ-04 y design §4.2 lo declaran así. `REGRESO` sin vuelo de regreso se rechaza (`cotizar/logica.ts`, REQ-4.4).
- `mapa_url` y `CRM_PUBLIC_URL` en `VueloResumen`, variables de entorno (§4.2, §7.2) y REQ-1.2; coinciden con `vuelos-buscar/logica.ts` e `index.ts`.
- Secreto `JELOU_FN_TOKEN` en design §2.1, §2.2, §4.2 y §7.2; coincide con `brain/tools/*.json`.
- `seed/demo.mjs` en design §5 y REQ-11.4; Pasajero 1:0..4 Equipaje (bodega y cabina por trayecto) y RN-04 "una pieza por pasajero y trayecto" coinciden con `transaccion-crear` y el prompt.
- Estructuras de datos: el código no crea ni altera ninguna estructura no declarada en domain-model y dbml. Sin anticipación de funcionalidad futura.

Reglas verificadas en código y sin desvío (ciclo 1, se mantienen): RN-01 a RN-20 del domain-model; HMAC con `ctx.verifyHmac` sobre el cuerpo crudo antes de toda lectura, escritura o red; `sanitizarParaLog` en logs; filtros con `literalFiltro` y rutas con `encodeURIComponent`; sin secretos en el repositorio; `@jelou/functions` fijado en 1.5.0; write-then-verify de 3 intentos; `Math.round` por línea. Constitución (`## Global` y `## Unidad: apps/agent`): cumplida.

---

## 3. Hallazgos y Desviaciones

Sin hallazgos nuevos en este ciclo.

- H-01 (ciclo 1, resuelto): vuelos por ruta y fecha con varios horarios; domain-model, `db-design.dbml` (único `(ruta_id, fecha, hora_salida)`), REQ-1.2/REQ-11.1/Objetivo 4 y design alineados al código, sin cifras del seed; contrato regenerado y hashes verificados.
- H-02 (ciclo 1, resuelto): mascota por trayecto (`IDA` o `REGRESO`) aprobada y documentada en RN-05, REQ-4.2/4.4, design §4.2 y dbml; `trayecto` no se persiste, como declaran los documentos.
- H-03 (ciclo 1, resuelto): `mapa_url` y `CRM_PUBLIC_URL` documentados en design §4.2, §7.2 y REQ-1.2.
- H-04 (ciclo 1, resuelto): secreto `JELOU_FN_TOKEN` corregido en design; `seed/demo.mjs` mapeado en §5 y REQ-11.4; relación Pasajero 1:0..4 Equipaje alineada con lo que persiste `transaccion-crear`.

Divergencias ya aceptadas y conocidas (no son hallazgos): D-01 (la variante de mascota por trayecto quedó aprobada por el USUARIO y documentada), D-02, D-03, D-06, D-07, D-10, D-11, D-12 y D-13.

---

## 4. Supuestos Detectados
- IMPLEMENT asumió que el asiento i-ésimo de la lista corresponde al pasajero i-ésimo (`edades[i]`) para la regla de exit row (comentado en `lib/asientos.ts`); `requirements.md` no lo declara como regla.
- Los topes de bodega y mascota se declaran dos veces: en `Bodega` y `Mascota` (zod, con 158, 32 y 8 fijos) y en `parametros` (usados por `precioBodega` y `precioMascota`). `edad_min_exit_row` (15) y `max_pasajeros` (9) son filas de `parametros` pero están fijos en código. Hoy coinciden con el seed; el spec no declara cuál manda.
- Resuelto en el ciclo 2: la pieza de bodega por pasajero y trayecto ya figura en RN-04 del domain-model y de requirements.

---

## 5. Preguntas Abiertas

Sin preguntas abiertas (las del ciclo 1 sobre horarios, trayecto de mascota y piezas de bodega por trayecto quedaron resueltas por decisión del USUARIO).

---

## 6. Recomendaciones
- Dejar `parametros` como única fuente de los topes de bodega y mascota, o declarar la duplicación en el diseño. Hoy `Bodega` rechaza en zod con un "Validation failed" genérico un exceso de L+A+H o de peso, y no explica el límite incumplido (REQ-3.3 pide explicarlo).
- El código reanuda antes de cerrar la transacción (documentado en §2.6 del diseño); alinear el orden de RN-10 del domain-model con ese comportamiento.
- `design.md` §2.5 (ids físicos deterministas) lista el vuelo solo como `<ruta sin guion><fecha sin guiones>`; añadir la variante `<ruta><fecha><hhmm>` para los horarios distintos del base, como ya hacen domain-model y dbml.
- `apps/agent/spike/RESULTADO.md` conserva el nombre histórico `JELOU_FN_INVOKE_KEY` del spike; aclarar que el secreto vigente es `JELOU_FN_TOKEN` (no afecta a ningún artefacto del diseño).
- H-03 y H-04 del ciclo 1 (documentación del contrato y referencias): resueltos, ver sección 3.

---

## 7. Veredicto Final

**Veredicto:** `PASA_CON_OBSERVACIONES`

Los dos hallazgos bloqueantes del ciclo 1 (H-01 y H-02) y los menores (H-03, H-04) están resueltos: domain-model, `db-design.dbml`, requirements y design reflejan fielmente el código (varios vuelos por ruta y fecha con clave `(ruta_id, fecha, hora_salida)`, mascota por trayecto sin persistir el trayecto, `mapa_url`/`CRM_PUBLIC_URL`, `JELOU_FN_TOKEN`), sin cifras de datos del seed, y el contrato y sus copias verifican por hash. Quedan solo recomendaciones no bloqueantes (sección 6) y los supuestos de la sección 4. Constitución y principios de trabajo cumplidos.
