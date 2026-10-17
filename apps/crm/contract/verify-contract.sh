#!/bin/sh
# Verifica la copia local del contrato (hash) y, si existe, que sea identica al original de apps/agent.
set -eu
cd "$(dirname "$0")"
sha256sum -c CONTRACT.sha256
if [ -d ../../agent/contract ]; then
  for f in db-design.dbml endpoints.md CONTRACT.sha256; do
    cmp "../../agent/contract/$f" "$f"
  done
  echo "identico al original apps/agent/contract"
fi
