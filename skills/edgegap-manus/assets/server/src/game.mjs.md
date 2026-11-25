# `assets/server/src/game.mjs`

Template file. Write the content of the code block below, without the fences, to `game.mjs`.

```js
// EXAMPLE authoritative game. Replace the body with the Manus game's real rules, moved here from
// the browser code: the server owns positions, scores, timers and win conditions; clients send
// only inputs and draw the snapshots they receive. Keep this file free of networking so the
// same simulation can be unit-tested.

const ARENA = { width: 1600, height: 900 };
const SPEED = 300; // units per second
const MATCH_SECONDS = 300;

export function createGame({ mode = "casual" } = {}) {
  const players = new Map(); // steamId -> state
  let elapsed = 0;
  let over = null;

  return {
    mode,
    addPlayer(id, { name } = {}) {
      if (players.has(id)) return players.get(id); // reconnect keeps score and position
      const p = {
        id, name: name ?? id.slice(-4),
        x: Math.random() * ARENA.width, y: Math.random() * ARENA.height,
        input: { x: 0, y: 0 }, lastSeq: 0, score: 0, connected: true,
      };
      players.set(id, p);
      return p;
    },
    setConnected(id, connected) {
      const p = players.get(id);
      if (!p) return;
      p.connected = connected;
      if (!connected) p.input = { x: 0, y: 0 };
    },
    removePlayer(id) { players.delete(id); },

    // Never trust input values: clamp, ignore old sequence numbers, ignore unknown fields.
    input(id, msg) {
      const p = players.get(id);
      if (!p || over) return;
      const seq = Number(msg.seq) || 0;
      if (seq <= p.lastSeq) return;
      p.lastSeq = seq;
      let x = Number(msg.x) || 0;
      let y = Number(msg.y) || 0;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      p.input = { x, y };
    },

    tick(dt) {
      if (over) return;
      elapsed += dt;
      for (const p of players.values()) {
        p.x = Math.min(ARENA.width, Math.max(0, p.x + p.input.x * SPEED * dt));
        p.y = Math.min(ARENA.height, Math.max(0, p.y + p.input.y * SPEED * dt));
        if (p.connected && (p.input.x || p.input.y)) p.score += dt; // example scoring
      }
      if (elapsed >= MATCH_SECONDS) over = "time_up";
    },

    snapshot() {
      return {
        time: Math.round(elapsed * 1000), // ms since match start ("t" is the message type)
        remaining: Math.max(0, Math.round(MATCH_SECONDS - elapsed)),
        players: [...players.values()].map((p) => ({
          id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
          score: Math.floor(p.score), connected: p.connected, seq: p.lastSeq,
        })),
      };
    },

    overReason() { return over; },
    results() { return [...players.values()].map((p) => ({ id: p.id, score: Math.floor(p.score) })).sort((a, b) => b.score - a.score); },
  };
}
```
