#!/usr/bin/env bash
# Coleccion Datum: equipaje (fuente: ../contract/db-design.dbml). Get-or-create; esquema distinto => exit 2.
# Tipos reales de Datum v2 (PocketBase), verificados con --describe (GAP-12): text, number, date, select, json.
# Mapeo: enum -> select (maxSelect=1); ref -> text; int -> number onlyInt; decimal -> number; timestamp/date -> date;
# time/char -> text. La PK es el id de Datum ([a-z0-9]): id autogenerado por Datum (15 caracteres).
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name equipaje --json \
  --field 'pasajero_id!:text' \
  --field 'reserva_id!:text' \
  --field 'tipo!:select:maxSelect=1,values=BODEGA|CABINA' \
  --field 'trayecto!:select:maxSelect=1,values=IDA|REGRESO' \
  --field 'largo_cm:number:onlyInt=true' \
  --field 'ancho_cm:number:onlyInt=true' \
  --field 'alto_cm:number:onlyInt=true' \
  --field 'peso_real_kg:number' \
  --field 'peso_volumetrico_kg:number' \
  --field 'precio_cop:number:onlyInt=true'
