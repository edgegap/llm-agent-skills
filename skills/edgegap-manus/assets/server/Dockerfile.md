# `assets/server/Dockerfile`

Template file. Write the content of the code block below, without the fences, to `Dockerfile`.

```dockerfile
# Edgegap game server image. Build for linux/amd64 (Edgegap runs amd64 hosts):
#   docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<image>:<tag> game-server
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=7777
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force
COPY src ./src
# Internal port. The app version maps it as "gameport", protocol WS, TLS Upgrade on.
EXPOSE 7777/tcp
USER node
# Node is PID 1 and handles SIGTERM itself (src/lifecycle.mjs).
CMD ["node", "src/server.mjs"]
```
