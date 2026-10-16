#!/usr/bin/env bash
# Aplica las 10 migraciones en orden. Uso: DATABASE_ID=<id> ./apply.sh (dentro del contenedor del CLI).
set -euo pipefail
cd "$(dirname "$0")"
for f in [0-9][0-9]-*.sh; do
  echo "==> $f"
  bash "$f"
done
