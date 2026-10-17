"""Driver minimo de WhatsApp Web. Escribe como una persona: pausa fija tras cada accion."""
import random
import re
import time

from playwright.sync_api import Page

from .config import ARTEFACTOS, PAUSA_S, WA_PHONE
from .guard import Contador

ENTRADA = 'footer div[contenteditable="true"]'


def pausa() -> None:
    time.sleep(PAUSA_S)


class Chat:
    def __init__(self, page: Page) -> None:
        self.page = page
        self.cuenta = Contador()

    def abrir(self, espera_login_s: int = 300) -> None:
        self.page.goto(f"https://web.whatsapp.com/send?phone={WA_PHONE}", wait_until="domcontentloaded")
        # Sin sesion aparece el QR: se espera a que el usuario inicie sesion en este perfil.
        self.page.locator(ENTRADA).wait_for(state="visible", timeout=espera_login_s * 1000)
        pausa()
        self.cerrar_avisos()

    def cerrar_avisos(self) -> None:
        """Avisos/modales de WhatsApp (p. ej. 'servicio seguro de Meta'): se registran y se aceptan."""
        for d in self.page.locator('div[role="dialog"]').all():
            try:
                txt = d.inner_text(timeout=2000)
                print("[aviso WhatsApp]", " | ".join(txt.splitlines()))
                self.page.screenshot(path=str(ARTEFACTOS / "aviso_whatsapp.png"))
                d.locator("button").last.click(timeout=3000)
                pausa()
            except Exception as e:
                print("[aviso WhatsApp] no se pudo cerrar:", e)

    def _entrantes(self) -> list[str]:
        """Mensajes del bot posteriores a mi ultimo mensaje enviado (el historial cargado varia, por eso no se cuenta el total).

        El DOM actual no marca la direccion con clases: el emisor va en data-pre-plain-text ("[hora, fecha] Emisor: ").
        """
        titulo = self.page.locator('#main header span[dir="auto"]').first.inner_text()
        return self.page.locator("div.copyable-text[data-pre-plain-text]").evaluate_all(
            """(els, t) => {
                const msgs = els.map(e => ({
                    bot: e.getAttribute('data-pre-plain-text').trim().endsWith('] ' + t + ':'),
                    txt: [...e.querySelectorAll('[data-testid="selectable-text"]')].map(x => x.innerText).join(String.fromCharCode(10)),
                }));
                let ult = -1;
                msgs.forEach((m, i) => { if (!m.bot) ult = i; });
                return msgs.slice(ult + 1).map(m => m.txt);
            }""",
            titulo,
        )

    def contar(self) -> int:
        return len(self._entrantes())

    def enviar(self, texto: str) -> None:
        self.cuenta.tick()
        self.cerrar_avisos()
        self.page.locator(ENTRADA).click()
        # Shift+Enter entre renglones para no mandar varios mensajes.
        for i, linea in enumerate(texto.split("\n")):
            if i:
                self.page.keyboard.press("Shift+Enter")
            self.page.keyboard.type(linea, delay=random.randint(20, 60))
        self.page.keyboard.press("Enter")
        pausa()

    def esperar_respuesta(self, antes: int, timeout_s: int = 120) -> list[str]:
        """Espera mensajes nuevos del bot y a que dejen de llegar (PAUSA_S sin cambios)."""
        fin = time.time() + timeout_s
        while self.contar() <= antes:
            if time.time() > fin:
                raise TimeoutError("El agente no respondio")
            time.sleep(1)
        estable, ultimo = 0.0, self.contar()
        while estable < PAUSA_S and time.time() < fin:
            time.sleep(1)
            n = self.contar()
            estable = estable + 1 if n == ultimo else 0
            ultimo = n
        pausa()
        return self._entrantes()[antes:]

    def decir(self, texto: str) -> str:
        self.enviar(texto)  # tras enviar, _entrantes() solo ve lo posterior a este mensaje
        try:
            return "\n".join(self.esperar_respuesta(0, timeout_s=90))
        except TimeoutError:
            # El agente a veces deja un mensaje sin respuesta: se reenvia una sola vez.
            print("[sin respuesta; reenvio una vez]")
            self.enviar(texto)
            return "\n".join(self.esperar_respuesta(0))

    def elegir(self, opcion: str, prefijo: bool = False) -> str:
        """Selecciona una opcion de un mensaje interactivo (boton o lista) del ultimo mensaje del bot.

        Si el DOM de WhatsApp Web no ofrece el control, escribe el titulo de la opcion: es lo mismo que
        recibe el agente al tocar el control (el titulo), asi la prueba no depende de un selector fragil.
        """
        self.cuenta.tick()
        self.cerrar_avisos()
        via = self._tocar(opcion, prefijo)
        print(f"[seleccion: {opcion!r} via {via}]")
        pausa()
        try:
            return "\n".join(self.esperar_respuesta(0, timeout_s=90))
        except TimeoutError:
            print("[sin respuesta tras la seleccion; reenvio escrita una vez]")
            self.enviar(opcion)
            return "\n".join(self.esperar_respuesta(0))

    def _tocar(self, opcion: str, prefijo: bool = False) -> str:
        pg = self.page
        exacto = re.compile(rf"^\s*{re.escape(opcion)}" + ("" if prefijo else r"\s*$"), re.I)
        try:
            # Boton de respuesta rapida: control con el texto exacto en el area de mensajes.
            boton = pg.locator("#main [role='button']").filter(has_text=exacto).last
            if boton.count():
                boton.click(timeout=3000)
                return "boton"
            # Lista: el boton del mensaje abre un panel con las filas.
            abrir = pg.locator("#main [role='button']").filter(has_text=re.compile(r"ver opciones|opciones|seleccionar|view options|select", re.I)).last
            if abrir.count():
                abrir.click(timeout=3000)
                pausa()
                fila = pg.locator("div[role='dialog'] , [data-animate-modal-popup]").get_by_text(exacto).first
                fila.click(timeout=4000)
                pg.locator("div[role='dialog'] button, [data-animate-modal-popup] button").filter(has_text=re.compile(r"enviar|send", re.I)).last.click(timeout=4000)
                return "lista"
        except Exception as e:
            print("[no se pudo tocar el control:", type(e).__name__, "]")
            pg.keyboard.press("Escape")
        self.enviar(opcion)
        return "texto"
