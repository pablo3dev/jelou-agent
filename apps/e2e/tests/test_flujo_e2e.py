"""Tres escenarios de la reserva por WhatsApp con selectores (listas y botones), en este orden y sobre el mismo vuelo:

1. una persona   - Cabina y bodega (medidas directas) + mascota (Si/No); pago aprobado.
2. varias personas - lista de nombres para elegir quienes llevan bodega; pago aprobado.
3. flujo por mal - asiento ocupado, maleta y mascota fuera de limites; pago rechazado (asientos liberados).

Cada escenario cierra mostrando el mapa de asientos del CRM de ese vuelo: ocupados (VENDIDO) y libres.
Ejecutar uno: `uv run pytest -k una_persona`. Los tres: `uv run pytest` (cooldown anti-bloqueo solo al inicio).
"""
import pytest

from e2e import datos
from e2e.flujo import ejecutar


@pytest.mark.wa
@pytest.mark.parametrize("fabrica", [datos.una_persona, datos.varias_personas, datos.flujo_por_mal],
                         ids=["una_persona", "varias_personas", "flujo_por_mal"])
def test_reserva_pago_crm(fabrica, datum, fk, viaje, ctx):
    esc = fabrica(fk, datum, viaje)
    print("\nEscenario:", esc)
    ejecutar(ctx, datum, esc)
