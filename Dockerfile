# syntax=docker/dockerfile:1

# The server shells out to a real Godot binary, so the image has to carry the
# engine as well as the Node runtime. Built in stages to keep the engine
# download and the npm toolchain out of the final layer.

# ---------- build the server ----------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev


# ---------- fetch the engine ----------
FROM debian:bookworm-slim AS engine

ARG GODOT_VERSION=4.7.2
# Set by BuildKit; defaulted so a plain `docker build` still works
ARG TARGETARCH=amd64

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) godot_arch=x86_64 ;; \
      arm64) godot_arch=arm64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    archive="Godot_v${GODOT_VERSION}-stable_linux.${godot_arch}"; \
    curl -fsSL -o /tmp/godot.zip \
      "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/${archive}.zip"; \
    unzip -j /tmp/godot.zip -d /tmp/godot; \
    install -m 0755 "/tmp/godot/${archive}" /usr/local/bin/godot; \
    rm -rf /tmp/godot.zip /tmp/godot


# ---------- runtime ----------
FROM node:22-bookworm-slim

# Godot's Linux build links these even when run with --headless: the dynamic
# loader has to resolve them before the engine can decide to skip the display.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libasound2 \
      libfontconfig1 \
      libfreetype6 \
      libgl1 \
      libpulse0 \
      libx11-6 \
      libxcursor1 \
      libxi6 \
      libxinerama1 \
      libxrandr2 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=engine /usr/local/bin/godot /usr/local/bin/godot

# Unprivileged: this process accepts paths from the network and writes files
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 godot \
 && mkdir -p /workspace \
 && chown godot:godot /workspace

WORKDIR /app
COPY --from=build --chown=godot:godot /app/node_modules ./node_modules
COPY --from=build --chown=godot:godot /app/build ./build
COPY --chown=godot:godot package.json ./

ENV NODE_ENV=production \
    HOME=/home/godot \
    XDG_DATA_HOME=/home/godot/.local/share \
    XDG_CONFIG_HOME=/home/godot/.config \
    GODOT_PATH=/usr/local/bin/godot \
    MCP_TRANSPORT=http \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=8086 \
    MCP_HTTP_ENDPOINT=/mcp \
    GODOT_MCP_WORKSPACE=/workspace \
    GODOT_MCP_STRICT_PATHS=true

USER godot
EXPOSE 8086
VOLUME ["/workspace"]

# Verifies the process is serving, not merely that it started
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_HTTP_PORT||8086)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
