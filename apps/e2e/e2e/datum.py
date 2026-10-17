import httpx

from .config import DATUM_API_KEY, DATUM_URL


class Datum:
    """Cliente de solo lectura sobre Datum v2 (PocketBase)."""

    def __init__(self) -> None:
        if not DATUM_URL or not DATUM_API_KEY:
            raise RuntimeError("Falta DATUM_URL/DATUM_API_KEY (apps/infrastructure/.env)")
        self.c = httpx.Client(base_url=DATUM_URL, headers={"X-Api-Key": DATUM_API_KEY}, timeout=15, transport=httpx.HTTPTransport(retries=3))  # reintenta cortes de red al conectar

    def get(self, coleccion: str, id_: str) -> dict | None:
        r = self.c.get(f"/collections/{coleccion}/records/{id_}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def lista(self, coleccion: str, filtro: str = "", por_pagina: int = 100) -> list[dict]:
        r = self.c.get(f"/collections/{coleccion}/records", params={"filter": filtro, "perPage": por_pagina})
        r.raise_for_status()
        return r.json()["items"]

    def vuelo(self, ruta: str, fecha: str) -> dict | None:
        return self.get("vuelos", ruta.replace("-", "").lower() + fecha.replace("-", ""))

    def reserva_por_pnr(self, pnr: str) -> dict | None:
        items = self.lista("reservas", f"pnr='{pnr}'")
        return items[0] if items else None
