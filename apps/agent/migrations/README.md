# Migraciones de Datum (apps/agent)

Una migracion por coleccion, derivada de `../contract/db-design.dbml`. Orden (respeta las referencias):

1. `01-rutas.sh`, `02-temporada.sh`, `03-parametros.sh` (referencia)
2. `04-vuelos.sh`
3. `05-reservas.sh`, `06-pasajeros.sh`, `07-equipaje.sh`, `08-mascotas.sh`
4. `09-transacciones.sh`, `10-eventos_pago.sh`

Uso (dentro del contenedor del CLI, con `DATABASE_ID` en `.env`): `DATABASE_ID=<id> bash migrations/apply.sh`. Cada script es get-or-create; un esquema distinto en una coleccion existente devuelve exit 2.

PENDIENTE de verificar en la tarea 3.2 (GAP-12): sintaxis y tipos exactos de `--field` con `jelou databases collections create --describe`. Por ahora enums y referencias se declaran como `Text` (el valor valido esta en el DBML) y `decimal` como `Number`. GAP-18: Datum no documenta que fuerce indices unicos (`rutas(origen,destino)`, `vuelos(ruta_id,fecha)`, `reservas.pnr`, `eventos_pago.id_evento`); la unicidad se garantiza en codigo. `transacciones` no declara `id`: lo asigna Datum (`_id`).
