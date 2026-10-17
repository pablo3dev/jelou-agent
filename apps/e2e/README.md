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

Video: `E2E_VIDEO=true` graba un video por pestaña en `artifacts/<escenario>/video/NN_<pestaña>.webm`. Cada pestaña (WhatsApp, widget de asientos, pasarela y cada vista del CRM) se abre al usarla y se cierra al terminar, así cada video es corto. Requiere el `ffmpeg` de Playwright (una sola vez, ~1,3 MB; sin él Chrome se cierra al abrir con video):

```sh
uv run playwright install ffmpeg
```

Requiere que el agente publicado use la herramienta nativa «Buttons and list» (ver `apps/agent/workflow/agent.prompt.md`).

## Prevalidación (antes de gastar mensajes)

Al inicio de la sesión, antes de abrir WhatsApp, la prueba llama a cada function con el mismo cuerpo y cabecera que usan las tools del agente (`e2e/preflight.py`): Datum con datos, `rutas-listar`, `vuelos-buscar` (con `mapa_url`), `equipaje-calcular`, `cotizar` y, con entradas inválidas, `asientos-validar-retener` y `transaccion-crear` (esperan un error de negocio, nunca 401/5xx; no escribe nada). Si algo falla, aborta sin enviar un solo mensaje. También se puede correr sola: `uv run python -m e2e.preflight`.

Limitación: no valida que la tool resuelva su secreto (`{{$secret.JELOU_FN_TOKEN}}`); eso solo se prueba con el agente real. Si el agente responde «error de autorización», la prueba se detiene en ese paso (`AssertionError`) en lugar de gastar mensajes en un bucle.

## Borrar el chat entre corridas

Para empezar de cero, elimina el chat en WhatsApp Web con el perfil del e2e:

```sh
uv run python -m e2e.abrir_chat
```

Abre Chrome (perfil `.profile/`) en el chat del agente: menú ⋮ → **Eliminar chat** y cierra la ventana. Ojo: eso no borra la memoria de la conversación en Jelou; el agente puede recordar la ruta de la corrida anterior en el primer mensaje.

## Errores frecuentes

| Síntoma | Causa y solución |
|---------|------------------|
| `Cooldown anti-bloqueo: espera N s` | Pasaron menos de `E2E_COOLDOWN_MIN` minutos desde la última corrida; se descuenta aunque haya fallado. Espera. |
| `Connection closed while reading from the driver` al abrir Chrome | Falta `ffmpeg` y `E2E_VIDEO=true`; ver Video. |
| `UnicodeEncodeError` al redirigir la salida a un archivo | La consola de Windows usa cp1252; `tests/conftest.py` fuerza UTF-8. |
| `WinError 10051` hacia Datum | Corte de red momentáneo; el cliente reintenta la conexión 3 veces. |
| El agente responde «error de autorización» | Las tools envían un secreto que la function rechaza (`401 Invalid API key`); revisa el secreto `JELOU_FN_TOKEN` de la organización. |

## Riesgo con WhatsApp

WhatsApp prohíbe clientes automatizados no oficiales; el riesgo de restricción de la cuenta existe aunque el volumen sea bajo. Mitigaciones incluidas: perfil dedicado, tipeo con retardo, pausas de 3 s, tope de mensajes por corrida (`E2E_MAX_MENSAJES`), cooldown entre corridas (`E2E_COOLDOWN_MIN`) y un solo escenario por corrida. Usa un número de pruebas, no tu cuenta principal.
