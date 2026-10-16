// Genera brain/tools/<slug>.json: una Tool de Jelou por function (HTTP a la function con JELOU_FN_INVOKE_KEY).
// Uso (cwd = apps/agent): node workflow/generar-tools.mjs. Los toolId/workflowId salen de los archivos creados con `jelou tool create`.
// Sin credenciales: el token es el secreto de organizacion {{$secret.JELOU_FN_INVOKE_KEY}}.
import { readFileSync, writeFileSync } from "node:fs";

const FN_URL = process.env.FUNCTIONS_URL ?? "https://aerolinea-reservas.fn.jelou.ai";
const TOOLS = {
  "rutas-listar": { sinEntrada: true, desc: "" },
  "vuelos-buscar": { desc: 'JSON: {"ruta_id":"BOG-MDE","fecha_ida":"2026-12-10","fecha_regreso":"2026-12-20" (opcional),"pasajeros":2}' },
  "equipaje-calcular": { desc: 'JSON: {"vuelo_id":"<vuelo_id>","bodega":{"largo_cm":60,"ancho_cm":40,"alto_cm":30,"peso_kg":20}}' },
  "cotizar": { desc: 'JSON: {"vuelo_ida_id":"..","vuelo_regreso_id":".." (opcional),"pasajeros":[{"edad":30,"bodega_ida":{..},"bodega_regreso":{..}}],"mascota":{"pasajero_indice":0,"especie":"perro","peso_kg":5} (opcional)}' },
  "asientos-validar-retener": { desc: 'JSON: {"vuelo_ida_id":"..","vuelo_regreso_id":".." (opcional),"edades":[30,12],"asientos_ida":"12A 12B","asientos_regreso":"14A 14B" (opcional)}' },
  "transaccion-crear": { desc: 'JSON: {"hold_token":"..","vuelo_ida_id":"..","vuelo_regreso_id":".." (opcional),"pasajeros":[{"nombre":"..","documento":"..","edad":30,"cabina":true,"bodega_ida":{..},"bodega_regreso":{..},"asiento_ida":"12A","asiento_regreso":"14A"}],"mascota":{..} (opcional),"execution_id":"<{{$context.executionId}} del agente>"}' },
};

const nodoCode = (id, title, content) => ({ id, type: "CODE", title, position: [0, 0], configuration: { title, content, memoryVersion: "v2" } });

for (const [slug, t] of Object.entries(TOOLS)) {
  const ruta = `tools/${slug}.json`;
  const base = JSON.parse(readFileSync(ruta, "utf8"));
  const entrada = t.sinEntrada
    ? []
    : [{ name: "payload", displayName: "payload", description: `Cuerpo JSON (texto) para ${slug}. ${t.desc}`, type: "STRING", required: true }];
  const leer = t.sinEntrada
    ? `$context.set("cuerpo", "{}");`
    : `var raw = "{}"; try { raw = $input.get("payload"); } catch (e) { raw = "{}"; }\n$context.set("cuerpo", typeof raw === "string" ? raw : JSON.stringify(raw));`;
  const salida = `var r = $context.get("resp") || {};
var st = Number(r.status) || 0;
$output.set("respuesta", JSON.stringify({ ok: st >= 200 && st < 300, status: st, data: r.data === undefined ? null : r.data }));`;
  const http = {
    id: "tmp_http", type: "HTTP", title: `POST ${slug}`, position: [0, 0],
    configuration: {
      title: `POST ${slug}`, method: "POST", url: `${FN_URL}/${slug}`, output: "resp",
      headers: [
        { id: "h1", key: "Authorization", value: "Bearer {{$secret.JELOU_FN_INVOKE_KEY}}", enabled: true },
        { id: "h2", key: "Content-Type", value: "application/json", enabled: true },
      ],
      body: { type: "application/json", content: "{{$context.cuerpo}}", enabled: true },
      settings: { sslCertificate: true, timeout: 30000 },
    },
  };
  const outId = "out-respuesta";
  const inicio = base.nodes.find((n) => n.type === "START");
  const doc = {
    ...base,
    inputs: entrada,
    outputs: [{ id: outId, name: "respuesta", displayName: "respuesta", description: "JSON {ok,status,data} con la respuesta de la function (errores de negocio incluidos en data)", type: "SUCCESS" }],
    nodes: [
      base.nodes.find((n) => n.type === "START"),
      nodoCode("tmp_in", "Leer entrada", leer),
      http,
      nodoCode("tmp_ok", "Respuesta", salida),
      nodoCode("tmp_err", "Respuesta con error", salida),
      { id: "tmp_end1", type: "END", title: "Fin", position: [0, 0], configuration: { outputId: outId } },
      { id: "tmp_end2", type: "END", title: "Fin con error", position: [0, 0], configuration: { outputId: outId } },
    ],
    edges: [
      { id: "tmp_e0", sourceId: inicio.id, targetId: "tmp_in", branch: "default" },
      { id: "tmp_e1", sourceId: "tmp_in", targetId: "tmp_http", branch: "success" },
      { id: "tmp_e2", sourceId: "tmp_http", targetId: "tmp_ok", branch: "success" },
      { id: "tmp_e3", sourceId: "tmp_http", targetId: "tmp_err", branch: "failed" },
      { id: "tmp_e4", sourceId: "tmp_ok", targetId: "tmp_end1", branch: "success" },
      { id: "tmp_e5", sourceId: "tmp_err", targetId: "tmp_end2", branch: "success" },
    ],
  };
  writeFileSync(ruta, JSON.stringify(doc, null, 2) + "\n");
  console.log(`escrito ${ruta}`);
}
