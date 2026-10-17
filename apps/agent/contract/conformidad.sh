#!/usr/bin/env bash
# Conformidad db-design.dbml <-> colecciones reales de Datum. Sin imprimir secretos.
set -euo pipefail
export MSYS_NO_PATHCONV=1
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
wpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
ENV_FILE="$RAIZ/apps/infrastructure/.env"
CLI_IMAGE="${CLI_IMAGE:-jelou-cli:poc}"
NODE_IMAGE="node:24.22.0-bookworm-slim"
MASK='s/(sk|db)_[A-Za-z0-9_-]{6,}/\1_***/g'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
RAW="$TMP/raw"; OUT="$TMP/out"; mkdir -p "$RAW" "$OUT"

TABLAS=$(grep -oE '^Table +[a-z_]+' "$AQUI/db-design.dbml" | awk '{print $2}')
for t in $TABLAS; do
  docker run --rm --env-file "$(wpath "$ENV_FILE")" --entrypoint bash "$CLI_IMAGE" \
    -c "exec jelou databases collections show \"\$DATABASE_ID\" $t --json" > "$RAW/$t.json" 2> "$RAW/$t.err" \
    || { sed -E "$MASK" "$RAW/$t.err" >&2; echo "fallo al leer la coleccion $t" >&2; exit 2; }
done

# Desenvuelve {ok,data} -> data (un JSON por coleccion).
docker run --rm -v "$(wpath "$RAW"):/raw:ro" -v "$(wpath "$OUT"):/out" "$NODE_IMAGE" node -e '
const fs=require("fs");
for(const f of fs.readdirSync("/raw").filter(x=>x.endsWith(".json"))){
  const j=JSON.parse(fs.readFileSync("/raw/"+f,"utf8"));
  if(!j.ok||!j.data){console.error("respuesta no ok: "+f);process.exit(2);}
  fs.writeFileSync("/out/"+f,JSON.stringify(j.data));
}'

docker run --rm -v "$(wpath "$AQUI"):/c:ro" -v "$(wpath "$OUT"):/out:ro" "$NODE_IMAGE" node /c/conformidad.mjs /c/db-design.dbml /out | sed -E "$MASK"
exit "${PIPESTATUS[0]}"
