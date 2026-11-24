#!/usr/bin/env node
// npm test: start the game server with short timers, play a whole match with two headless
// players, check it ended with a result. No Edgegap account needed. Works on Windows, macOS, Linux.

import { spawn } from "node:child_process";
import { playSession, splatInput } from "./headless-player.mjs";

const PORT = 7790;
const server = spawn(process.execPath, ["server/main.js"], {
  env: { ...process.env, PORT: String(PORT), WAIT_SECONDS: "1", COUNTDOWN_SECONDS: "1", RESULTS_SECONDS: "1", MATCH_SECONDS: "25" },
  stdio: ["ignore", "inherit", "inherit"],
});
await new Promise((r) => setTimeout(r, 1500));

const url = `ws://localhost:${PORT}`;
const reports = await Promise.all(["test-1", "test-2"].map((name) => playSession({ url, name, makeInput: splatInput, maxSeconds: 60 })));
server.kill();

const problems = [];
for (const r of reports) {
  if (r.error) problems.push(`${r.name}: ${r.error}`);
  for (const p of ["countdown", "playing", "over"]) if (!r.phases.includes(p)) problems.push(`${r.name}: never saw ${p}`);
  if (!r.result) problems.push(`${r.name}: no result`);
}
const players = reports[0].players;
if (players.length < 3) problems.push(`expected bots to fill the match, saw ${players.length} player(s)`);
console.log(`result: ${reports[0].result?.winner}`);
for (const p of reports[0].result?.ranking ?? []) console.log(`  ${p.name}: ${p.score}`);
const hits = (reports[0].result?.ranking ?? []).reduce((n, p) => n + p.score, 0);
if (!hits) problems.push("nobody scored a hit");

console.log(problems.length ? `FAIL\n - ${problems.join("\n - ")}` : "PASS");
process.exit(problems.length ? 1 : 0);
