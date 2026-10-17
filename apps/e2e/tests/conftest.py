import random

import pytest
from faker import Faker
from playwright.sync_api import sync_playwright

from e2e import config
from e2e.datum import Datum


@pytest.fixture(scope="session")
def datum():
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
        c = p.chromium.launch_persistent_context(
            str(config.PERFIL), channel="chrome", headless=False, no_viewport=True,
            args=["--start-maximized"],
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


@pytest.fixture(scope="session")
def paginas(ctx):
    """Pestanas abiertas desde el inicio: WhatsApp, pasarela y las 4 vistas del CRM."""
    from e2e.flujo import VISTAS_CRM

    wa = ctx.pages[0] if ctx.pages else ctx.new_page()
    crm = {}
    for vista in VISTAS_CRM:
        crm[vista] = ctx.new_page()
        crm[vista].goto(f"{config.CRM_URL}/#/{vista}")
    pay = ctx.new_page()
    pay.goto(f"{config.PAY_URL}/health")
    return wa, crm, pay
