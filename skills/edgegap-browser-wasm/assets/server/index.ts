// Authoritative game server: one Rapier world, a fixed 30 Hz tick, WebSockets for players.
//
// Clients only send inputs. The server applies them, steps the physics and sends every client a
// snapshot of all bodies each tick. Nothing a client says about positions is ever trusted.
//
// On Edgegap the port is a WS port with TLS Upgrade: Edgegap terminates TLS, so this process
// stays plain HTTP + WebSocket. SIGTERM ends a deployment, and the server stops its own
// deployment once nobody has been connected for EMPTY_SHUTDOWN_MINUTES.

import http from "node:http";
import RAPIER from "@dimforge/rapier3d-compat";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ARENA,
  CRATE,
  DEFAULT_PORT,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  PLAYER_COLORS,
  TICK_DT,
  TICK_HZ,
  round3,
  type ClientMessage,
  type InputCmd,
  type PlayerInfo,
  type Pose,
  type ServerMessage,
  type Snapshot,
} from "@sample/shared";
import { applyInput, buildArena, createPlayerBody, createWorld, type RigidBody } from "@sample/shared/physics";
import { describeDeployment, onEdgegap, selfStop } from "./edgegap.js";

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const EMPTY_SHUTDOWN_MINUTES = Number(process.env.EMPTY_SHUTDOWN_MINUTES ?? 5);
/** Inputs a client may queue ahead of the simulation; older ones are dropped. */
const MAX_QUEUED_INPUTS = 4;

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

// --- Physics -----------------------------------------------------------------------------------

// The compat build embeds the WASM binary in its JavaScript file: init() compiles it from memory,
// with no .wasm path to resolve and nothing downloaded at runtime.
await RAPIER.init();
const world = createWorld(RAPIER);
buildArena(RAPIER, world);

const crates: RigidBody[] = [];
for (let i = 0; i < CRATE.count; i++) crates.push(createCrate(i));

function createCrate(i: number): RigidBody {
  const angle = (i / CRATE.count) * Math.PI * 2;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(Math.cos(angle) * 3, 0.5 + (i % 3), Math.sin(angle) * 3)
  );
  const e = CRATE.halfExtent;
  world.createCollider(RAPIER.ColliderDesc.cuboid(e, e, e).setDensity(CRATE.density).setFriction(CRATE.friction), body);
  return body;
}

function poseOf(body: RigidBody): Pose {
  const p = body.translation();
  const q = body.rotation();
  return [round3(p.x), round3(p.y), round3(p.z), round3(q.x), round3(q.y), round3(q.z), round3(q.w)];
}

function respawn(body: RigidBody, x: number, y: number, z: number): void {
  body.setTranslation({ x, y, z }, true);
  body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// --- Players -----------------------------------------------------------------------------------

interface Player extends PlayerInfo {
  ws: WebSocket;
  body: RigidBody;
  inputs: InputCmd[];
  /** Highest seq received, to reject replayed or out-of-order inputs. */
  lastReceivedSeq: number;
  /** Highest seq applied to the simulation, sent back as `ack`. */
  lastAppliedSeq: number;
  /** Cleared by the keep-alive, set again by any message or pong. */
  alive: boolean;
}

const players = new Map<number, Player>();
let nextId = 1;
let tick = 0;

function spawnPoint(n: number): { x: number; z: number } {
  const angle = (n * 2.4) % (Math.PI * 2);
  return { x: Math.cos(angle) * 8, z: Math.sin(angle) * 8 };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
}

const infoOf = ({ id, name, color }: PlayerInfo): PlayerInfo => ({ id, name, color });

function join(ws: WebSocket, rawName: unknown): Player | null {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: "error", message: `Server full (${MAX_PLAYERS} players)` });
    ws.close(1008, "server full");
    return null;
  }
  const id = nextId++;
  const cleaned = (typeof rawName === "string" ? rawName : "").replace(/[^\p{L}\p{N} _-]/gu, "").trim();
  const name = cleaned.slice(0, MAX_NAME_LENGTH) || `Player ${id}`;
  const { x, z } = spawnPoint(id);
  const player: Player = {
    id,
    name,
    color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
    ws,
    body: createPlayerBody(RAPIER, world, x, z),
    inputs: [],
    lastReceivedSeq: 0,
    lastAppliedSeq: 0,
    alive: true,
  };
  players.set(id, player);
  send(ws, { t: "welcome", id, tick, tickHz: TICK_HZ, players: [...players.values()].map(infoOf) });
  broadcast({ t: "join", player: infoOf(player) });
  log(`join #${id} "${name}" (${players.size} online)`);
  onPlayerCountChanged();
  return player;
}

function leave(player: Player): void {
  if (!players.delete(player.id)) return;
  world.removeRigidBody(player.body);
  broadcast({ t: "leave", id: player.id });
  log(`leave #${player.id} "${player.name}" (${players.size} online)`);
  onPlayerCountChanged();
}

