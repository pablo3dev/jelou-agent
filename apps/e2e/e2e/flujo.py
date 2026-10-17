"""Guion paso a paso de un escenario: chat WhatsApp (selectores) -> Datum -> pasarela -> chat -> Datum -> CRM.

Cada paso se anuncia en consola ("PASO n"), deja captura numerada en artifacts/<escenario>/ y respeta la pausa
de 3 s para que la secuencia se vea. Tras los datos de los pasajeros el agente conduce el orden (equipaje,
mascota, asientos): el guion reacciona al ultimo mensaje del bot en vez de asumir un orden fijo.
"""
import re
import time

from . import config
from .datos import Escenario, titulo_ruta
from .whatsapp import Chat, pausa

ENLACE = re.compile(r"https?://\S+/(?:pay|pagar)/([A-Za-z0-9_-]+)")
VISTAS_CRM = ["resumen", "ventas", "vuelos", "mapa"]
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


def ejecutar(datum, esc: Escenario, wa, crm: dict, pay) -> None:
    v = esc.viaje
    paso = Paso(esc, wa)
    chat = Chat(wa)
    log: list[str] = []

    def di(texto: str) -> str:
        r = chat.decir(texto)
        print(f"  >> {texto}\n  << {r}\n")
        log.append(r)
        return r

    def elige(opcion: str, prefijo: bool = False) -> str:
        r = chat.elegir(opcion, prefijo)
        print(f"  << {r}\n")
        log.append(r)
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

    # Conduce el agente: se responde a lo que pregunte, con una entrada invalida primero si el escenario lo pide.
    pendientes_bodega = [p for p in esc.pasajeros if p.bodega]
    elegidos_lista: list[str] = []
    probado: set[str] = set()
    asiento_ida_enviado = False
    ultimo = log[-1]
    for _ in range(MAX_TURNOS):
        t = ultimo.lower()
        if ENLACE.search(ultimo):
            break
        if "confirmar y pagar" in t:
            paso("Resumen y confirmacion (botones)")
            ultimo = elige("Confirmar y pagar")
        elif "qué equipaje" in t or "que equipaje" in t:
            paso(f"Equipaje: {esc.equipaje} (botones)")
            ultimo = elige(esc.equipaje)
        elif "quién lleva" in t or "quien lleva" in t:
            paso("Quienes llevan bodega (lista de nombres)")
            sig = next(p for p in pendientes_bodega if p.nombre not in elegidos_lista)
            elegidos_lista.append(sig.nombre)
            ultimo = elige(sig.nombre[:15], prefijo=True)
        elif "alguien más" in t or "alguien mas" in t:
            paso("Alguien mas lleva bodega? (botones)")
            quedan = len(elegidos_lista) < len(pendientes_bodega)
            ultimo = elige("Sí" if quedan else "No, seguimos")
        elif "tramo" in t and "bodega" in t:
            paso("Tramo de la bodega (botones)")
            ultimo = elige("Solo ida")
        elif pendientes_bodega and any(k in t for k in ("largo", "medidas", "alto")) and "kg" in t:
            if "bodega_excedida" in esc.errores and "bodega" not in probado:
                probado.add("bodega")
                paso("Maleta fuera de limites (entrada invalida)")
                lo, an, al, kg = esc.errores["bodega_excedida"]
                ultimo = di(f"{lo}x{an}x{al} cm, {kg} kg")
                assert not ENLACE.search(ultimo), "El agente acepto una maleta fuera de limites"
                continue
            p = pendientes_bodega.pop(0)
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
            paso("Asientos de regreso (texto)")
            ultimo = di(" ".join(p.asiento_regreso for p in esc.pasajeros))
        elif "asiento" in t and not asiento_ida_enviado:
            asiento_ida_enviado = True
            ida = [p.asiento_ida for p in esc.pasajeros]
            if "asiento_ocupado" in esc.errores:
                paso("Asiento ocupado (entrada invalida)")
                r = di(" ".join([esc.errores["asiento_ocupado"]] + ida[1:]))
                assert not ENLACE.search(r), "El agente retuvo un asiento ocupado"
            paso("Asientos de ida (texto)")
            ultimo = di(" ".join(ida))
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

    # CRM: el mismo vuelo en el mapa muestra ocupados y libres acumulados por los escenarios.
    time.sleep(11)  # el CRM cachea 10 s por coleccion
    for vista in VISTAS_CRM:
        mostrar(crm[vista])
        crm[vista].reload()
        pausa()
        if vista == "mapa":
            crm[vista].locator("#sel-vuelo").select_option(v.vuelo_ida)
            pausa()
        paso(f"CRM: {vista}", crm[vista])
