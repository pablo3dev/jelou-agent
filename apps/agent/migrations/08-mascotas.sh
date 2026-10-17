#!/usr/bin/env bash
# Coleccion Datum: mascotas (fuente: ../contract/db-design.dbml). Get-or-create; esquema distinto => exit 2.
# Tipos reales de Datum v2 (PocketBase), verificados con --describe (GAP-12): text, number, date, select, json.
# Mapeo: enum -> select (maxSelect=1); ref -> text; int -> number onlyInt; decimal -> number; timestamp/date -> date;
# time/char -> text. La PK es el id de Datum ([a-z0-9]): id autogenerado por Datum (15 caracteres).
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name mascotas --json \
  --field 'pasajero_id!:text' \
  --field 'reserva_id!:text' \
  --field 'especie!:text' \
  --field 'peso_kg:number' \
  --field 'precio_cop:number:onlyInt=true'
