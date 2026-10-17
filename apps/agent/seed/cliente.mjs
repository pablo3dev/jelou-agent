// adapter: out — Datum v2 (PocketBase) con ritmo bajo y backoff ante 429/5xx/red.
// Credenciales solo por parametro (el llamador las lee del entorno). Este modulo nunca imprime
// cabeceras, cuerpos ni secretos: los errores solo llevan metodo, ruta y codigo.

export const INTERVALO_MS = 250; // <= 4 req/s (gateway: 120/min)
export const REINTENTOS = 5;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30000;
const POR_PAGINA = 200;

export class ErrorDatum extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = "ErrorDatum";
    this.status = status;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearCliente({ url, apiKey }, { fetchImpl = fetch, sleep = dormir, ahora = Date.now } = {}) {
  const base = String(url).replace(/\/+$/, "");
  let ultimo = -Infinity;

  // Espacia TODA peticion (reintentos incluidos) al menos INTERVALO_MS.
  async function espaciar() {
    const espera = ultimo + INTERVALO_MS - ahora();
    if (espera > 0) await sleep(espera);
    ultimo = ahora();
  }

  function esperaReintento(resp, intento) {
    const ra = Number(resp?.headers?.get?.("retry-after"));
    const exp = BACKOFF_BASE_MS * 2 ** intento;
    return Math.min(Number.isFinite(ra) && ra > 0 ? Math.max(ra * 1000, exp) : exp, BACKOFF_MAX_MS);
  }

  const esDuplicado = (cuerpo) => cuerpo?.data?.id?.code === "validation_not_unique";

  // Devuelve { status, cuerpo }. Con `aceptar400` un 400 se devuelve (no lanza) para que el llamador lo interprete.
  async function pedir(metodo, ruta, cuerpo, aceptar400 = false) {
    const headers = { "X-Api-Key": apiKey, Accept: "application/json" };
    const init = { method: metodo, headers };
    if (cuerpo !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }
    const rutaLog = ruta.split("?")[0];
    for (let intento = 0; ; intento++) {
      await espaciar();
      let resp;
      try {
        resp = await fetchImpl(`${base}${ruta}`, init);
      } catch {
        if (intento >= REINTENTOS) throw new ErrorDatum(0, `${metodo} ${rutaLog}: error de red tras ${intento + 1} intentos`);
        await sleep(esperaReintento(null, intento));
        continue;
      }
      if (resp.ok) return { status: resp.status, cuerpo: await resp.json() };
      if (aceptar400 && resp.status === 400) {
        let c = null;
        try {
          c = await resp.json();
        } catch {
          // cuerpo no JSON: se trata como 400 generico
        }
        return { status: 400, cuerpo: c };
      }
      await resp.body?.cancel?.();
      const reintentable = resp.status === 429 || resp.status >= 500;
      if (!reintentable || intento >= REINTENTOS) throw new ErrorDatum(resp.status, `${metodo} ${rutaLog}: Datum respondio ${resp.status}`);
      await sleep(esperaReintento(resp, intento));
    }
  }

  const registros = (coleccion) => `/collections/${encodeURIComponent(coleccion)}/records`;

  return {
    // Set de ids fisicos de la coleccion (pagina con perPage=200 y fields=id).
    async listarIds(coleccion) {
      const ids = new Set();
      for (let pagina = 1; ; pagina++) {
        const { cuerpo } = await pedir("GET", `${registros(coleccion)}?page=${pagina}&perPage=${POR_PAGINA}&fields=id`);
        const items = cuerpo?.items ?? [];
        for (const it of items) ids.add(String(it.id));
        if (pagina >= (cuerpo?.totalPages ?? 1) || items.length === 0) return ids;
      }
    },
    // Total de registros via totalItems (perPage=1).
    async total(coleccion) {
      const { cuerpo } = await pedir("GET", `${registros(coleccion)}?page=1&perPage=1&fields=id`);
      return Number(cuerpo?.totalItems ?? 0);
    },
    // POST con id determinista. 400 validation_not_unique => { duplicado: true }; otro 400 lanza.
    async crear(coleccion, campos, id) {
      const r = await pedir("POST", registros(coleccion), { id, ...campos }, true);
      if (r.status === 400) {
        if (esDuplicado(r.cuerpo)) return { duplicado: true };
        throw new ErrorDatum(400, `POST ${registros(coleccion)}: Datum respondio 400`);
      }
      return { duplicado: false };
    },
  };
}
