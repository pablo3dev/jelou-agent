# Resultado del spike 3.1 (go/no-go)

Fecha: 2026-10-16. Spike en vivo contra una base de Datum v2 creada para la PoC. Este archivo no contiene secretos.

## Veredicto

GO condicionado a las correcciones de diseno de este documento (Datum v2 es PocketBase con filtros y direccionamiento por coleccion; ids fisicos `[a-z0-9]`; HMAC con `prefix`; `@jelou/functions` fijado en 1.5.0). El punto 5 (WhatsApp) no se pudo ejecutar: queda pendiente de que el usuario conecte un canal.

## Los 5 puntos del spike (viability.md)

| # | Punto | Resultado | Evidencia |
|---|-------|-----------|-----------|
| 1 | Auth y CRUD de Datum con curl | PASA, con otra URL y otra auth | Base `https://<slug>.jelou.cloud/api` (slug de `jelou databases show`), cabecera `X-Api-Key: <db_...>` (creada con `jelou databases api-keys create`). `gateway.jelou.ai/datum-db/<slug>/api` y `api.jelou.ai/v2/databases/{id}/rows` (Basic) responden 401. Reproducible con `spike/datum-crud.sh`. |
| 2 | HMAC sobre el cuerpo crudo | PASA | Firma con espacios no canonicos: ok. Firma sobre `JSON.stringify` con cuerpo distinto: `invalid_signature`. |
| 3 | `ctx.verifyHmac` en `jelou functions dev` | PASA con `prefix` | Probado con 1.5.0 y 1.6.1 (`spike/hmac-probe`). |
| 4 | `jelou functions check` en `node:24.22.0-bookworm-slim` | PASA (GAP-04 cerrado antes) | `check` es offline y no requiere Deno. `functions dev` si necesita `unzip` en la imagen (descarga Deno al primer arranque). |
| 5 | Mensaje de texto por WhatsApp | NO EJECUTABLE | No hay canal conectado (lo conecta el usuario). La documentacion muestra `ctx.jelou.send({ type: "text", to, text })`; GAP-11 sigue abierto. |

## Hallazgos de Datum v2

- Es PocketBase. Coleccion: `GET|POST ${DATUM_URL}/collections/{coleccion}/records`; registro: `GET|PATCH|DELETE .../records/{id}`. PUT => 404 (se usa PATCH, que fusiona campos). `/batch` => 403.
- GET por id => 200 con registro plano `{id, collectionId, collectionName, created, updated, ...campos}`; inexistente => 404.
- Listado `{items, page, perPage, totalItems, totalPages}` con `page`, `perPage` (hasta 500), `filter` (p. ej. `ruta_id="BOG-MDE" && fecha>="2026-12-01"`), `sort`, `fields`. El supuesto "Datum no filtra" era falso.
- Ids: los asigna Datum (15 chars a-z0-9) o se envia `id` al crear; con `id:text` declarado admite cualquier longitud pero solo `[a-z0-9]` (`BOG-MDE` es invalido). Un `id` repetido en POST => 400 `validation_not_unique`: la PK es unica y atomica. No se pueden crear otros indices unicos (ni con API key ni con CLI): `rutas(origen,destino)`, `vuelos(ruta_id,fecha)`, `reservas.pnr` y `eventos_pago.id_evento` se garantizan por id determinista o por codigo.
- Ids fisicos: rutas `bogmde`; temporada `mes01`..`mes12`; parametros = clave sin guiones bajos (`tarifakgbodegacop`); vuelos `<ruta sin guion><fecha sin guiones>` (`bogmde20261201`, es el `vuelo_id` del agente); eventos_pago `<transaccion_id><estado en minusculas>`; resto autogenerado.
- Tipos reales: text, number, bool, email, url, date, select, relation, file, json, editor, geoPoint. En `number`, `required` significa "distinto de 0": no se marcan required los numeros. Las fechas `date` vuelven como `2026-12-01 00:00:00.000Z` (el cliente las normaliza a ISO con `T`). Los JSON vuelven como objeto. Select invalido => 400.
- Concurrencia: no hay transacciones ni CAS en el servidor (`If-Match` se ignora). Se mantiene write-then-verify del mapa de asientos con `version`. Produccion: una fila por asiento con id `<vuelo><asiento>` y POST como reclamo atomico.
- Tasa: el gateway devuelve `x-ratelimit-limit: 120`; contra `<slug>.jelou.cloud`, 150 GET secuenciales no dieron 429. El seed mantiene ritmo bajo igualmente.

## Hallazgos de Functions

- `ctx.verifyHmac(request, { secretEnv, header: "x-webhook-signature", prefix: "sha256=" })`: HMAC-SHA256 hex sobre el cuerpo crudo. Sin `prefix`, `sha256=<hex>` falla (`invalid_signature`); hex desnudo con `prefix` falla (`malformed_signature`). Exito devuelve `undefined`; fallo lanza `WebhookVerificationError` (`missing_signature`, `malformed_signature`, `invalid_signature`, `missing_secret`...). `X-Jelou-Signature` no se lee.
- `ctx.request` no existe: la peticion es el tercer argumento del handler `(input, ctx, request)`.
- `@jelou/functions` 1.6.1 se publico hace menos de 24 h y Deno 2.9.7 (`minimumDependencyAge` 24 h) la bloquea en `deno check`. Se fija `jsr:@jelou/functions@1.5.0` (2026-10-02), que compila y pasa el mismo probe.
- `jelou functions dev` en el contenedor del CLI necesita `unzip`; con el, el primer arranque tarda ~40 s (descarga de Deno).
- Despliegue: un proyecto = un slug con `jelou.json` e `index.ts` raiz; varias tools con `app({ tools })` (rutas kebab-case, MCP en `<url>/mcp`). La tool recibe `Authorization: Bearer sk_...`. `jelou functions invoke-key ensure` crea el secreto de organizacion `JELOU_FN_INVOKE_KEY` (el valor no sale de la plataforma; los workflows lo usan como `{{$secret.JELOU_FN_INVOKE_KEY}}`).

## GAPs

- Resueltos: GAP-02 (auth de Datum = solo `X-Api-Key`), GAP-09 (GET por id existe), GAP-12 (tipos reales de Datum v2), GAP-13 (HMAC), GAP-18 (PK unica y atomica), GAP-10 (limites de tasa medidos), GAP-03 (version fijada: 1.5.0) y GAP-04 (`functions check` offline).
- Abiertos: GAP-11 (tipo de mensaje de texto de WhatsApp: probar con un canal conectado) y GAP-15 (`pauseInteraction`: probar en Brain Studio).
