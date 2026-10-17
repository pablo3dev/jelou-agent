# Viabilidad — Aerolínea reservas por WhatsApp (aerolinea-reservas-whatsapp)

## Veredicto

SÍ viable como PoC (con prerrequisitos)

## Justificación

Todas las piezas tienen soporte documentado o un camino verificable en el spike. Los bloqueos son de verificación (auth de Datum, firma con raw body) y de escalabilidad (concurrencia), no de existencia de capacidades.

## Evidencia

- Dominio: el PNR tiene 6 caracteres (Intelisys). Fuente: https://www.travel-code.com
- Exit row: práctica de 15 años (Alaska Airlines, Kaiser Air). La FAA 14 CFR 121.585 exige capacidad de evacuación. Fuente: regla DEMO, marcada [DEMO].
- Peso volumétrico IATA: L×A×H/6000. Fuente: https://www.gettransport.com (2026).
- Mascota en cabina: 8 kg combinado (Marabu, Iberia, ITA). Fuente: políticas de cada aerolínea.
- Jelou Functions: `define()` con zod; validación de entrada antes del handler; timeout de 30 s y 120 s; deploy con `jelou functions deploy`; MCP automático en `/mcp`. Fuente: https://docs.jelou.ai/guides/functions
- Jelou Datum: colecciones con tipos Text, Number, Boolean, Date, Select, Relation y JSON. API de filas `https://api.jelou.ai/v2/databases/{id}/rows` con Basic auth. Fuente: https://docs.jelou.ai/en/api/api-reference
- Jelou Datum: sin migraciones, sin filtros y sin transacciones documentados. Fuente: https://docs.jelou.ai/en/api/api-reference
- Jelou API: límite general de 5 req/s. Fuente: https://docs.jelou.ai/en/api/introduction
- CLI `@jelou/cli` 4.13.1 (npm registry). Contenedor `node:24.22.0-bookworm-slim`. Auth por `JELOU_TOKEN`. Comandos: `project`, `workflow`, `link/pull/push`, `functions`, `databases collections create`. Fuente: https://docs.jelou.ai/guides/cli
- Brain Studio: nodo AI Agent con Pause interaction y `executionId`. Reanudación con POST a `https://gateway.jelou.ai/workflows/v1/skills/resume`. Fuente: https://docs.jelou.ai/en/guides/nodos/ai-agent
- WhatsApp: envío con POST a `https://api.jelou.ai/v1/bots/{BOT_ID}/messages`. Imagen, archivo y quick_reply verificados. La ventana de 24 h queda cubierta por el flujo (<15 min). Fuente: análisis de LEARN (learning.md).
- Idempotencia: el canal personalizado deduplica por `messageId`. La pasarela usa `event_id` propio (sin clave nativa). Fuente: análisis de LEARN (learning.md).

## Prerrequisitos del USUARIO

- Cuenta Jelou con proyecto creado.
- API key del CLI (`JELOU_TOKEN`).
- Credenciales de API (`clientId`/`clientSecret`) y API key de gateway, expuestas solo como `${NOMBRE_VARIABLE}`.
- Base de Datum creada.
- Canal de WhatsApp conectado con número.
- Opcional: Business Manager verificado para volumen.

## Spike go/no-go

Estas verificaciones deben pasar antes de dar la PoC por viable:

1. Auth y CRUD de Datum con curl (Basic auth sobre `api.jelou.ai/v2/databases/{id}/rows`).
2. Raw body de la firma HMAC: la firma se valida sobre el cuerpo crudo recibido.
3. `ctx.verifyHmac` funciona en `jelou functions dev`.
4. `jelou functions check` pasa dentro de contenedor `node:24.22.0-bookworm-slim`.
5. Envío de mensaje de texto por WhatsApp.

## Bloqueos y riesgos residuales

- Datum no tiene transacciones ni compare-and-set: doble venta posible con escrituras concurrentes del mapa de asientos por vuelo.
- Datum no tiene filtros: las colecciones pequeñas (6 rutas, 372 vuelos) se leen completas.
- Jelou Functions está en vista previa.
- Node 24 está en mantenimiento.
- El enlace de pago a localhost solo es accesible desde el host.
- No se requieren plantillas HSM.

## Bloqueos para producción

No aplica a la PoC. Pendiente para producción:

- Compare-and-set (CAS) o transacciones en Datum para el mapa de asientos.
- SLA.
- Tenancy.
