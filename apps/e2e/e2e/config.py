import os
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
# Datum (DATUM_URL, DATUM_API_KEY) se lee del .env de infrastructure; el .env local sobreescribe.
load_dotenv(RAIZ.parent / "infrastructure" / ".env")
load_dotenv(RAIZ / ".env", override=True)


def env(nombre: str, defecto: str = "") -> str:
    return os.environ.get(nombre, defecto) or defecto


DATUM_URL = env("DATUM_URL").rstrip("/")
DATUM_API_KEY = env("DATUM_API_KEY")
CRM_URL = env("CRM_URL", "http://127.0.0.1:3000").rstrip("/")
PAY_URL = env("PAY_URL", "http://127.0.0.1:3001").rstrip("/")
WA_PHONE = "".join(c for c in env("WA_AGENT_PHONE") if c.isdigit())
ESCENARIO = env("E2E_ESCENARIO", "aprobar")
SEED = env("E2E_SEED")
BODEGA = env("E2E_BODEGA", "true").lower() == "true"
PAUSA_S = float(env("E2E_PAUSA_S", "3"))
MAX_MENSAJES = int(env("E2E_MAX_MENSAJES", "30"))
COOLDOWN_MIN = int(env("E2E_COOLDOWN_MIN", "10"))
PERFIL = RAIZ / ".profile"
ESTADO = RAIZ / ".state"
ARTEFACTOS = RAIZ / "artifacts"
