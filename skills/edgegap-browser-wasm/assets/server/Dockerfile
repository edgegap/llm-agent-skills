# Game server image: compiled server + production dependencies only.
# The browser client is NOT in this image: it is built separately and served from static
# hosting or a CDN. Build from the repository root:
#
#   docker build --platform linux/amd64 -f server/Dockerfile -t rapier-arena-server:<tag> .
#
# Base image pinned by version AND digest, so every build uses the same bytes.
ARG NODE_IMAGE=node:22.23.4-alpine3.23@sha256:2cfe8c19bd3df0192ad5dfd2e13e86567743ffa1eb614e750a706891f19606af

# --- Build stage: install all dependencies, compile TypeScript -------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --workspace shared --include-workspace-root --ignore-scripts
COPY shared/ shared/
COPY server/ server/
RUN npx tsc -b server

# --- Runtime stage: production dependencies + compiled JavaScript ----------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=7777
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Only the server's and shared's runtime dependencies (ws, Rapier): no three.js, no Vite.
# Then drop the Rapier files Node never loads here: the server imports the ES module build
# (rapier.mjs), which embeds the WASM binary. The CommonJS copy, source maps and loose .wasm
# file are ~10 MB of dead weight.
RUN npm ci --omit=dev --workspace server --workspace shared --ignore-scripts \
 && npm cache clean --force \
 && cd node_modules/@dimforge/rapier3d-compat/dist \
 && rm rapier.cjs rapier.cjs.map rapier.mjs.map rapier_wasm3d_bg.wasm rapier_wasm3d.js
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist

# The node user (uid 1000) ships with the official image.
USER node
EXPOSE 7777
# Node runs as PID 1 (no npm/sh wrapper), so it receives the SIGTERM Edgegap sends on stop.
CMD ["node", "server/dist/index.js"]
