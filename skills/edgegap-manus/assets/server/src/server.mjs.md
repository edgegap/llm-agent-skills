# `assets/server/src/server.mjs`

Template file. Write the content of the code block below, without the fences, to `server.mjs`.

```js
// Authoritative dedicated game server for a browser game, run in an Edgegap container.
// Browsers connect over WebSocket. On Edgegap the port has TLS Upgrade on, so they connect with
// wss://<request_id>.pr.edgegap.net:<external port> while this process serves plain ws inside.
//
// Protocol (JSON text frames):
//   client -> server  {t:"join", token}            first message, within 5 s
//                     {t:"input", seq, x, y}        example input; replace with the game's
//                     {t:"ping", c}                 latency probe
//   server -> client  {t:"welcome", you, tickRate}  {t:"state", ...snapshot}  {t:"pong", c}
//                     {t:"over", reason, results}   {t:"error", code}
import http from "node:http";
import { WebSocketServer } from "ws";
import { createVerifier, expectedPlayers } from "./auth.mjs";
import { createLifecycle, onShutdown } from "./lifecycle.mjs";
import { createGame } from "./game.mjs";

const PORT = Number(process.env.PORT ?? 7777);
const TICK_RATE = 20;
const JOIN_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_BYTES = 4_096;
const MAX_MESSAGES_PER_SECOND = 60;

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const verifyJoinToken = createVerifier();
const lifecycle = createLifecycle({ log });
const game = createGame({ mode: process.env.MM_MATCH_PROFILE ?? "casual" });
const sockets = new Map(); // steamId -> ws (one live connection per player)

log(`Edgegap Server | request=${process.env.ARBITRIUM_REQUEST_ID ?? "local"} profile=${process.env.MM_MATCH_PROFILE ?? "-"} expected players=${expectedPlayers() ?? "any"}`);

// Plain HTTP answers Edgegap's port check and health probes. Only authenticated sockets count as
// players, so probes never keep an empty server alive.
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  let steamId = null;
  let budget = MAX_MESSAGES_PER_SECOND;
  const refill = setInterval(() => { budget = MAX_MESSAGES_PER_SECOND; }, 1000);
  const joinTimer = setTimeout(() => ws.close(4001, "join timeout"), JOIN_TIMEOUT_MS);

  ws.on("message", (data, isBinary) => {
    if (isBinary || --budget < 0) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (!steamId) {
      if (msg?.t !== "join") return ws.close(4002, "join first");
      const result = verifyJoinToken(msg.token);
      if (!result.ok) {
        log(`Edgegap Server | Rejected join: ${result.error}`);
        send(ws, { t: "error", code: result.error });
        return ws.close(4003, result.error);
      }
      clearTimeout(joinTimer);
      steamId = result.steamId;
      // Reconnect: the newer connection replaces the old one, the player keeps their state.
      const previous = sockets.get(steamId);
      if (previous && previous !== ws) previous.close(4004, "replaced by a new connection");
      sockets.set(steamId, ws);
      game.addPlayer(steamId);
      game.setConnected(steamId, true);
      send(ws, { t: "welcome", you: steamId, tickRate: TICK_RATE });
      log(`Edgegap Server | ${connectedCount()} player(s) connected.`);
      lifecycle.playerCountChanged(connectedCount());
      return;
    }

    if (msg?.t === "input") game.input(steamId, msg);
    else if (msg?.t === "ping") send(ws, { t: "pong", c: msg.c });
  });

  ws.on("close", () => {
    clearInterval(refill);
    clearTimeout(joinTimer);
    if (steamId && sockets.get(steamId) === ws) {
      sockets.delete(steamId);
      game.setConnected(steamId, false);
      log(`Edgegap Server | ${connectedCount()} player(s) connected.`);
      lifecycle.playerCountChanged(connectedCount());
    }
  });
  ws.on("error", () => {});
});

// Fixed-rate simulation and snapshot broadcast.
let last = performance.now();
const loop = setInterval(() => {
  const now = performance.now();
  game.tick(Math.min(0.25, (now - last) / 1000));
  last = now;
  broadcast({ t: "state", ...game.snapshot() });
  const reason = game.overReason();
  if (reason) {
    clearInterval(loop);
    broadcast({ t: "over", reason, results: game.results() });
    // Report results to the backend here if the game keeps a ladder (references/server.md §5).
    lifecycle.matchOver(reason);
  }
}, 1000 / TICK_RATE);

// Detect dead connections (closed tabs, lost Wi-Fi) so the empty-server timer can start.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 10_000);

onShutdown(async (signal) => {
  log(`Edgegap Server | ${signal}, closing.`);
  broadcast({ t: "over", reason: "server_shutdown", results: game.results() });
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  await new Promise((r) => setTimeout(r, 500));
});

httpServer.listen(PORT, "0.0.0.0", () => log(`Edgegap Server | Listening on 0.0.0.0:${PORT}`));

function connectedCount() { return sockets.size; }
function send(ws, msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of sockets.values()) if (ws.readyState === ws.OPEN) ws.send(data);
}
```
