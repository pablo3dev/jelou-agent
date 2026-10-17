# Audit Report: Dashboard de la aerolínea (solo lectura)

## 1. Metadata
- **Spec Auditado:** `dashboard-aerolinea-crm`
- **Ruta:** `.makia/docs/specs/apps/crm/dashboard-aerolinea-crm`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `1`

Contexto: se audita el código actual de `apps/crm` (incluye la iteración de GUI posterior a la promoción, commit `d917aad`: pestañas, gráfica de ventas por periodo, buscador, tema claro/oscuro y widget de selección de asientos), aprobada por el USUARIO como MVP. Se contrasta contra `.makia/docs/specs/apps/agent/domain-model.md`, `apps/agent/contract/` (copia verificada por hash: `verify-contract.sh` reporta `db-design.dbml: OK`, `endpoints.md: OK`, idéntico al original) y el `design.md` del spec hermano `reserva-pago-whatsapp-agent`. Constitución leída: `## Global` y `## Unidad: apps/crm`. Divergencias aceptadas citadas por ID (hoja `poc/divergencias.md`): D-03, D-04, D-06, D-07, D-17. No se modificó código ni git.

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos), con las observaciones de las secciones 3 y 6.
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (lenguaje ubicuo, límites del Contexto Delimitado, entidades y reglas de negocio), con la salvedad de H-01.

Resultado por regla de negocio y seguridad (código actual):
- RN-08 / REQ-1.1, 1.6, 2.3, EC-02: `src/asientos.js` `estadoEfectivo` trata RETENIDO con `hold_expira <= ahora` como LIBRE, solo por lectura; RETENIDO vigente no suma a vendidos. Cumple.
- RN-16 / REQ-2.1: 174 asientos (filas 1-3 letras A,C,D,F; 4-30 A-F), clases por fila y exit row 13 y 14. Cumple.
- RN-17: `porcentaje(vendidos, 174)` con una decimal; agregados con `vuelos * 174`. Cumple.
- RN-18 / REQ-2.5, 4.3: `detalleAsientos` solo expone `pnr` en VENDIDO; `hold_token` y `hold_expira` no se copian; no se leen `pasajeros`, `equipaje`, `mascotas`, `transacciones`. El buscador y las pestañas nuevas operan solo sobre `vuelo_id`, `ruta` y `fecha`. Cumple.
- Solo lectura (constitución Global y REQ-4.1, 4.2): el router rechaza con 405 todo método fuera de GET, HEAD y OPTIONS; el cliente Datum solo expone `list` y `getById`; el frontend usa `fetch` GET. El widget `views/asientos.js` mantiene la selección en estado local y solo copia al portapapeles: no escribe datos. Cumple.
- Documento enmascarado: crm no lee ni registra el documento del pasajero. Cumple.
- Chart.js 4.5.1 fijado, único origen externo `cdn.jsdelivr.net`, CSP sin `unsafe-inline`; sin `innerHTML`, `insertAdjacentHTML` ni estilos inline en `public/` (barras con `style.setProperty` de variables CSS). Cumple REQ-5.3, 5.4.
- Express 5.3.0 / Node 24.22.0 (constitución `apps/crm`): sin desvío.
- Principios de trabajo: sin mocks, stubs, flags ni ramas para funcionalidad futura en `src/` ni `public/`; la inyección de `datum` y `now` en `createApp` tiene consumidor actual (pruebas). Sin estructura de datos nueva en crm (solo modelos de lectura derivados).

---

## 3. Hallazgos y Desviaciones
| ID | Descripción | Severidad | Referencia (REQ/DESIGN/domain-model) |
|:---|:---|:---:|:---|
| **H-01** | Los datos reales difieren del modelo de dominio: `apps/agent/seed/datos.mjs` define `HORARIOS = ["07:00","12:30","18:45"]` y genera 3 vuelos por ruta y día (id físico con sufijo de hora, p. ej. `bogmde202612011230`); `apps/agent/seed/demo.mjs` y el comentario de `apps/crm/public/js/views/ventas.js:25` asumen más de 1.100 vuelos. El `domain-model.md` (Vuelo: un vuelo por ruta y día, 372, salida 07:00) y `db-design.dbml` (`hora_salida` fija 07:00, índice único `(ruta_id, fecha)`) no lo declaran. El código de `apps/crm` no depende del conteo (calcula sobre lo que lee) y no se ve afectado funcionalmente, pero `requirements.md` (Objetivo 1: 372 vuelos del calendario) y `design.md` (§2.6, §4.2: `vuelos: 372`, `total: 64728`, §8.3) quedan desalineados con los datos mostrados. El origen es la unidad `apps/agent` (dueña del modelo y del seed), no `apps/crm`. Principio 2 de trabajo (de los datos hacia afuera): primero se actualizan `domain-model.md` y `db-design.dbml` (y se regenera el hash del contrato y las copias), luego el seed y el resto. No figura en las divergencias aceptadas (D-01 a D-18). | `Menor` (para este spec; se resuelve en `apps/agent`) | domain-model.md (Vuelo, 372 vuelos); db-design.dbml `vuelos`; REQ-01 Objetivo 1; DESIGN §2.6, §4.2, §8.3 |
| **H-02** | Funcionalidad añadida tras la promoción que `requirements.md`, `design.md` y `tasks.md` no reflejan: widget de selección de asientos `#/asientos/<vuelo_id>/<n>` (`public/js/views/asientos.js`, `hash.js`), tema claro/oscuro (`public/js/tema.js`), gráfica de línea de ventas por periodo con granularidad día/semana/mes y picos, pestañas Todos/Con ventas/Sin ventas y buscador por palabra clave en Ventas (`public/js/views/ventas.js`). No viola regla de negocio ni de seguridad (solo lectura, sin datos personales, CSP intacta); es un desfase documental. El widget es una interfaz cross-unidad ya declarada en el contrato de `apps/agent` (`endpoints.md` línea 78: `mapa_url` = CRM_PUBLIC_URL + `/#/asientos/<vuelo_id>/<pasajeros>`, generado en `vuelos-buscar`) y consumida por crm sin que el spec de crm la nombre. | `Menor` | DESIGN §4.2 Frontend, §5; REQ-02, REQ-01; contrato `apps/agent/contract/endpoints.md` |

