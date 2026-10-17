"""Pruebas offline del guion (sin navegador, red ni creditos): lo que responderia la prueba a mensajes reales del agente.

Los textos de abajo salen de corridas reales (capturas de WhatsApp) y del prompt del agente. Si el agente cambia
una frase, esta prueba debe fallar aqui y no a mitad de una corrida que gasta mensajes.
"""
import pytest

from e2e.datos import Escenario, Mascota, Pasajero, Viaje
from e2e.guion import Estado, GuionDetenido, decidir

V = Viaje("BOG-MDE", "2026-12-16", "MDE-BOG", "2026-12-23")
ENL = "Listo, paga aqui: http://localhost:3001/pay/abc123xyz"


def esc_varias() -> Escenario:
    ps = [
        Pasajero("Gilma Ramírez", "1", 44, "9A", "27A", (50, 35, 25, 15), "Ida y regreso"),
        Pasajero("Javier Gómez", "2", 55, "9B", "27B", (43, 39, 20, 8), "Solo regreso"),
        Pasajero("María Pérez", "3", 59, "9C", "27C"),
    ]
    return Escenario("varias_personas", V, ps, "Cabina y bodega", Mascota("Perro", 5, 2, "Regreso"))


def esc_una() -> Escenario:
    p = Pasajero("Ana Gómez", "1", 30, "9A", "27A", (50, 35, 25, 15))
    return Escenario("una_persona", V, [p], "Cabina y bodega", Mascota("Perro", 5, 0))


def recorrer(esc: Escenario, guion: list[tuple[str, str, str]]) -> None:
    st = Estado(esc)
    for texto, tipo, valor in guion:
        a = decidir(texto, st)
        assert (a.tipo, a.valor) == (tipo, valor), f"ante {texto!r}: {(a.tipo, a.valor)} != {(tipo, valor)}"


def test_varias_personas_pregunta_por_pasajero_bodega_tramo_medidas():
    e = esc_varias()
    recorrer(e, [
        ("🧳 ¿Qué equipaje llevan?", "elegir", "Cabina y bodega"),
        ("🧳 ¿Gilma Ramírez lleva maleta de bodega?", "elegir", "Sí"),
        ("🧳 ¿En qué tramo viaja la maleta de Gilma? Elige una opción.", "elegir", "Ida y regreso"),
        ("🧳 Maleta de Gilma: largo, ancho, alto en cm y peso en kg. Ejemplo: 60x40x30 cm, 20 kg.", "decir", "50x35x25 cm, 15 kg"),
        ("🧳 La maleta de Gilma cuesta COP 124.800 (8 kg cobrables).\n🧳 ¿Javier Gómez lleva maleta de bodega?", "elegir", "Sí"),
        ("🧳 ¿En qué tramo viaja la maleta de Javier?", "elegir", "Solo regreso"),
        ("🧳 Maleta de Javier: largo, ancho, alto en cm y peso en kg.", "decir", "43x39x20 cm, 8 kg"),
        ("La maleta de Javier cuesta COP 234.000 (20 kg cobrables). ¿María Pérez lleva maleta de bodega?", "elegir", "No"),
        ("🐾 ¿Viaja una mascota?", "elegir", "Sí"),
        ("🐾 ¿Qué especie es la mascota?", "elegir", "Perro"),
        ("🐾 ¿Cuánto pesa la mascota? Escribe el peso en kg.", "decir", "5 kg"),
        ("🐾 ¿A nombre de quién viaja la mascota?", "elegir", "María"),
        ("🐾 ¿En qué tramo viaja la mascota?", "elegir", "Regreso"),
        ("💺 Elige los asientos de ida aquí: http://localhost:3000/#/asientos/mdebog20261216/3", "widget_ida", ""),
        ("💺 Ahora elige los asientos de regreso: http://localhost:3000/#/asientos/bogmde20261223/3", "widget_regreso", ""),
        ("✅ ¿Todo correcto? Pasajeros y asientos ... Total COP 3.000.000. Confirmar y pagar / Cambiar asientos", "elegir", "Confirmar y pagar"),
        (ENL, "fin", ""),
    ])


def test_la_pregunta_de_bodega_usa_al_pasajero_de_la_pregunta_y_no_al_del_aviso():
    st = Estado(esc_varias())
    decidir("🧳 ¿Gilma Ramírez lleva maleta de bodega?", st)
    a = decidir("La maleta de Gilma cuesta COP 124.800. ¿María Pérez lleva maleta de bodega?", st)
    assert (a.tipo, a.valor) == ("elegir", "No")  # María no lleva bodega


