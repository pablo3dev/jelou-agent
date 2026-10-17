"""Guion paso a paso de un escenario: chat WhatsApp (selectores) -> Datum -> pasarela -> chat -> Datum -> CRM.

Cada paso se anuncia en consola ("PASO n"), deja captura numerada en artifacts/<escenario>/ y respeta la pausa
de 3 s para que la secuencia se vea. Tras los datos de los pasajeros el agente conduce el orden (equipaje,
mascota, asientos): el guion reacciona al ultimo mensaje del bot en vez de asumir un orden fijo.
"""
import re
import time

from . import config
from .datos import Escenario, titulo_ruta
from .guion import ENLACE, Estado, decidir
from .pestanas import Pestanas
from .whatsapp import Chat, pausa

VISTAS_CRM = ["resumen", "vuelos", "mapa", "ventas"]
MAPA = re.compile(r"https?://\S+/#/asientos/\S+")
MAX_TURNOS = 30


class Paso:
    """Numera y registra los pasos de un escenario (consola + captura)."""

    def __init__(self, esc: Escenario, wa) -> None:
        self.n = 0
        self.esc = esc
        self.wa = wa
        self.dir = config.ARTEFACTOS / esc.nombre
        self.dir.mkdir(parents=True, exist_ok=True)

    def __call__(self, titulo: str, page=None) -> None:
        self.n += 1
        print(f"\n== [{self.esc.nombre}] PASO {self.n}: {titulo} ==")
        slug = re.sub(r"[^a-z0-9]+", "_", titulo.lower())[:40]
        (page or self.wa).screenshot(path=str(self.dir / f"{self.n:02d}_{slug}.png"))


def mostrar(page) -> None:
    page.bring_to_front()
    pausa()


def _falla_de_sistema(respuesta: str) -> None:
    """Si el agente avisa que sus herramientas fallan, corta: reintentar solo gasta mensajes y creditos."""
    if re.search(r"error de autorizaci|problema (al|de) busca|sistema de (b[uú]squeda|vuelos) (sigue|no)|problema en nuestro sistema|no pude consultar los vuelos|sigue sin (responder|funcionar)", respuesta, re.I):
        raise AssertionError(f"El agente reporta una falla de sus herramientas: {respuesta[:200]}")


