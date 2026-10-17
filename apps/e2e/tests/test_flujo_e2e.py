"""Flujo completo: chat WhatsApp -> reserva -> pasarela de pago -> chat con PNR -> CRM, verificado contra Datum."""
import re

import pytest

from e2e import config, guard
from e2e.datos import generar
from e2e.whatsapp import Chat, pausa

VISTAS_CRM = ["resumen", "ventas", "vuelos", "mapa"]
ENLACE = re.compile(r"https?://\S+/(?:pay|pagar)/([A-Za-z0-9_-]+)")


def mostrar(page):
    page.bring_to_front()
    pausa()


@pytest.mark.wa
def test_reserva_pago_crm(ctx, datum, fk):
    assert config.WA_PHONE, "Define WA_AGENT_PHONE en apps/e2e/.env"
    assert config.ESCENARIO in ("aprobar", "rechazar")
    guard.verificar_cooldown()
    esc = generar(fk, datum, config.BODEGA)
    print("\nEscenario:", esc)

    # Abre todas las paginas desde el inicio.
    wa = ctx.pages[0] if ctx.pages else ctx.new_page()
    crm = {}
    for v in VISTAS_CRM:
        crm[v] = ctx.new_page()
        crm[v].goto(f"{config.CRM_URL}/#/{v}")
    pay = ctx.new_page()
    pay.goto(f"{config.PAY_URL}/health")
    mostrar(crm["resumen"])
    reservas_antes = len(datum.lista("reservas", "", 500))

    # 1) Chat: conversacion guiada con datos dinamicos.
    mostrar(wa)
    chat = Chat(wa)
    chat.abrir()

    def di(texto):
        r = chat.decir(texto)
        print(f">> {texto}\n<< {r}\n")
        return r

    di("Hola, quiero reservar un vuelo")
    di(f"Quiero viajar de {esc.ruta_ida.replace('-', ' a ')}")
    di(f"Somos {len(esc.pasajeros)} pasajeros")
    di(f"Ida el {esc.fecha_ida} y regreso el {esc.fecha_regreso}")
    di("Elijo el vuelo de ida y el de regreso disponibles de esas fechas")
    for i, p in enumerate(esc.pasajeros, 1):
        txt = f"Pasajero {i}: nombre {p.nombre}, documento {p.documento}, edad {p.edad}. Lleva equipaje de cabina."
        if p.bodega:
            largo, ancho, alto, kg = p.bodega
            txt += f" Bodega solo en la ida: {largo}x{ancho}x{alto} cm y {kg} kg."
        else:
            txt += " Sin equipaje de bodega."
        di(txt + " Sin mascota.")
    di("Asientos de ida: " + " ".join(p.asiento_ida for p in esc.pasajeros)
       + ". Asientos de regreso: " + " ".join(p.asiento_regreso for p in esc.pasajeros))
    resumen = di("Confirmo los asientos")
    if not ENLACE.search(resumen):
        resumen = di("Si, confirmo el resumen y quiero pagar")
    m = ENLACE.search(resumen)
    assert m, f"El agente no envio el enlace de pago:\n{resumen}"
    tx_id = m.group(1)
    wa.screenshot(path=str(config.ARTEFACTOS / "01_chat_enlace.png"))

    # 2) Datum: transaccion y reserva pendientes reales.
    tx = datum.get("transacciones", tx_id)
    assert tx and tx["estado"] == "PENDIENTE"
    reserva = datum.get("reservas", tx["reserva_id"])
    assert reserva["estado"] == "PENDIENTE_PAGO"
    pnr = reserva["pnr"]
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", pnr)
    assert len(datum.lista("reservas", "", 500)) == reservas_antes + 1
    ida = datum.vuelo(esc.ruta_ida, esc.fecha_ida)["mapa_asientos"]
    assert all(ida[p.asiento_ida]["estado"] == "RETENIDO" for p in esc.pasajeros)

    # 3) Pasarela: se abre el enlace y se ejecuta la accion.
    pay.goto(f"{config.PAY_URL}/pay/{tx_id}")
    mostrar(pay)
    antes = chat.contar()
    accion = config.ESCENARIO
    pay.locator(f"button.{accion}").click()
    pausa()
    pay.screenshot(path=str(config.ARTEFACTOS / "02_pasarela.png"))

    # 4) Chat: resultado.
    mostrar(wa)
    final = "\n".join(chat.esperar_respuesta(antes, timeout_s=180))
    print("<< resultado:", final)
    wa.screenshot(path=str(config.ARTEFACTOS / "03_chat_resultado.png"))

    # 5) Datum: estado final y asientos.
    ok = accion == "aprobar"
    esperado_res, esperado_tx, esperado_asiento = (
        ("EMITIDA", "APROBADA", "VENDIDO") if ok else ("PAGO_RECHAZADO", "RECHAZADA", "LIBRE")
    )
    assert datum.get("transacciones", tx_id)["estado"] == esperado_tx
    assert datum.get("reservas", reserva["id"])["estado"] == esperado_res
    ida = datum.vuelo(esc.ruta_ida, esc.fecha_ida)["mapa_asientos"]
    assert all(ida[p.asiento_ida]["estado"] == esperado_asiento for p in esc.pasajeros)
    if ok:
        assert pnr in final, f"El PNR {pnr} no llego al chat"

    # 6) CRM: cada vista, con espera de 3 s entre una y otra.
    for v in VISTAS_CRM:
        mostrar(crm[v])
        crm[v].reload()
        pausa()
        crm[v].screenshot(path=str(config.ARTEFACTOS / f"04_crm_{v}.png"))
    if ok:
        # El CRM cachea 10 s por coleccion; el PNR no se muestra en todas las vistas, asi que es informativo.
        visto = [v for v in VISTAS_CRM if crm[v].get_by_text(pnr).count()]
        print(f"PNR {pnr} visible en vistas del CRM: {visto or 'ninguna'}")
        mostrar(crm["ventas"])
