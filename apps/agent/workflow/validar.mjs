// Valida workflow.json y agent.prompt.md. Uso: node workflow/validar.mjs (cwd = apps/agent)
import { readFileSync, existsSync, statSync } from "node:fs";

const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };

const crudo = readFileSync("workflow/workflow.json", "utf8");
let wf;
try { wf = JSON.parse(crudo); } catch (e) { console.error("workflow.json no es JSON valido:", e.message); process.exit(1); }

const nodo = wf.nodes.find((n) => n.type === "ai_agent");
ok(nodo, "falta el nodo ai_agent");
const tools = nodo.tabs.tools.tools.map((t) => t.name);
const esperadas = ["rutas-listar", "vuelos-buscar", "equipaje-calcular", "cotizar", "asientos-validar-retener", "transaccion-crear"];
for (const t of esperadas) ok(tools.includes(t), `tool faltante en workflow.json: ${t}`);
for (const t of tools) ok(existsSync(`functions/${t}`) && statSync(`functions/${t}`).isDirectory(), `no existe functions/${t}`);
ok(!tools.includes("pago-notificacion"), "pago-notificacion no debe ser tool del agente");
ok(nodo.tabs.pauseInteraction.enabled === true, "pause interaction no habilitada");
ok(nodo.tabs.pauseInteraction.resume.body.pauseInteraction === false, "resume debe llevar pauseInteraction false");
ok(nodo.toolBindings["transaccion-crear"].execution_id === "{{$context.executionId}}", "execution_id no enlazado a {{$context.executionId}}");
ok(wf.usesHsmTemplates === false, "no debe usar HSM");

// Secretos: sk_ seguido de valor; cualquier valor de cabecera que no sea ${VAR}
ok(!/sk_[A-Za-z0-9]{6,}/.test(crudo), "posible secreto sk_ en workflow.json");
const prompt = readFileSync("workflow/agent.prompt.md", "utf8");
const readme = readFileSync("workflow/README.md", "utf8");
for (const [n, txt] of [["prompt", prompt], ["readme", readme], ["workflow", crudo]]) {
  ok(!/sk_[A-Za-z0-9]{6,}/.test(txt), `posible secreto sk_ en ${n}`);
  ok(!/Bearer\s+(?!\$\{)[A-Za-z0-9._-]{8,}/.test(txt), `Bearer con valor literal en ${n}`);
}
for (const h of Object.values(nodo.tabs.tools.server.headers).concat(Object.values(nodo.tabs.pauseInteraction.resume.headers))) {
  ok(/^(Bearer )?\$\{[A-Z_]+\}$/.test(h), `cabecera con valor literal: ${h}`);
}

// Prompt: cada tool y cada etapa
for (const t of [...esperadas]) ok(prompt.includes("`" + t + "`"), `el prompt no menciona la tool ${t}`);
ok(prompt.includes("{{$context.executionId}}"), "el prompt no usa {{$context.executionId}}");
const etapas = {
  trayecto: /### 1\. Trayecto/, pasajeros: /### 2\. Pasajeros/, fechas: /### 3\. Fechas de ida y de vuelta/,
  vuelos: /### 4\. Vuelos/, equipaje: /### 5\..*equipaje/, mascotas: /### 5\..*mascota/, asientos: /### 6\. Asientos de ida y de vuelta/,
  resumen: /### 7\. Resumen y total/, transaccion: /### 8\. Transacci/, pago: /### 9\. Pago/, resultado: /### 10\. Resultado/,
  paid: /`paid`/, rejected: /`rejected`/, expired: /`expired`/, pnr: /PNR/, "texto plano": /texto plano/,
  "400": /HTTP 400/, "503": /HTTP 503/, privacidad: /Nunca repitas.*documento/,
};
for (const [k, re] of Object.entries(etapas)) ok(re.test(prompt), `el prompt no cubre: ${k}`);
// Frases que el guion e2e (apps/e2e/e2e/guion.py) espera del agente: si cambian, hay que actualizar ambos.
for (const f of ["Quién lleva maleta de bodega", "Solo regreso", "mascota.trayecto", "tramo lleva la maleta", "lista de trayectos"]) ok(prompt.includes(f), `el prompt perdio una frase que usa el e2e: ${f}`);

if (fallos.length) { console.error("FALLOS:\n- " + fallos.join("\n- ")); process.exit(1); }
console.log(`OK: workflow.json valido; tools=${tools.length} existen en functions/; sin secretos; prompt cubre ${Object.keys(etapas).length} chequeos y ${esperadas.length} tools.`);
