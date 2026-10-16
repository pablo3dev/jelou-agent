#!/usr/bin/env bash
# Coleccion Datum: reservas (fuente: ../contract/db-design.dbml). Get-or-create; schema distinto => exit 2.
# Tipos: Text, Number, Date, JSON. Enums y refs van como Text (GAP-12: sintaxis de Select/Relation sin confirmar); el valor valido se documenta en el DBML.
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name reservas \
  --field "id:Text" \
  --field "pnr:Text" \
  --field "estado:Text" \
  --field "vuelo_ida_id:Text" \
  --field "vuelo_regreso_id:Text" \
  --field "hold_expira:Date" \
  --field "total_cop:Number"
