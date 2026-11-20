// Turf Painters on the server. The rules are client/rules.js, generated from ChatGPT's HTML file by
// tools/split-artifact.mjs: the same code the page runs for solo play. Here the server owns the
// world and players only send their four buttons.
// Implements the room.js game contract from the edgegap-threejs skill (assets/server/game.js).

import * as R from "../client/rules.js";
import { ranking } from "./util.js";

const r1 = (v) => Math.round(v * 10) / 10;
const tilesOf = (world, id) => world.tiles.reduce((n, t) => n + (t === id), 0);

export function createGame() {
  let world = R.createWorld();
  let events = []; // bumps and the win since the last snapshot, for client effects

  return {
    name: "turf-painters",
    // Bots fill every empty seat, so 1 to 4 humans always play a 4-painter round. The rules end
    // the round after 60 s; matchSeconds is only a backstop.
    config: { tickHz: 60, sendHz: 20, maxPlayers: 4, botFill: 4, matchSeconds: 90 },
    info: () => ({ roundSeconds: world.roundLength, arena: world.size, grid: world.grid }),

    addPlayer(p) {
      R.addPlayer(world, p.id, p.name, p.bot);
    },
    removePlayer(p) {
      R.removePlayer(world, p.id);
    },
    // Never trust the wire: four booleans, nothing else.
    input(p, msg) {
      R.setInput(world, p.id, { up: msg.up === true, down: msg.down === true, left: msg.left === true, right: msg.right === true });
    },
    // A fresh world for each round, with the room's current players (bots included) in it.
    start(room) {
      world = R.createWorld();
      for (const p of room.players.values()) R.addPlayer(world, p.id, p.name, p.bot);
      events = [];
    },
    reset() {
      world = R.createWorld();
    },

    // ChatGPT's step() doesn't drive bots: the page feeds them botInput() first, so the server does too.
    update(dt, room) {
      for (const p of world.players) if (p.isBot) R.setInput(world, p.id, R.botInput(world, p.id));
      events.push(...R.step(world, dt));
      for (const p of world.players) {
        const rp = room.players.get(p.id);
        if (rp) rp.score = tilesOf(world, p.id);
      }
    },

    result(room) {
      if (!world.ended) return null;
      const win = events.find((e) => e.type === "win");
      const w = room.players.get(win?.winner) ?? ranking(room)[0];
      return { winner: `${w?.name ?? "Someone"} takes the turf!`, ranking: ranking(room) };
    },
    timeUp(room) {
      const rank = ranking(room);
      return { winner: `${rank[0].name} takes the turf!`, ranking: rank };
    },

    // The world is plain data, so the snapshot is the world itself (tiles as owner ids), rounded.
    // The page draws it with ChatGPT's own draw(), and the test players feed it to botInput().
    snapshot() {
      const s = {
        time: r1(world.time),
        ended: world.ended,
        tiles: world.tiles,
        players: world.players.map((p) => ({
          id: p.id, name: p.name, isBot: p.isBot, color: p.color, spawnSlot: p.spawnSlot, radius: p.radius,
          x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), input: p.input,
        })),
        ev: events.filter((e) => e.type === "bump"),
      };
      events = events.filter((e) => e.type === "win"); // keep the win for result()
      return s;
    },
  };
}
