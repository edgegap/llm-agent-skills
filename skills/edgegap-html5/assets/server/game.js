// Splat Arena: a top-down 2D paintball free-for-all. Move with WASD, aim with the mouse, click to
// fire paint. Every hit is a point, first to 10 wins.
//
// This file is the whole game rule set and it runs on the server only. Browsers send intents
// (which keys are down, where the mouse points, whether the button is held) and draw what
// snapshot() returns. Nothing a player changes in devtools can move them faster or score a hit.
//
// Contract with room.js:
//   name, config { tickHz, sendHz, maxPlayers, botFill, matchSeconds }
//   info()                       static data sent once in "welcome" (arena size, walls)
//   addPlayer(p, room) / removePlayer(p, room)
//   input(p, msg)                validate every field
//   start(room)                  new match (countdown begins)
//   update(dt, room)             fixed-rate simulation while "playing"
//   result(room) / timeUp(room)  end of match
//   snapshot(room)               sent to every client 20 times a second as state.s

import { angleIn, axisIn, clamp, dist2, ffaResult, pointInBox, pushOutOfBox, r1, r2, rand } from "./util.js";

const W = 960; // arena size in pixels, the same numbers the Phaser client uses for its world
const H = 600;
const RADIUS = 16;
const SPEED = 220; // px/s
const BULLET_SPEED = 620;
const BULLET_RADIUS = 5;
const BULLET_LIFE = 1.1; // s
const FIRE_COOLDOWN = 0.3; // s between shots
const RESPAWN_TIME = 1.2; // s out after being hit
const SPAWN_SHIELD = 1.0; // s of protection after respawning (ends early if you fire)
const SCORE_TO_WIN = 10;

// Walls: centre x, y and size w, h.
const WALLS = [
  { x: 480, y: 300, w: 160, h: 28 },
  { x: 480, y: 300, w: 28, h: 160 },
  { x: 220, y: 150, w: 130, h: 24 },
  { x: 740, y: 450, w: 130, h: 24 },
  { x: 200, y: 440, w: 24, h: 120 },
  { x: 760, y: 160, w: 24, h: 120 },
];

