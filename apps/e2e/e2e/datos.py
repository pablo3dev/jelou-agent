"""Datos dinamicos de los escenarios: nada hardcodeado, todo sale de Faker + Datum.

Los tres escenarios comparten el MISMO vuelo de ida y de regreso (se elige una vez por sesion) para que el
mapa de asientos del CRM acumule ocupados (VENDIDO) y libres entre una corrida y otra.
"""
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from .datum import Datum

RUTAS = ["BOG-MDE", "MDE-BOG", "BOG-CLO", "CLO-BOG", "BOG-CTG", "CTG-BOG"]
CIUDAD = {"BOG": "Bogotá", "MDE": "Medellín", "CLO": "Cali", "CTG": "Cartagena"}
INICIO, FIN = date(2026, 12, 1), date(2027, 1, 31)
HORA_IDA, HORA_REGRESO = "12:30", "18:45"  # la lista del chat muestra varios horarios; la prueba siempre elige estos dos
FILAS_EXIT = {13, 14}
MIN_LIBRES = 14  # asientos libres por tramo para que quepan los tres escenarios


def titulo_ruta(ruta: str) -> str:
    """Titulo de la opcion de la lista de destinos (el agente lo traduce a ruta_id)."""
    a, b = ruta.split("-")
    return f"{CIUDAD[a]} → {CIUDAD[b]}"


@dataclass
class Viaje:
    ruta_ida: str
    fecha_ida: str
    ruta_regreso: str
    fecha_regreso: str
    hora_ida: str = HORA_IDA
    hora_regreso: str = HORA_REGRESO

    @staticmethod
    def _id(ruta: str, fecha: str, hora: str) -> str:
        return ruta.replace("-", "").lower() + fecha.replace("-", "") + ("" if hora == "07:00" else hora.replace(":", ""))

    @property
    def vuelo_ida(self) -> str:
        return self._id(self.ruta_ida, self.fecha_ida, self.hora_ida)

    @property
    def vuelo_regreso(self) -> str:
        return self._id(self.ruta_regreso, self.fecha_regreso, self.hora_regreso)


@dataclass
class Pasajero:
    nombre: str
    documento: str
    edad: int
    asiento_ida: str = ""
    asiento_regreso: str = ""
    bodega: tuple[int, int, int, int] | None = None  # largo, ancho, alto (cm), peso (kg)
    bodega_tramo: str = "Solo ida"  # boton que elige: Solo ida | Solo regreso | Ida y regreso


@dataclass
class Mascota:
    especie: str
    peso_kg: int
    dueno: int  # indice del pasajero
    tramo: str = "Ida"  # boton que elige: Ida | Regreso


@dataclass
class Escenario:
    nombre: str
    viaje: Viaje
    pasajeros: list[Pasajero] = field(default_factory=list)
    equipaje: str = "Solo cabina"  # Solo cabina | Cabina y bodega | Solo bodega
    mascota: Mascota | None = None
    pago: str = "aprobar"  # aprobar | rechazar
    errores: dict = field(default_factory=dict)  # entradas invalidas a probar (flujo por mal)


def _estado(vuelo: dict, asiento: str) -> str:
    return vuelo["mapa_asientos"].get(asiento, {}).get("estado", "")


def libres(vuelo: dict, n: int, excluir: set[str] = frozenset()) -> list[str]:
    """n asientos LIBRES contiguos en una fila Economy que no sea salida de emergencia."""
    filas = [f for f in range(8, 31) if f not in FILAS_EXIT]
    random.shuffle(filas)
    for f in filas:
        ok = [f"{f}{l}" for l in "ABCDEF" if _estado(vuelo, f"{f}{l}") == "LIBRE" and f"{f}{l}" not in excluir]
        if len(ok) >= n:
            return ok[:n]
    raise RuntimeError(f"Sin {n} asientos libres juntos en {vuelo.get('id')}")


def ocupado(vuelo: dict) -> str | None:
    """Un asiento VENDIDO o RETENIDO del vuelo (para el flujo por mal), si existe."""
    for a, v in vuelo["mapa_asientos"].items():
        if v.get("estado") in ("VENDIDO", "RETENIDO"):
            return a
    return None


