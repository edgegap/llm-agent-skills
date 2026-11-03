#!/usr/bin/env node
// End-to-end test of the whole stack, the same path the browser takes:
//   Supabase anonymous sign-in -> "matchmaking" Edge Function -> Edgegap matchmaker -> deployment
//   -> wss with the access token -> full match -> server reports to "report-match" -> Supabase rows
//   -> the deployment stops itself.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... [GAME=<name>] node tools/e2e.mjs [players]
//
// Without the env vars it reads client/config.local.js. Uses only what a browser has.

import { createClient } from "@supabase/supabase-js";
import { playSession } from "./lib/bot.mjs";

let url = process.env.SUPABASE_URL;
let key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  try {
    const local = (await import("../client/config.local.js")).default;
    url ??= local.supabaseUrl;
    key ??= local.supabasePublishableKey;
  } catch {}
}
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or fill client/config.local.js.");
  process.exit(1);
}
const PLAYERS = Number(process.argv[2] ?? 2);
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ${m}`);
const problems = [];

async function signIn(i) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInAnonymously();
  if (error) throw new Error(`sign-in: ${error.message}`);
  const name = `e2e-${Date.now().toString(36).slice(-4)}-${i}`;
  const { error: renameError } = await db.from("profiles").update({ display_name: name }).eq("id", data.user.id);
  if (renameError) throw new Error(`rename: ${renameError.message}`);
  return { db, name, userId: data.user.id, token: data.session.access_token };
}

async function invoke(db, action) {
  const { data, error } = await db.functions.invoke("matchmaking", { body: { action } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(`matchmaking ${action}: ${detail?.error ?? error.message}`);
  }
  return data;
}

async function queue(p) {
  await invoke(p.db, "join");
  let last = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await invoke(p.db, "status");
    if (res.status !== last) log(`${p.name}: ${res.status}`);
    last = res.status;
    if (res.url) return { ...p, ticketId: res.ticket_id, url: res.url };
    if (res.status === "EXPIRED" || res.status === "CANCELLED") throw new Error(`${p.name}: ticket ${res.status}`);
  }
}

// 1. Sign in and queue, a little apart (the matchmaker rate-limits bursts).
const players = [];
for (let i = 0; i < PLAYERS; i++) players.push(await signIn(i + 1));
log(`signed in ${players.map((p) => `${p.name} (${p.userId.slice(0, 8)})`).join(", ")}`);
const seats = await Promise.all(players.map((p, i) => new Promise((r) => setTimeout(r, i * 400)).then(() => queue(p))));
const urls = new Set(seats.map((s) => s.url));
if (urls.size !== 1) problems.push(`players split across ${urls.size} deployments`);
log(`all assigned to ${seats[0].url}`);

// 2. Play the match with each player's Supabase access token.
const until = (r) => r.phases.includes("over") && r.result;
const reports = await Promise.all(
  seats.map((s) => playSession({ url: s.url, game: process.env.GAME ?? "sumo", name: s.name, ticket: s.ticketId, token: s.token, maxSeconds: 330, until }))
);
for (const r of reports) {
  if (r.error) problems.push(`${r.name}: ${r.error}`);
  if (!r.match) problems.push(`${r.name}: server did not see the matchmaker env`);
  for (const ph of ["countdown", "playing", "over"]) if (!r.phases.includes(ph)) problems.push(`${r.name}: never saw ${ph}`);
}
log(`result: ${reports[0].result?.winner}`);

// 3. The server reports when the match ends; read it back as a player would.
const db = players[0].db;
let row = null;
for (let i = 0; i < 15 && !row; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const { data } = await db
    .from("match_players")
    .select("score, place, user_id, matches(id, deployment_id, result, winner_id, profile)")
    .eq("user_id", players[0].userId)
    .maybeSingle();
  row = data;
}
if (!row) problems.push("no match recorded in Supabase for the first player");
else {
  log(`Supabase match ${row.matches.id}: deployment ${row.matches.deployment_id}, "${row.matches.result}"`);
  const { data: mp } = await db.from("match_players").select("user_id, score, place").eq("match_id", row.matches.id);
  const recorded = new Set(mp.map((m) => m.user_id));
  for (const p of players) if (!recorded.has(p.userId)) problems.push(`${p.name} missing from match_players`);
  const { data: profiles } = await db.from("profiles").select("id, display_name, wins, matches_played").in("id", players.map((p) => p.userId));
  for (const pr of profiles) {
    log(`profile ${pr.display_name}: ${pr.wins} win(s), ${pr.matches_played} match(es)`);
    if (pr.matches_played !== 1) problems.push(`${pr.display_name}: matches_played ${pr.matches_played}`);
  }
}

// 4. Only the game server (shared secret) may report results.
if (row) {
  const res = await fetch(`${url}/functions/v1/report-match`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-game-server-secret": "wrong" },
    body: "{}",
  });
  if (res.status !== 403) problems.push(`report-match without the secret: HTTP ${res.status}, expected 403`);
}

// 5. The deployment stops itself after the results screen.
const target = new URL(seats[0].url.replace(/^wss/, "https"));
let stoppedAfter = null;
const s0 = Date.now();
while (Date.now() - s0 < 90_000) {
  try {
    await fetch(target, { signal: AbortSignal.timeout(4000) });
  } catch {
    stoppedAfter = (Date.now() - s0) / 1000;
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}
if (stoppedAfter === null) problems.push("deployment still answering 90s after the match");
else log(`deployment stopped itself ${stoppedAfter.toFixed(0)}s after the match`);

console.log(`${problems.length ? "FAIL" : "PASS"} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const p of problems) console.log(`     - ${p}`);
process.exit(problems.length ? 1 : 0);
