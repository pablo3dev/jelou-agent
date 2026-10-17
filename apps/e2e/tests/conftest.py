import random
import sys

import pytest
from faker import Faker
from playwright.sync_api import sync_playwright

from e2e import config, preflight
from e2e.datum import Datum

# Los textos de WhatsApp llevan flechas y tildes: la salida redirigida a archivo en Windows usa cp1252.
for _f in (sys.stdout, sys.stderr):
    _f.reconfigure(encoding="utf-8", errors="replace")


@pytest.fixture(scope="session")
def datum():
    preflight.ejecutar()  # valida las functions antes de gastar un solo mensaje de WhatsApp
    return Datum()


@pytest.fixture(scope="session")
def fk():
    f = Faker("es_CO")
    if config.SEED:
        Faker.seed(int(config.SEED))
        random.seed(int(config.SEED))
    return f


@pytest.fixture(scope="session")
def ctx():
    """Chrome real con perfil propio persistente (la sesion de WhatsApp Web queda guardada tras el primer QR)."""
    config.PERFIL.mkdir(exist_ok=True)
    config.ARTEFACTOS.mkdir(exist_ok=True)
    with sync_playwright() as p:
        video = {"record_video_dir": str(config.ARTEFACTOS / "_grabacion"), "record_video_size": {"width": 1280, "height": 720}} if config.VIDEO else {}
        c = p.chromium.launch_persistent_context(
            str(config.PERFIL), channel="chrome", headless=False, no_viewport=True,
            args=["--start-maximized"], **video,
        )
        c.set_default_timeout(15000)
        yield c
        c.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Si falla, deja captura de cada pestana y el texto visible de WhatsApp como evidencia."""
    out = yield
    rep = out.get_result()
    if rep.when == "call" and rep.failed and "ctx" in item.funcargs:
        for i, pg in enumerate(item.funcargs["ctx"].pages):
            try:
                pg.screenshot(path=str(config.ARTEFACTOS / f"fallo_{i}.png"))
                if "whatsapp" in pg.url:
                    (config.ARTEFACTOS / "fallo_wa.txt").write_text(pg.locator("body").inner_text(), encoding="utf-8")
            except Exception:
                pass


@pytest.fixture(scope="session")
def viaje(datum, fk):
    """Un unico vuelo de ida y de regreso para todos los escenarios: el mapa del CRM acumula ocupados y libres."""
    from e2e import guard
    from e2e.datos import elegir_viaje

    assert config.WA_PHONE, "Define WA_AGENT_PHONE en apps/e2e/.env"
    guard.verificar_cooldown()  # una vez por sesion, no por escenario
    v = elegir_viaje(fk, datum)
    print("\nViaje compartido por los escenarios:", v)
    return v
