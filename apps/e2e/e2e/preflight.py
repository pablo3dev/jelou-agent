"""Prevalidacion antes de gastar mensajes de WhatsApp: cada function se llama con el mismo cuerpo y cabecera que usan las tools del agente.

Sin IA ni WhatsApp. Las operaciones que escriben solo se prueban con entradas invalidas (esperan un error de negocio, no 401/5xx).
Limite conocido: la resolucion del secreto `{{$secret.JELOU_FN_TOKEN}}` dentro de la tool solo se prueba con el agente real.
"""
import hashlib
import hmac
import json
import re

import httpx

from . import config
from .datum import Datum

TOOLS = config.RAIZ.parent / "agent" / "brain" / "tools"


def _base_functions() -> str:
    url = json.loads((TOOLS / "rutas-listar.json").read_text(encoding="utf-8"))
    for n in url["nodes"]:
        if n["type"] == "HTTP":
            return re.sub(r"/rutas-listar$", "", n["configuration"]["url"])
    raise RuntimeError("rutas-listar.json no tiene nodo HTTP")


def _secreto_de_tools() -> str:
    nombres = set()
    for f in TOOLS.glob("*.json"):
        if f.name.startswith("."):
            continue
        nombres |= set(re.findall(r"\$secret\.(\w+)", f.read_text(encoding="utf-8")))
    return ", ".join(sorted(nombres))


class Revision:
    def __init__(self) -> None:
        self.fallas: list[str] = []

    def ok(self, nombre: str, cond: bool, detalle: str = "") -> None:
        print(f"  [{'OK ' if cond else 'FALLA'}] {nombre}" + (f" — {detalle}" if detalle else ""))
        if not cond:
            self.fallas.append(f"{nombre}: {detalle}")


def ejecutar() -> None:
    r = Revision()
    token = config.env("JELOU_TOKEN")
    r.ok("JELOU_TOKEN definido", bool(token))
    base = _base_functions()
    print(f"[preflight] functions en {base}; las tools usan el secreto: {_secreto_de_tools()}")
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    c = httpx.Client(timeout=30, transport=httpx.HTTPTransport(retries=3))

    def post(fn: str, cuerpo: dict):
        resp = c.post(f"{base}/{fn}", headers=h, json=cuerpo)
        try:
            return resp.status_code, resp.json()
        except ValueError:
            return resp.status_code, resp.text[:200]

    # Datum accesible con la llave configurada y con datos cargados.
    datum = Datum()
    r.ok("Datum: 6 rutas", len(datum.lista("rutas")) == 6)
    r.ok("Datum: vuelos sembrados", len(datum.lista("vuelos", "", 1)) == 1)

    st, rutas = post("rutas-listar", {})
    r.ok("rutas-listar 200 con 6 rutas", st == 200 and len(rutas.get("rutas", [])) == 6, f"status {st}")

    ruta = "BOG-MDE"
    st, vb = post("vuelos-buscar", {"ruta_id": ruta, "fecha_ida": "2026-12-10", "fecha_regreso": "2026-12-12", "pasajeros": 2})
    ida = (vb.get("ida") or [{}])[0] if isinstance(vb, dict) else {}
    vuelta = (vb.get("regreso") or [{}])[0] if isinstance(vb, dict) else {}
    r.ok("vuelos-buscar 200 con ida y regreso", st == 200 and bool(ida.get("vuelo_id")) and bool(vuelta.get("vuelo_id")), f"status {st}")
    r.ok("vuelos-buscar incluye mapa_url", "/#/asientos/" in str(ida.get("mapa_url")), str(ida.get("mapa_url")))
    vid, vrid = ida.get("vuelo_id", ""), vuelta.get("vuelo_id", "")

    st, eq = post("equipaje-calcular", {"vuelo_id": vid, "bodega": {"largo_cm": 60, "ancho_cm": 40, "alto_cm": 30, "peso_kg": 20}})
    r.ok("equipaje-calcular 200", st == 200, f"status {st} {str(eq)[:120]}")

    st, co = post("cotizar", {"vuelo_ida_id": vid, "vuelo_regreso_id": vrid, "pasajeros": [{"edad": 30}, {"edad": 12}]})
    r.ok("cotizar 200", st == 200, f"status {st} {str(co)[:120]}")

    # Escrituras: solo entradas invalidas; se espera error de negocio (4xx distinto de 401), nunca 401/5xx.
    st, _ = post("asientos-validar-retener", {"vuelo_ida_id": vid, "edades": [30], "asientos_ida": "99Z"})
    r.ok("asientos-validar-retener rechaza asiento inexistente sin 401/5xx", st in (200, 400, 404, 409, 422) and st != 401, f"status {st}")
    st, _ = post("transaccion-crear", {"hold_token": "invalido", "vuelo_ida_id": vid, "pasajeros": []})
    r.ok("transaccion-crear rechaza hold invalido sin 401/5xx", st in (200, 400, 404, 409, 422) and st != 401, f"status {st}")

    st, _ = httpx.post(f"{base}/rutas-listar", headers={"Authorization": "Bearer invalido"}, json={}, timeout=30).status_code, None
    r.ok("las functions rechazan un token invalido (401)", st == 401, f"status {st}")

    # Webhook de pago: la function debe aceptar la firma HMAC de `pay` (mismo PAY_WEBHOOK_SECRET). Transaccion inexistente: sin efectos.
    secreto = config.env("PAY_WEBHOOK_SECRET")
    if secreto:
        cuerpo = json.dumps({"transaccion_id": "noexiste000000x", "estado": "APROBADA", "event_id": "noexiste000000x:APROBADA", "emitido_at": "2026-01-01T00:00:00.000Z"}, separators=(",", ":"))
        firma = hmac.new(secreto.encode(), cuerpo.encode(), hashlib.sha256).hexdigest()
        resp = c.post(f"{base}/pago-notificacion", content=cuerpo, headers={"Content-Type": "application/json", "X-Webhook-Signature": f"sha256={firma}"})
        r.ok("pago-notificacion acepta la firma de pay (no 401 'Firma invalida')", resp.status_code == 200, f"status {resp.status_code} {resp.text[:80]}")
    else:
        r.ok("PAY_WEBHOOK_SECRET definido en .env (firma del webhook de pago)", False, "falta")

    if r.fallas:
        raise RuntimeError("Prevalidacion fallida; no se envia nada a WhatsApp:\n- " + "\n- ".join(r.fallas))
    print("[preflight] todo OK")


if __name__ == "__main__":
    ejecutar()
