# Game server image (linux/amd64):
#   docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<game>:<tag> .
#   docker run --rm -p 7777:7777 registry.edgegap.com/<project>/<game>:<tag>
# Assumes the server files (main.js, room.js, edgegap.js, util.js, game.js) are in server/
# and package.json has "type": "module" and the "ws" dependency.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=7777
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Only the server goes into the image: the browser client is served elsewhere.
COPY server ./server
# A rules file shared with the page's solo mode (references/server.md §9) goes in too, at the same
# relative path the server imports it from:
# COPY client/rules.js ./client/rules.js
# Internal port. The Edgegap app version maps it as "gameport", protocol WS, TLS Upgrade on.
EXPOSE 7777/tcp
USER node
# Node is PID 1, so it receives Edgegap's SIGTERM directly (no shell wrapper).
CMD ["node", "server/main.js"]
