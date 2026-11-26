// The Phaser scene: draws what the server says and sends what the player wants.
//
// There are no game rules in here. The server (server/game.js) moves everyone, fires the paint,
// decides the hits and keeps the score; this scene only
//   1. eases each sprite toward its latest server position (state arrives 20 times a second,
//      the screen draws 60+), and
//   2. sends the player's intent: movement keys, aim angle, fire button.
//
// Phaser is the global from the <script> tag in index.html.

export const COLORS = [0xff5a5f, 0x3fa7ff, 0xffc93c, 0x5ad17a, 0xb57bff, 0xff8f3c, 0x3ce0d0, 0xff6fb5];
export const colorOf = (id) => COLORS[(id - 1) % COLORS.length];

/** Frame-rate independent smoothing toward the latest server value. */
const smooth = (dt, rate = 16) => 1 - Math.exp(-rate * dt);

// Keyboard state from the window, so typing a name in the menu never moves anyone.
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const axis = (neg, pos) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

export const WORLD = { w: 960, h: 600 };

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super("arena");
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
    this.match = null; // { myId, info, send(input) } while connected
    this.players = new Map(); // id -> { body, barrel, label, x, y, aim }
    this.bullets = new Map(); // id -> { dot, x, y, vx, vy }
  }

  create() {
    this.add.rectangle(WORLD.w / 2, WORLD.h / 2, WORLD.w, WORLD.h, 0x1b2133);
    const grid = this.add.graphics({ lineStyle: { width: 1, color: 0x262e45 } });
    for (let x = 40; x < WORLD.w; x += 40) grid.lineBetween(x, 0, x, WORLD.h);
    for (let y = 40; y < WORLD.h; y += 40) grid.lineBetween(0, y, WORLD.w, y);
    this.paint = this.add.graphics(); // paint splats stay on the floor for the whole match
    this.walls = this.add.graphics();
    this.resolveReady(this);
  }

  /** Called once the server's welcome arrives: info has the arena and walls. */
  startMatch(match) {
    this.clearMatch();
    this.match = match;
    const { walls, radius } = match.info;
    this.radius = radius;
    this.walls.clear().fillStyle(0x3a4560);
    for (const w of walls) this.walls.fillRoundedRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h, 6);
  }

  clearMatch() {
    this.match = null;
    for (const p of this.players.values()) this.destroyPlayer(p);
    for (const b of this.bullets.values()) b.dot.destroy();
    this.players.clear();
    this.bullets.clear();
    this.paint.clear();
    this.walls.clear();
  }

  /** Every state message from the server (20 per second). */
  applyState(msg) {
    if (!this.match) return;
    const s = msg.s;
    const names = new Map(msg.players.map((p) => [p.id, p.name]));
    if (msg.phase === "countdown") this.paint.clear();

    // Players: create sprites for new ids, remove the ones the server dropped.
    const seen = new Set();
    for (const e of s.p) {
      seen.add(e.id);
      let p = this.players.get(e.id);
      if (!p) p = this.createPlayer(e, names.get(e.id) ?? "");
      // Snap on respawn or a big jump instead of sliding across the map.
      if (p.dead && !e.d) Object.assign(p.view, { x: e.x, y: e.y });
      Object.assign(p, { x: e.x, y: e.y, aim: e.a, dead: !!e.d, shield: !!e.sh });
    }
    for (const [id, p] of this.players) if (!seen.has(id)) (this.destroyPlayer(p), this.players.delete(id));

    // Bullets: the client moves them with their velocity between snapshots, the server corrects.
    const live = new Set();
    for (const e of s.b) {
      live.add(e.id);
      let b = this.bullets.get(e.id);
      if (!b) {
        b = { dot: this.add.circle(e.x, e.y, this.match.info.bulletRadius, colorOf(e.o)).setStrokeStyle(2, 0xffffff, 0.6) };
        this.bullets.set(e.id, b);
      }
      Object.assign(b, { x: e.x, y: e.y, vx: e.vx, vy: e.vy });
      b.dot.setPosition(e.x, e.y);
    }
    for (const [id, b] of this.bullets) if (!live.has(id)) (b.dot.destroy(), this.bullets.delete(id));

    // Paint marks where a shot landed: big on a hit, small on a wall.
    for (const fx of s.fx) {
      this.paint.fillStyle(colorOf(fx.c), 0.55);
      const size = fx.hit ? 22 : 9;
      for (let i = 0; i < (fx.hit ? 7 : 3); i++) {
        this.paint.fillCircle(fx.x + (Math.random() - 0.5) * size * 1.6, fx.y + (Math.random() - 0.5) * size * 1.6, size * (0.35 + Math.random() * 0.5));
      }
    }
  }

  createPlayer(e, name) {
    const me = e.id === this.match.myId;
    const r = this.radius;
    const body = this.add.circle(0, 0, r, colorOf(e.id));
    if (me) body.setStrokeStyle(3, 0xffffff);
    const barrel = this.add.rectangle(0, 0, r + 10, 8, 0xe9edf7).setOrigin(0, 0.5);
    const view = this.add.container(e.x, e.y, [barrel, body]);
    const label = this.add.text(e.x, e.y - r - 14, me ? `${name} (you)` : name, { fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#ffffff", stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5);
    const p = { view, barrel, label, x: e.x, y: e.y, aim: e.a, dead: false, shield: false };
    this.players.set(e.id, p);
    return p;
  }

  destroyPlayer(p) {
    p.view.destroy();
    p.label.destroy();
  }

  update(_time, deltaMs) {
    const dt = Math.min(0.1, deltaMs / 1000);
    if (!this.match) return;
    const t = smooth(dt);
    const pointer = this.input.activePointer;
    let myAim = 0;

    for (const [id, p] of this.players) {
      p.view.x += (p.x - p.view.x) * t;
      p.view.y += (p.y - p.view.y) * t;
      p.label.setPosition(p.view.x, p.view.y - this.radius - 14);
      p.view.setAlpha(p.dead ? 0.15 : p.shield ? 0.5 + 0.3 * Math.sin(this.time.now / 60) : 1);
      p.label.setAlpha(p.dead ? 0.3 : 1);
      if (id === this.match.myId) {
        // Your own barrel follows the mouse right away; the server still decides where shots go.
        myAim = Math.atan2(pointer.worldY - p.view.y, pointer.worldX - p.view.x);
        p.barrel.rotation = myAim;
      } else {
        p.barrel.rotation = p.aim;
      }
    }

    for (const b of this.bullets.values()) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.dot.setPosition(b.x, b.y);
    }

    // Intents only: never positions, hits or scores.
    this.match.send({
      mx: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
      my: axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]),
      aim: Math.round(myAim * 100) / 100,
      fire: pointer.isDown || keys.has("Space"),
    });
  }
}
