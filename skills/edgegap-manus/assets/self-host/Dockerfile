# Image for a Node.js game server that Manus built as "self-hostable" (linux/amd64):
#   docker build --platform linux/amd64 -t registry.edgegap.com/<project>/<game>:<YYYYMMDD-HHMM> .
# Run it from the folder with package.json (Manus calls it e.g. orb-arena-server/).
# Use this, not the pkg binaries Manus also builds: same code, smaller to reason about, current Node.
# Edgegap app version port: the PORT below, protocol WS, TLS Upgrade on.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
EXPOSE 8787/tcp
USER node
# Node is PID 1, so it receives Edgegap's SIGTERM directly. Adjust the entry file to the server's.
CMD ["node", "src/server.js"]
