# `assets/server/Dockerfile`

Template file. Write the content of the code block below, without the fences, to `Dockerfile`.

```dockerfile
# Edgegap game server image for a Colyseus server (linux/amd64):
#   docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<game>:<tag> .
# Assumes the server's package.json has tsx in "dependencies" (not devDependencies: NODE_ENV=production
# makes npm ci skip those) and the entry point at src/index.ts. For a server compiled with tsc,
# add a build step and use CMD ["node", "lib/index.js"] (or wherever outDir points).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
# Internal port. The Edgegap app version maps it as "gameport", protocol WS, TLS Upgrade on.
EXPOSE 2567/tcp
USER node
# Node is PID 1 (no npm, no shell, no PM2), so it gets Edgegap's SIGTERM and Colyseus shuts the rooms down cleanly.
CMD ["node", "--import", "tsx", "src/index.ts"]
```
