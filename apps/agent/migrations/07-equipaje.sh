#!/usr/bin/env bash
# Coleccion Datum: equipaje (fuente: ../contract/db-design.dbml). Get-or-create; schema distinto => exit 2.
# Tipos: Text, Number, Date, JSON. Enums y refs van como Text (GAP-12: sintaxis de Select/Relation sin confirmar); el valor valido se documenta en el DBML.
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name equipaje \
  --field "id:Text" \
  --field "pasajero_id:Text" \
  --field "reserva_id:Text" \
  --field "tipo:Text" \
  --field "trayecto:Text" \
  --field "largo_cm:Number" \
  --field "ancho_cm:Number" \
  --field "alto_cm:Number" \
  --field "peso_real_kg:Number" \
  --field "peso_volumetrico_kg:Number" \
  --field "precio_cop:Number"
