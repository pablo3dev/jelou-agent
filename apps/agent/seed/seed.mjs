// adapter: in — CLI. Uso: node seed.mjs [--dry-run | --verificar]
// Entorno: DATUM_URL (https://<slug>.jelou.cloud/api), DATUM_API_KEY (nunca se imprimen).
import { pathToFileURL } from "node:url";
import { cargar, contar } from "./cargar.mjs";
import { crearCliente } from "./cliente.mjs";

const fmt = (c) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ");

export async function main(argv, env, log = console.log) {
  if (argv.includes("--dry-run")) {
    log(`dry-run (sin red): ${fmt(contar())}`);
    return 0;
  }
  const faltan = ["DATUM_URL", "DATUM_API_KEY"].filter((k) => !env[k]);
  if (faltan.length > 0) {
    log(`Faltan variables de entorno: ${faltan.join(", ")}`);
    return 2;
  }
  const cliente = crearCliente({ url: env.DATUM_URL, apiKey: env.DATUM_API_KEY });
  try {
    if (argv.includes("--verificar")) {
      const esperado = contar();
      const real = {};
      for (const nombre of Object.keys(esperado)) real[nombre] = await cliente.total(nombre);
      const ok = Object.keys(esperado).every((k) => real[k] === esperado[k]);
      log(`verificar: ${fmt(real)} (esperado ${fmt(esperado)}) => ${ok ? "OK" : "NO COINCIDE"}`);
      return ok ? 0 : 1;
    }
    await cargar(cliente, { log });
    return 0;
  } catch (e) {
    log(`Seed fallido: ${e.message}`); // el mensaje solo trae metodo, ruta y codigo
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2), process.env);
