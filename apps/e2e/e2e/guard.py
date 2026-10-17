"""Salvaguardas anti-bloqueo de WhatsApp: cooldown entre corridas y tope de mensajes."""
import time

from .config import COOLDOWN_MIN, ESTADO, MAX_MENSAJES

_ULTIMA = ESTADO / "ultima_corrida"


def verificar_cooldown() -> None:
    if _ULTIMA.exists():
        espera = COOLDOWN_MIN * 60 - (time.time() - float(_ULTIMA.read_text()))
        if espera > 0:
            raise RuntimeError(f"Cooldown anti-bloqueo: espera {int(espera)} s antes de otra corrida con WhatsApp real")
    ESTADO.mkdir(exist_ok=True)
    _ULTIMA.write_text(str(time.time()))


class Contador:
    def __init__(self) -> None:
        self.enviados = 0

    def tick(self) -> None:
        self.enviados += 1
        if self.enviados > MAX_MENSAJES:
            raise RuntimeError(f"Tope de {MAX_MENSAJES} mensajes por corrida superado (anti-bloqueo)")
