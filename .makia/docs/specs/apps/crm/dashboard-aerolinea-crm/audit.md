# Audit Report: Dashboard de la aerolínea (solo lectura)

## 1. Metadata
- **Spec Auditado:** `dashboard-aerolinea-crm`
- **Ruta:** `.makia/docs/specs/apps/crm/dashboard-aerolinea-crm`
- **Fecha de Auditoría:** `2026-10-17`
- **Auditor:** `AUDIT`
- **Ciclo de Auditoría:** `2`

Contexto: reemisión (ciclo 2) tras la actualización del spec y de `apps/agent`. El USUARIO decidió que el código aprobado es la fuente de verdad y que los datos son dinámicos. Se contrasta `requirements.md` y `design.md` (con REQ-1.7, 1.8, 2.6 a 2.8 y 3.5 nuevos) contra el código actual de `apps/crm` (lectura, sin ejecutar), `.makia/docs/specs/apps/agent/domain-model.md` y `apps/agent/contract/` (ya con varios vuelos por ruta y fecha, distinguidos por `hora_salida`, índice único `(ruta_id, fecha, hora_salida)`, id físico con sufijo `hhmm` para horarios no base). `sh contract/verify-contract.sh` en `apps/crm`: `db-design.dbml: OK`, `endpoints.md: OK`, idéntico al original. Constitución leída: `## Global` y `## Unidad: apps/crm`. No se modificó código ni git.

---

## 2. Alcance de la Verificación
- [x] El código implementado cumple con `requirements.md` (criterios EARS) y `design.md` (contratos, estructura de archivos), con las observaciones de la sección 6.
- [x] El spec (`requirements.md`/`design.md`) está alineado con `domain-model.md` (lenguaje ubicuo, límites del Contexto Delimitado, entidades y reglas de negocio).

Verificación de los requerimientos nuevos contra el código:
- REQ-1.7 / `views/ventas.js`: `agruparVentas` agrupa por día, semana (lunes, `(getUTCDay()+6)%7`) o mes; `indicesPicos` resalta hasta 5 máximos locales con punto; el tooltip muestra vuelos con ventas y vuelo con más vendidos. Fiel.
- REQ-1.8 / `filtrarVentasVuelo`: pestañas `todos|con|sin`, palabras que deben estar todas, normalización NFD sin tildes ni mayúsculas sobre `vuelo_id`, `ruta`, `fecha` (y fecha formateada), «Con ventas» ordenado por vendidos descendente, conteo por pestaña, mensaje sin resultados, estado a nivel de módulo que sobrevive al refresco. Fiel.
- REQ-2.6 a 2.8 / `views/asientos.js`, `hash.js`: solo LIBRE elegible, contador, botón copiar en orden natural fila-letra (`ordenarAsientos`), `navigator.clipboard` con respaldo `execCommand`; límite `n` con `MAX_SELECCION = 9` y aviso al superarlo; sin `n` válido, `null` sin límite; asiento que deja de ser LIBRE se retira al refrescar; selección solo en estado local. Fiel.
- REQ-3.5 / `tema.js`, `main.js`: `data-theme`, `localStorage` `crm-theme`, `prefers-color-scheme: light` (si no, oscuro), botón `#tema` en la barra superior. Fiel.
- Calendario: `design.md` y `requirements.md` ya no fijan 372 ni 64728; usan lenguaje independiente del conteo («calendario vigente», ejemplos declarados ilustrativos). Alineado con `domain-model.md` (un `Vuelo` por ruta, fecha y hora) y `db-design.dbml`. El ejemplo `bogmde20261201` coincide con el id del horario base.

