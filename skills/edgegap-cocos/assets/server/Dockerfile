# Edgegap game server image (linux/amd64) for a Node.js WebSocket server next to a Cocos Creator project:
#   docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<game>:<YYYYMMDD-HHMM> Server
#   docker run --rm -p 7777:7777 registry.edgegap.com/<project>/<game>:<YYYYMMDD-HHMM>
# Assumes Server/ holds package.json ("type": "module", "ws" in dependencies), package-lock.json,
# server.mjs and edgegap.mjs. TypeScript: run with tsx (in "dependencies", not devDependencies)
# or compile in a build stage and run the output.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=7777
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.mjs ./
# Internal port. The Edgegap app version maps it as "gameport", protocol WS, TLS Upgrade on.
EXPOSE 7777/tcp
USER node
# Node is PID 1 (no npm, no shell), so Edgegap's SIGTERM reaches the server directly.
CMD ["node", "server.mjs"]