H-01 y H-02 no bloquean: no violan una regla de negocio ni de seguridad dentro de la unidad auditada, y el USUARIO aprobó el resultado como MVP.

---

## 4. Supuestos Detectados
- La iteración de GUI (commit `d917aad`) asumió un calendario con 3 horarios diarios por ruta (más de 1.100 vuelos) sin que `domain-model.md` ni `db-design.dbml` lo declaren (origen: `apps/agent/seed/datos.mjs`, `demo.mjs`).
- `design.md` §8 y `tasks.md` §5 afirman 47 pruebas verdes (2026-10-16); la iteración posterior añadió pruebas a `tests/frontend.test.js` y la suite no se re-ejecutó en esta auditoría. El conteo vigente no está verificado.
- El widget `#/asientos` limita la selección a 9 (`MAX_SELECCION`), coherente con 1-9 pasajeros del agente, pero esa cota no está escrita en el spec de crm.

---

## 5. Preguntas Abiertas
- El USUARIO debe decidir el calendario vigente (negocio): un vuelo por ruta y día a las 07:00 (372, como declara el modelo) o tres horarios diarios (07:00, 12:30, 18:45; 1.116). Según la respuesta, `apps/agent` actualiza primero `domain-model.md` y `db-design.dbml` (y regenera hash y copias) o corrige el seed; luego crm ajusta las cifras de su spec.

---

## 6. Recomendaciones
- (H-01) Resolver el calendario en `apps/agent` (datos primero) y, después, reemplazar en el spec de crm las cifras fijas 372 y 64728 por lenguaje independiente del conteo, o por el conteo vigente.
- (H-02) Actualizar el spec en una iteración (desarrollo aditivo): `requirements.md` con criterios EARS de (a) widget de selección compartible por enlace desde el chat (solo lectura; solo asientos LIBRE elegibles; límite 1..9 opcional dado por la ruta), (b) serie de ventas por periodo (día, semana ISO, mes), (c) pestañas y buscador del detalle por vuelo, (d) tema claro/oscuro; `design.md` §4.2 Frontend (ruta `#/asientos/<id>/<n>`, `tema.js`, `views/asientos.js`) y §5 (archivos nuevos `tema.js` y `views/asientos.js`); `tasks.md` con la tarea correspondiente.
- Actualizar `design.md` §8 y `tasks.md` §5 con el conteo real de pruebas tras ejecutar la suite en contenedor.
- Sobre-ingeniería menor, no anticipatoria: la tabla del detalle por vuelo en Ventas renderiza todos los vuelos visibles sin paginar (con más de 1.100 filas pesa en el DOM); considerar limitar o paginar.
- Divergencias ya aceptadas que siguen vigentes y no se reabren: D-03/D-04 (REQ sin test automatizado versionado; para crm, REQ-06 se verifica por comando, ejecutado hoy con resultado OK), D-06 (contrato `endpoints.md` obsoleto en su descripción de autenticación), D-07 (as-built de Datum v2), D-17 (`engines.node` 24 frente a 24.22.0).

---

## 7. Veredicto Final

**Veredicto:** `PASA_CON_OBSERVACIONES`

El código de `apps/crm` cumple las reglas de negocio (RN-08, RN-16, RN-17, RN-18), la restricción de solo lectura, el documento enmascarado y la versión fijada de Chart.js 4.5.1, y la copia del contrato coincide por hash con el original. H-01 (desfase de calendario con origen en `apps/agent`) y H-02 (funcionalidad añadida no reflejada en el spec) son menores y no bloqueantes.
