// Edgegap lifecycle for one deployment = one match. No dependencies (Node 18+ for global fetch).
// Works with any Node.js WebSocket server (ws, uWebSockets.js, socket.io...): it only counts players.
//
// On Edgegap (ARBITRIUM_REQUEST_ID is set) the server stops its own deployment when:
//   - nobody joined within FIRST_JOIN_TIMEOUT_S of boot (default 120),
//   - every player left and nobody came back within EMPTY_TIMEOUT_S (default 30),
//   - or the game calls selfStop("...") when its match is over.
// Self-stop calls DELETE $ARBITRIUM_DELETE_URL with $ARBITRIUM_DELETE_TOKEN; billing stops with it,
// then Edgegap sends SIGTERM. Off Edgegap (local dev, the Cocos extension's "Run locally") none of
// this runs and the server behaves as before.
//
// Wiring: startLifecycle() once listening; playerJoined() when a player is admitted;
// playerLeft() when a player's seat is really gone; selfStop("match over") at match end.
// matchTickets() gives the matchmaker's ticket IDs, to refuse players who weren't matched.

const env = process.env;

export const onEdgegap = !!env.ARBITRIUM_REQUEST_ID;

const FIRST_JOIN_TIMEOUT_S = num(env.FIRST_JOIN_TIMEOUT_S, 120);
const EMPTY_TIMEOUT_S = num(env.EMPTY_TIMEOUT_S, 30);

let players = 0;
let joinedOnce = false;
let timer = null;
let stopping = false;

export function startLifecycle() {
  if (!onEdgegap) {
    log("local run (ARBITRIUM_REQUEST_ID not set): no self-stop");
    return;
  }
  log(
    `deployment ${env.ARBITRIUM_REQUEST_ID} ` +
      `(${env.ARBITRIUM_PUBLIC_IP ?? "?"}, ${env.ARBITRIUM_HOST_ID ?? "?"}) ` +
      `match=${env.MM_MATCH_ID ?? "direct"} tickets=${matchTickets()?.length ?? 0}`
  );
  timer = setTimeout(() => {
    if (!joinedOnce) selfStop(`nobody joined within ${FIRST_JOIN_TIMEOUT_S}s`);
  }, FIRST_JOIN_TIMEOUT_S * 1000);
}

export function playerJoined() {
  players++;
  joinedOnce = true;
  if (timer) clearTimeout(timer);
  timer = null;
}

export function playerLeft() {
  players = Math.max(0, players - 1);
  if (!onEdgegap || players > 0) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (players === 0) selfStop(`empty for ${EMPTY_TIMEOUT_S}s`);
  }, EMPTY_TIMEOUT_S * 1000);
}

/** The matched tickets (MM_TICKET_IDS, a JSON array), or null on a direct deployment / local run. */
export function matchTickets() {
  try {
    return env.MM_TICKET_IDS ? JSON.parse(env.MM_TICKET_IDS) : null;
  } catch {
    return null;
  }
}

export async function selfStop(reason) {
  if (!onEdgegap || stopping) return;
  stopping = true;
  log(`self-stop: ${reason}`);
  const url = env.ARBITRIUM_DELETE_URL;
  const token = env.ARBITRIUM_DELETE_TOKEN;
  if (!url || !token) {
    log("ARBITRIUM_DELETE_URL/TOKEN missing, exiting instead");
    process.exit(0);
  }
  try {
    const res = await fetch(url, { method: "DELETE", headers: { authorization: token } });
    log(`self-stop request: HTTP ${res.status}`);
    if (!res.ok) process.exit(0); // with restart policy "never", exiting also ends the deployment
  } catch (err) {
    log(`self-stop request failed: ${err}`);
    process.exit(0);
  }
  // Edgegap now sends SIGTERM: the server's handler closes the sockets and exits.
}

function num(v, fallback) {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function log(msg) {
  console.log(`[edgegap] ${msg}`);
}
