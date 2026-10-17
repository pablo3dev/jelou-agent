#!/bin/sh
# Spike 3.1: CRUD reproducible contra Datum v2. Requiere DATUM_URL y DATUM_API_KEY en el entorno.
# No imprime la clave ni cabeceras. Usa la coleccion indicada (por defecto "parametros") con un id
# de prueba y limpia lo que crea.
set -eu
: "${DATUM_URL:?falta DATUM_URL}" "${DATUM_API_KEY:?falta DATUM_API_KEY}"
COL="${1:-parametros}"
ID="spikecrud$(date +%s)"
BASE="$DATUM_URL/collections/$COL/records"

# req metodo url [cuerpo] -> imprime solo el codigo HTTP
req() {
  if [ $# -ge 3 ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "X-Api-Key: $DATUM_API_KEY" -H 'Content-Type: application/json' -d "$3" "$2"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "X-Api-Key: $DATUM_API_KEY" "$2"
  fi
}
cleanup() { curl -s -o /dev/null -X DELETE -H "X-Api-Key: $DATUM_API_KEY" "$BASE/$ID" || true; }
trap cleanup EXIT

# Ajusta los campos a la coleccion de prueba (por defecto parametros: clave select, valor number).
CUERPO="{\"id\":\"$ID\",\"clave\":\"hold_minutos\",\"valor\":1}"

echo "POST   (id determinista): $(req POST "$BASE" "$CUERPO") esperado 200"
echo "GET    por id:            $(req GET "$BASE/$ID") esperado 200"
echo "PATCH  valor=2:           $(req PATCH "$BASE/$ID" '{"valor":2}') esperado 200"
echo "GET    con filter:        $(req GET "$BASE?filter=id%3D%22$ID%22&perPage=5") esperado 200"
echo "POST   duplicado:         $(req POST "$BASE" "$CUERPO") esperado 400 (validation_not_unique)"
echo "DELETE:                   $(req DELETE "$BASE/$ID") esperado 204"
echo "GET    tras borrar:       $(req GET "$BASE/$ID") esperado 404"
