#!/usr/bin/env bash
# Coleccion Datum: rutas (fuente: ../contract/db-design.dbml). Get-or-create; schema distinto => exit 2.
# Tipos: Text, Number, Date, JSON. Enums y refs van como Text (GAP-12: sintaxis de Select/Relation sin confirmar); el valor valido se documenta en el DBML.
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name rutas \
  --field "id:Text" \
  --field "origen:Text" \
  --field "destino:Text" \
  --field "tarifa_base_cop:Number"
