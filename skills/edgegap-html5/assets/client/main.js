// Page flow: menu -> Find match (Edgegap matchmaker) or Local server -> connect -> play -> menu.
//
//   Find match   the Edgegap JS SDK asks the matchmaker for a ticket. When enough players are
//                queued, Edgegap starts a server near them and returns wss://<fqdn>:<port>.
//   Local server ws://localhost:7777, for development (npm start).
//   ?server=wss://<fqdn>:<port>   connects straight to one deployment (testing without a matchmaker).

import { getConnectionUrl, matchmaking } from "@edgegap/sdk";
import { connect } from "./net.js";
import { ArenaScene, WORLD, colorOf } from "./scene.js";
import baseConfig from "./config.js";

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const ui = { menu: $("menu"), hud: $("hud"), name: $("name"), find: $("find"), local: $("local"), cancel: $("cancel"), status: $("status"), board: $("board"), banner: $("banner"), big: $("big") };

const MATCHMAKING_STATUS = {
  SEARCHING: "Searching for players...",
  TEAM_FOUND: "Match found! Starting a server near you...",
  MATCH_FOUND: "Match found! Starting a server near you...",
  HOST_ASSIGNED: "Server ready!",
};

async function loadConfig() {
  const cfg = { ...baseConfig };
  try {
    Object.assign(cfg, (await import("./config.local.js")).default);
  } catch {}
  if (params.get("mm")) cfg.matchmakerUrl = params.get("mm");
  if (params.get("token")) cfg.matchmakerToken = params.get("token");
  return cfg;
}

const config = await loadConfig();

// ---- Phaser ----------------------------------------------------------------------------------

const scene = new ArenaScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WORLD.w,
  height: WORLD.h,
  backgroundColor: "#10141f",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene,
});
await scene.ready;

// For browser automation and debugging: fed by WebSocket messages, so it updates in hidden tabs too.
const debug = (window.__game = { phase: "menu", players: [], server: null, error: null, states: 0, result: null });

// ---- HUD -------------------------------------------------------------------------------------

function renderHud(msg, myId) {
  const players = [...msg.players].sort((a, b) => b.score - a.score);
  ui.board.replaceChildren(
    ...players.map((p) => {
      const li = document.createElement("li");
      li.className = p.id === myId ? "me" : "";
      li.style.setProperty("--c", `#${colorOf(p.id).toString(16).padStart(6, "0")}`);
      li.append(Object.assign(document.createElement("span"), { textContent: p.name }), Object.assign(document.createElement("b"), { textContent: p.score }));
      return li;
    })
  );
  const t = msg.timer;
  const mmss = t == null ? "" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const me = msg.s.p.find((p) => p.id === myId);
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
      ui.banner.textContent = `First to 10  ${mmss}`;
      ui.big.textContent = me?.d ? "Splat!" : "";
      break;
    case "over":
      ui.banner.textContent = `Server closes in ${t}s`;
      ui.big.textContent = msg.result?.winner ?? "Match over";
      break;
  }
}

// ---- menu and connection ---------------------------------------------------------------------

ui.name.value = localStorage.getItem("edgegap-name") || `Player${Math.floor(Math.random() * 900 + 100)}`;
let conn = null;
let mm = null;

function showMenu(message) {
  scene.clearMatch();
  ui.menu.hidden = false;
  ui.hud.hidden = true;
  ui.find.hidden = ui.local.hidden = false;
  ui.find.disabled = !config.matchmakerUrl;
  ui.find.title = config.matchmakerUrl ? "" : "Set the matchmaker URL and token in config.js";
  ui.cancel.hidden = true;
  ui.status.textContent = message ?? (config.matchmakerUrl ? "" : "No matchmaker configured: use a local server or set config.js.");
  debug.phase = "menu";
}

async function play(getServer) {
  localStorage.setItem("edgegap-name", ui.name.value);
  ui.find.hidden = ui.local.hidden = true;
  ui.cancel.hidden = false;
  debug.error = null;
  try {
    const { url, ticketId } = await getServer();
    debug.server = url;
    ui.status.textContent = "Connecting...";
    const res = await connect(url, { name: ui.name.value, ticket: ticketId }, { onStatus: (s) => (ui.status.textContent = s) });
    conn = res.conn;
    const myId = res.welcome.id;

    // Send input when it changes (at most ~30 times a second) and at least every 250 ms.
    let last = "";
    let lastAt = 0;
    const send = (input) => {
      const s = JSON.stringify(input);
      const now = performance.now();
      if ((s !== last && now - lastAt > 33) || now - lastAt > 250) {
        conn?.send({ t: "input", ...input });
        last = s;
        lastAt = now;
      }
    };
    scene.startMatch({ myId, info: res.welcome.info, send });
    ui.menu.hidden = true;
    ui.hud.hidden = false;
    debug.phase = "connected";

    conn.on("state", (msg) => {
      Object.assign(debug, { phase: msg.phase, players: msg.players, result: msg.result });
      debug.states++;
      renderHud(msg, myId);
      scene.applyState(msg);
    });
    conn.onclose = (e) => {
      conn = null;
      // 4000 = the server dropped this player for sending nothing (IDLE_TIMEOUT_S).
      showMenu(debug.phase === "over" ? "Match finished. Play again?" : e?.code === 4000 ? "You were away too long, so you left the match." : "Disconnected from the server.");
    };
  } catch (err) {
    debug.error = String(err.message ?? err);
    showMenu(`${err.message ?? err}`);
  }
}

// Find match: a group of one player, ready at once, through the Edgegap JS SDK. The page's origin
// must be listed in the matchmaker's allowed_cors_origins.
ui.find.onclick = () =>
  play(async () => {
    ui.status.textContent = "Joining queue...";
    mm?.dispose();
    mm = new matchmaking.GroupAgent({ baseUrl: config.matchmakerUrl, authToken: config.matchmakerToken, logGroupUpdates: false });
    mm.initialize(undefined, ({ current }) => {
      if (MATCHMAKING_STATUS[current?.status]) ui.status.textContent = MATCHMAKING_STATUS[current.status];
    });
    mm.createGroup({ profile: config.profile, attributes: {}, is_ready: true }, true);
    const assignment = await mm.nextAssignment();
    const ticketId = mm.group.current.ticket_id;
    mm.dispose(); // matched: leaving the group now would only get a 409
    // The port is WS with TLS Upgrade, so this is wss://<fqdn>:<port> and the certificate matches.
    return { url: getConnectionUrl(assignment, "gameport"), ticketId };
  });

ui.local.onclick = () => play(async () => ({ url: `ws://${location.hostname || "localhost"}:7777` }));

ui.cancel.onclick = () => {
  mm?.stopMatchmaking();
  conn?.close();
  showMenu("Cancelled.");
};
addEventListener("pagehide", () => mm?.stopMatchmaking());

showMenu();
if (params.get("server")) play(async () => ({ url: params.get("server") }));
else if (params.get("autoplay") === "1" && config.matchmakerUrl) ui.find.click();
else if (params.get("autoplay") === "local") ui.local.click();
