"""Datos dinamicos del escenario: nada hardcodeado, todo sale de Faker + Datum."""
import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from .datum import Datum

RUTAS = ["BOG-MDE", "MDE-BOG", "BOG-CLO", "CLO-BOG", "BOG-CTG", "CTG-BOG"]
INICIO, FIN = date(2026, 12, 1), date(2027, 1, 31)
FILAS_EXIT = {13, 14}


@dataclass
class Pasajero:
    nombre: str
    documento: str
    edad: int
    asiento_ida: str = ""
    asiento_regreso: str = ""
    bodega: tuple[int, int, int, int] | None = None  # largo, ancho, alto (cm), peso (kg)


@dataclass
class Escenario:
    ruta_ida: str
    fecha_ida: str
    ruta_regreso: str
    fecha_regreso: str
    pasajeros: list[Pasajero] = field(default_factory=list)


def _libres(vuelo: dict, n: int) -> list[str] | None:
    """n asientos LIBRES contiguos en una fila Economy que no sea salida de emergencia."""
    mapa = vuelo["mapa_asientos"]
    filas = list(range(8, 31))
    random.shuffle(filas)
    for f in filas:
        if f in FILAS_EXIT:
            continue
        libres = [f"{f}{l}" for l in "ABCDEF" if mapa.get(f"{f}{l}", {}).get("estado") == "LIBRE"]
        if len(libres) >= n:
            return libres[:n]
    return None


def generar(fk: Faker, datum: Datum, con_bodega: bool) -> Escenario:
    n = random.randint(1, 2)
    for _ in range(40):
        ruta = random.choice(RUTAS)
        a, b = ruta.split("-")
        regreso = f"{b}-{a}"
        f_ida = fk.date_between(INICIO, FIN - timedelta(days=8))
        f_reg = f_ida + timedelta(days=random.randint(2, 7))
        v_ida = datum.vuelo(ruta, f_ida.isoformat())
        v_reg = datum.vuelo(regreso, f_reg.isoformat())
        if not v_ida or not v_reg:
            continue
        s_ida, s_reg = _libres(v_ida, n), _libres(v_reg, n)
        if not s_ida or not s_reg:
            continue
        pas = []
        for i in range(n):
            p = Pasajero(
                nombre=fk.name(),
                documento=fk.numerify("##########"),
                edad=random.randint(18, 60),
                asiento_ida=s_ida[i],
                asiento_regreso=s_reg[i],
            )
            if con_bodega and i == 0:
                p.bodega = (random.randint(40, 60), random.randint(30, 40), random.randint(20, 30), random.randint(8, 20))
            pas.append(p)
        return Escenario(ruta, f_ida.isoformat(), regreso, f_reg.isoformat(), pas)
    raise RuntimeError("No se encontraron vuelos con asientos libres en Datum")
