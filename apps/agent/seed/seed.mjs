// adapter: in — CLI. Uso: node seed.mjs [--dry-run]
// Entorno: JELOU_CLIENT_ID, JELOU_CLIENT_SECRET, DATABASE_ID (nunca se imprimen).
import { pathToFileURL } from "node:url";
import { cargar, contar } from "./cargar.mjs";
import { crearCliente } from "./cliente.mjs";

export async function main(argv, env, log = console.log) {
  if (argv.includes("--dry-run")) {
    const c = contar();
    log(`dry-run (sin red): ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    return 0;
  }
  const faltan = ["JELOU_CLIENT_ID", "JELOU_CLIENT_SECRET", "DATABASE_ID"].filter((k) => !env[k]);
  if (faltan.length > 0) {
    log(`Faltan variables de entorno: ${faltan.join(", ")}`);
    return 2;
  }
  const cliente = crearCliente({ databaseId: env.DATABASE_ID, clientId: env.JELOU_CLIENT_ID, clientSecret: env.JELOU_CLIENT_SECRET });
  try {
    await cargar(cliente, { log });
    return 0;
  } catch (e) {
    log(`Seed fallido: ${e.message}`); // el mensaje solo trae metodo y codigo
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2), process.env);
