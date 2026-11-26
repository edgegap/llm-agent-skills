// Small helpers for the 2D simulation. Coordinates are in pixels, x to the right, y down,
// the same space Phaser draws in.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Numbers from a client, sanitised: never trust what comes over the wire. */
export const axisIn = (v) => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
export const angleIn = (v) => (Number.isFinite(v) ? v : 0);

/** Axis-aligned box {x, y, w, h}: x, y is the centre. */
export const pointInBox = (x, y, b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;

/** Push a circle (c.x, c.y, radius r) out of a box. Returns true if they overlapped. */
export function pushOutOfBox(c, r, b) {
  const nx = clamp(c.x, b.x - b.w / 2, b.x + b.w / 2);
  const ny = clamp(c.y, b.y - b.h / 2, b.y + b.h / 2);
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.y = ny + (dy / d) * r;
  } else {
    // Centre inside the box: leave by the nearest face.
    const ex = b.w / 2 + r - Math.abs(c.x - b.x);
    const ey = b.h / 2 + r - Math.abs(c.y - b.y);
    if (ex < ey) c.x += Math.sign(c.x - b.x || 1) * ex;
    else c.y += Math.sign(c.y - b.y || 1) * ey;
  }
  return true;
}

/** Players sorted by score, the shape Room.finish() expects in result.ranking. */
export function ranking(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }));
}

/** Free-for-all result: highest score wins. */
export function ffaResult(room) {
  const rank = ranking(room);
  const top = rank[0];
  const tie = rank[1] && rank[1].score === top.score;
  return { winner: tie ? "Draw!" : `${top.name} wins!`, ranking: rank };
}
