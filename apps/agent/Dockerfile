# syntax=docker/dockerfile:1
# Contenedor del CLI de Jelou (@jelou/cli). No es un servicio: se ejecuta bajo demanda
# (docker compose --profile tools run --rm agent-cli ...). Sin .env en la imagen:
# el token JELOU_TOKEN se inyecta en runtime (env_file del compose).
# GAP-04 (cerrado 2026-10-16): `jelou functions check` es offline y NO requiere Deno;
# verificado en esta imagen (sin Deno) sobre un proyecto `functions init`: passed=true.
# Las pruebas (deno test) siguen corriendo en denoland/deno:2.9.7, no en esta imagen.
FROM node:24.22.0-bookworm-slim
ARG JELOU_CLI_VERSION=4.13.1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
# unzip: `jelou functions dev` descarga Deno en el primer arranque y lo necesita.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates unzip \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @jelou/cli@${JELOU_CLI_VERSION} \
 && npm cache clean --force \
 && jelou --version \
 && git config --system --add safe.directory /workspace
RUN mkdir -p /home/node/.jelou /workspace && chown -R node:node /home/node/.jelou /workspace
USER node
ENV HOME=/home/node
WORKDIR /workspace
# El CLI no escucha en ningun puerto: el healthcheck comprueba que el binario responde.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD ["jelou", "--version"]
ENTRYPOINT ["jelou"]
CMD ["--help"]
