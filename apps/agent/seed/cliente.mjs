// adapter: out — Datum REST (api.jelou.ai/v2) con ritmo bajo y backoff ante 429/5xx.
// Credenciales solo por parametro (el llamador las lee del entorno). Este modulo nunca imprime
// cabeceras, cuerpos ni secretos: los errores solo llevan metodo y codigo.

export const DATUM_BASE = "https://api.jelou.ai/v2/databases";
export const INTERVALO_MS = 250; // <= 4 req/s (limite de 5 req/s de la guia)
export const REINTENTOS = 5;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30000;

export class ErrorDatum extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = "ErrorDatum";
    this.status = status;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearCliente({ databaseId, clientId, clientSecret }, { fetchImpl = fetch, sleep = dormir, ahora = Date.now } = {}) {
  const base = `${DATUM_BASE}/${encodeURIComponent(databaseId)}/rows`;
  const autorizacion = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
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

  async function pedir(metodo, ruta, cuerpo) {
    const headers = { Authorization: autorizacion, Accept: "application/json" };
    const init = { method: metodo, headers };
    if (cuerpo !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }
    for (let intento = 0; ; intento++) {
      await espaciar();
      let resp;
      try {
        resp = await fetchImpl(`${base}${ruta}`, init);
      } catch {
        if (intento >= REINTENTOS) throw new ErrorDatum(0, `${metodo} /rows${ruta}: error de red tras ${intento + 1} intentos`);
        await sleep(esperaReintento(null, intento));
        continue;
      }
      if (resp.ok) return await resp.json();
      await resp.body?.cancel?.();
      const reintentable = resp.status === 429 || resp.status >= 500;
      if (!reintentable || intento >= REINTENTOS) throw new ErrorDatum(resp.status, `${metodo} /rows${ruta}: Datum respondio ${resp.status}`);
      await sleep(esperaReintento(resp, intento));
    }
  }

  const normalizar = (r) => ({ _id: String(r._id ?? r.id ?? ""), fields: r.fields ?? r });

  return {
    // Lista toda la base paginando; corta en pagina corta o si la API ignora `page` (sin ids nuevos).
    async listarTodo(limit = 100, maxPaginas = 50) {
      const vistas = new Map();
      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const cuerpo = await pedir("GET", `?limit=${limit}&page=${pagina}`);
        const filas = (Array.isArray(cuerpo) ? cuerpo : cuerpo?.data ?? cuerpo?.rows ?? []).map(normalizar);
        const nuevas = filas.filter((f) => !vistas.has(f._id));
        nuevas.forEach((f) => vistas.set(f._id, f));
        if (filas.length < limit || nuevas.length === 0) break;
      }
      return [...vistas.values()];
    },
    crear: (fields) => pedir("POST", "", { fields }),
  };
}