Resultado por regla de negocio y seguridad (código actual):
- RN-08 / REQ-1.1, 1.6, 2.3, EC-02: `estadoEfectivo` trata RETENIDO vencido como LIBRE solo por lectura; RETENIDO vigente no suma a vendidos. Cumple.
- RN-16 / REQ-2.1: 174 asientos, clases por fila, exit row 13 y 14. Cumple.
- RN-17: `porcentaje(vendidos, 174)` y agregados con `vuelos * 174`. Cumple.
- RN-18 / REQ-2.5, 4.3: `pnr` solo en VENDIDO; `hold_token` y `hold_expira` no se copian; no se leen datos de pasajeros. Buscador, pestañas y widget operan solo sobre `vuelo_id`, `ruta`, `fecha` y estado de asiento. Cumple.
- Solo lectura (Global y `apps/crm`; REQ-4.1, 4.2): 405 fuera de GET/HEAD/OPTIONS; cliente Datum solo `list` y `getById`; el único `fetch` del frontend (`public/js/api.js`) usa el verbo por defecto. Cumple.
- Documento del pasajero: crm no lo lee ni lo registra. Cumple.
- Chart.js 4.5.1 fijado, único origen externo `cdn.jsdelivr.net`, CSP sin `unsafe-inline`; sin `innerHTML`, `insertAdjacentHTML`, `style=` ni `eval` en `public/`. Cumple REQ-5.3, 5.4.
- Express 5.3.0 / Node 24.22.0 (constitución `apps/crm` y Global): sin desvío.
- Principios de trabajo: sin mocks, stubs, flags ni ramas para funcionalidad futura; sin estructura de datos nueva en crm (solo modelos de lectura derivados); la inyección de `datum` y `now` tiene consumidor actual (pruebas).
- Conteos de pruebas citados en `design.md` §8 verificados contra los archivos: `api` 14, `datum` 9, `server` 5, `static` 7; los nombres de pruebas citados en las secciones «Verificación» existen en `frontend.test.js` (17 pruebas) y `api.test.js`. La suite no se re-ejecutó (la auditoría no ejecuta código).

---

## 3. Hallazgos y Desviaciones
H-01 (ciclo 1, resuelto): desfase de calendario (372 vuelos, 64728 asientos, un vuelo por ruta y día) corregido en `domain-model.md`, `db-design.dbml` y contrato (varios vuelos por ruta y fecha); `requirements.md` y `design.md` de crm ya no fijan cifras; copia del contrato verificada por hash.
H-02 (ciclo 1, resuelto): widget de asientos, tema claro/oscuro, gráfica de ventas por periodo y pestañas/buscador documentados en `requirements.md` (REQ-1.7, 1.8, 2.6 a 2.8, 3.5), `design.md` (§4.2 Frontend, §5, §6, §8) y verificados contra el código.

Sin hallazgos nuevos.

---

## 4. Supuestos Detectados
- H-03-supuesto (ciclo 1, resuelto): el tope de 9 asientos del widget ya está escrito en REQ-2.7 y `design.md` §4.2.
- `design.md` y `tasks.md` §5 ya no afirman un conteo global de pruebas verdes; el estado de la suite completa tras la iteración de GUI no fue re-ejecutado en esta auditoría (la suite parcial por archivo coincide con los conteos documentados).

---

## 5. Preguntas Abiertas
Sin preguntas abiertas. (Ciclo 1, resuelto: calendario vigente decidido por el USUARIO, datos dinámicos.)

---

## 6. Recomendaciones
- Trazabilidad menor en `tasks.md`: la tarea 2.16 lista los archivos nuevos (`tema.js`, `views/asientos.js`) pero su etiqueta de requerimientos no incluye REQ-1.7, 1.8, 2.6, 2.7, 2.8 ni 3.5, y `summary.md` («Qué puede hacer ya el usuario») no menciona el widget, el tema ni la gráfica/pestañas. Añadirlos en la próxima edición del spec.
- Fecha obsoleta: `design.md` §1 sigue con «AS-BUILT, redactado ... el 2026-10-16» aunque se actualizó el 2026-10-17; actualizar la fecha.
- Sobre-ingeniería menor, no anticipatoria: el comentario de `public/js/views/ventas.js:25` menciona «1.100+ vuelos» (cifra de datos dinámicos que la decisión del USUARIO descarta fijar), y la tabla de detalle por vuelo renderiza todos los vuelos visibles sin paginar. Considerar reformular el comentario y limitar o paginar.
- El orden de `/api/vuelos` es por `fecha` y `ruta` (documentado como tal); con varios vuelos por ruta y fecha los desempata el orden de lectura de Datum. Considerar añadir `hora_salida` como tercer criterio (cambio de código; el spec documenta el comportamiento actual).
- Divergencias ya aceptadas que siguen vigentes y no se reabren: D-03/D-04 (REQ-06 sin test automatizado versionado; verificado por comando hoy, OK), D-06, D-07, D-17.

---

## 7. Veredicto Final

**Veredicto:** `PASA_CON_OBSERVACIONES`

Los hallazgos del ciclo 1 (H-01, H-02) están resueltos. El spec refleja fielmente el código (widget de asientos, tema, gráfica de ventas, pestañas y buscador), no fija cifras de datos, y el código cumple RN-08, RN-16, RN-17, RN-18, solo lectura, CSP y las directrices de `## Global` y `## Unidad: apps/crm`. Quedan solo observaciones no bloqueantes de trazabilidad y limpieza (sección 6).
