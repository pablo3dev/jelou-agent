#!/usr/bin/env bash
# Coleccion Datum: reservas (fuente: ../contract/db-design.dbml). Get-or-create; esquema distinto => exit 2.
# Tipos reales de Datum v2 (PocketBase), verificados con --describe (GAP-12): text, number, date, select, json.
# Mapeo: enum -> select (maxSelect=1); ref -> text; int -> number onlyInt; decimal -> number; timestamp/date -> date;
# time/char -> text. La PK es el id de Datum ([a-z0-9]): id autogenerado por Datum (15 caracteres).
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name reservas --json \
  --field 'pnr!:text' \
  --field 'estado!:select:maxSelect=1,values=PENDIENTE_PAGO|EMITIDA|PAGO_RECHAZADO|EXPIRADA|CANCELADA' \
  --field 'vuelo_ida_id!:text' \
  --field 'vuelo_regreso_id:text' \
  --field 'hold_expira!:date' \
  --field 'total_cop:number:onlyInt=true'
