// Headless test player: speaks the same protocol as the browser client (hello -> welcome -> state
// stream -> input), so tests can play whole matches without a browser.
//   import { playSession } from "./headless-player.mjs";
//   await playSession({ url, name, ticket, makeInput: (state, me, info) => ({ mx: 1, my: 0 }) });
// Needs the "ws" package (already a dependency of the server).

import WebSocket from "ws";

/**
 * Resolves with a report when `until(report)` is true, the server closes the connection,
 * or `maxSeconds` passes. Retries the first connection (fresh deployments refuse for a few seconds).
 */
export function playSession({ url, name, ticket, makeInput = () => ({}), maxSeconds = 300, until = (r) => r.phases.includes("over") && r.result, attempts = 15, log = () => {} }) {
  return new Promise((resolve) => {
    const report = { url, name, id: null, team: null, match: null, connectTries: 0, phases: [], states: 0, result: null, players: [], error: null };
    let ws = null;
    let loop = null;
    let latest = null;
    let info = {};
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(loop);
      try {
        ws?.close();
      } catch {}
      resolve(report);
    };
    const timer = setTimeout(() => {
      report.error ??= `timeout after ${maxSeconds}s`;
      finish();
    }, maxSeconds * 1000);

    const attempt = () => {
      report.connectTries++;
      ws = new WebSocket(url);
      ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name, ticket })));
      ws.on("error", () => {});
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.t === "welcome") {
          Object.assign(report, { id: msg.id, team: msg.team, match: msg.match });
          info = msg.info;
          log(`${name}: welcome as #${msg.id} after ${report.connectTries} try(s)`);
          loop = setInterval(() => {
            if (latest?.phase === "playing") ws.send(JSON.stringify({ t: "input", ...makeInput(latest, report, info) }));
          }, 50);
        } else if (msg.t === "state") {
          latest = msg;
          report.states++;
          report.players = msg.players;
          if (report.phases.at(-1) !== msg.phase) report.phases.push(msg.phase);
          if (msg.result) report.result = msg.result;
          if (until(report)) finish();
        } else if (msg.t === "error") {
          report.error = msg.message;
          finish();
        }
      });
      ws.on("close", () => {
        if (done) return;
        if (!report.id && report.connectTries < attempts) return setTimeout(attempt, 1000);
        finish();
      });
    };
    attempt();
  });
}

/** Test input for Splat Arena: aim at the nearest player, keep moving, hold fire. */
export function splatInput(state, me) {
  const self = state.s.p.find((p) => p.id === me.id);
  if (!self) return { mx: 0, my: 0, aim: 0, fire: false };
  let target = null;
  let best = Infinity;
  for (const p of state.s.p) {
    if (p.id === me.id || p.d) continue;
    const d = (p.x - self.x) ** 2 + (p.y - self.y) ** 2;
    if (d < best) [target, best] = [p, d];
  }
  const wiggle = Math.sin(Date.now() / 400 + me.id);
  if (!target) return { mx: wiggle, my: Math.cos(Date.now() / 500), aim: 0, fire: false };
  const aim = Math.atan2(target.y - self.y, target.x - self.x);
  return { mx: Math.cos(aim) * 0.5 - Math.sin(aim) * wiggle, my: Math.sin(aim) * 0.5 + Math.cos(aim) * wiggle, aim, fire: true };
}
