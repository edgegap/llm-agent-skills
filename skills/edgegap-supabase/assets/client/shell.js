// The game shell: the Three.js stage, the menu (Supabase profile and leaderboard, Find Match,
// local server, direct connect), the HUD (scoreboard, timer, banners) and the connection flow.
// The game only provides create(ctx) -> { state(msg), frame(dt) }.

import * as THREE from "three";
import { connect } from "./net.js";
import { connectBackend } from "./backend.js";
import baseConfig from "../config.js";

// Local dev server port (npm run dev).
export const LOCAL_PORT = 7777;

export const COLORS = [0xff5a5f, 0x3fa7ff, 0xffc93c, 0x5ad17a, 0xb57bff, 0xff8f3c, 0x3ce0d0, 0xff6fb5];
export const colorOf = (id) => COLORS[(id - 1) % COLORS.length];
export const TEAM_COLORS = [0xff5a5f, 0x3fa7ff];

const params = new URLSearchParams(location.search);

async function loadConfig() {
  const cfg = { ...baseConfig };
  try {
    Object.assign(cfg, (await import("../config.local.js")).default);
  } catch {}
  return cfg;
}

// ---- stage ---------------------------------------------------------------------------------

export function createStage({ background = 0x10141f, fog = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(background, fog[0], fog[1]);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x30283a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 40, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 120 });
  scene.add(sun);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
  return { renderer, scene, camera, sun };
}

/** Text sprite that always faces the camera (player names). */
export function makeLabel(text, color = "#fff") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,.7)";
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Frame-rate independent smoothing toward the latest server value. */
export const smooth = (dt, rate = 14) => 1 - Math.exp(-rate * dt);

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Keeps one mesh per server entity id: creates new ones, removes ones the server dropped. */
export class EntityMap {
  constructor(scene, make) {
    Object.assign(this, { scene, make, map: new Map() });
  }
  sync(list, update) {
    const seen = new Set();
    for (const e of list) {
      seen.add(e.id);
      let obj = this.map.get(e.id);
      const fresh = !obj;
      if (fresh) {
        obj = this.make(e);
        this.map.set(e.id, obj);
        this.scene.add(obj);
      }
      update(obj, e, fresh);
    }
    for (const [id, obj] of this.map) {
      if (!seen.has(id)) {
        this.scene.remove(obj);
        this.map.delete(id);
      }
    }
  }
  get(id) {
    return this.map.get(id);
  }
  clear() {
    for (const obj of this.map.values()) this.scene.remove(obj);
    this.map.clear();
  }
}

// ---- keyboard / pointer --------------------------------------------------------------------

export const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target.tagName !== "INPUT") keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
export const axis = (neg, pos) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

// ---- UI ------------------------------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const e = Object.assign(document.createElement(tag), attrs);
  e.append(...children);
  return e;
}

function buildUi(def) {
  const status = el("p", { className: "status" });
  const name = el("input", { value: "", maxLength: 16, disabled: true });
  const stats = el("p", { className: "stats" });
  const findBtn = el("button", { className: "primary", textContent: "Find match" });
  const localBtn = el("button", { textContent: `Local server :${LOCAL_PORT}` });
  const cancelBtn = el("button", { textContent: "Cancel", hidden: true });
  const leaders = el("ol", { className: "leaders" });
  const menu = el(
    "div",
    { className: "menu" },
    el("h1", { textContent: def.title }),
    el("p", { className: "tagline", textContent: def.tagline }),
    el("label", {}, "Name ", name),
    stats,
    el("div", { className: "buttons" }, findBtn, localBtn, cancelBtn),
    status,
    el("h2", { textContent: "Leaderboard" }),
    leaders,
    el("p", { className: "help", textContent: def.help })
  );
  const board = el("ol", { className: "board" });
  const banner = el("div", { className: "banner" });
  const big = el("div", { className: "big" });
  const hud = el("div", { className: "hud", hidden: true }, board, banner, big, el("div", { className: "keys", textContent: def.help }));
  document.body.append(el("div", { className: "ui" }, menu, hud));
  return { menu, hud, status, name, stats, findBtn, localBtn, cancelBtn, leaders, board, banner, big };
}

function renderHud(ui, msg, myId, def) {
  const players = [...msg.players].sort((a, b) => b.score - a.score);
  ui.board.replaceChildren(
    ...players.map((p) => {
      const color = p.team != null && def.teams ? TEAM_COLORS[p.team] : colorOf(p.id);
      return el(
        "li",
        { className: p.id === myId ? "me" : "", style: `--c:#${color.toString(16).padStart(6, "0")}` },
        el("span", { textContent: p.name }),
        el("b", { textContent: def.scoreText ? def.scoreText(p, msg) : p.score })
      );
    })
  );
  const t = msg.timer;
  const mmss = t == null ? "" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  switch (msg.phase) {
    case "waiting":
      ui.banner.textContent = msg.waitingFor > 0 ? `Waiting for ${msg.waitingFor} more player(s)...` : "Waiting for players...";
      ui.big.textContent = "";
      break;
    case "countdown":
      ui.banner.textContent = "Get ready";
      ui.big.textContent = t > 0 ? t : "GO!";
      break;
    case "playing":
      ui.banner.textContent = (def.bannerText?.(msg) ?? "") + (mmss ? `  ${mmss}` : "");
      ui.big.textContent = def.bigText?.(msg, myId) ?? "";
      break;
    case "over":
      ui.banner.textContent = `Server closes in ${t}s`;
      ui.big.textContent = msg.result?.winner ?? "Match over";
      break;
  }
}

// ---- flow ----------------------------------------------------------------------------------

