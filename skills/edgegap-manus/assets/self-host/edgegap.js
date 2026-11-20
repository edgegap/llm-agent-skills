'use strict';
// Edgegap adapter: one deployment = one match. Does nothing when not on Edgegap
// (local runs, the pkg binaries), so the self-hosted server keeps working unchanged.
//
// Edgegap injects ARBITRIUM_* env vars into every deployment. When the match is over the
// server stops its own deployment: DELETE $ARBITRIUM_DELETE_URL with $ARBITRIUM_DELETE_TOKEN.
// Billing stops with it.

const onEdgegap = Boolean(process.env.ARBITRIUM_REQUEST_ID);
const NO_JOIN_MS = Number(process.env.EDGEGAP_NO_JOIN_SEC || 120) * 1000; // nobody ever came
const EMPTY_MS = Number(process.env.EDGEGAP_EMPTY_SEC || 30) * 1000;      // everyone left
const RESULTS_MS = Number(process.env.EDGEGAP_RESULTS_SEC || 60) * 1000;  // results screen / rematch window

let stopping = false;
let timer = null;
let everJoined = false;

function log(msg) { console.log(`[edgegap] ${msg}`); }

function stop(reason) {
  if (!onEdgegap || stopping) return;
  stopping = true;
  log(`self-stop: ${reason}`);
  const url = process.env.ARBITRIUM_DELETE_URL;
  const token = process.env.ARBITRIUM_DELETE_TOKEN;
  if (!url || !token) { log('ARBITRIUM_DELETE_URL/TOKEN missing, exiting'); process.exit(0); }
  fetch(url, { method: 'DELETE', headers: { authorization: token } })
    .then(res => log(`self-stop request: HTTP ${res.status}`))
    .catch(err => { log(`self-stop request failed: ${err.message}, exiting`); process.exit(0); });
}

function arm(ms, reason) {
  clearTimeout(timer);
  timer = setTimeout(() => stop(reason), ms);
}

// Matchmaker deployments get MM_TICKET_IDS (a JSON array of the matched tickets). Direct
// deployments and local runs don't: then anyone with the address may join, as before.
let matchTickets = null;
try { matchTickets = process.env.MM_TICKET_IDS ? JSON.parse(process.env.MM_TICKET_IDS) : null; } catch { matchTickets = null; }

module.exports = {
  onEdgegap,
  /** The matched ticket IDs, or null when the matchmaker didn't start this server. */
  matchTickets,
  /** How many players the matchmaker sent, or null. */
  expectedPlayers: matchTickets ? matchTickets.length : null,
  /** Whether a joining player's ticket belongs to this match (always true off the matchmaker). */
  ticketAllowed(ticket) { return !matchTickets || (typeof ticket === 'string' && matchTickets.includes(ticket)); },
  started() {
    if (!onEdgegap) return;
    log(`deployment ${process.env.ARBITRIUM_REQUEST_ID}: ${matchTickets ? `match ${process.env.MM_MATCH_ID || '?'}, ${matchTickets.length} ticket(s), profile ${process.env.MM_MATCH_PROFILE || '?'}` : 'direct deploy'}; waiting for players`);
    arm(NO_JOIN_MS, `no player joined in ${NO_JOIN_MS / 1000} s`);
  },
  // Call with the number of connected players whenever someone joins or leaves.
  connectedChanged(count) {
    if (!onEdgegap || stopping) return;
    if (count > 0) { everJoined = true; clearTimeout(timer); return; }
    if (everJoined) arm(EMPTY_MS, `all players left ${EMPTY_MS / 1000} s ago`);
  },
  matchEnded() {
    if (!onEdgegap) return;
    arm(RESULTS_MS, `match over ${RESULTS_MS / 1000} s ago`);
  },
  matchStarted() { if (onEdgegap && everJoined) clearTimeout(timer); }
};

process.on('SIGTERM', () => { log('SIGTERM, exiting'); process.exit(0); });
