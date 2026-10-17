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

Repetir una corrida: `E2E_SEED=123`. Rechazo de pago: `E2E_ESCENARIO=rechazar`.

## Riesgo con WhatsApp

WhatsApp prohíbe clientes automatizados no oficiales; el riesgo de restricción de la cuenta existe aunque el volumen sea bajo. Mitigaciones incluidas: perfil dedicado, tipeo con retardo, pausas de 3 s, tope de mensajes por corrida (`E2E_MAX_MENSAJES`), cooldown entre corridas (`E2E_COOLDOWN_MIN`) y un solo escenario por corrida. Usa un número de pruebas, no tu cuenta principal.
