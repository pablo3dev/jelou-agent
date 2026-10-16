# Learning: aerolinea-reservas-whatsapp

## 0. Cabecera

- Fecha de consulta: 2026-10-16.
- Idea: `aerolinea-reservas-whatsapp` (repo `C:\repos\jelou-agent`, rama `makia/dev/aerolinea-reservas-whatsapp`).
- Consumidor: CODE, durante IMPLEMENT.
- Regla: no usar métodos, endpoints, flags, campos ni tipos que no figuren en este documento sin escalar un gap (ver sección 9) al LANZADOR.
- Marcas: "VERIFICAR" = debe comprobarse antes de depender de ello. "NO EJECUTADO" = construcción no probada. "GAP-NN" = referencia a la sección 9.
- Los secretos nunca se escriben en archivos versionados; solo se usan placeholders `${NOMBRE_VARIABLE}`.

## 1. Versiones fijadas

| Componente | Versión | Fuente / nota |
|---|---|---|
| Node.js | 24.22.0 (LTS), imagen `node:24.22.0-bookworm-slim` | Decisión IDEA para la PoC. |
| Express | 5.3.0 | Investigación LEARN. VERIFICAR: `npm view express@5.3.0 version`. |
| Chart.js | 4.5.1 | CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` |
| @jelou/cli | 4.13.1 | Investigación LEARN. |
| Docker Compose | v5.6.0 | Investigación LEARN. VERIFICAR: `docker compose version`. |
| @jelou/functions | 1.6.1 (JSR: jsr:@jelou/functions; no está en npm) | Verificado por LEARN 2026-10-16 en JSR; su tarea test es `deno test --allow-read --allow-env --allow-net`. Sin versión mínima de Deno declarada (GAP-03 cerrado en versión; compatibilidad con 2.9.7 se confirma al correr los tests). |
| Deno (pruebas) | 2.9.7, imagen `denoland/deno:2.9.7` (digest sha256:fa335acdf6b72106eda2cb6a8cb5f4187e7630e357467489db4b2e7352d5e432) | Verificado 2026-10-16: `docker manifest inspect` OK y `docker run --rm denoland/deno:2.9.7 deno --version` => `deno 2.9.7 (stable, release, x86_64-unknown-linux-gnu)`, typescript 6.0.3. |

Riesgo de ciclo de vida: según la tabla de nodejs.org (consulta de LEARN, fecha 2026-10-14), Node 24 entra en mantenimiento. Decisión IDEA: se fija 24.22.0 para la PoC. Subir de versión es decisión del USUARIO (GAP-01).

## 2. Docker, Compose y Windows

### 2.1 Dockerfile del CLI (`apps/agent/Dockerfile`)

```
# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim
ARG JELOU_CLI_VERSION=4.13.1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @jelou/cli@${JELOU_CLI_VERSION} \
 && npm cache clean --force \
 && jelou --version \
 && git config --system --add safe.directory /workspace
RUN mkdir -p /home/node/.jelou /workspace && chown -R node:node /home/node/.jelou
USER node
ENV HOME=/home/node
WORKDIR /workspace
ENTRYPOINT ["jelou"]
CMD ["--help"]
```

### 2.2 Dockerfile de los servicios Node (`apps/crm`, `apps/pay`)

```
FROM node:24.22.0-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node","server.js"]
```

Nota: el Dockerfile de los servicios Node no fue validado con build todavía (VERIFICAR con `docker compose build crm pay`).

### 2.3 Compose de infraestructura (`apps/infrastructure/compose.yaml`)

Decisiones IDEA: sin servicio de base de datos. Los `.env` de cada unidad viven en su carpeta. Los puertos interpolados vienen de `apps/infrastructure/.env`.

```
name: aerolinea-reservas-whatsapp
networks:
  reservas-net:
    driver: bridge