export function createGame() {
  const bodies = new Map(); // player id -> body
  let bullets = [];
  let nextBulletId = 1;
  let splats = []; // hit and wall impacts since the last snapshot, for the client's paint marks

  const blocked = (x, y, margin) => WALLS.some((w) => pointInBox(x, y, { ...w, w: w.w + margin * 2, h: w.h + margin * 2 }));

  // A free spot away from walls and, if possible, away from other players.
  function spawnPoint() {
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 30; i++) {
      const x = rand(RADIUS * 2, W - RADIUS * 2);
      const y = rand(RADIUS * 2, H - RADIUS * 2);
      if (blocked(x, y, RADIUS + 6)) continue;
      let nearest = Infinity;
      for (const b of bodies.values()) if (!b.deadFor) nearest = Math.min(nearest, dist2(b, { x, y }));
      if (nearest > 180 * 180) return { x, y };
      if (nearest > bestD) [best, bestD] = [{ x, y }, nearest];
    }
    return best ?? { x: 60, y: 60 };
  }

  function respawn(b) {
    Object.assign(b, spawnPoint(), { deadFor: 0, shield: SPAWN_SHIELD, cooldown: 0 });
  }

  // Bots: chase the nearest player, keep some distance, strafe, shoot with a little inaccuracy.
  function think(b, dt) {
    let target = null;
    let best = Infinity;
    for (const o of bodies.values()) {
      if (o === b || o.deadFor) continue;
      const d = dist2(b, o);
      if (d < best) [target, best] = [o, d];
    }
    b.strafeIn -= dt;
    if (b.strafeIn <= 0) {
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      b.strafeIn = rand(0.8, 2);
    }
    if (!target) return { mx: 0, my: 0, aim: b.aim, fire: false };
    const d = Math.sqrt(best) || 1;
    const ux = (target.x - b.x) / d;
    const uy = (target.y - b.y) / d;
    const forward = d > 260 ? 1 : d < 150 ? -0.6 : 0;
    return {
      mx: ux * forward - uy * b.strafe * 0.8,
      my: uy * forward + ux * b.strafe * 0.8,
      aim: Math.atan2(uy, ux) + rand(-0.15, 0.15),
      fire: d < 430 && Math.random() < 0.35,
    };
  }

  return {
    name: "splat-arena",
    config: { tickHz: 30, sendHz: 20, maxPlayers: 8, botFill: 3, matchSeconds: 120 },
    info: () => ({ w: W, h: H, radius: RADIUS, bulletRadius: BULLET_RADIUS, walls: WALLS, scoreToWin: SCORE_TO_WIN }),

    addPlayer(p) {
      const b = { x: 0, y: 0, aim: 0, input: { mx: 0, my: 0, aim: 0, fire: false }, deadFor: 0, shield: 0, cooldown: 0, strafe: 1, strafeIn: 0 };
      bodies.set(p.id, b);
      respawn(b);
    },
    removePlayer(p) {
      bodies.delete(p.id);
    },
    input(p, msg) {
      const b = bodies.get(p.id);
      if (b) b.input = { mx: axisIn(msg.mx), my: axisIn(msg.my), aim: angleIn(msg.aim), fire: msg.fire === true };
    },
    start() {
      bullets = [];
      splats = [];
      for (const b of bodies.values()) respawn(b);
    },
    reset() {
      bullets = [];
    },

    update(dt, room) {
      for (const p of room.players.values()) {
        const b = bodies.get(p.id);
        if (b.deadFor > 0) {
          b.deadFor -= dt;
          if (b.deadFor <= 0) respawn(b);
          continue;
        }
        b.shield = Math.max(0, b.shield - dt);
        b.cooldown -= dt;
        const input = p.bot ? think(b, dt) : b.input;

        // Movement: the server decides the speed, the client only says which way.
        const len = Math.hypot(input.mx, input.my);
        const k = len > 1 ? 1 / len : 1; // no faster diagonals
        b.x = clamp(b.x + input.mx * k * SPEED * dt, RADIUS, W - RADIUS);
        b.y = clamp(b.y + input.my * k * SPEED * dt, RADIUS, H - RADIUS);
        for (const w of WALLS) pushOutOfBox(b, RADIUS, w);
        b.aim = input.aim;

        // Firing: the server owns the cooldown, so a modified client can't fire faster.
        if (input.fire && b.cooldown <= 0) {
          const cx = Math.cos(b.aim);
          const cy = Math.sin(b.aim);
          bullets.push({ id: nextBulletId++, owner: p.id, x: b.x + cx * (RADIUS + 4), y: b.y + cy * (RADIUS + 4), vx: cx * BULLET_SPEED, vy: cy * BULLET_SPEED, life: BULLET_LIFE });
          b.cooldown = FIRE_COOLDOWN;
          b.shield = 0;
        }
      }

      // Bullets: move, then hit a wall, a player or the arena edge.
      bullets = bullets.filter((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0 || s.x < 0 || s.x > W || s.y < 0 || s.y > H) return false;
        if (blocked(s.x, s.y, BULLET_RADIUS)) {
          splats.push({ x: r1(s.x), y: r1(s.y), c: s.owner, hit: 0 });
          return false;
        }
        for (const [id, b] of bodies) {
          if (id === s.owner || b.deadFor > 0 || b.shield > 0) continue;
          if (dist2(s, b) < (RADIUS + BULLET_RADIUS) ** 2) {
            const shooter = room.players.get(s.owner);
            if (shooter) shooter.score++;
            b.deadFor = RESPAWN_TIME;
            splats.push({ x: r1(b.x), y: r1(b.y), c: s.owner, hit: id });
            return false;
          }
        }
        return true;
      });
    },

    result(room) {
      return [...room.players.values()].some((p) => p.score >= SCORE_TO_WIN) ? ffaResult(room) : null;
    },
    timeUp: (room) => ffaResult(room),

    // Small snapshots: rounded numbers, only what the client draws.
    snapshot() {
      const out = {
        p: [...bodies].map(([id, b]) => ({ id, x: r1(b.x), y: r1(b.y), a: r2(b.aim), d: b.deadFor > 0 ? 1 : 0, sh: b.shield > 0 ? 1 : 0 })),
        b: bullets.map((s) => ({ id: s.id, o: s.owner, x: r1(s.x), y: r1(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy) })),
        fx: splats,
      };
      splats = [];
      return out;
    },
  };
}
