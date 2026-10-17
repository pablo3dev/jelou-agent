"""Decision pura del guion: dado el ultimo mensaje del agente, que responde la prueba.

Sin navegador ni red, para poder probarla offline (tests/test_00_guion.py) con respuestas reales del agente antes
de gastar mensajes. Un mensaje que no se reconoce o una repeticion del mismo mensaje cortan la prueba: seguir
escribiendo "Continuar" solo gasta creditos.
"""
import re
from dataclasses import dataclass, field

from .datos import Escenario, Pasajero

ENLACE = re.compile(r"https?://\S+/(?:pay|pagar)/([A-Za-z0-9_-]+)")


def corto(nombre: str) -> str:
    """Las filas de las listas llevan el nombre abreviado por el agente: se busca por las dos primeras palabras."""
    return " ".join(nombre.split()[:2])


@dataclass
class Accion:
    tipo: str  # fin | elegir | decir | widget_ida | widget_regreso
    titulo: str = ""  # texto del PASO en consola
    valor: str = ""  # opcion a tocar o texto a escribir
    prefijo: bool = False
    invalida: str = ""  # nombre de la entrada invalida que prueba ('bodega', 'mascota', 'asiento'), si es el caso


@dataclass
class Estado:
    esc: Escenario
    pendientes_bodega: list[Pasajero] = field(default_factory=list)
    elegidos_lista: list[str] = field(default_factory=list)
    probado: set[str] = field(default_factory=set)
    maleta_actual: Pasajero | None = None
    asiento_ida_enviado: bool = False
    ultima: tuple | None = None  # (mensaje, tipo, valor) de la accion anterior

    def __post_init__(self) -> None:
        self.pendientes_bodega = [p for p in self.esc.pasajeros if p.bodega]
        self.maleta_actual = self.esc.pasajeros[0]


class GuionDetenido(AssertionError):
    pass


def decidir(texto: str, st: Estado) -> Accion:
    a = _decidir(texto, st)
    clave = (texto, a.tipo, a.valor)
    if a.tipo != "fin" and clave == st.ultima:
        raise GuionDetenido(f"El agente repitio el mismo mensaje tras responder {a.valor!r}; se corta para no gastar mensajes:\n{texto}")
    st.ultima = clave
    return a


def _decidir(texto: str, st: Estado) -> Accion:
    esc, t = st.esc, texto.lower()
    if ENLACE.search(texto):
        return Accion("fin")
    if "confirmar y pagar" in t or "confirmas y pagas" in t or "todo correcto" in t:
        return Accion("elegir", "Resumen y confirmacion (botones)", "Confirmar y pagar")
    if "qué equipaje" in t or "que equipaje" in t:
        return Accion("elegir", f"Equipaje: {esc.equipaje} (botones)", esc.equipaje)
    if re.search(r"qui[eé]n( m[aá]s)? lleva", t):
        quedan = [p for p in esc.pasajeros if p.bodega and p.nombre not in st.elegidos_lista]
        if quedan:
            st.elegidos_lista.append(quedan[0].nombre)
            return Accion("elegir", "Quienes llevan bodega (lista de nombres)", corto(quedan[0].nombre), prefijo=True)
        return Accion("elegir", "Nadie mas lleva bodega (ultima fila de la lista)", "Nadie más, continuar")
    if "alguien más" in t or "alguien mas" in t:
        quedan = len(st.elegidos_lista) < sum(1 for p in esc.pasajeros if p.bodega)
        return Accion("elegir", "Alguien mas lleva bodega? (botones)", "Sí" if quedan else "No, seguimos")
    if "tramo" in t and "mascota" in t and "?" in t:
        tramo = esc.mascota.tramo if esc.mascota else "Ida"
        return Accion("elegir", f"Tramo de la mascota: {tramo} (botones)", tramo)
    if "tramo" in t and ("bodega" in t or "maleta" in t) and "?" in t:  # la pregunta (puede venir junto al precio de la maleta)
        dueno = next((q for q in esc.pasajeros if q.bodega and q.nombre.split()[0].lower() in t), st.maleta_actual)
        return Accion("elegir", f"Tramo de la maleta de {dueno.nombre.split()[0]}: {dueno.bodega_tramo} (botones)", dueno.bodega_tramo)
    if st.pendientes_bodega and any(k in t for k in ("largo", "medidas", "alto")) and "kg" in t:
        if "bodega_excedida" in esc.errores and "bodega" not in st.probado:
            st.probado.add("bodega")
            lo, an, al, kg = esc.errores["bodega_excedida"]
            return Accion("decir", "Maleta fuera de limites (entrada invalida)", f"{lo}x{an}x{al} cm, {kg} kg", invalida="bodega")
        p = st.maleta_actual = st.pendientes_bodega.pop(0)
        lo, an, al, kg = p.bodega
        return Accion("decir", f"Medidas y peso de la maleta de {p.nombre.split()[0]}", f"{lo}x{an}x{al} cm, {kg} kg")
    if esc.mascota and "nombre de quién" in t:
        return Accion("elegir", "Dueño de la mascota (lista)", corto(esc.pasajeros[esc.mascota.dueno].nombre), prefijo=True)
    if esc.mascota and "especie" in t:
        return Accion("elegir", "Especie de la mascota (botones)", esc.mascota.especie)
    if esc.mascota and re.search(r"pes(o|a)", t) and ("mascota" in t or not st.pendientes_bodega):
        if "mascota_pesada" in esc.errores and "mascota" not in st.probado:
            st.probado.add("mascota")
            return Accion("decir", "Mascota con peso fuera de limite (entrada invalida)", f"{esc.errores['mascota_pesada']} kg", invalida="mascota")
        return Accion("decir", "Peso de la mascota", f"{esc.mascota.peso_kg} kg")
    if "mascota" in t and "?" in t and not re.search(r"pes(o|a)|especie|nombre de quién|tramo", t):
        return Accion("elegir", "Mascota: Si / No (botones)", "Sí" if esc.mascota else "No")
    if "asiento" in t and "regreso" in t and st.asiento_ida_enviado:
        return Accion("widget_regreso", "Asientos de regreso (widget del CRM + copiar + pegar)")
    if "asiento" in t and not st.asiento_ida_enviado:
        st.asiento_ida_enviado = True
        return Accion("widget_ida", "Asientos de ida (widget del CRM + copiar + pegar)",
                      invalida="asiento" if "asiento_ocupado" in esc.errores else "")
    raise GuionDetenido(f"El agente pidio algo no previsto; se corta en vez de escribir 'Continuar' a ciegas:\n{texto}")
