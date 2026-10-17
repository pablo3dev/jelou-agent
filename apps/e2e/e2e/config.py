import os
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
# Datum (DATUM_URL, DATUM_API_KEY) se lee del .env de infrastructure; el .env local sobreescribe.
_proceso = dict(os.environ)  # lo exportado en el shell manda sobre cualquier .env
load_dotenv(RAIZ.parent / "infrastructure" / ".env")
load_dotenv(RAIZ / ".env", override=True)
os.environ.update(_proceso)


def env(nombre: str, defecto: str = "") -> str:
    return os.environ.get(nombre, defecto) or defecto


DATUM_URL = env("DATUM_URL").rstrip("/")
DATUM_API_KEY = env("DATUM_API_KEY")
CRM_URL = env("CRM_URL", "http://127.0.0.1:3000").rstrip("/")
PAY_URL = env("PAY_URL", "http://127.0.0.1:3001").rstrip("/")
WA_PHONE = "".join(c for c in env("WA_AGENT_PHONE") if c.isdigit())
SEED = env("E2E_SEED", "2026")  # datos fijos entre corridas: el agente no ve informacion distinta cada vez
VIDEO = env("E2E_VIDEO", "false").lower() == "true"  # un video por pestana en artifacts/<escenario>/video/
VIDEO_ALTO = int(env("E2E_VIDEO_ALTO", "1080"))  # 1080 (1920x1080) o 720 (1280x720)
PAUSA_S = float(env("E2E_PAUSA_S", "1"))
MAX_MENSAJES = int(env("E2E_MAX_MENSAJES", "45"))
COOLDOWN_MIN = int(env("E2E_COOLDOWN_MIN", "10"))
PERFIL = RAIZ / ".profile"
ESTADO = RAIZ / ".state"
ARTEFACTOS = RAIZ / "artifacts"