def elegir_viaje(fk: Faker, datum: Datum) -> Viaje:
    """Un trayecto de ida y vuelta con vuelos y asientos suficientes; se reutiliza en todos los escenarios."""
    for _ in range(60):
        ruta = random.choice(RUTAS)
        a, b = ruta.split("-")
        f_ida = fk.date_between(INICIO, FIN - timedelta(days=8))
        f_reg = f_ida + timedelta(days=random.randint(2, 7))
        v_ida = datum.vuelo(ruta, f_ida.isoformat(), HORA_IDA)
        v_reg = datum.vuelo(f"{b}-{a}", f_reg.isoformat(), HORA_REGRESO)
        if not v_ida or not v_reg:
            continue
        n_ida = sum(1 for x in v_ida["mapa_asientos"].values() if x.get("estado") == "LIBRE")
        n_reg = sum(1 for x in v_reg["mapa_asientos"].values() if x.get("estado") == "LIBRE")
        if min(n_ida, n_reg) >= MIN_LIBRES:
            return Viaje(ruta, f_ida.isoformat(), f"{b}-{a}", f_reg.isoformat())
    raise RuntimeError("No se encontraron vuelos con asientos libres en Datum")


def _pasajeros(fk: Faker, datum: Datum, v: Viaje, n: int) -> list[Pasajero]:
    # Asientos frescos de Datum: respetan lo que dejaron los escenarios anteriores.
    s_ida = libres(datum.vuelo(v.ruta_ida, v.fecha_ida, v.hora_ida), n)
    s_reg = libres(datum.vuelo(v.ruta_regreso, v.fecha_regreso, v.hora_regreso), n)
    return [
        Pasajero(fk.name(), fk.numerify("##########"), random.randint(18, 60), s_ida[i], s_reg[i])
        for i in range(n)
    ]


def _maleta() -> tuple[int, int, int, int]:
    return random.randint(40, 60), random.randint(30, 40), random.randint(20, 30), random.randint(8, 20)


def una_persona(fk: Faker, datum: Datum, v: Viaje) -> Escenario:
    """1 pasajero: 'Cabina y bodega' (pide medidas directo) y mascota. Pago aprobado."""
    e = Escenario("una_persona", v, _pasajeros(fk, datum, v, 1), "Cabina y bodega", pago="aprobar")
    e.pasajeros[0].bodega = _maleta()
    e.mascota = Mascota("Perro", random.randint(3, 7), 0)
    return e


def varias_personas(fk: Faker, datum: Datum, v: Viaje) -> Escenario:
    """3 pasajeros, una maleta por tramo distinto: 1 de bodega en la ida, 2 en el regreso, y una mascota que viaja de regreso. Pago aprobado."""
    e = Escenario("varias_personas", v, _pasajeros(fk, datum, v, 3), "Cabina y bodega", pago="aprobar")
    tramos = ["Solo ida", "Solo regreso", "Solo regreso"]
    random.shuffle(tramos)
    for p, t in zip(e.pasajeros, tramos):
        p.bodega, p.bodega_tramo = _maleta(), t
    e.mascota = Mascota("Perro", random.randint(3, 7), random.randrange(3), "Regreso")
    return e


def flujo_por_mal(fk: Faker, datum: Datum, v: Viaje) -> Escenario:
    """2 pasajeros con entradas invalidas (asiento ocupado, maleta fuera de limites, mascota pesada) y pago RECHAZADO."""
    e = Escenario("flujo_por_mal", v, _pasajeros(fk, datum, v, 2), "Solo bodega", pago="rechazar")
    e.pasajeros[0].bodega = _maleta()
    ida = datum.vuelo(v.ruta_ida, v.fecha_ida, v.hora_ida)
    e.errores = {
        "asiento_ocupado": ocupado(ida) or "99Z",  # sin ocupados aun: un asiento que no existe en el mapa
        "bodega_excedida": (120, 80, 80, 45),
        "mascota_pesada": 25,
    }
    e.mascota = Mascota("Gato", random.randint(3, 7), 0)
    return e
