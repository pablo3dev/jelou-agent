#!/usr/bin/env bash
# Coleccion Datum: vuelos (fuente: ../contract/db-design.dbml). Get-or-create; esquema distinto => exit 2.
# Tipos reales de Datum v2 (PocketBase), verificados con --describe (GAP-12): text, number, date, select, json.
# Mapeo: enum -> select (maxSelect=1); ref -> text; int -> number onlyInt; decimal -> number; timestamp/date -> date;
# time/char -> text. La PK es el id de Datum ([a-z0-9]): id determinista (se declara `id:text`, que deja la longitud libre).
# Numeros sin "!" (en Datum required = distinto de 0).
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name vuelos --json \
  --field 'id:text' \
  --field 'ruta_id!:text' \
  --field 'fecha!:date' \
  --field 'hora_salida!:text' \
  --field 'mapa_asientos:json' \
  --field 'version:number:onlyInt=true'
