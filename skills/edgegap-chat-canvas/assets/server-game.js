// Star Snatch on the server. The rules are client/rules.js, generated from Claude's artifact by
// tools/split-artifact.mjs: the same code the page runs for solo play. Here the server owns the
// world and players only send their four buttons.
// Implements the room.js game contract from the edgegap-threejs skill (assets/server/game.js).

import * as R from "../client/rules.js";
import { ranking } from "./util.js";

const r1 = (v) => Math.round(v * 10) / 10;

export function createGame() {
  let world = R.createWorld(Date.now());
  let events = []; // pickups, bumps and the win since the last snapshot, for client effects

  return {
    name: "star-snatch",
    // Bots fill every empty seat, so 1 to 4 humans always play a 4-ship match.
    config: { tickHz: 60, sendHz: 20, maxPlayers: R.RULES.MAX_PLAYERS, botFill: R.RULES.MAX_PLAYERS, matchSeconds: 240 },
    info: () => ({ winStars: R.RULES.WIN_STARS, arena: R.RULES.ARENA }),

    addPlayer(p) {
      R.addPlayer(world, p.id, p.name, p.bot);
    },
    removePlayer(p) {
      R.removePlayer(world, p.id);
    },
    // Never trust the wire: four booleans, nothing else. step() drives the bots itself.
    input(p, msg) {
      R.setInput(world, p.id, { up: msg.up === true, down: msg.down === true, left: msg.left === true, right: msg.right === true });
    },
    // A fresh world for each match, with the room's current players (bots included) in it.
    start(room) {
      world = R.createWorld(Date.now());
      for (const p of room.players.values()) R.addPlayer(world, p.id, p.name, p.bot);
      events = [];
    },
    reset() {
      world = R.createWorld(Date.now());
    },

    update(dt, room) {
      events.push(...R.step(world, dt));
      for (const p of world.players) {
        const rp = room.players.get(p.id);
        if (rp) rp.score = p.stars;
      }
    },

    result(room) {
      if (world.winner == null) return null;
      const w = room.players.get(world.winner);
      return { winner: `${w?.name ?? "Someone"} wins`, ranking: ranking(room) };
    },
    timeUp(room) {
      const rank = ranking(room);
      const tie = rank[1] && rank[1].score === rank[0].score;
      return { winner: tie ? "Time! Draw" : `Time! ${rank[0].name} wins`, ranking: rank };
    },

    // The world is plain data, so the snapshot is the world itself, rounded. The page draws it
    // with Claude's own renderer, and the test players feed it to botInput().
    snapshot() {
      const s = {
        time: r1(world.time),
        phase: world.phase,
        winner: world.winner,
        players: world.players.map((p) => ({
          id: p.id, name: p.name, isBot: p.isBot, slot: p.slot, r: p.r, stars: p.stars,
          x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), cooldown: r1(p.cooldown), input: p.input,
        })),
        stars: world.stars.map((st) => ({ id: st.id, x: r1(st.x), y: r1(st.y), vx: r1(st.vx), vy: r1(st.vy), delay: r1(st.delay) })),
        ev: events,
      };
      events = [];
      return s;
    },
  };
}