services:
  crm:
    build: ../crm
    env_file: ../crm/.env
    ports: ["127.0.0.1:${PORT_CRM:-3000}:3000"]
    networks: [reservas-net]
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s
  pay:
    build: ../pay
    env_file: ../pay/.env
    ports: ["127.0.0.1:${PORT_PAY:-3001}:3001"]
    networks: [reservas-net]
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 15s
  agent-cli:
    build:
      context: ../agent
    image: jelou-cli:4.13.1
    profiles: ["tools"]
    env_file: ../agent/.env
    working_dir: /workspace
    volumes: ["../agent:/workspace", "jelou-home:/home/node/.jelou"]
    networks: [reservas-net]
volumes:
  jelou-home:
```

Notas:
- `env_file` inyecta variables dentro del contenedor. `.env` del compose (apps/infrastructure/.env) solo interpola los puertos.
- El servicio `agent-cli` está en el profile `tools`: no arranca con `docker compose up`; se ejecuta con `docker compose run --rm agent-cli ...`.
- Los puertos se publican solo en `127.0.0.1`.

### 2.4 Windows: fin de línea y atributos Git

Ejecutar en el repo:

```
git config core.autocrlf false
```

`.gitattributes` (raíz del repo):

```
* text=auto eol=lf
*.cmd text eol=crlf
```

Renormalizar tras crear `.gitattributes`:

```
git add --renormalize .
git ls-files --eol
```

Criterio: en `git ls-files --eol`, los archivos fuente deben mostrar `i/lf` (y `*.cmd` `i/crlf`). Si un archivo fuente muestra `i/crlf`, es un fallo a corregir antes de continuar.

### 2.5 Comandos de verificación de Compose

```
docker compose version
docker compose config --quiet
docker compose config --services
```

Resultado esperado de `config --services`: `crm`, `pay`, `agent-cli`. VERIFICAR en el primer build (si `agent-cli` no aparece por el profile, usar `docker compose --profile tools config --services`).

## 3. Jelou CLI en contenedor

- Instalación dentro de la imagen: `npm install -g @jelou/cli@4.13.1` (ya incluida en 2.1).
- Autenticación no interactiva: variable `JELOU_TOKEN` en `apps/agent/.env`. El archivo `.env` NO se versiona (verificar que esté en `.gitignore`).
- Paso manual ÚNICO del USUARIO: crear la API key en apps.jelou.ai (Configuración > Claves API) y pegarla en `apps/agent/.env` como `JELOU_TOKEN`.
- Verificación de autenticación:

```
docker compose run --rm agent-cli whoami --json
docker compose run --rm agent-cli doctor --json
```

- Comandos de Functions (ejecutados con `docker compose run --rm agent-cli ...`):

```
jelou functions check
jelou functions deploy --no-confirm
jelou functions secrets set <slug> KEY=VALUE
jelou functions logs <slug> --history
jelou functions dev --port 3002
```

- GAP-04: `jelou functions check` puede requerir Deno local. VERIFICAR en el primer build. Si requiere Deno, escalar (no instalar Deno sin aprobación del LANZADOR).
- Comando de pruebas en Docker (Git Bash): `MSYS_NO_PATHCONV=1 docker run --rm -v "C:/repos/jelou-agent/apps/agent/functions:/app" -w /app denoland/deno:2.9.7 deno test --allow-read --allow-env --allow-net`. GAP-04 sigue abierto: si `jelou functions check` requiere Deno se corre en una imagen con Deno, no local.
- `jelou functions dev --port 3002` dentro del contenedor requiere publicar el puerto 3002; no está previsto en el compose de 2.3. GAP-05.

## 4. Jelou Functions

- Paquete: `@jelou/functions` (versión: GAP-03).
- Patrón de definición, importado de `@jelou/functions`:

```
define({ name, description, input: z.object(...), output, handler })
```

- Validación de entrada: se ejecuta antes del handler. Si falla, responde HTTP 400 con mensaje "Validation failed" y campo `details`. Discrepancia menor entre dos lecturas de la doc: el campo podría llamarse `error`. VERIFICAR con una petición real.
- Salida: no bloqueante. Una salida que no cumple `output` solo genera un warning (no corta la respuesta).
- Contexto `ctx`:
  - `ctx.env.get` (lectura de variables/secretos), `ctx.env.has` y `ctx.env.toObject()`. Claves de variables: `^[A-Z][A-Z0-9_]*$`. Fuente: docs.jelou.ai/guides/functions (quickstart), consulta 2026-10-16.
  - `ctx.log` (logs, visibles con `jelou functions logs <slug> --history`).
  - `ctx.verifyHmac(request, { secretEnv, header })` (verificación de firma; ver sección 7).
  - `ctx.db` NO EXISTE. Datum se consume por REST (sección 5). GAP-06.
- Configuración de ruta: `config: { path, methods, public, mcp }`.
- Límites:
  - Timeout por defecto: 30 s. Máximo: 120 s.
  - Máximo 20 archivos por función; 256 KB por archivo.
  - Nombres de tool: máximo 64 caracteres.
- Ejemplo de cálculo de equipaje (frente 2): NO EJECUTADO, verificar en `jelou functions dev`. El código no fue entregado a EDITOR: GAP-07. No escribir código de equipaje sin el texto aprobado por el LANZADOR.

### 4.1 Fragmento de referencia: `consultar-cliente`

```typescript
import { define, z } from "@jelou/functions";

