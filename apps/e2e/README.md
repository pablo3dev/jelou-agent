# e2e — prueba de extremo a extremo (WhatsApp → pago → CRM)

Python + `uv` + Playwright (Chrome real, perfil propio) + Faker (es_CO). Los datos del escenario (ruta, fechas, pasajeros, documentos, asientos libres, medidas de bodega) se generan en cada corrida; los vuelos y asientos se consultan en Datum. Al final se verifica en Datum el estado de transacción, reserva y asientos.

Es una unidad `host-native` (usa Chrome del host con WhatsApp Web), excepción a la contenedorización.

## Uso

```sh
cp .env.example .env   # define WA_AGENT_PHONE
docker compose -f ../infrastructure/compose.yaml up -d crm pay
uv sync
uv run pytest
```

La primera vez se abre Chrome con el perfil `.profile/` (propio, gitignoreado): escanea el QR de WhatsApp Web; la prueba espera hasta 5 min. Las siguientes corridas reutilizan la sesión. Abre en pestañas WhatsApp, pasarela y las 4 vistas del CRM. Pausa de 3 s (`E2E_PAUSA_S`) tras cada acción y tras cada respuesta del chat. Capturas en `artifacts/`.

## Escenarios

Los tres comparten el mismo vuelo de ida y de regreso (se elige una vez por sesión), con asientos distintos en cada uno; al cerrar cada escenario el CRM muestra el mapa de ese vuelo con los asientos ocupados y libres acumulados.

| Escenario | Qué recorre | Pago |
|-----------|-------------|------|
| `una_persona` | lista de destino y de pasajeros, botones ida y vuelta, vuelos en lista, equipaje «Cabina y bodega» (medidas directas), mascota Sí/No | aprobado |
| `varias_personas` | 3 pasajeros: lista de nombres para elegir quién lleva bodega, medidas por persona, sin mascota | aprobado |
| `flujo_por_mal` | asiento ocupado, maleta fuera de límites y mascota de más de 8 kg (el agente debe rechazar y pedir de nuevo) | rechazado: asientos liberados |

`uv run pytest` corre los tres en ese orden; uno solo: `uv run pytest -k una_persona`. Cada paso se anuncia en consola (`PASO n`) y deja captura numerada en `artifacts/<escenario>/`. Selección de botones y listas: el driver toca el control de WhatsApp Web y, si no lo encuentra, escribe el título de la opción (es lo mismo que recibe el agente). Repetir una corrida: `E2E_SEED=123`.

Asientos: el agente comparte el enlace del selector del CRM (`#/asientos/<vuelo>/<n>`, requiere `CRM_PUBLIC_URL` en las functions). La prueba lo abre en otra pestaña, elige asientos, quita uno de prueba, pulsa «Copiar asientos» y pega el texto copiado en el chat (el contexto del navegador recibe permiso de portapapeles).

Recorrido por el CRM al cerrar cada escenario: resumen (modo claro/oscuro, idioma y scroll), vuelos (scroll y filtro por la ruta), mapa (vuelo de la reserva y scroll), ventas (2 s, scroll y clic en el vuelo para abrir su mapa).

Requiere que el agente publicado use la herramienta nativa «Buttons and list» (ver `apps/agent/workflow/agent.prompt.md`).

## Riesgo con WhatsApp

WhatsApp prohíbe clientes automatizados no oficiales; el riesgo de restricción de la cuenta existe aunque el volumen sea bajo. Mitigaciones incluidas: perfil dedicado, tipeo con retardo, pausas de 3 s, tope de mensajes por corrida (`E2E_MAX_MENSAJES`), cooldown entre corridas (`E2E_COOLDOWN_MIN`) y un solo escenario por corrida. Usa un número de pruebas, no tu cuenta principal.
