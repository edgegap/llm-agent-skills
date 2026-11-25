# `assets/client/matchmakingClient.ts`

Template file. Write the content of the code block below, without the fences, to `matchmakingClient.ts`.

```ts
// Browser side: talks only to the game's own backend (/api/matchmaking/*) and, once matched, to the
// Edgegap game server over wss. No Edgegap URL, token or Steam ID is ever read from or kept in the
// page; the session cookie identifies the player.
//
//   const mm = new MatchClient({ onStatus: renderStatus, onMessage: handleServerMessage });
//   await mm.resume();                         // on page load: continue a search or rejoin a match
//   mm.findMatch("casual", ["europe"]);        // Find Match button
//   mm.cancel();                               // Cancel button
//   mm.send({ t: "input", seq, x, y });        // gameplay inputs once connected

export type ClientStatus =
  | { state: "idle" }
  | { state: "searching"; seconds: number }
  | { state: "match_found" } // server starting
  | { state: "connecting"; attempt: number }
  | { state: "connected"; you: string; location?: string }
  | { state: "reconnecting"; attempt: number }
  | { state: "ended"; reason: string; results?: unknown }
  | { state: "error"; reason: string; retryable: boolean };

interface Options {
  apiBase?: string;
  pollMs?: number;
  connectTimeoutMs?: number; // a fresh server can take a while to accept connections
  reconnectWindowMs?: number; // keep below the server's empty-server grace (30 s)
  onStatus: (s: ClientStatus) => void;
  onMessage: (msg: any) => void;
}

export class MatchClient {
  private o: Required<Options>;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private ws: WebSocket | null = null;
  private searching = false;
  private joined = false;
  private ended = false;
  private networkErrors = 0;

  constructor(options: Options) {
    this.o = { apiBase: "", pollMs: 2000, connectTimeoutMs: 60_000, reconnectWindowMs: 20_000, ...options };
  }

  async resume() {
    const res = await this.api("GET", "status");
    this.handle(res);
  }

  async findMatch(mode: string, regions: string[] = []) {
    this.ended = false;
    this.o.onStatus({ state: "searching", seconds: 0 });
    const res = await this.api("POST", "join", { mode, regions });
    this.handle(res);
  }

  async cancel() {
    this.stopPolling();
    const res = await this.api("POST", "cancel");
    this.handle(res); // "match_found" here means it was too late to cancel
  }

  /** Leave the match for good (back to menu). */
  async leave() {
    this.ended = true;
    this.stopPolling();
    this.ws?.close(1000, "leaving");
    this.ws = null;
    await this.api("POST", "leave");
    this.o.onStatus({ state: "idle" });
  }

  send(msg: unknown) {
    if (this.joined && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  // ---------- queue ----------

  private handle(res: any) {
    if (res?.reason !== "network") this.networkErrors = 0;
    switch (res?.status) {
      case "idle":
        this.stopPolling();
        this.o.onStatus({ state: "idle" });
        break;
      case "searching":
        this.o.onStatus({ state: "searching", seconds: Math.round((Date.now() - (res.since ?? Date.now())) / 1000) });
        this.schedulePoll(res.retryAfterMs);
        break;
      case "match_found":
        this.o.onStatus({ state: "match_found" });
        this.schedulePoll();
        break;
      case "ready":
        this.stopPolling();
        this.connect(res, Date.now() + this.o.connectTimeoutMs, 1, false);
        break;
      default: // cancelled, timeout, expired, error
        // A dropped request while searching: keep polling, the backend still holds the ticket.
        if (res?.reason === "network" && this.searching && ++this.networkErrors < 5) {
          this.schedulePoll(this.o.pollMs * 2);
          return;
        }
        this.stopPolling();
        this.o.onStatus({ state: "error", reason: res?.reason ?? "network", retryable: res?.retryable ?? true });
    }
  }

  private schedulePoll(delay = this.o.pollMs) {
    this.searching = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (!this.searching) return;
      this.handle(await this.api("GET", "status"));
    }, Math.max(delay, this.o.pollMs));
  }

  private stopPolling() {
    this.searching = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  // ---------- game server connection ----------

  private connect(ready: any, deadline: number, attempt: number, reconnecting: boolean) {
    if (this.ended) return;
    this.o.onStatus(reconnecting ? { state: "reconnecting", attempt } : { state: "connecting", attempt });
    const ws = new WebSocket(ready.server.url); // wss://<request_id>.pr.edgegap.net:<external port>
    this.ws = ws;
    this.joined = false;

    ws.onopen = () => ws.send(JSON.stringify({ t: "join", token: ready.joinToken }));
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === "welcome") {
        this.joined = true;
        attempt = 1;
        this.o.onStatus({ state: "connected", you: msg.you, location: ready.server.location?.city });
      } else if (msg.t === "over") {
        this.ended = true;
        this.o.onStatus({ state: "ended", reason: msg.reason, results: msg.results });
        this.api("POST", "leave");
      }
      this.o.onMessage(msg);
    };
    ws.onclose = async (ev) => {
      if (this.ws !== ws || this.ended) return;
      // The server refused the token: retrying with the same assignment won't help.
      if (ev.code === 4003 && /wrong_server|not_in_match/.test(ev.reason)) {
        this.o.onStatus({ state: "error", reason: ev.reason, retryable: true });
        await this.api("POST", "leave");
        return;
      }
      const wasJoined = this.joined;
      this.joined = false;
      // Joined before: reconnect window. Never joined: the server may still be starting.
      const until = wasJoined ? Date.now() + this.o.reconnectWindowMs : deadline;
      if (Date.now() > until) {
        this.o.onStatus({ state: "error", reason: wasJoined ? "connection_lost" : "server_unreachable", retryable: true });
        return;
      }
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
      // Join tokens are single-use and short-lived: get a fresh one for the same server.
      const fresh = await this.api("GET", "status");
      if (fresh?.status !== "ready") return this.handle(fresh);
      this.connect(fresh, until, attempt + 1, wasJoined || reconnecting);
    };
  }

  private async api(method: "GET" | "POST", path: string, body?: unknown) {
    try {
      const res = await fetch(`${this.o.apiBase}/api/matchmaking/${path}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch {
      return { status: "error", reason: "network", retryable: true };
    }
  }
}
```
