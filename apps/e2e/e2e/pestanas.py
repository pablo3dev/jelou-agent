"""Pestanas de vida corta: cada una se abre cuando se va a usar y se cierra al terminar.

Con E2E_VIDEO=true Playwright graba un video por pestana; como la pestana solo vive mientras se usa, cada
video es corto. Al cerrar se guarda en artifacts/<escenario>/video/NN_<nombre>.webm.
"""
from contextlib import contextmanager

from . import config


class Pestanas:
    def __init__(self, ctx, escenario: str) -> None:
        self.ctx = ctx
        self.dir = config.ARTEFACTOS / escenario / "video"
        self.n = 0

    @contextmanager
    def abrir(self, nombre: str):
        self.n += 1
        pg = self.ctx.new_page()
        try:
            yield pg
        finally:
            video = pg.video if config.VIDEO else None
            pg.close()  # el video se escribe al cerrar la pestana
            if video:
                self.dir.mkdir(parents=True, exist_ok=True)
                destino = self.dir / f"{self.n:02d}_{nombre}.webm"
                video.save_as(str(destino))
                video.delete()  # quita la copia con nombre aleatorio del directorio de grabacion
                print(f"  [video] {destino.relative_to(config.RAIZ)}")
