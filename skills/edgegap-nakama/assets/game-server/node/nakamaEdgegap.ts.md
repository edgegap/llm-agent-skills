# `assets/game-server/node/nakamaEdgegap.ts`

Template file. Write the content of the code block below, without the fences, to `nakamaEdgegap.ts`.

```ts
// Game server side of the Edgegap Fleet Manager for Nakama, for a Node.js
// (18+) game server. No dependencies: uses the global fetch.
//
// A port of the GDScript template (assets/game-server/godot), which was
// verified on Edgegap; this file was checked against a mock Nakama only.
// Same contract, so it also documents what any engine's server must do.
//
// Wiring, in the game server:
//   const fm = new NakamaEdgegap();
//   server.listen(port, async () => { await fm.sendReady(); });
//   on connect:  const account = await fm.verifyPlayer(tokenFromClient); if (!account) kick();
//   on join/leave: fm.setConnectedUsers(userIdsOfAcceptedPlayers);
//   on match end:  await fm.reportResult(winnerUserId, userIds); await fm.stop("Match finished");

export interface PlayerAccount {
  userId: string;
  username: string;
}

export interface NakamaEdgegapOptions {
  /** Stop if nobody joined this long after READY. */
  noPlayersTimeoutMs?: number;
  /** Hard cap on a match, below the app version's max duration. */
  maxMatchDurationMs?: number;
  /** Connection events are batched: at most one POST per interval, only on change. */
  connectionReportIntervalMs?: number;
  /** After STOP, Nakama asks Edgegap to stop the deployment; exit anyway after this. */
  stopGracePeriodMs?: number;
  /** Called last; defaults to process.exit(0). */
  exit?: () => void;
}

export class NakamaEdgegap {
  /** ARBITRIUM_REQUEST_ID: the Edgegap deployment ID, which is also the Nakama instance ID. */
  readonly instanceId = process.env.ARBITRIUM_REQUEST_ID ?? "";
  readonly instanceEventUrl = process.env.NAKAMA_INSTANCE_EVENT_URL ?? "";
  readonly connectionEventUrl = process.env.NAKAMA_CONNECTION_EVENT_URL ?? "";
  /** Nakama's base URL and "?http_key=...&unwrap", taken from the event URLs. */
  readonly nakamaUrl: string;
  readonly rpcQuery: string;
  /** NAKAMA_INSTANCE_METADATA: what the Nakama module passed to Create. */
  readonly metadata: Record<string, unknown>;
  /** metadata.user_ids: the matched players, the only ones allowed in. */
  readonly expectedUserIds: string[];

  private readonly opts: Required<NakamaEdgegapOptions>;
  private stopping = false;
  private hadPlayers = false;
  private connected: string[] = [];
  private reported: string[] = [];
  private dirty = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(options: NakamaEdgegapOptions = {}) {
    this.opts = {
      noPlayersTimeoutMs: 60_000,
      maxMatchDurationMs: 20 * 60_000,
      connectionReportIntervalMs: 5_000,
      stopGracePeriodMs: 30_000,
      exit: () => process.exit(0),
      ...options,
    };
    const rpcIndex = this.instanceEventUrl.indexOf("/v2/rpc/");
    const queryIndex = this.instanceEventUrl.indexOf("?");
    const fromEvents = rpcIndex > 0 && queryIndex > rpcIndex;
    // Local tests without Edgegap: NAKAMA_URL points the server at Nakama directly.
    this.nakamaUrl = fromEvents ? this.instanceEventUrl.slice(0, rpcIndex) : process.env.NAKAMA_URL ?? "";
    this.rpcQuery = fromEvents ? this.instanceEventUrl.slice(queryIndex) : "";
    this.metadata = parseJson(process.env.NAKAMA_INSTANCE_METADATA) ?? {};
    const ids = this.metadata.user_ids;
    this.expectedUserIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  }

  /** True when Nakama started this server through the Fleet Manager. */
  isManaged(): boolean {
    return this.instanceEventUrl !== "";
  }

  /**
   * Tell Nakama the server is listening. Nakama notifies the players only now.
   * Includes the server's own address, because Nakama can run the READY callback
   * before Edgegap's ready webhook has stored the connection info.
   */
  async sendReady(message = "Game server is listening"): Promise<void> {
    this.timers.push(setInterval(() => void this.reportConnections(), this.opts.connectionReportIntervalMs));
    this.timers.push(setTimeout(() => {
      if (!this.hadPlayers) void this.stop(`No players connected within ${this.opts.noPlayersTimeoutMs / 1000} seconds`);
    }, this.opts.noPlayersTimeoutMs));
    this.timers.push(setTimeout(() => void this.stop("Reached the maximum match duration"), this.opts.maxMatchDurationMs));
    console.log(`Nakama: ${this.nakamaUrl || "(none)"}, instance '${this.instanceId}', expected players: ${JSON.stringify(this.expectedUserIds)}`);
    await this.sendInstanceEvent("READY", message, {
      game_server: {
        ARBITRIUM_REQUEST_ID: this.instanceId,
        ARBITRIUM_PUBLIC_IP: process.env.ARBITRIUM_PUBLIC_IP ?? "",
        ARBITRIUM_PORTS_MAPPING: parseJson(process.env.ARBITRIUM_PORTS_MAPPING) ?? {},
      },
    });
  }

  /** Report a failure to start (e.g. the port can't be bound). */
  async sendError(message: string): Promise<void> {
    await this.sendInstanceEvent("ERROR", message);
  }

  /** The full list of Nakama user IDs connected now. Stops when the last one leaves. */
  setConnectedUsers(userIds: string[]): void {
    this.connected = [...userIds];
    this.dirty = true;
    if (userIds.length > 0) this.hadPlayers = true;
    else if (this.hadPlayers) void this.stop("All players left");
  }

  /** Checks a Nakama session token with Nakama itself; null if the player doesn't belong here. */
  async verifyPlayer(token: string): Promise<PlayerAccount | null> {
    if (!this.nakamaUrl) {
      if (!this.instanceId) return { userId: `local-${Math.random().toString(36).slice(2, 8)}`, username: "Player" };
      console.error("No Nakama URL to verify players with");
      return null;
    }
    if (!token) return null;
    const res = await request("GET", `${this.nakamaUrl}/v2/account`, undefined, { Authorization: `Bearer ${token}` });
    if (res.status !== 200) {
      console.log(`Rejected a player: Nakama returned ${res.status} for their session`);
      return null;
    }
    const user = (parseJson(res.body)?.user ?? null) as { id?: string; username?: string } | null;
    if (!user?.id) return null;
    if (this.expectedUserIds.length > 0 && !this.expectedUserIds.includes(user.id)) {
      console.log(`Rejected user ${user.id}: not matched to this server`);
      return null;
    }
    return { userId: user.id, username: user.username ?? "" };
  }

  /** Calls a Nakama RPC server-to-server (http_key, unwrap: the body is the payload). */
  async callRpc(rpcId: string, payload: unknown): Promise<{ status: number; body: string }> {
    if (!this.nakamaUrl || !this.rpcQuery) return { status: 0, body: "not started by Nakama" };
    return request("POST", `${this.nakamaUrl}/v2/rpc/${rpcId}${this.rpcQuery}`, payload);
  }

  /** Records the winner through the module's report_match_result RPC. */
  async reportResult(winnerUserId: string, userIds: string[]): Promise<boolean> {
    const res = await this.callRpc("report_match_result", { instance_id: this.instanceId, winner_user_id: winnerUserId, user_ids: userIds });
    if (res.status !== 200) console.error(`report_match_result failed (${res.status}): ${res.body}`);
    return res.status === 200;
  }

  /** Asks Nakama to stop this deployment (STOP), and exits if that doesn't happen. */
  async stop(reason: string): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    console.log(`Stopping: ${reason}`);
    this.timers.forEach(clearTimeout);
    if (!this.isManaged()) return this.opts.exit();
    await this.reportConnections();
    await this.sendInstanceEvent("STOP", reason);
    setTimeout(this.opts.exit, this.opts.stopGracePeriodMs);
  }

  private async reportConnections(): Promise<void> {
    if (!this.dirty || !this.connectionEventUrl) return;
    this.dirty = false;
    if (sameList(this.connected, this.reported)) return;
    this.reported = [...this.connected];
    const res = await request("POST", this.connectionEventUrl, { instance_id: this.instanceId, connections: this.reported });
    if (res.status !== 200) console.error(`Connection event failed (${res.status}): ${res.body}`);
  }

  private async sendInstanceEvent(action: "READY" | "ERROR" | "STOP", message: string, metadata: Record<string, unknown> = {}): Promise<void> {
    if (!this.isManaged()) return;
    const res = await request("POST", this.instanceEventUrl, { instance_id: this.instanceId, action, message, metadata });
    if (res.status !== 200) console.error(`${action} event failed (${res.status}): ${res.body}`);
    else console.log(`Sent ${action} to Nakama`);
  }
}

async function request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: String(err) };
  }
}

function parseJson(value: string | undefined): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
```
