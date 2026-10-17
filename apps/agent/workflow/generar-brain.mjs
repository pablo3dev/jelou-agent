// Genera el workflow real de Brain Studio (apps/agent/brain/workflows/*.json) desde agent.prompt.md.
// Uso (cwd = apps/agent): node workflow/generar-brain.mjs [ruta-del-workflow-existente]
// Sin credenciales: el token de las functions es el secreto de organizacion JELOU_FN_TOKEN ({{$secret.*}}).
import { readFileSync, writeFileSync } from "node:fs";

const destino = process.argv[2] ?? "brain/workflows/mi-primer-workflow.whatsapp.json";
const FN_URL = process.env.FUNCTIONS_URL ?? "https://aerolinea-reservas-b5dfca.fn.jelou.ai";
const previo = JSON.parse(readFileSync(destino, "utf8"));
const instructions = readFileSync("workflow/agent.prompt.md", "utf8");
// Sin pausa por tool: con action "pause" la plataforma pausa justo tras la tool y el mensaje con el enlace de pago nunca se entrega.
const pausa = new Set([]);
const tools = ["rutas-listar", "vuelos-buscar", "equipaje-calcular", "cotizar", "asientos-validar-retener", "transaccion-crear"];

const agente = {
  id: "tmp_agente",
  type: "AI_TASK",
  title: "Agente de reservas",
  position: [488, 50],
  configuration: {
    title: "Agente de reservas",
    name: "Agente de reservas",
    version: "v2",
    instructions,
    variable: "agentResponse",
    model: process.env.AGENT_MODEL ?? "anthropic/claude-haiku-5.5",
    startCommand: "{{$message.text}}",
    allowExternalResume: true,
    settings: { expiration: { enabled: true, duration: 24, time: "hours", timeInSeconds: 86400 }, splitMessages: true, messageHistory: { enabled: true, count: 15 } },
    connections: {
      tools: tools.map((t) => {
        const doc = JSON.parse(readFileSync(`brain/tools/${t}.json`, "utf8"));
        return {
          id: `tool-${t}`,
          toolId: doc.toolId,
          name: t,
          description: doc.toolDescription,
          version: "1.0.0",
          inputs: doc.inputs.map((i) => ({ id: i.name, name: i.name, displayName: i.displayName ?? i.name, description: i.description, type: i.type, required: i.required, toolId: doc.toolId, state: true })),
          action: pausa.has(t) ? "pause" : "none",
        };
      }),
    },
    nonHappyPathHandlers: { error: { mode: "message", message: "Tuve un problema tecnico. Intenta de nuevo en unos minutos." } },
    endFunction: { description: "Termina cuando el cliente recibio la confirmacion final (PNR) o el aviso de pago rechazado o vencido, o si pide dejar la reserva. No envies despedida: el siguiente paso la envia." },
  },
};
const sink = (id, title, text, y) => ({ id, type: "CHANNEL_MESSAGE", title, position: [876, y], configuration: { messages: [{ id: `${id}-m`, type: "text", text }] } });
const start = previo.nodes.find((n) => n.type === "START");
const wf = {
  workflowId: previo.workflowId,
  workflowName: "Aerolinea reservas",
  workflowDescription: "Agente de reservas de vuelos por WhatsApp con pago (PoC)",
  workflowDefault: true,
  nodes: [
    start,
    agente,
    sink("tmp_cierre", "Cierre", "Gracias por volar con nosotros.", 50),
    sink("tmp_expirada", "Sesion expirada", "Cerre esta conversacion por inactividad. Escribeme cuando quieras y retomamos.", 250),
  ],
  edges: [
    { id: "tmp_e0", sourceId: start.id, targetId: "tmp_agente", branch: "default" },
    { id: "tmp_e1", sourceId: "tmp_agente", targetId: "tmp_cierre", branch: "success" },
    { id: "tmp_e2", sourceId: "tmp_agente", targetId: "tmp_expirada", branch: "expire" },
  ],
};
writeFileSync(destino, JSON.stringify(wf, null, 2) + "\n");
console.log(`escrito ${destino}`);