def _conversacion(datum, esc: Escenario, wa, pest: Pestanas) -> Paso:
    v = esc.viaje
    paso = Paso(esc, wa)
    chat = Chat(wa)
    log: list[str] = []

    def di(texto: str) -> str:
        r = chat.decir(texto)
        print(f"  >> {texto}\n  << {r}\n")
        log.append(r)
        _falla_de_sistema(r)
        return r

    def elige(opcion: str, prefijo: bool = False) -> str:
        r = chat.elegir(opcion, prefijo)
        print(f"  << {r}\n")
        log.append(r)
        _falla_de_sistema(r)
        return r

    mostrar(wa)
    chat.abrir()
    reservas_antes = len(datum.lista("reservas", "", 500))
    n = len(esc.pasajeros)

    paso("Saludo y lista de destinos")
    r0 = di("Hola, quiero reservar un vuelo")
    assert "trayecto" in r0.lower() or "dónde" in r0.lower(), f"El agente no reinicio el flujo (pregunta otra cosa): {r0}"
    paso("Elijo el destino en la lista")
    elige(titulo_ruta(v.ruta_ida))
    paso("Elijo el numero de pasajeros")
    elige(f"{n} pasajero" + ("s" if n > 1 else ""))
    paso("Fecha de ida")
    di(v.fecha_ida)
    paso("Ida y vuelta (botones)")
    elige("Sí, ida y vuelta")
    paso("Fecha de regreso")
    di(v.fecha_regreso)
    paso("Vuelo de ida (lista)")
    elige(v.hora_ida, prefijo=True)
    paso("Vuelo de regreso (lista)")
    elige(v.hora_regreso, prefijo=True)

    for i, p in enumerate(esc.pasajeros, 1):
        paso(f"Datos del pasajero {i}")
        di(f"{p.nombre}, {p.documento}, {p.edad}")

    def enlace_mapa(vuelo_id: str) -> str | None:
        """Enlace al widget de asientos que el agente compartió en el chat para ese vuelo."""
        for r in reversed(log):
            for m in MAPA.finditer(r):
                if vuelo_id in m.group(0):
                    return m.group(0).rstrip(".,)")
        return None

    def elegir_en_widget(url: str | None, asientos: list[str]) -> str:
        """Abre el widget en otra pestana, elige (y quita uno) los asientos, copia y devuelve el texto copiado."""
        if not url:
            print("  [el agente no compartio el enlace del mapa; se escriben los asientos]")
            return " ".join(asientos)
        wa.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=config.CRM_URL)
        with pest.abrir("widget_asientos") as pg:
            pg.goto(f"{config.CRM_URL}/#{url.split('#', 1)[1]}")
            libres = pg.locator('button.asiento[data-asiento][data-estado="LIBRE"]:not([disabled])')  # sin la leyenda, que tambien es .asiento
            libres.first.wait_for()
            mostrar(pg)
            # Demostracion de deseleccionar: se elige un asiento de mas y se quita.
            extra = next(a for a in (libres.nth(i).get_attribute("data-asiento") for i in range(12)) if a not in asientos)
            pg.locator(f'[data-asiento="{extra}"]').click()
            pausa()
            pg.locator(f'[data-asiento="{extra}"]').click()
            assert pg.locator(f'[data-asiento="{extra}"]').get_attribute("aria-pressed") == "false"
            for a in asientos:
                pg.locator(f'[data-asiento="{a}"]').click()
                time.sleep(0.5)
            pausa()
            pg.screenshot(path=str(paso.dir / f"{paso.n:02d}_widget_asientos.png"))
            pg.locator("#copiar-asientos").click()
            pausa()
            copiado = pg.evaluate("navigator.clipboard.readText()")
            assert copiado.split() == sorted(asientos, key=lambda x: (int(x[:-1]), x[-1])), f"Copiado: {copiado!r}"
            copiado_ok = copiado
        mostrar(wa)
        return copiado_ok

    # Conduce el agente: la decision vive en guion.py (pura y probada offline); aqui solo se ejecuta.
    st = Estado(esc)
    ultimo = log[-1]
    for _ in range(MAX_TURNOS):
        a = decidir(ultimo, st)
        if a.tipo == "fin":
            break
        if a.tipo == "widget_ida":
            ida = [p.asiento_ida for p in esc.pasajeros]
            if a.invalida == "asiento":
                paso("Asiento ocupado (entrada invalida)")
                r = di(" ".join([esc.errores["asiento_ocupado"]] + ida[1:]))
                assert not ENLACE.search(r), "El agente retuvo un asiento ocupado"
            paso(a.titulo)
            ultimo = di(elegir_en_widget(enlace_mapa(v.vuelo_ida), ida))
            continue
        paso(a.titulo)
        if a.tipo == "elegir":
            ultimo = elige(a.valor, a.prefijo)
        elif a.tipo == "decir":
            ultimo = di(a.valor)
            if a.invalida:
                assert not ENLACE.search(ultimo), f"El agente acepto una entrada invalida ({a.invalida})"
        elif a.tipo == "widget_regreso":
            ultimo = di(elegir_en_widget(enlace_mapa(v.vuelo_regreso), [p.asiento_regreso for p in esc.pasajeros]))
    m = ENLACE.search(ultimo)
    assert m, f"El agente no envio el enlace de pago:\n{log[-3:]}"
    tx_id = m.group(1)
    paso("Enlace de pago recibido")

    # Datum: transaccion y reserva pendientes reales.
    tx = datum.get("transacciones", tx_id)
    assert tx and tx["estado"] == "PENDIENTE"
    reserva = datum.get("reservas", tx["reserva_id"])
    assert reserva["estado"] == "PENDIENTE_PAGO"
    pnr = reserva["pnr"]
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", pnr)
    assert len(datum.lista("reservas", "", 500)) == reservas_antes + 1
    ida = datum.vuelo(v.ruta_ida, v.fecha_ida, v.hora_ida)["mapa_asientos"]
    assert all(ida[p.asiento_ida]["estado"] == "RETENIDO" for p in esc.pasajeros)
    if esc.mascota:
        assert datum.lista("mascotas", f"reserva_id='{reserva['id']}'"), "La mascota no quedo registrada"

    # Pasarela.
    antes = chat.contar()
    with pest.abrir("pasarela") as pay:
        pay.goto(f"{config.PAY_URL}/pay/{tx_id}")
        mostrar(pay)
        paso(f"Pasarela: {esc.pago}", pay)
        pay.locator(f"button.{esc.pago}").click()
        pausa()

    mostrar(wa)
    final = "\n".join(chat.esperar_respuesta(antes, timeout_s=180))
    print("  << resultado:", final)
    paso("Resultado en el chat")

    ok = esc.pago == "aprobar"
    exp_res, exp_tx, exp_as = ("EMITIDA", "APROBADA", "VENDIDO") if ok else ("PAGO_RECHAZADO", "RECHAZADA", "LIBRE")
    assert datum.get("transacciones", tx_id)["estado"] == exp_tx
    assert datum.get("reservas", reserva["id"])["estado"] == exp_res
    ida = datum.vuelo(v.ruta_ida, v.fecha_ida, v.hora_ida)["mapa_asientos"]
    assert all(ida[p.asiento_ida]["estado"] == exp_as for p in esc.pasajeros)
    if ok:
        assert pnr in final, f"El PNR {pnr} no llego al chat"

    return paso


