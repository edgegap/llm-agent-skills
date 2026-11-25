# `assets/server/game.js`

Template file. Write the content of the code block below, without the fences, to `game.js`.

```js
// Skeleton of a game for room.js: a free-for-all where players move on a plane and score by
// touching a coin. Replace the rules, keep the shape. Everything here runs on the server only;
// clients send inputs and draw snapshot().
//
// Contract (room.js calls these):
//   name, config { tickHz, sendHz, maxPlayers, botFill, matchSeconds }
//   info()                       static data sent once in "welcome" (map, sizes, rules)
//   addPlayer(p, room)           p = { id, name, bot, team, score, ticket }; may run in any phase
//   removePlayer(p, room)
//   input(p, msg)                validate every field: never trust the client
//   start(room)                  reset for a new match (countdown begins)
//   update(dt, room)             fixed-rate simulation, only while "playing"
//   result(room) -> null | { winner, ranking }   end the match early (score limit...)
//   timeUp(room) -> { winner, ranking }          MATCH_SECONDS ran out
//   snapshot(room) -> object     sent to every client at sendHz as state.s
//   botsNeeded?(room) -> number  optional: how many bots to add at start (default botFill - players)

import { axisIn, clamp, dist2, ffaResult, r2, rand } from "./util.js";

const HALF = 15;
const SPEED = 7;
const SCORE_TO_WIN = 10;

export function createGame() {
  const bodies = new Map(); // id -> { x, z, input }
  let coin = { x: 0, z: 0 };
  const moveCoin = () => (coin = { x: rand(-HALF + 1, HALF - 1), z: rand(-HALF + 1, HALF - 1) });

  return {
    name: "coins",
    config: { tickHz: 30, sendHz: 20, maxPlayers: 8, botFill: 2, matchSeconds: 120 },
    info: () => ({ half: HALF, scoreToWin: SCORE_TO_WIN }),

    addPlayer(p) {
      bodies.set(p.id, { x: rand(-HALF, HALF), z: rand(-HALF, HALF), input: { mx: 0, mz: 0 } });
    },
    removePlayer(p) {
      bodies.delete(p.id);
    },
    input(p, msg) {
      const b = bodies.get(p.id);
      if (b) b.input = { mx: axisIn(msg.mx), mz: axisIn(msg.mz) };
    },
    start() {
      moveCoin();
      for (const b of bodies.values()) Object.assign(b, { x: rand(-HALF, HALF), z: rand(-HALF, HALF) });
    },

    update(dt, room) {
      for (const p of room.players.values()) {
        const b = bodies.get(p.id);
        let { mx, mz } = b.input;
        if (p.bot) {
          // Bots walk to the coin.
          const d = Math.sqrt(dist2(b, coin)) || 1;
          [mx, mz] = [(coin.x - b.x) / d, (coin.z - b.z) / d];
        }
        const len = Math.hypot(mx, mz);
        const k = len > 1 ? 1 / len : 1; // no faster diagonals
        b.x = clamp(b.x + mx * k * SPEED * dt, -HALF, HALF);
        b.z = clamp(b.z + mz * k * SPEED * dt, -HALF, HALF);
        if (dist2(b, coin) < 1) {
          p.score++;
          moveCoin();
        }
      }
    },

    result(room) {
      return [...room.players.values()].some((p) => p.score >= SCORE_TO_WIN) ? ffaResult(room) : null;
    },
    timeUp: (room) => ffaResult(room),

    snapshot() {
      return { p: [...bodies].map(([id, b]) => ({ id, x: r2(b.x), z: r2(b.z) })), coin: { x: r2(coin.x), z: r2(coin.z) } };
    },
  };
}
```
