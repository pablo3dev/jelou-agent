# CRM de la aerolinea (solo lectura)

Dashboard y API JSON (`/api`) que leen Datum v2 (PocketBase); no escriben nada (REQ-11).

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATUM_URL` | Base de la base de datos de Datum: `https://<slug>.jelou.cloud/api` |
| `DATUM_API_KEY` | API key `db_...`, se envia como cabecera `X-Api-Key` (nunca se registra) |
| `PORT_CRM` | Puerto (default 3000) |
| `CRM_CACHE_TTL_MS` | TTL de la cache en memoria por coleccion (default 10000) |

Sin `DATUM_URL` o `DATUM_API_KEY`, `/api/*` responde 503 `datum_no_configurado`. Ya no se usan `JELOU_CLIENT_ID`, `JELOU_CLIENT_SECRET` ni `DATABASE_ID`.

## Datum v2

`GET ${DATUM_URL}/collections/{coleccion}/records?page=N&perPage=100` (respuesta `{items, totalPages, ...}`);
`GET .../records/{id}` por registro. El cliente normaliza las filas (sin metadatos de PocketBase; `id` fisico y
alias `_id`) y las fechas `2026-12-01 00:00:00.000Z` a ISO con `T`. El `vuelo_id` es el id fisico
(`bogmde20261201`); `ruta_id` guarda la ruta logica (`BOG-MDE`). Contrato en `contract/endpoints.md`
(copia verificada con `contract/verify-contract.sh`).

## Pruebas y ejecucion (Docker)

```sh
docker run --rm -v "$PWD:/app" -w /app node:24.22.0-bookworm-slim node --test
docker build -t crm . && docker run --rm -p 127.0.0.1:3000:3000 -e DATUM_URL -e DATUM_API_KEY crm
```
