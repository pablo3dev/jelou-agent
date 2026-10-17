# hmac-probe

Probe de `ctx.verifyHmac` (GAP-13). Sin `.env`: el valor de prueba del secreto es `PAY_WEBHOOK_SECRET=probe-secret-123` (solo para este probe).

Correr en el contenedor del CLI (requiere `unzip` en la imagen; el primer arranque descarga Deno, ~40 s). Ajusta el nombre de la imagen al de apps/infrastructure:

    MSYS_NO_PATHCONV=1 docker run --rm -it -p 8000:8000 -e JELOU_TOKEN -e PAY_WEBHOOK_SECRET=probe-secret-123 -v "$PWD/apps/agent/spike/hmac-probe:/workspace" <imagen-agent-cli> functions dev

Firma de prueba (HMAC-SHA256 hex del cuerpo crudo, con el prefijo `sha256=`):

    BODY='{"a": 1}'
    SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac probe-secret-123 -hex | sed 's/^.* //')
    curl -s -X POST http://localhost:8000/hmac-probe -H "x-webhook-signature: sha256=$SIG" -d "$BODY"

Esperado: firma valida => `ok: true`; cuerpo alterado o firma sin el prefijo `sha256=` => `invalid_signature`/`malformed_signature`.
