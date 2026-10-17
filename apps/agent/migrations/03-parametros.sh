#!/usr/bin/env bash
# Coleccion Datum: parametros (fuente: ../contract/db-design.dbml). Get-or-create; esquema distinto => exit 2.
# Tipos reales de Datum v2 (PocketBase), verificados con --describe (GAP-12): text, number, date, select, json.
# Mapeo: enum -> select (maxSelect=1); ref -> text; int -> number onlyInt; decimal -> number; timestamp/date -> date;
# time/char -> text. La PK es el id de Datum ([a-z0-9]): id determinista (se declara `id:text`, que deja la longitud libre).
# Numeros sin "!" (en Datum required = distinto de 0).
set -euo pipefail
: "${DATABASE_ID:?DATABASE_ID es obligatorio}"
jelou databases collections create "${DATABASE_ID}" --name parametros --json \
  --field 'id:text' \
  --field 'clave!:select:maxSelect=1,values=tarifa_kg_bodega_cop|cargo_minimo_bodega_cop|divisor_volumetrico|max_lineal_bodega_cm|max_peso_bodega_kg|tarifa_mascota_cop|peso_max_mascota_kg|max_mascotas_reserva|hold_minutos|edad_min_exit_row|max_pasajeros|max_piezas_bodega_pasajero' \
  --field 'valor:number:onlyInt=true'
