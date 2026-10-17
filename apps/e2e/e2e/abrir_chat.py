"""Abre WhatsApp Web (perfil del e2e) en el chat del agente y espera a que cierres la ventana. Para borrar el chat a mano."""
from playwright.sync_api import sync_playwright

from . import config

with sync_playwright() as p:
    c = p.chromium.launch_persistent_context(str(config.PERFIL), channel="chrome", headless=False, no_viewport=True, args=["--start-maximized"])
    pg = c.pages[0] if c.pages else c.new_page()
    pg.goto(f"https://web.whatsapp.com/send?phone={config.WA_PHONE}", wait_until="domcontentloaded")
    print("Chrome abierto en el chat. Elimina el chat (menu ⋮ > Eliminar chat) y cierra la ventana.")
    pg.wait_for_event("close", timeout=0)
    c.close()