export default define({
  name: "consultar-cliente",
  description: "Busca información de un cliente por número de teléfono para el canal de soporte",
  input: z.object({
    telefono: z.string().min(10).describe("Número de teléfono del cliente"),
  }),
  output: z.object({
    nombre: z.string(),
    email: z.string(),
    plan: z.string(),
    saldo: z.number(),
  }),
  handler: async (input, ctx) => {
    ctx.log("Buscando cliente", { telefono: input.telefono, company: ctx.company.id });
    const apiKey = ctx.env.get("CRM_API_KEY");
    // ... fetch y return { nombre, email, plan, saldo }
  },
});
```

Fuente: docs.jelou.ai/guides/functions (quickstart), consulta 2026-10-16.
NO EJECUTADO en esta etapa: verificar con `jelou functions dev`.

Esquemas documentados (misma fuente):
- `z.string().min(1).max(200)`
- `z.string().email()`
- `z.number().int().positive()`
- `z.enum([...]).default("media")`
- `z.boolean().default(true)`
- `z.array(z.string()).optional()`
- `z.record(z.string(), z.unknown())`
- Query params de GET: `z.coerce.number()`.

### 4.2 Fragmento de referencia: `validar-reserva`

```typescript
import { define, z } from "@jelou/functions";

export default define({
  name: "validar-reserva",
  description: "Valida número de pasajeros y fecha de vuelo de una reserva",
  input: z.object({
    pasajeros: z.number().int().positive().max(9).describe("Número de pasajeros (1-9)"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha de vuelo YYYY-MM-DD"),
  }),
  output: z.object({ valido: z.boolean(), motivo: z.string().optional() }),
  handler: async (input, ctx) => {
    const d = new Date(`${input.fecha}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.fecha) {
      return { valido: false, motivo: "Fecha inexistente" };
    }
    const hoy = new Date().toISOString().slice(0, 10);
    if (input.fecha < hoy) return { valido: false, motivo: "Fecha en el pasado" };
    ctx.log("Reserva validada", { pasajeros: input.pasajeros });
    return { valido: true };
  },
});
```

Fuente: docs.jelou.ai/guides/functions (quickstart), consulta 2026-10-16.
NO EJECUTADO en esta etapa: verificar con `jelou functions dev`.

## 5. Datum (base de datos de filas)

### 5.1 API de filas (fuente: api-reference, exacta)

- Listar: `GET https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows?limit=10&page=1`
- Crear: `POST https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows` con body `{"fields":{...}}`
- Actualizar: `PUT https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows/{rowId}` con body `{"fields":{...}}`
- Headers en todas: `Authorization: Basic <base64 clientId:clientSecret>` y `Accept: application/json`. `clientId` y `clientSecret` se leen de variables de entorno; nunca se escriben literales.
- Lectura por id: `GET https://api.jelou.ai/v2/databases/{DATABASE_ID}/rows/{rowId}`. NO LEÍDO en la documentación: GAP-09.

### 5.2 CLI de Datum

- Crear base: `jelou databases create --name "<n>"`.
- Crear colección (get-or-create):

```
jelou databases collections create <db-id> --name "<n>" --field "<nombre>:<tipo>"
```

- Schema distinto en una colección existente: exit code 2.
- Tipos aceptados: VERIFICAR con `--describe` (GAP-12).

### 5.3 Mapeo de tipos DBML a Datum

| Tipo DBML | Tipo Datum |
|---|---|
| Text | `Text` |
| Number | `Number` |
| Boolean | `Boolean` |
| Date | `Date` |
| Select | `Select` (con opciones) |
| Relation | `Relation` (colección destino) |
| JSON | `JSON` |
| Autodate | `Autodate` |

Índices únicos: Datum no documenta que los fuerce (GAP-18).

El formato JSON de valor para cada tipo NO fue entregado: GAP-12.

### 5.4 Spike go/no-go (primer paso de IMPLEMENT en `apps/agent`)

1. Crear una fila de prueba con `POST .../rows` y registrar el código HTTP y el `rowId` devuelto.
2. Leer esa fila con `GET .../rows/{rowId}` y registrar el código HTTP.
3. Actualizar con `PUT .../rows/{rowId}` y registrar el código HTTP.
4. Registrar la respuesta de límite de tasa si aparece (código 429 y cabeceras).
5. Resultado: go si 1-3 responden correctamente con la autenticación de 5.1. No go si la autenticación o el GET por id fallan; escalar.

### 5.5 Gaps críticos de Datum

- (a) GAP-02: la guía de api-keys documenta `X-Api-Key` contra una ruta `tu-instancia.jelou.cloud/api/collections/...`, contradictoria con la sección 5.1. Verificar en el spike qué esquema acepta la API v2.
- (b) GAP-08: no hay filtros, transacciones ni compare-and-set. Esto afecta la concurrencia de reservas (dos clientes sobre el mismo asiento). Bloquea el diseño de reserva; decisión en SPEC.
- (c) GAP-10: 429 y límites no documentados. La introducción general menciona 5 req/s. Medir en el spike.
- (d) GAP-09: GET por id no leído. Verificar en el spike 5.4, paso 2.

## 6. Brain Studio, agente y WhatsApp

### 6.1 Nodo AI Agent

Pestañas: General, Tools, Context, Advanced, Events.

- Prompt: usar `{{$message.text}}` para el texto entrante y `{{$context.executionId}}` para el id de ejecución. El `executionId` es válido 24 h.
- Pause interaction: el flujo queda en pausa esperando la respuesta del usuario.

### 6.2 Reanudación de ejecución (exacta)

```
curl -X POST "https://gateway.jelou.ai/workflows/v1/skills/resume" -H "x-api-key: ${JELOU_API_KEY}" -H "Content-Type: application/json" -d '{"executionId":"<ID>","message":"<texto>","pauseInteraction":false}'
```

Reemplazar `<ID>` y `<texto>` en tiempo de ejecución. `${JELOU_API_KEY}` se toma del entorno.

### 6.3 Envío de mensajes WhatsApp (exacta en estructura)

```
curl --request POST --url https://api.jelou.ai/v1/bots/${JELOU_BOT_ID}/messages --header "Authorization: Basic <base64 clientId:clientSecret>" --header "Content-Type: application/json" --data '<JSON>'
```

Payloads verificados:

- Imagen: `{"type":"image","mediaUrl":"https://example.com/imagen.jpg","text":"Mira esta imagen","userId":"USER_ID"}`
- Quick reply: `{"type":"quick_reply","text":"...","title":"...","quick_replies":[{"title":"Sí"}],"userId":"USER_ID"}`

Texto plano: el valor de `type` NO está verificado (GAP-11). No usar ningún valor de `type` para texto plano hasta verificarlo con la página de texto de la API de envío.

### 6.4 Ventana de 24 h

El flujo completo cabe en 15 minutos (hold). No se usan plantillas.

### 6.5 Prerrequisito del USUARIO

Canal WhatsApp conectado en Brain Studio (número, cuenta Business).

## 7. Webhooks, firmas e idempotencia

- Gateway de nodo Webhook: `POST https://gateway.jelou.ai/workflows/v2/webhooks/skill/{workflowId}/{canal}/{nodeId}` con header `x-api-key`.
- Vía elegida para la notificación de la pasarela: Functions con `ctx.verifyHmac(request, { secretEnv, header })`.
- Firma: HMAC-SHA256 en hexadecimal, con prefijo `sha256=`, sobre el cuerpo crudo.
- CONTRADICCIÓN documentada: cuerpo crudo frente a `JSON.stringify`. Spike obligatorio antes de implementar la verificación (GAP-13).
- Header de firma del canal personalizado: `X-Jelou-Signature: sha256=<HMAC_HEX>` (HMAC-SHA256). VERIFICAR en el spike (GAP-13).
- Alternativa a verificar en el spike, en Functions: `ctx.verifyHmac(request, { secretEnv: "WEBHOOK_SECRET", header: "x-webhook-signature" })`. Fuente: docs.jelou.ai/guides/functions (quickstart), consulta 2026-10-16. NO EJECUTADO en esta etapa: verificar con `jelou functions dev`.
- Idempotencia: clave `event_id = "<transaccion_id>:<estado>"`, guardada en `eventos_pago` antes de reanudar la ejecución (6.2).
- Reintentos de Jelou hacia el receptor (referencia; no es la pasarela de la PoC): 3 intentos máximo, límite total 20 s, backoff exponencial con jitter (~300 ms, ~600 ms). Reintenta 5xx, 429 y conexión rechazada. No reintenta fallos de DNS, otros 4xx ni timeout.
- Reintentos de la pasarela `apps/pay` (simulada): política propia, decisión IDEA para la DEMO, no es la de Jelou: 3 intentos, backoff de 1 s y 2 s (GAP-14).

## 8. Pasarela (`apps/pay`) hacia Datum

- Lectura de transacción por id: mismo REST de la sección 5.1 (`GET .../rows/{rowId}`, pendiente de verificar con GAP-09).
- Autenticación: igual que 5.1, desde variables de entorno.

## 9. Gaps abiertos

| id | Gap | Por qué bloquea o no | Verificación exacta | Dueño |
|---|---|---|---|---|
| GAP-01 | Node 24 entra en mantenimiento (tabla nodejs.org, 2026-10-14). | No bloquea la PoC. Riesgo a largo plazo. | Revisar la tabla de nodejs.org antes de release. | USUARIO |
| GAP-02 | Esquema de autenticación Datum contradictorio (`X-Api-Key` frente a `Basic`). | Bloquea 5.1 si la API v2 no acepta `Basic`. | Spike 5.4: `POST`/`GET`/`PUT` con `Authorization: Basic`; registrar códigos HTTP. | IMPLEMENT (apps/agent) |
| GAP-03 | Versión de `@jelou/functions` no verificada. | Bloquea el `package.json` de Functions. | `jelou functions init` y fijar la versión generada. | CODE |
| GAP-04 | `jelou functions check` puede requerir Deno local. | No bloquea si el check corre en el contenedor. | Ejecutar `docker compose run --rm agent-cli functions check` en el primer build. | CODE |
| GAP-05 | `functions dev --port 3002` requiere puerto publicado; no previsto en el compose. | Bloquea solo el desarrollo local de Functions. | Decidir con SPEC si se publica `127.0.0.1:3002`. | SPEC |
| GAP-06 | `ctx.db` no existe; Datum solo por REST. | No bloquea (ya resuelto por 5.1). | `jelou functions dev` con una llamada REST de prueba. | CODE |
| GAP-07 | Código del ejemplo de equipaje no entregado (el de validación de reserva está en 4.2, NO EJECUTADO). | Bloquea solo ese ejemplo (frente 2). | Escribir y ejecutar en `jelou functions dev`; marcar NO EJECUTADO hasta entonces. | CODE |
| GAP-08 | Sin filtros, transacciones ni compare-and-set en Datum. | Bloquea la concurrencia de reservas. | Revisar la documentación de Datum; si no existe, diseñar la reserva sin CAS y documentarlo en SPEC. | SPEC |
| GAP-09 | `GET .../rows/{rowId}` no leído en la documentación. | Bloquea 5.4 y 8. | Spike 5.4, paso 2. | IMPLEMENT (apps/agent) |
| GAP-10 | 429 y límites de tasa no documentados (intro general: 5 req/s). | No bloquea la PoC; afecta la carga. | Spike 5.4, paso 4. | IMPLEMENT (apps/agent) |
| GAP-11 | Tipo exacto para texto plano en WhatsApp no verificado. | Bloquea el envío de texto plano. | Página de texto de la API de envío de mensajes. | IMPLEMENT (apps/agent) |
| GAP-12 | Tipos aceptados en `databases collections create` y formato de valor por tipo DBML. | Bloquea la creación de colecciones. | `jelou databases collections create --describe`. | CODE |
| GAP-13 | HMAC: cuerpo crudo frente a `JSON.stringify`; header `X-Jelou-Signature` (IDEA) frente a `x-webhook-signature` (ejemplo de Functions): confirmar cuál aplica. | Bloquea la verificación de firma de la pasarela. | Spike obligatorio con una firma generada sobre el cuerpo crudo y otra sobre `JSON.stringify`; confirmar header. | IMPLEMENT (apps/pay y apps/agent) |
| GAP-14 | Backoff de la pasarela `apps/pay` fijado por IDEA para la DEMO (1 s y 2 s); no validado. | No bloquea; afecta el tiempo de reintento. | Confirmar en SPEC. | SPEC |
| GAP-15 | `pauseInteraction` y su semántica no documentados aquí más allá del ejemplo de 6.2. | Bloquea el manejo de pausa si el valor cambia. | Probar en Brain Studio con un flujo mínimo. | IMPLEMENT (apps/agent) |
| GAP-16 | Base Datum no creada (`DATABASE_ID` desconocido). | Bloquea 5.1 y 5.2. | `jelou databases create --name "<n>"`; registrar el id. | USUARIO o CODE |
| GAP-17 | `max_lineal_bodega_cm` interpretado como suma L+A+H (DEMO, sin confirmar). | Bloquea la regla de equipaje (frente 2). | Confirmar la definición del límite con el USUARIO antes de implementar la regla. | USUARIO |
| GAP-18 | Datum no documenta que los índices únicos se fuercen. | Bloquea la garantía de unicidad (p. ej. `event_id` de `eventos_pago`). | Spike 5.4: crear dos filas con el mismo valor en un campo único y registrar el resultado. Si no fuerza, documentar en SPEC la unicidad en código. | IMPLEMENT (apps/agent) |

## 10. Prerrequisitos manuales del USUARIO

1. Crear la API key en apps.jelou.ai (Configuración > Claves API) y pegarla en `apps/agent/.env` como `JELOU_TOKEN`.
2. Conectar el canal WhatsApp en Brain Studio (número, cuenta Business).
3. Confirmar la versión de Node.js (decisión de subir de 24.22.0 o no; GAP-01).
4. Proveer los valores de `clientId`, `clientSecret`, `JELOU_API_KEY` y `JELOU_BOT_ID` en los `.env` correspondientes (nunca en este documento).

## 11. Hallazgos del spike en vivo (2026-10-16)

1. **Datum v2 es PocketBase.** Ruta: `https://<slug>.jelou.cloud/api/collections/{c}/records`, cabecera `X-Api-Key`. Basic, `api.jelou.ai/v2/.../rows` y `gateway.jelou.ai/datum-db` dan 401. Resueltos GAP-02 y GAP-09: GET por id 200/404; actualizar con PATCH (no PUT); `/batch` da 403. Hay filtros, orden y selección de campos en servidor.
2. **Ids.** Id custom: solo `[a-z0-9]`. Con `--field id:text` la longitud es libre; sin él, mínimo 15 caracteres. Id repetido: 400 `validation_not_unique` (la PK es única y atómica; GAP-18). No se pueden crear otros índices únicos.
3. **Tipos CLI.** `text`, `number`, `bool`, `email`, `url`, `date`, `select`, `relation`, `file`, `json`, `editor`, `geoPoint`. En `number`, `required` significa distinto de 0 (GAP-12). Las fechas se devuelven como `YYYY-MM-DD HH:MM:SS.sssZ`.
4. **Sin CAS en servidor.** `If-Match` se ignora. Se mantiene write-then-verify.
5. **HMAC (GAP-13).** `ctx.verifyHmac(request, {secretEnv, header: "x-webhook-signature", prefix: "sha256="})` sobre el cuerpo crudo. Éxito: retorna `undefined`. Fallo: lanza. La request es el 3.er argumento del handler; `ctx.request` no existe.
6. **Errores.** La plataforma convierte excepciones en HTTP 500. Para responder 400/401/503 hay que devolver `new Response(...)` con el status.
7. **Versiones y entorno.** `@jelou/functions` 1.6.1 (publicada hace menos de 24 h) la bloquea la política `minimumDependencyAge` de Deno 2.9.7; se fija 1.5.0 (GAP-03). `jelou functions dev` requiere `unzip` en la imagen; `jelou test` del CLI requiere `ps` (paquete procps).
8. **Despliegue.** Un proyecto de functions = un slug: `aerolinea-reservas` (`https://aerolinea-reservas.fn.jelou.ai`), con `app({tools})`. Autenticación: `Authorization: Bearer` con la API key de plataforma. `jelou functions invoke-key ensure` crea el secreto de organización `JELOU_FN_INVOKE_KEY`.
9. **Brain Studio.** `connections.mcp` exige una app de marketplace; `connections.function` no expone tools. Lo que funciona: una Tool de Jelou por function (`jelou tool create/push/publish`: nodos HTTP + CODE + END; los nodos CODE ramifican por `success`), referenciada en `connections.tools` como tool de registro (inputs con `id`, `name`, `description`, `type`, `displayName`, `required`, `toolId`, `state`). En transaccion-crear `action` es `"none"` (con `"pause"` la plataforma pausa justo tras la tool y el mensaje con el enlace de pago nunca se entrega); la reanudación externa se habilita con `allowExternalResume:true` en el nodo del agente. Flujo verificado con `jelou test send text`: búsqueda, retención, cotización, transacción, pausa, pago-notificación con HMAC (primero APLICADO, luego DUPLICADO) y reanudación con el PNR. `JELOU_TOKEN` sirve como `x-api-key` de la reanudación (GAP-15 resuelto).
10. **Abiertos.** GAP-11 (texto por WhatsApp sin canal). Publicar el proyecto y conectar el canal: USUARIO.
