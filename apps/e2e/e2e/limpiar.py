"""Limpia los datos que dejan las corridas del e2e en Datum: reservas, pasajeros, equipaje, mascotas, transacciones y
eventos de pago, y devuelve a LIBRE los asientos de los vuelos tocados. No toca rutas, temporada, parametros ni vuelos.

Uso: uv run python -m e2e.limpiar            (se niega si hay reservas PAGADAS: ya concluyeron un flujo)
     uv run python -m e2e.limpiar --forzar   (borra todo, incluidas las pagadas)
"""
import sys

from .datum import Datum

DETALLE = ["eventos_pago", "mascotas", "equipaje", "pasajeros", "transacciones", "reservas"]


def _todo(d: Datum, coleccion: str) -> list[dict]:
    items, pagina = [], 1
    while True:
        r = d.c.get(f"/collections/{coleccion}/records", params={"perPage": 100, "page": pagina})
        r.raise_for_status()
        j = r.json()
        items += j["items"]
        if pagina >= j.get("totalPages", 1):
            return items
        pagina += 1


def limpiar(forzar: bool = False) -> dict:
    d = Datum()
    pagadas = [r["pnr"] for r in _todo(d, "reservas") if r.get("estado") not in ("PENDIENTE_PAGO", "CANCELADA", "RECHAZADA", "VENCIDA")]
    if pagadas and not forzar:
        raise SystemExit(f"Hay reservas que ya concluyeron un flujo ({', '.join(pagadas)}); usa --forzar para borrarlas tambien.")
    resumen: dict[str, int] = {}
    for c in DETALLE:
        n = 0
        for it in _todo(d, c):
            d.c.delete(f"/collections/{c}/records/{it['id']}").raise_for_status()
            n += 1
        resumen[c] = n
    vuelos = 0
    for v in _todo(d, "vuelos"):
        m = v["mapa_asientos"]
        if any(a["estado"] != "LIBRE" for a in m.values()):
            libre = {k: {"estado": "LIBRE", "pnr": None, "hold_token": None, "hold_expira": None} for k in m}
            d.c.patch(f"/collections/vuelos/records/{v['id']}", json={"mapa_asientos": libre, "version": int(v.get("version") or 1) + 1}).raise_for_status()
            vuelos += 1
    resumen["vuelos_restablecidos"] = vuelos
    return resumen


if __name__ == "__main__":
    print(limpiar("--forzar" in sys.argv))
