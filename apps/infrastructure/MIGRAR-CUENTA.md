# Replicar el proyecto en otra cuenta de Jelou

Guía para recrear `aerolinea-reservas-whatsapp` en una cuenta nueva (por ejemplo, si se agotan los créditos de la actual). Todo el CLI corre en el contenedor, desde `apps/infrastructure`:

```sh
export MSYS_NO_PATHCONV=1   # Git Bash en Windows
docker compose --profile tools run --rm -T agent-cli <comando> --agent
# Para el brain o las functions: añade -C /workspace/brain  o  -C /workspace/functions
```

`<comando> --help` y `--describe` muestran las opciones exactas de cada subcomando.

## Datos que pide la cuenta nueva

| Dato | Para qué |
|---|---|
| Token del CLI (`sk_...`) | `JELOU_TOKEN` y `JELOU_API_KEY` en `apps/infrastructure/.env` |
| ID del proyecto (brain) | `JELOU_PROJECT_ID`, `apps/agent/brain/jelou.yml` |
| ID y teléfono del canal de WhatsApp | `WA_AGENT_PHONE` en `apps/e2e/.env` |
| Teléfono de prueba, agregado como tester del canal | chat del e2e |

Antes de empezar, guarda el `.env` actual (`.env` está en `.gitignore`).

## Pasos (en este orden)

1. **Contexto**: `context` confirma organización y proyecto de la cuenta.
2. **Datum**: `databases create`, luego `databases show` para el slug y `databases api-keys` para la llave. Anota en `.env`: `DATABASE_ID`, `DATABASE_SLUG`, `DATUM_API_KEY` y `DATUM_URL`.
   - `DATUM_URL` es `https://<slug>.jelou.cloud/api`. La URL del gateway devuelve 401 con esa llave.
3. **Migraciones y seed**: `apps/agent/migrations/apply.sh` y `apps/agent/seed` (usa `--entrypoint bash` para correr scripts; el entrypoint normal ya es `jelou`). Verifica 6 rutas y vuelos sembrados.
4. **Functions**: `functions create` (nombre `aerolinea-reservas`), actualiza `apps/agent/functions/jelou.json`, `functions deploy`. Si falla con `BUILD_FAILED`, es de la plataforma: reintenta. Carga las variables de las functions con `functions secrets set`: `DATUM_URL`, `DATUM_API_KEY`, `CRM_PUBLIC_URL`, etc. `functions invoke-key ensure` crea la llave de invocación.
   - La URL de las functions cambia en cada cuenta (`https://<nombre>-<sufijo>.fn.jelou.ai`). Actualízala en `PAGO_NOTIFICACION_URL`, `.env.example`, `apps/agent/workflow/generar-brain.mjs` y `generar-tools.mjs`, y en los 6 JSON de `apps/agent/brain/tools/`.
5. **Secreto de las tools**: las tools mandan `Authorization: Bearer {{$secret.JELOU_FN_TOKEN}}`. Crea ese secreto con `secret set` a nivel de **organización** (company). Los secretos de proyecto o brain no los ven las tools. Las functions tienen su propio almacén de secretos.
6. **Brain**: ajusta `apps/agent/brain/jelou.yml` (brain y organización) y borra `jelou.lock` para que se regenere. Usa el workflow `workflows/mi-primer-workflow.whatsapp.json`.
7. **Tools**: `tool create --name <slug> --brain <id>` para cada una de las 6 (`asientos-validar-retener`, `cotizar`, `equipaje-calcular`, `rutas-listar`, `transaccion-crear`, `vuelos-buscar`). Copia el contenido de cada JSON a la tool creada (conserva el `toolId`/`workflowId` nuevos) y súbela con `tool push <slug> --yes`.
   - Si `tool create` genera slugs con sufijo `-2`, renombra archivos y claves del lock al slug sin sufijo.
8. **Publicar cada tool en 1.0.0**: `tool publish <slug> --version 1.0.0` (sin `--yes`).
9. **Apuntar el agente a las tools nuevas**: en `mi-primer-workflow.whatsapp.json`, cada entrada de `connections.tools` (y su `inputs[].toolId`) debe llevar el `toolId` de la cuenta nueva (`tool list`). Mantén `"version": "1.0.0"`.
10. **Subir y publicar**: `push -C /workspace/brain --yes` y `project publish <brain-id> --commit-name "<etiqueta>" --yes`. El push solo escribe el borrador; el canal sirve el último commit publicado.
11. **Validar sin gastar mensajes**: `cd apps/e2e && uv run python -m e2e.preflight` (llama a las functions con el mismo cuerpo y cabecera que las tools; no usa WhatsApp ni IA).
12. **Prueba real**: un solo mensaje por WhatsApp y revisar el consumo antes de correr los 3 escenarios (ver `apps/e2e/README.md`).

## Errores que ya ocurrieron

| Síntoma | Causa y arreglo |
|---|---|
| `401 Invalid API key` desde la tool | El agente ejecutaba tools viejas (con la URL y el secreto de la cuenta anterior). Revisa que los `toolId` del workflow sean los de la cuenta nueva. Diagnóstico: `logs failed` y `logs node --execution-id <id> --node-id <nodeExecutionId>` muestran la URL y la cabecera usadas. |
| El agente dice «problema en nuestro sistema» y `logs chat --user-id <tel> --type execution` no muestra ejecuciones de la tool | La versión `1.0.0` que referencia el agente no está publicada: `tool versions <slug>` sale vacío. Paso 8 y republicar (paso 10). |
| El agente retoma la reserva anterior | La memoria (`messageHistory`, 15 mensajes) es por usuario y borrar el chat de WhatsApp no la limpia. El prompt (reglas 10 y 11) ordena iniciar flujo nuevo ante «quiero reservar» y volver a llamar a las tools. |
| `jelou` no se reconoce dentro del contenedor | El entrypoint ya es `jelou`; para scripts usa `--entrypoint bash`. |
| Python en Windows no lee `/c/...` | Usa `C:/...`. |

## Costos de referencia (cuenta nueva)

- Cada ejecución de workflow cuesta unos 0,02 USD y domina el costo con el modelo del agente `claude-haiku-5.5`.
- La base de datos Datum NANO cuesta unos 7,50 USD al mes: bórrala si no se usa.
- Un solo escenario por corrida y la prevalidación evitan gastar mensajes (ver `apps/e2e/README.md`).

## Seguridad

- El token del CLI no se guarda en el repo. Si se pegó en un chat, rótalo al terminar y actualiza el secreto `JELOU_FN_TOKEN`.
- Elimina secretos que ya no se usen (por ejemplo, `JELOU_FN_INVOKE_KEY`).