/**
 * def: { game, title, tagline, help, teams?, scoreText?, bannerText?, bigText?, create(ctx) }
 * create(ctx) returns { state(msg), frame(dt), reset?() }.
 * ctx: { THREE, scene, camera, renderer, myId, info, input(obj) }
 */
export async function runGame(def) {
  const config = await loadConfig();
  const stage = createStage(def.stage);
  const ui = buildUi(def);
  const debug = (window.__game = { phase: "menu", players: [], server: null, error: null, states: 0 });

  let game = null;
  let conn = null;
  let searching = null; // AbortController of the current Find Match
  let backend = null;

  // Supabase: sign in (anonymously), load the profile, show the leaderboard.
  const showProfile = (p) => (ui.stats.textContent = `${p.wins} win(s) in ${p.matches_played} match(es)`);
  if (config.supabaseUrl && config.supabasePublishableKey) {
    try {
      backend = await connectBackend(config);
      debug.userId = backend.userId;
      ui.name.value = backend.profile.display_name;
      ui.name.disabled = false;
      showProfile(backend.profile);
      ui.name.onchange = async () => {
        const name = ui.name.value.trim().slice(0, 16);
        if (!name) return;
        try {
          await backend.rename(name);
        } catch (err) {
          ui.status.textContent = `Could not rename: ${err.message}`;
        }
      };
      backend.watchLeaderboard((rows) =>
        ui.leaders.replaceChildren(
          ...(rows.length
            ? rows.map((r) =>
                el(
                  "li",
                  { className: r.id === backend.userId ? "me" : "" },
                  el("span", { textContent: r.display_name }),
                  el("b", { textContent: `${r.wins} W / ${r.matches_played}` })
                )
              )
            : [el("li", { className: "empty", textContent: "No matches played yet." })])
        )
      );
    } catch (err) {
      backend = null;
      ui.status.textContent = err.message;
    }
  }
  let lastInput = "";
  let lastInputAt = 0;

  const ctx = {
    THREE,
    ...stage,
    myId: 0,
    info: {},
    // Sends the player's input at most 30 times a second, and at least every 250 ms.
    input(obj) {
      const s = JSON.stringify(obj);
      const now = performance.now();
      if ((s !== lastInput && now - lastInputAt > 33) || now - lastInputAt > 250) {
        conn?.send({ t: "input", ...obj });
        lastInput = s;
        lastInputAt = now;
      }
    },
  };

  const showMenu = (message) => {
    ui.menu.hidden = false;
    ui.hud.hidden = true;
    ui.findBtn.hidden = ui.localBtn.hidden = false;
    ui.findBtn.disabled = !backend;
    ui.findBtn.title = backend ? "" : "Set the Supabase URL and publishable key in client/config.js";
    ui.cancelBtn.hidden = true;
    if (message !== undefined) ui.status.textContent = message;
    else if (!backend && !ui.status.textContent) ui.status.textContent = "Supabase not configured: use a local server or set client/config.js.";
    debug.phase = "menu";
    backend?.loadProfile().then(showProfile, () => {});
  };

  const play = async (getServer) => {
    ui.findBtn.hidden = ui.localBtn.hidden = true;
    ui.cancelBtn.hidden = false;
    debug.error = null;
    try {
      const { url, ticketId } = await getServer();
      debug.server = url;
      ui.status.textContent = "Connecting...";
      // The access token proves to the game server which Supabase user this is.
      const hello = { name: ui.name.value, ticket: ticketId, token: await backend?.accessToken() };
      const res = await connect(url, hello, { onStatus: (s) => (ui.status.textContent = s) });
      conn = res.conn;
      ctx.myId = res.welcome.id;
      ctx.info = res.welcome.info;
      game = def.create(ctx);
      ui.menu.hidden = true;
      ui.hud.hidden = false;
      debug.phase = "connected";
      conn.on("state", (msg) => {
        debug.phase = msg.phase;
        debug.players = msg.players;
        debug.result = msg.result;
        debug.state = msg; // latest server state, for test automation
        debug.myId = ctx.myId;
        debug.states++;
        renderHud(ui, msg, ctx.myId, def);
        game.state(msg);
      });
      conn.onclose = () => {
        game?.dispose?.();
        game = null;
        conn = null;
        showMenu(debug.phase === "over" ? "Match finished. Play again?" : "Disconnected from the server.");
      };
    } catch (err) {
      debug.error = String(err.message ?? err);
      showMenu(`${err.message ?? err}`);
    }
  };

  // Find Match goes through the "matchmaking" Edge Function, which holds the Edgegap matchmaker
  // token and ties the ticket to this Supabase user.
  ui.findBtn.onclick = () =>
    play(async () => {
      ui.status.textContent = "Joining queue...";
      searching = new AbortController();
      try {
        return await backend.findMatch((s) => (ui.status.textContent = s), searching.signal);
      } finally {
        searching = null;
      }
    });
  ui.localBtn.onclick = () => play(async () => ({ url: `ws://${location.hostname || "localhost"}:${LOCAL_PORT}` }));
  ui.cancelBtn.onclick = () => {
    searching?.abort();
    conn?.close();
    showMenu("Cancelled.");
  };
  // Closing the page mid-search cancels through backend.js (a keepalive request).

  showMenu();
  // ?server=wss://host:port connects straight to a deployment (e.g. one started by edgegap/deploy.mjs).
  if (params.get("server")) play(async () => ({ url: params.get("server") }));
  else if (params.get("autoplay") === "1" && backend) ui.findBtn.click();
  else if (params.get("autoplay") === "local") ui.localBtn.click();

  let last = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game?.frame(dt);
    def.idle?.(stage, dt, !!game);
    stage.renderer.render(stage.scene, stage.camera);
  });
}
