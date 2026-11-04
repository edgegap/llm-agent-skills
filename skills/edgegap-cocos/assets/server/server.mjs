// Minimal authoritative WebSocket game server for a Cocos Creator client, wired to edgegap.mjs.
// A skeleton to show the wiring, not a game: replace the "game" part with your rules.
//
//   npm i ws            (package.json: "type": "module", Node 18+)
//   PORT=7777 node server.mjs
//
// Protocol (JSON text frames):
//   client -> {t:"hello", name, ticket?}   first message; ticket = the matchmaker ticket ID, if any
//   client -> {t:"input", ...}             intents only (axes, buttons), never positions or scores
//   server -> {t:"welcome", id}  {t:"state", ...}  {t:"over", result}  {t:"error", message}
//
// Env: PORT (default 7777), MAX_PLAYERS (default 8), REQUIRE_TICKET=1 to refuse players whose
// ticket isn't in MM_TICKET_IDS (matchmaker deployments only), FIRST_JOIN_TIMEOUT_S, EMPTY_TIMEOUT_S.

import { WebSocketServer } from "ws";
import { log, matchTickets, onEdgegap, playerJoined, playerLeft, selfStop, startLifecycle } from "./edgegap.mjs";

const PORT = Number(process.env.PORT ?? 7777);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 8);
const REQUIRE_TICKET = process.env.REQUIRE_TICKET === "1";
const tickets = matchTickets();

// Bind 0.0.0.0 (the default): Edgegap routes the external port to the container's internal one.
// A plain HTTP request to this port gets "426 Upgrade Required", which is enough for health checks.
const wss = new WebSocketServer({ port: PORT, maxPayload: 16 * 1024 });
let nextId = 1;
const players = new Map(); // ws -> {id, name, input}
let over = false;

wss.on("listening", () => {
  log(`listening on ws://0.0.0.0:${PORT}`);
  startLifecycle();
});

wss.on("connection", (ws) => {
  let player = null;
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!player) {
      if (msg.t !== "hello") return ws.close(1008, "hello first");
      if (over) return refuse(ws, "match over");
      if (players.size >= MAX_PLAYERS) return refuse(ws, "server full");
      if (REQUIRE_TICKET && tickets && !tickets.includes(String(msg.ticket ?? ""))) return refuse(ws, "not in this match");
      player = { id: nextId++, name: String(msg.name ?? "player").slice(0, 24), input: {} };
      players.set(ws, player);
      playerJoined();
      ws.send(JSON.stringify({ t: "welcome", id: player.id }));
      log(`join ${player.id} (${players.size} playing)`);
      return;
    }
    if (msg.t === "input") player.input = msg; // validate and clamp in your game rules
  });
  ws.on("close", () => {
    if (!player) return;
    players.delete(ws);
    playerLeft(); // a game with reconnection would wait for the player before calling this
    log(`leave ${player.id} (${players.size} playing)`);
  });
});

function refuse(ws, message) {
  ws.send(JSON.stringify({ t: "error", message }));
  ws.close(1008, message);
}

// --- game: fixed tick, state broadcast. Replace with your rules. ---
const TICK_HZ = 20;
let ticks = 0;
setInterval(() => {
  if (over || players.size === 0) return;
  ticks++;
  const state = JSON.stringify({ t: "state", tick: ticks, players: [...players.values()].map((p) => ({ id: p.id, name: p.name })) });
  for (const ws of players.keys()) ws.send(state);
  // Example match end: call endMatch() when your rules say the match is decided.
  if (process.env.MATCH_TICKS && ticks >= Number(process.env.MATCH_TICKS)) endMatch({ winner: null });
}, 1000 / TICK_HZ);

/** Lock the match, show the result for a few seconds, disconnect everyone, stop the deployment. */
function endMatch(result) {
  if (over) return;
  over = true;
  const msg = JSON.stringify({ t: "over", result });
  for (const ws of players.keys()) ws.send(msg);
  setTimeout(() => {
    for (const ws of players.keys()) ws.close(1000, "match over");
    if (onEdgegap) selfStop("match over");
    else { over = false; ticks = 0; } // local: loop back so you can play again
  }, 5000);
}

// Edgegap sends SIGTERM when the deployment stops (self-stop, max duration, dashboard).
// Node must be PID 1 (Dockerfile CMD ["node", ...]) for this to arrive.
process.on("SIGTERM", () => {
  log("SIGTERM: closing");
  for (const ws of wss.clients) ws.close(1001, "server stopping");
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
