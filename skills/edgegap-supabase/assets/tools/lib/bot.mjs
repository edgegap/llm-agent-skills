// Headless test player: connects like the browser client (hello -> welcome -> state stream) and
// plays with simple per-game inputs, so tests can drive full matches without a browser.

import WebSocket from "ws";

// Per-game inputs for headless players: add yours (other games get no input, bots still play).
const inputs = {
  sumo: (me, s, t) => {
    const self = s.p.find((p) => p.id === me.id);
    if (!self) return { mx: 0, mz: 0, dash: false };
    const r = Math.hypot(self.x, self.z) || 1;
    if (r > s.ring - 3) return { mx: -self.x / r, mz: -self.z / r, dash: false };
    return { mx: Math.sin(t), mz: Math.cos(t * 1.3), dash: Math.random() < 0.02 };
  },
};

/**
 * Play one game session. Resolves with a report once the server closes the connection
 * (match over + self-stop), or after `maxSeconds`, or when `until(report)` returns true.
 */
export function playSession({ url, game = "sumo", name, ticket, token, maxSeconds = 300, until = () => false, attempts = 15, log = () => {} }) {
  return new Promise((resolve) => {
    const report = { url, name, id: null, connectTries: 0, phases: [], states: 0, result: null, players: [], error: null, closeCode: null };
    let tries = 0;
    let done = false;
    const finish = (ws) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(loop);
      try {
        ws?.close();
      } catch {}
      resolve(report);
    };
    let ws = null;
    let loop = null;
    let latest = null;
    let info = {};
    const started = Date.now();
    const timer = setTimeout(() => {
      report.error ??= `timeout after ${maxSeconds}s`;
      finish(ws);
    }, maxSeconds * 1000);

    const attempt = () => {
      tries++;
      report.connectTries = tries;
      ws = new WebSocket(url);
      ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name, ticket, token })));
      ws.on("error", () => {});
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.t === "welcome") {
          report.id = msg.id;
          report.team = msg.team;
          report.match = msg.match;
          info = msg.info;
          log(`${name}: welcome as #${msg.id} after ${tries} try(s)`);
          loop = setInterval(() => {
            if (!latest || latest.phase !== "playing") return;
            const t = (Date.now() - started) / 1000;
            ws.send(JSON.stringify({ t: "input", ...(inputs[game] ?? (() => ({})))({ id: report.id }, latest.s, t, info) }));
          }, 50);
        } else if (msg.t === "state") {
          latest = msg;
          report.states++;
          report.players = msg.players;
          if (report.phases.at(-1) !== msg.phase) {
            report.phases.push(msg.phase);
            log(`${name}: phase ${msg.phase}`);
          }
          if (msg.result) report.result = msg.result;
          if (until(report)) finish(ws);
        } else if (msg.t === "error") {
          report.error = msg.message;
          finish(ws);
        }
      });
      ws.on("close", (code) => {
        report.closeCode = code;
        if (done) return;
        if (!report.id && tries < attempts) return setTimeout(attempt, 1000);
        finish(ws);
      });
    };
    attempt();
  });
}
