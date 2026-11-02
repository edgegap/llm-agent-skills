#!/usr/bin/env node
// End-to-end test through the Edgegap matchmaker, the path the browser clients take:
// group of one (Edgegap JS SDK) -> HOST_ASSIGNED -> wss to the deployment -> full match -> the server stops itself.
//
//   MM_URL=https://<id>.edgegap.net MM_TOKEN=<matchmaker auth token> node tools/e2e.mjs <profile> [players]
//
// Needs "ws" and "@edgegap/sdk" (both dependencies of the server). Uses only the matchmaker's
// client token, never the Edgegap API token. Edit makeInput() so the headless players actually
// play your game (moving toward the goal, shooting...), or the match may only end on time.

import { getConnectionUrl } from "@edgegap/sdk";
import { GroupAgent } from "@edgegap/sdk/matchmaking";
import { playSession } from "./headless-player.mjs";

const MM = (process.env.MM_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.MM_TOKEN;
const [profile, playersArg] = process.argv.slice(2);
const PLAYERS = Number(playersArg ?? 2);
if (!MM || !TOKEN || !profile) {
  console.error("Usage: MM_URL=... MM_TOKEN=... node tools/e2e.mjs <profile> [players]");
  process.exit(1);
}

// Per-game test input. state = latest {phase, players, s}, me = {id, team}, info = welcome.info.
const makeInput = (state, me, info) => ({ mx: Math.sin(Date.now() / 700), mz: Math.cos(Date.now() / 900) });

// One SDK agent per headless player: it creates a group of one, polls it, and retries 429/5xx.
async function queue(name) {
  const t0 = Date.now();
  const agent = new GroupAgent({ baseUrl: MM, authToken: TOKEN, requestTimeoutSeconds: 15, pollingBackoffSeconds: 2, logGroupUpdates: false });
  agent.initialize(undefined, (_group, _type, _message, event) => {
    if (event.code === "updated") console.log(`${name}: ${event.status} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });
  agent.createGroup({ profile, attributes: {}, is_ready: true }, true);
  try {
    const assignment = await agent.nextAssignment();
    return { ticketId: agent.group.current.ticket_id, fqdn: assignment.fqdn, url: getConnectionUrl(assignment, "gameport") };
  } catch (err) {
    throw new Error(`${name}: ${err.event?.status === "CANCELLED" ? "ticket expired" : err.message}`);
  } finally {
    agent.dispose();
  }
}

const problems = [];
const names = Array.from({ length: PLAYERS }, (_, i) => `e2e-${i + 1}`);
const seats = await Promise.all(names.map((n, i) => new Promise((r) => setTimeout(r, i * 300)).then(() => queue(n))));
if (new Set(seats.map((s) => s.fqdn)).size !== 1) problems.push("players were split across deployments (stale tickets from an earlier run? restart the matchmaker)");

const reports = await Promise.all(
  seats.map((s, i) => playSession({ url: s.url, name: names[i], ticket: s.ticketId, makeInput, maxSeconds: 600 }))
);
for (const r of reports) {
  if (r.error) problems.push(`${r.name}: ${r.error}`);
  if (r.match?.players !== PLAYERS) problems.push(`${r.name}: server saw ${JSON.stringify(r.match)} (expected ${PLAYERS} tickets)`);
  for (const p of ["countdown", "playing", "over"]) if (!r.phases.includes(p)) problems.push(`${r.name}: never saw ${p}`);
}
console.log(`result: ${reports[0].result?.winner}; teams: ${reports.map((r) => r.team).join(", ")}`);

// The deployment should stop itself shortly after the results screen.
const t0 = Date.now();
let stopped = false;
while (Date.now() - t0 < 90000 && !stopped) {
  try {
    await fetch(seats[0].url.replace(/^wss:/, "https:"), { signal: AbortSignal.timeout(4000) });
    await new Promise((r) => setTimeout(r, 3000));
  } catch {
    stopped = true;
  }
}
if (stopped) console.log(`deployment stopped itself ${((Date.now() - t0) / 1000).toFixed(0)}s after the match`);
else problems.push("deployment still answering 90s after the match");

console.log(problems.length ? `FAIL\n - ${problems.join("\n - ")}` : "PASS");
process.exit(problems.length ? 1 : 0);
