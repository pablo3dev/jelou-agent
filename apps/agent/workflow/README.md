# Agente de Brain Studio (apps/agent/workflow)

Brain Studio se configura por UI. Esta carpeta documenta y declara de forma versionable el agente; no es un formato de importación confirmado.

- `agent.prompt.md`: prompt del nodo AI Agent (pestaña General).
- `workflow.json`: declaración del nodo, sus tools, Pause interaction y el enlace de `execution_id`.
- `validar.mjs`: verifica JSON, tools frente a `functions/`, ausencia de secretos y cobertura del prompt.

## Cómo cargarlo en Brain Studio

Prerrequisitos (USUARIO): canal WhatsApp conectado; functions desplegadas (tarea 3.2); variables `JELOU_FUNCTIONS_TOKEN` (token `sk_...` de Jelou) y `JELOU_API_KEY` disponibles. Los valores se escriben solo en la UI o en `.env`, nunca aquí.

1. Crea un workflow en Brain Studio con el canal WhatsApp y agrega un nodo **AI Agent**.
2. Pestaña **General**: pega el contenido de `agent.prompt.md`. Conserva `{{$message.text}}` y `{{$context.executionId}}`.
3. Pestaña **Tools**: conecta el servidor MCP de las Jelou Functions con `Authorization: Bearer ${JELOU_FUNCTIONS_TOKEN}` y habilita solo: `rutas-listar`, `vuelos-buscar`, `equipaje-calcular`, `cotizar`, `asientos-validar-retener`, `transaccion-crear`. No habilites `pago-notificacion` (pública con HMAC; la llama `apps/pay`).
4. Pestaña **Pause interaction**: actívala para que el agente espere tras enviar el enlace de pago. `pago-notificacion` reanuda con `POST https://gateway.jelou.ai/workflows/v1/skills/resume` (`x-api-key: ${JELOU_API_KEY}`, `executionId`, `message` = `paid`|`rejected`|`expired`, `pauseInteraction: false`). El `executionId` es el `{{$context.executionId}}` que el agente pasó como `execution_id` a `transaccion-crear` (válido 24 h; el flujo dura menos de 15 min).
5. Mensajes: texto plano, sin plantillas HSM; el enlace de pago va en texto plano en el mensaje.
6. Verificación local del repo:

```
MSYS_NO_PATHCONV=1 docker run --rm -v "C:/repos/jelou-agent/apps/agent:/w" -w /w node:24.22.0-bookworm-slim node workflow/validar.mjs
```

## Gaps y supuestos (no están en learning.md)

- GAP-W1: el formato de importación/exportación de Brain Studio no está documentado; `workflow.json` es una declaración propia (SUPUESTO), el montaje real es por UI.
- GAP-W2: la URL del servidor MCP de Functions y la forma exacta de habilitar tools por nombre en la pestaña Tools no figuran en learning.md (se usa el placeholder `${JELOU_FUNCTIONS_MCP_URL}`; SUPUESTO). El contrato fija solo la autenticación Bearer.
- GAP-W3: cómo el nodo "pause" se activa tras una tool (`pauseAfter`) y cómo llega el mensaje de reanudación (`paid`/`rejected`/`expired`) al agente: no documentado; es SUPUESTO que el mensaje se recibe como texto de entrada del agente. Relacionado con GAP-15.
- GAP-W4: el tipo de mensaje de texto plano de WhatsApp (GAP-11) no está verificado; el agente responde con su salida de texto normal y no se envía por la API `type` de bots.
- GAP-W5: forma del cuerpo 400 (`details` o `error`) sin confirmar (spike 3.1); el prompt solo pide explicar el motivo.
- Pendiente de ejecución real: nada de esto se probó en Brain Studio (tareas 3.x bloqueadas por credenciales).