def test_una_persona_mascota_de_ida():
    recorrer(esc_una(), [
        ("🧳 ¿Qué equipaje llevan?", "elegir", "Cabina y bodega"),
        ("🧳 ¿En qué tramo viaja la maleta de Ana?", "elegir", "Solo ida"),
        ("🧳 Maleta de Ana: escribe largo, ancho, alto en cm y peso en kg.", "decir", "50x35x25 cm, 15 kg"),
        ("🐾 ¿Viaja una mascota?", "elegir", "Sí"),
        ("🐾 ¿Qué especie es?", "elegir", "Perro"),
        ("🐾 ¿Cuánto pesa en kg?", "decir", "5 kg"),
        ("🐾 ¿En qué tramo viaja la mascota?", "elegir", "Ida"),
    ])


def test_medidas_llegan_en_un_mensaje_aparte_del_formato():
    st = Estado(esc_varias())
    a = decidir("Anotado: María Adriana Pérez también lleva maleta de bodega. Ahora las medidas de Gilma.", st)
    assert (a.tipo, a.valor) == ("decir", "50x35x25 cm, 15 kg")


def test_pregunta_de_bodega_sin_nombre_sigue_el_orden_de_los_pasajeros():
    st = Estado(esc_varias())
    assert decidir("🧳 ¿Lleva maleta de bodega el pasajero 1?", st).valor == "Sí"
    assert decidir("🧳 ¿Lleva maleta de bodega el pasajero 2?", st).valor == "Sí"
    assert decidir("🧳 ¿Lleva maleta de bodega el pasajero 3?", st).valor == "No"


def test_mensaje_no_previsto_corta_en_vez_de_escribir_continuar():
    with pytest.raises(GuionDetenido):
        decidir("Tuve un inconveniente raro, ¿puedes repetirlo?", Estado(esc_una()))


def test_mismo_mensaje_dos_veces_corta():
    st = Estado(esc_varias())
    decidir("🧳 ¿Qué equipaje llevan?", st)
    with pytest.raises(GuionDetenido):
        decidir("🧳 ¿Qué equipaje llevan?", st)


def test_flujo_por_mal_prueba_entradas_invalidas_una_vez():
    p = Pasajero("Ana Gómez Ruiz", "1", 30, "9A", "27A", (50, 35, 25, 15))
    e = Escenario("flujo_por_mal", V, [p], "Solo bodega", Mascota("Gato", 5, 0),
                  errores={"asiento_ocupado": "9A", "bodega_excedida": (120, 80, 80, 45), "mascota_pesada": 25})
    st = Estado(e)
    a = decidir("Maleta de Ana: escribe largo, ancho, alto en cm y peso en kg.", st)
    assert (a.tipo, a.invalida, a.valor) == ("decir", "bodega", "120x80x80 cm, 45 kg")
    a = decidir("Esa maleta supera el límite de 158 cm. Escribe largo, ancho, alto en cm y peso en kg.", st)
    assert (a.invalida, a.valor) == ("", "50x35x25 cm, 15 kg")
    a = decidir("🐾 ¿Cuánto pesa en kg la mascota?", st)
    assert (a.invalida, a.valor) == ("mascota", "25 kg")
    a = decidir("La mascota excede 8 kg. ¿Cuánto pesa en kg la mascota?", st)
    assert (a.invalida, a.valor) == ("", "5 kg")
    a = decidir("💺 Elige tus asientos de ida: http://localhost:3000/#/asientos/x/1", st)
    assert (a.tipo, a.invalida) == ("widget_ida", "asiento")


def test_viaje_siempre_elige_los_mismos_horarios():
    v = Viaje("BOG-MDE", "2026-12-16", "MDE-BOG", "2026-12-23")
    assert (v.hora_ida, v.hora_regreso) == ("12:30", "18:45")
    assert v.vuelo_ida == "bogmde202612161230"
    assert v.vuelo_regreso == "mdebog202612231845"
    # el horario base de las 07:00 conserva el id original
    assert Viaje("BOG-MDE", "2026-12-16", "MDE-BOG", "2026-12-23", "07:00", "07:00").vuelo_ida == "bogmde20261216"


def test_datos_de_los_escenarios_son_fijos_entre_corridas():
    import random

    from faker import Faker

    from e2e import datos

    class DatumFalso:
        def vuelo(self, ruta, fecha, hora="07:00"):
            return {"mapa_asientos": {f"{n}{l}": {"estado": "LIBRE"} for n in range(1, 31) for l in "ABCDEF"}}

    def generar():
        salida = []
        for nombre in ("una_persona", "varias_personas", "flujo_por_mal"):
            fk = Faker("es_CO")
            Faker.seed(f"2026-{nombre}")
            random.seed(f"2026-{nombre}")
            salida.append(getattr(datos, nombre)(fk, DatumFalso(), V))
        return salida

    a, b = generar(), generar()
    assert a == b
    assert all(len(p.nombre.split()) == 2 for e in a for p in e.pasajeros)  # nombre y apellido, como los muestra la lista