function onInput(player: Player, msg: Extract<ClientMessage, { t: "input" }>): void {
  if (!Number.isInteger(msg.seq) || msg.seq <= player.lastReceivedSeq) return;
  player.lastReceivedSeq = msg.seq;
  // Values are clamped in applyInput, the one place inputs touch the simulation.
  player.inputs.push({ seq: msg.seq, x: msg.x, z: msg.z, jump: msg.jump === true });
  // A client that runs ahead, or sends a burst after a stall, must not build up latency.
  while (player.inputs.length > MAX_QUEUED_INPUTS) player.inputs.shift();
}

// --- Fixed tick --------------------------------------------------------------------------------

function step(): void {
  // One queued input per player per tick: the same rate the client predicts at.
  for (const p of players.values()) {
    const input = p.inputs.shift();
    if (input) {
      applyInput(RAPIER, world, p.body, input);
      p.lastAppliedSeq = input.seq;
    }
  }
  world.step();
  tick++;

  for (const p of players.values()) {
    if (p.body.translation().y < ARENA.killY) {
      const { x, z } = spawnPoint(p.id + tick);
      respawn(p.body, x, 2, z);
    }
  }
  crates.forEach((c, i) => {
    if (c.translation().y < ARENA.killY) respawn(c, Math.cos(i) * 2, 3, Math.sin(i) * 2);
  });

  sendSnapshots();
}

function sendSnapshots(): void {
  if (players.size === 0) return;
  const playerPoses: Snapshot["players"] = [...players.values()].map((p) => [p.id, ...poseOf(p.body)]);
  const cratePoses = crates.map(poseOf);
  for (const p of players.values()) {
    const v = p.body.linvel();
    const w = p.body.angvel();
    send(p.ws, {
      t: "snapshot",
      tick,
      ack: p.lastAppliedSeq,
      players: playerPoses,
      crates: cratePoses,
      self: {
        pose: poseOf(p.body),
        linvel: [round3(v.x), round3(v.y), round3(v.z)],
        angvel: [round3(w.x), round3(w.y), round3(w.z)],
      },
    });
  }
}

// setInterval drifts, so run as many fixed steps as real time requires (capped, so a long
// pause doesn't trigger a burst of hundreds of steps).
let lastTime = performance.now();
let accumulator = 0;
const loop = setInterval(() => {
  const now = performance.now();
  accumulator += (now - lastTime) / 1000;
  lastTime = now;
  let steps = 0;
  while (accumulator >= TICK_DT && steps < 5) {
    step();
    accumulator -= TICK_DT;
    steps++;
  }
  if (steps === 5) accumulator = 0;
}, 1000 / TICK_HZ / 2);

// --- Network -----------------------------------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ status: "ok", players: players.size, tick, uptimeSeconds: Math.round(process.uptime()) }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Game server: connect with a WebSocket. Health check: /health\n");
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 4 * 1024 });

wss.on("connection", (ws, req) => {
  let player: Player | null = null;
  const helloTimer = setTimeout(() => ws.close(1008, "no hello"), 10_000);
  log(`connection from ${req.headers["x-forwarded-for"] ?? req.socket.remoteAddress}`);

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (player) player.alive = true;
    if (msg.t === "hello" && !player) {
      clearTimeout(helloTimer);
      player = join(ws, msg.name);
    } else if (msg.t === "input" && player) {
      onInput(player, msg);
    }
    // "ping" only marks the player alive (above).
  });
  ws.on("pong", () => {
    if (player) player.alive = true;
  });
  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (player) leave(player);
  });
});

// Drop connections that went silent (closed laptop, lost network) so they don't keep the
// server busy forever. Browsers answer WebSocket pings on their own, even in hidden tabs.
const keepAlive = setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) {
      log(`#${p.id} timed out`);
      p.ws.terminate();
      continue;
    }
    p.alive = false;
    p.ws.ping();
  }
}, 15_000);

// --- Empty-server shutdown ---------------------------------------------------------------------

let emptyTimer: NodeJS.Timeout | null = null;

function onPlayerCountChanged(): void {
  if (players.size > 0) {
    if (emptyTimer) clearTimeout(emptyTimer);
    emptyTimer = null;
    return;
  }
  if (emptyTimer) return;
  log(`no players: stopping in ${EMPTY_SHUTDOWN_MINUTES} min unless someone joins`);
  emptyTimer = setTimeout(() => {
    if (onEdgegap) selfStop(`empty for ${EMPTY_SHUTDOWN_MINUTES} min`);
    else log("empty timeout reached (not on Edgegap: keeping the server up)");
  }, EMPTY_SHUTDOWN_MINUTES * 60_000);
}

// --- Shutdown ----------------------------------------------------------------------------------

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal}: closing ${players.size} connection(s)`);
  clearInterval(loop);
  clearInterval(keepAlive);
  for (const p of players.values()) p.ws.close(1001, "server shutting down");
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

httpServer.listen(PORT, "0.0.0.0", () => {
  log(`listening on 0.0.0.0:${PORT} (WebSocket + /health), ${TICK_HZ} Hz tick, Node ${process.version}`);
  log(describeDeployment());
  onPlayerCountChanged(); // start the empty timer: a deployment nobody joins stops too
});