def ejecutar(ctx, datum, esc: Escenario) -> None:
    pest = Pestanas(ctx, esc.nombre)
    with pest.abrir("whatsapp") as wa:  # una pestana por escenario: chat, pago y resultado
        paso = _conversacion(datum, esc, wa, pest)
    # CRM: recorrido por las vistas; el mismo vuelo acumula ocupados y libres de todos los escenarios.
    time.sleep(11)  # el CRM cachea 10 s por coleccion
    recorrer_crm(pest, esc, paso)


def scroll(page, pasos: int = 3, dy: int = 450) -> None:
    page.mouse.move(640, 420)
    for _ in range(pasos):
        page.mouse.wheel(0, dy)
        time.sleep(1)
    page.mouse.wheel(0, -dy * pasos)
    time.sleep(1)


def recorrer_crm(pest: Pestanas, esc: Escenario, paso: Paso) -> None:
    """Cada vista se abre al llegar su turno y se cierra al terminar (un video corto por vista)."""
    v = esc.viaje
    ir = lambda vista: f"{config.CRM_URL}/#/{vista}"  # noqa: E731
    boton_idioma = "header .acciones button.btn--icono"

    # Resumen: tema claro/oscuro, idioma y scroll para ver toda la informacion.
    with pest.abrir("crm_resumen") as r:
        r.goto(ir("resumen"))
        mostrar(r)
        paso("CRM resumen", r)
        r.locator("#tema").click()
        pausa()
        paso("CRM resumen: modo claro/oscuro", r)
        scroll(r)
        r.locator("#tema").click()
        pausa()
        r.locator(boton_idioma).last.click()
        pausa()
        paso("CRM resumen: otro idioma", r)
        scroll(r)
        r.locator(boton_idioma).last.click()  # vuelve al idioma inicial
        pausa()

    # Vuelos: scroll y filtro por la ruta de la reserva.
    with pest.abrir("crm_vuelos") as vu:
        vu.goto(ir("vuelos"))
        mostrar(vu)
        paso("CRM vuelos", vu)
        scroll(vu, 2)
        vu.locator("#f-ruta").select_option(v.ruta_ida)
        pausa()
        paso(f"CRM vuelos: filtro {v.ruta_ida}", vu)
        scroll(vu, 2)

    # Mapa: el vuelo de la reserva, con scroll sobre el fuselaje.
    with pest.abrir("crm_mapa") as m:
        m.goto(ir("mapa"))
        mostrar(m)
        m.locator("#sel-vuelo").select_option(v.vuelo_ida)
        pausa()
        paso("CRM mapa: vuelo de la reserva", m)
        scroll(m, 4, 500)
        paso("CRM mapa: asientos ocupados y libres", m)

    # Ventas: 2 s en pantalla, scroll y clic en el vuelo para abrir su mapa.
    with pest.abrir("crm_ventas") as ve:
        ve.goto(ir("ventas"))
        mostrar(ve)
        time.sleep(2)
        paso("CRM ventas", ve)
        scroll(ve, 3)
        ve.locator("a.enlace", has_text=v.vuelo_ida).first.click()
        pausa()
        paso("CRM ventas: clic en el vuelo abre su mapa", ve)
        scroll(ve, 3, 500)
