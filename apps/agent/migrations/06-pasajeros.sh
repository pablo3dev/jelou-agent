#!/usr/bin/env bash
# Coleccion Datum: pasajeros (fuente: ../contract/db-design.dbml). Get-or-create; schema distinto => exit 2.
# Tipos: Text, Number, Date, JSON. Enums y refs van como Text (GAP-12: sintaxis de Select/Relation sin confirmar); el valor valido se documenta en el DBML.
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name pasajeros \
  --field "id:Text" \
  --field "reserva_id:Text" \
  --field "nombre:Text" \
  --field "documento:Text" \
  --field "edad:Number" \
  --field "asiento_ida:Text" \
  --field "asiento_regreso:Text"
