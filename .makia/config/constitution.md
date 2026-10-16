# Constitución — aerolinea-reservas-whatsapp

Directrices de alto nivel del proyecto, escritas para el LLM de un agente: el "qué y por qué" (principios y decisiones) que guía todo el flujo IDEA → DEPLOY. No reemplaza `deploy.md`, `git.md` ni `test.md` (el "cómo" técnico): en su ámbito técnico estricto gana el `config/*.md` correspondiente; en negocio, arquitectura, UX, seguridad y estrategia gana este documento. Una contradicción real entre ambos se reporta al USUARIO, no se resuelve por inferencia.

Esta constitución tiene DOS ÁMBITOS pares, que pueden existir a la vez:

- `## Global`: lo que aplica a TODO el proyecto o a más de una unidad.
- `## Unidad: <ruta>`: lo que aplica SOLO a esa unidad (app, extension…). Una sección por cada unidad con directrices propias; la unidad hereda lo global y, si hay choque, prevalece la suya dentro de esa unidad.

Ubicación: ante cada directriz, decide su ámbito. Si aplica a una sola unidad, va en su `## Unidad`, no en Global. Si no es claro, pregunta al USUARIO. Un proyecto de una sola unidad puede tener solo Global; uno multi-unidad suele tener ambos. Cada agente lee solo `## Global` y la sección de su unidad. Los encabezados `## Global` y `## Unidad: <ruta>` son literales: no se renombran.

## Global

Ámbito: todo el proyecto o más de una unidad.

### Principios fundamentales

- Aerolínea DEMO (PoC) de vuelos nacionales entre BOG, MDE, CLO y CTG.
- Jelou Datum es la única base de datos (no hay contenedor de base de datos).
- El LLM solo conversa y pasa texto a las functions; precios, totales y validaciones se calculan y aplican en servidor.

### Configuración host

- Windows con Docker y Docker Compose.
- Nada del proyecto se instala en el host: la contenedorización del CLI de Jelou y de toda ejecución de pruebas y herramientas es obligatoria.
- `git config core.autocrlf false` y `.gitattributes` con `eol=lf` por unidad (sin CRLF en .sh, .yaml, .js ni Dockerfile).

### Configuración de plataforma destino

- Plataforma Jelou (Brain Studio, Jelou Functions, Datum) operada con `@jelou/cli` dentro de contenedor.
- Node 24.22.0 (`node:24.22.0-bookworm-slim`).
- El proyecto Compose se llama `aerolinea-reservas-whatsapp`.
- Los puertos se definen en `.env` (`PORT_CRM`, `PORT_PAY`) y se publican en 127.0.0.1.

### Principios de seguridad

- Secretos solo como `${VAR}` en `.env` no versionado (con `.env` en el `.gitignore` de cada unidad).
- El documento del pasajero se enmascara en todos los logs.
- Toda entrada se valida en la function antes de tocar datos.
- Solo `pago-notificacion` es pública y exige firma HMAC sobre el cuerpo crudo.
- El dashboard y la pasarela no escriben datos de negocio salvo lo que su contrato defina (el dashboard es de solo lectura).

### Estrategias de implementación

- Datum v2 (PocketBase) se accede por REST con la cabecera `X-Api-Key` (`${DATUM_API_KEY}`) y la base `${DATUM_URL}`, endpoint por colección `/collections/{coleccion}/records`.
- Contrato primero: apps/agent publica el contrato y las demás unidades usan copias verificadas por hash.
- La escritura de `vuelos.mapa_asientos` es write-then-verify (3 intentos).
- Cada línea de precio se redondea con `Math.round` y el total es la suma de líneas.

## Unidad: apps/agent

Ámbito: solo esta unidad.

### Estrategias de implementación

- `@jelou/cli` 4.13.1 y Node 24.22.0; `@jelou/functions` fijado en 1.5.0.
- Las pruebas de las functions corren en `denoland/deno:2.9.7`.
- La fuente real del agente de Brain Studio es `apps/agent/brain/` (se genera con los scripts de `apps/agent/workflow/`).
- Dueña del `domain-model.md` y del contrato `db-design.dbml` de la capacidad.

## Unidad: apps/pay

Ámbito: solo esta unidad.

### Estrategias de implementación

- Express 5.3.0 sobre Node 24.22.0.
- La pasarela solo lee Datum y notifica con firma HMAC; nunca emite EXPIRADA.

## Unidad: apps/crm

Ámbito: solo esta unidad.

### Estrategias de implementación

- Express 5.3.0 sobre Node 24.22.0.
- Chart.js 4.5.1 por CDN con versión fijada.
- Solo lectura sobre Datum.

## Unidad: apps/infrastructure

Ámbito: solo esta unidad.

### Estrategias de implementación

- Es la unidad de arranque (compose.yaml, .env.example, .gitattributes, README).
- `agent-cli` solo bajo el perfil `tools`.
- Healthchecks de crm y pay con CMD de Node contra `/health`.

> **Seguridad:** ningún token, credencial o valor sensible se escribe aquí en texto plano — siempre `${NOMBRE_VARIABLE}` resuelto desde el entorno. Este archivo vive en `.makia/config/constitution.md` de cada proyecto, se versiona, y nunca se genera con contenido inventado por MakIA.
