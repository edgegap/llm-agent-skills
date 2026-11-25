# `assets/server/util.js`

Template file. Write the content of the code block below, without the fences, to `util.js`.

```js
// Small helpers shared by the game simulations.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const r2 = (v) => Math.round(v * 100) / 100;
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Axis input from a client, sanitised: never trust the numbers that come over the wire. */
export const axisIn = (v) => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
export const angleIn = (v) => (Number.isFinite(v) ? v : 0);

/** Push a circle (x, z, radius r) out of an axis-aligned box {x, z, w, d} (centre + size). */
export function pushOutOfBox(c, r, b) {
  const nx = clamp(c.x, b.x - b.w / 2, b.x + b.w / 2);
  const nz = clamp(c.z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = c.x - nx;
  const dz = c.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.z = nz + (dz / d) * r;
  } else {
    // Centre inside the box: leave by the nearest face.
    const ex = b.w / 2 + r - Math.abs(c.x - b.x);
    const ez = b.d / 2 + r - Math.abs(c.z - b.z);
    if (ex < ez) c.x += Math.sign(c.x - b.x || 1) * ex;
    else c.z += Math.sign(c.z - b.z || 1) * ez;
  }
  return true;
}

export const pointInBox = (x, z, b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2;

/** Players sorted by score, the shape Room.finish() expects in result.ranking. */
export function ranking(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }));
}

/** Free-for-all result: highest score wins. */
export function ffaResult(room, suffix = "") {
  const rank = ranking(room);
  const top = rank[0];
  const tie = rank[1] && rank[1].score === top.score;
  return { winner: tie ? "Draw!" : `${top.name} wins${suffix}`, ranking: rank };
}
```
