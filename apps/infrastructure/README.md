# Infraestructura (Docker Compose)

Orquesta los servicios de `aerolinea-reservas-whatsapp`:

| Servicio | Puerto (host) | Descripción |
|---|---|---|
| `crm` | 3000 (`PORT_CRM`) | API/dashboard del CRM |
| `pay` | 3001 (`PORT_PAY`) | Pagos y webhook |
| `agent-cli` | — | CLI de Jelou bajo demanda (perfil `tools`) |

No hay contenedor de base de datos: la DB es Datum, remota. `pay` no depende de `crm`.

## Requisitos

- Docker con Compose v2 (`docker compose`).

## Preparar variables

```sh
cp .env.example .env
```

Completa `.env` (sin valores reales en este documento):

| Variable | Descripción | Servicio(s) en compose |
|---|---|---|
| `PORT_CRM` | Puerto de `crm` (default 3000) | crm |
| `PORT_PAY` | Puerto de `pay` (default 3001) | pay |
| `JELOU_TOKEN` | Token del CLI de Jelou | agent-cli |
| `DATUM_URL` | URL base de Datum (PocketBase) | crm, pay |
| `DATUM_API_KEY` | API key de Datum | crm, pay |
| `DATABASE_ID` / `DATABASE_SLUG` | Base de datos en Datum para migraciones/seed | agent-cli |
| `PAY_WEBHOOK_SECRET` | Secreto para validar el webhook de pagos | pay |
| `PAY_PUBLIC_URL` | URL pública de `pay` | pay |
| `CRM_PUBLIC_URL` | URL pública del CRM; las functions la usan en `vuelos-buscar` para el enlace al selector de asientos (variable de las functions en Jelou, no de compose) | functions |
| `PAGO_NOTIFICACION_URL` | URL a la que se notifica el pago | pay |
| `JELOU_API_KEY` | API key de Jelou | solo en `.env.example`; no la inyecta el compose |
| `JELOU_FUNCTIONS_TOKEN` | Token de Jelou Functions | solo en `.env.example`; no la inyecta el compose |
| `JELOU_PROJECT_ID` | ID del proyecto Jelou | agent-cli |
| `DATUM_BASE_URL` (opcional) | Sobrescribe la URL base de Datum | crm, pay |
| `CRM_CACHE_TTL_MS` (opcional) | TTL de caché del CRM en ms | crm |

Nota: `env_file` carga `.env` completo en cada servicio que lo declara, así que las variables
marcadas "no la inyecta el compose" también llegan al contenedor si están en `.env`.

## Arranque

```sh
docker compose up --build -d
docker compose ps        # esperar estado "healthy"
```

- CRM: http://127.0.0.1:3000 (salud: http://127.0.0.1:3000/health)
- Pay: http://127.0.0.1:3001 (salud: http://127.0.0.1:3001/health)

Apagar:

```sh
docker compose down
```

Los puertos se cambian con `PORT_CRM` / `PORT_PAY` y se publican solo en `127.0.0.1`.

## CLI de Jelou (perfil `tools`)

```sh
docker compose --profile tools run --rm agent-cli --help
docker compose --profile tools run --rm agent-cli functions check
```

Monta `apps/agent` en `/workspace` y usa `JELOU_TOKEN`. `functions check` es offline y no requiere Deno.

## Validar la configuración

```sh
docker compose --env-file .env.example config -q
```

## Seguridad

`.env` está ignorado por git. Nunca commitees secretos; solo `.env.example` (sin valores).
