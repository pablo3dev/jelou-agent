"""Guion paso a paso de un escenario: chat WhatsApp (selectores) -> Datum -> pasarela -> chat -> Datum -> CRM.

Cada paso se anuncia en consola ("PASO n"), deja captura numerada en artifacts/<escenario>/ y respeta la pausa
de 3 s para que la secuencia se vea. Tras los datos de los pasajeros el agente conduce el orden (equipaje,
mascota, asientos): el guion reacciona al ultimo mensaje del bot en vez de asumir un orden fijo.
"""
import re
import time

from . import config
from .datos import Escenario, titulo_ruta
from .pestanas import Pestanas
from .whatsapp import Chat, pausa

ENLACE = re.compile(r"https?://\S+/(?:pay|pagar)/([A-Za-z0-9_-]+)")
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


def _hora(datum, ruta: str, fecha: str) -> str:
    return datum.vuelo(ruta, fecha)["hora_salida"][:5]


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
    di("Hola, quiero reservar un vuelo")
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
    elige(_hora(datum, v.ruta_ida, v.fecha_ida), prefijo=True)
    paso("Vuelo de regreso (lista)")
    elige(_hora(datum, v.ruta_regreso, v.fecha_regreso), prefijo=True)

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

    # Conduce el agente: se responde a lo que pregunte, con una entrada invalida primero si el escenario lo pide.
    pendientes_bodega = [p for p in esc.pasajeros if p.bodega]
    elegidos_lista: list[str] = []
    probado: set[str] = set()
    maleta_actual = esc.pasajeros[0]
    asiento_ida_enviado = False
    ultimo = log[-1]
    for _ in range(MAX_TURNOS):
        t = ultimo.lower()
        if ENLACE.search(ultimo):
            break
        if "confirmar y pagar" in t or "confirmas y pagas" in t or "todo correcto" in t:
            paso("Resumen y confirmacion (botones)")
            ultimo = elige("Confirmar y pagar")
        elif "qué equipaje" in t or "que equipaje" in t:
            paso(f"Equipaje: {esc.equipaje} (botones)")
            ultimo = elige(esc.equipaje)
        elif re.search(r"qui[eé]n( m[aá]s)? lleva", t):
            paso("Quienes llevan bodega (lista de nombres)")
            sig = next(p for p in pendientes_bodega if p.nombre not in elegidos_lista)
            elegidos_lista.append(sig.nombre)
            ultimo = elige(sig.nombre[:15], prefijo=True)
        elif "alguien más" in t or "alguien mas" in t:
            paso("Alguien mas lleva bodega? (botones)")
            quedan = len(elegidos_lista) < len(pendientes_bodega)
            ultimo = elige("Sí" if quedan else "No, seguimos")
        elif "tramo" in t and "mascota" in t and "?" in t:
            paso(f"Tramo de la mascota: {esc.mascota.tramo if esc.mascota else 'Ida'} (botones)")
            ultimo = elige(esc.mascota.tramo if esc.mascota else "Ida")
        elif "tramo" in t and ("bodega" in t or "maleta" in t) and "?" in t and "cuesta" not in t and "COP" not in t:  # la pregunta, no el precio ya calculado
            dueno_maleta = next((q for q in esc.pasajeros if q.bodega and q.nombre.split()[0].lower() in t), maleta_actual)
            paso(f"Tramo de la maleta de {dueno_maleta.nombre.split()[0]}: {dueno_maleta.bodega_tramo} (botones)")
            ultimo = elige(dueno_maleta.bodega_tramo)
        elif pendientes_bodega and any(k in t for k in ("largo", "medidas", "alto")) and "kg" in t:
            if "bodega_excedida" in esc.errores and "bodega" not in probado:
                probado.add("bodega")
                paso("Maleta fuera de limites (entrada invalida)")
                lo, an, al, kg = esc.errores["bodega_excedida"]
                ultimo = di(f"{lo}x{an}x{al} cm, {kg} kg")
                assert not ENLACE.search(ultimo), "El agente acepto una maleta fuera de limites"
                continue
            p = maleta_actual = pendientes_bodega.pop(0)
            lo, an, al, kg = p.bodega
            paso(f"Medidas y peso de la maleta de {p.nombre.split()[0]}")
            ultimo = di(f"{lo}x{an}x{al} cm, {kg} kg")
        elif "viaja una mascota" in t or ("mascota" in t and "?" in t and "especie" not in t and "peso" not in t):
            paso("Mascota: Si / No (botones)")
            ultimo = elige("Sí" if esc.mascota else "No")
        elif esc.mascota and "especie" in t:
            paso("Especie de la mascota (botones)")
            ultimo = elige(esc.mascota.especie)
        elif esc.mascota and "peso" in t and "mascota" in t:
            if "mascota_pesada" in esc.errores and "mascota" not in probado:
                probado.add("mascota")
                paso("Mascota con peso fuera de limite (entrada invalida)")
                ultimo = di(f"{esc.errores['mascota_pesada']} kg")
                assert not ENLACE.search(ultimo)
                continue
            paso("Peso de la mascota")
            ultimo = di(f"{esc.mascota.peso_kg} kg")
        elif esc.mascota and "nombre de quién" in t:
            paso("Dueño de la mascota (lista)")
            ultimo = elige(esc.pasajeros[esc.mascota.dueno].nombre[:15], prefijo=True)
        elif "asiento" in t and "regreso" in t and asiento_ida_enviado:
            paso("Asientos de regreso (widget del CRM + copiar + pegar)")
            ultimo = di(elegir_en_widget(enlace_mapa(v.vuelo_regreso), [p.asiento_regreso for p in esc.pasajeros]))
        elif "asiento" in t and not asiento_ida_enviado:
            asiento_ida_enviado = True
            ida = [p.asiento_ida for p in esc.pasajeros]
            if "asiento_ocupado" in esc.errores:
                paso("Asiento ocupado (entrada invalida)")
                r = di(" ".join([esc.errores["asiento_ocupado"]] + ida[1:]))
                assert not ENLACE.search(r), "El agente retuvo un asiento ocupado"
            paso("Asientos de ida (widget del CRM + copiar + pegar)")
            ultimo = di(elegir_en_widget(enlace_mapa(v.vuelo_ida), ida))
        else:
            paso("El agente pide algo no previsto; continuo")
            ultimo = di("Continuar")
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
    ida = datum.vuelo(v.ruta_ida, v.fecha_ida)["mapa_asientos"]
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
    ida = datum.vuelo(v.ruta_ida, v.fecha_ida)["mapa_asientos"]
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
