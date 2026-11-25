# `assets/backend/edgegapMatchmaker.ts`

Template file. Write the content of the code block below, without the fences, to `edgegapMatchmaker.ts`.

```ts
// Edgegap matchmaker, called from the Manus backend only. The browser never sees the matchmaker
// URL or its Auth Token: it calls this backend's join / status / cancel routes, and gets back
// either a queue status or the assigned server address plus a short-lived signed join token.
//
// Endpoints used (matchmaker 3.x, same paths as the Edgegap Unity SDK 3.5.5):
//   POST   {url}/tickets          { profile, attributes, player_ip }           one player
//   POST   {url}/group-tickets    { player_tickets: [{ profile, attributes, player_ip }] }  a party
//   GET    {url}/tickets/{id}     SEARCHING | MATCH_FOUND | HOST_ASSIGNED (+ assignment) | CANCELLED
//   DELETE {url}/tickets/{id}
// Header: Authorization: <matchmaker auth token>, raw, no "Bearer"/"token" prefix.
import { signJoinToken } from "./joinToken"; // match the project's import style (".js"/".ts" suffix if it uses one)

// ---------- Types ----------

export type QueueState = "creating" | "searching" | "match_found" | "host_assigned";

export interface Assignment {
  requestId: string; // Edgegap deployment request ID; the server checks the token is for it
  host: string; // <request_id>.pr.edgegap.net
  port: number; // external port of the game port
  url: string; // wss://host:port (the port must have TLS Upgrade on)
  location?: { city?: string; country?: string; continent?: string };
}

export interface QueueRecord {
  steamId: string;
  partyLeader: string; // own Steam ID when solo
  ticketId?: string;
  mode: string;
  regions: string[];
  state: QueueState;
  createdAt: number;
  updatedAt: number;
  lastPolledAt?: number;
  matchFoundAt?: number;
  deployRetries: number; // MATCH_FOUND -> SEARCHING flips: the deployment failed and was retried
  errorCount: number;
  assignment?: Assignment;
}

/**
 * One active queue entry per Steam ID. In production back it with the app's database and a
 * UNIQUE constraint on steam_id, so two tabs or two backend instances can't both create a ticket.
 */
export interface QueueStore {
  get(steamId: string): Promise<QueueRecord | null>;
  /** Insert only if no record exists for this Steam ID. Returns false if one exists. Must be atomic. */
  insert(record: QueueRecord): Promise<boolean>;
  put(record: QueueRecord): Promise<void>;
  delete(steamId: string): Promise<void>;
}

export type MatchmakingResult =
  | { status: "idle" }
  | { status: "searching"; since: number; retryAfterMs?: number }
  | { status: "match_found" } // a server is starting for this match
  | { status: "ready"; server: Assignment; joinToken: string; expiresInSeconds: number }
  | { status: "cancelled" | "timeout" | "expired" | "error"; reason: string; retryable: boolean };

export interface ModeConfig {
  profile: string; // profile name in the matchmaker config
  maxPartySize: number;
}

export interface MatchmakerConfig {
  url: string;
  token: string;
  modes: Record<string, ModeConfig>;
  regions: string[]; // values the "regions" intersection rule accepts
  gamePortName: string; // port name in the app version
  searchTimeoutMs: number; // give up searching and delete the ticket
  allocationTimeoutMs: number; // MATCH_FOUND for this long without a server = allocation error
  pollIntervalMs: number; // at most one matchmaker read per player per interval
  assignmentTtlMs: number; // how long a player may rejoin their assigned server
  creatingStaleMs: number; // a "creating" record older than this crashed mid-request
  maxDeploymentRetries: number; // match max_deployment_retry_count in the matchmaker config
  joinTokenTtlSeconds: number;
  requestTimeoutMs: number;
}

/** Reads server-side env vars. Mode and region lists are code, not secrets: edit the defaults. */
export function configFromEnv(): MatchmakerConfig {
  const url = process.env.EDGEGAP_MATCHMAKER_URL;
  const token = process.env.EDGEGAP_MATCHMAKER_TOKEN;
  if (!url || !token) throw new Error("EDGEGAP_MATCHMAKER_URL and EDGEGAP_MATCHMAKER_TOKEN must be set");
  return {
    url: url.replace(/\/+$/, ""),
    token: token.replace(/^(Bearer|token)\s+/i, ""), // the matchmaker wants the raw token
    modes: {
      casual: { profile: "casual", maxPartySize: 4 },
      duel: { profile: "duel", maxPartySize: 1 },
    },
    regions: ["north-america", "south-america", "europe", "asia", "oceania", "africa"],
    gamePortName: "gameport",
    searchTimeoutMs: 28_000,
    allocationTimeoutMs: 90_000,
    pollIntervalMs: 2_000,
    assignmentTtlMs: 30 * 60_000,
    creatingStaleMs: 20_000,
    maxDeploymentRetries: 3,
    joinTokenTtlSeconds: 60,
    requestTimeoutMs: 10_000,
  };
}

// ---------- Matchmaking service ----------

export interface Member {
  steamId: string; // from the verified session, never from the request body
  ip?: string; // the player's public IP, so Edgegap places the server near them
}

export interface JoinOptions {
  mode: string;
  regions?: string[]; // empty or missing = any region
}

export class Matchmaking {
  private cfg: MatchmakerConfig;
  private store: QueueStore;
  private now: () => number;

  constructor(cfg: MatchmakerConfig, store: QueueStore, now: () => number = Date.now) {
    this.cfg = cfg;
    this.store = store;
    this.now = now;
  }

  /** members[0] is the caller (party leader); the backend resolves the rest from its own party data. */
  async join(members: Member[], options: JoinOptions): Promise<MatchmakingResult> {
    const mode = this.cfg.modes[options.mode];
    if (!mode) return fail("error", "unknown_mode", false);
    if (members.length < 1 || members.length > mode.maxPartySize) return fail("error", "party_size", false);
    const regions = options.regions?.length ? options.regions : this.cfg.regions;
    if (regions.some((r) => !this.cfg.regions.includes(r))) return fail("error", "unknown_region", false);

    const leader = members[0].steamId;
    // Duplicate-ticket prevention: an existing live entry is returned as is, not replaced.
    for (const m of members) {
      const existing = await this.liveRecord(m.steamId);
      if (existing) return m.steamId === leader ? this.status(leader) : fail("error", "member_already_queued", false);
    }

    const t = this.now();
    const inserted: string[] = [];
    for (const m of members) {
      const ok = await this.store.insert({
        steamId: m.steamId, partyLeader: leader, mode: options.mode, regions,
        state: "creating", createdAt: t, updatedAt: t, deployRetries: 0, errorCount: 0,
      });
      if (!ok) {
        for (const id of inserted) await this.store.delete(id);
        return m.steamId === leader ? this.status(leader) : fail("error", "member_already_queued", false);
      }
      inserted.push(m.steamId);
    }

    const ticket = (m: Member) => ({
      profile: mode.profile,
      attributes: { regions },
      ...(m.ip ? { player_ip: m.ip } : {}),
    });

    let res: ApiResponse;
    if (members.length === 1) {
      res = await this.api("POST", "/tickets", ticket(members[0]));
    } else {
      res = await this.api("POST", "/group-tickets", { player_tickets: members.map(ticket) });
    }

    if (!res.ok) {
      for (const id of inserted) await this.store.delete(id);
      // A timed-out create may still have made a ticket; it expires on its own (ticket_expiration_period).
      return createError(res.status);
    }

    const tickets: any[] = members.length === 1 ? [res.body] : res.body?.player_tickets ?? [];
    if (tickets.length !== members.length || tickets.some((tk) => !tk?.id)) {
      for (const id of inserted) await this.store.delete(id);
      return fail("error", "unexpected_matchmaker_response", true);
    }

    for (let i = 0; i < members.length; i++) {
      const current = await this.store.get(members[i].steamId);
      if (!current) {
        // Cancelled while the create was in flight: remove the ticket we just made.
        await this.api("DELETE", `/tickets/${encodeURIComponent(tickets[i].id)}`);
        continue;
      }
      // Group tickets come back in request order.
      await this.store.put({ ...current, ticketId: tickets[i].id, state: "searching", updatedAt: this.now() });
    }
    return this.status(leader);
  }

  /** Browser polls this every ~2 s. Also the reconnect path: a fresh join token for the same server. */
  async status(steamId: string): Promise<MatchmakingResult> {
    const rec = await this.store.get(steamId);
    if (!rec) return { status: "idle" };
    const t = this.now();

    if (rec.state === "host_assigned" && rec.assignment) {
      if (t - rec.updatedAt > this.cfg.assignmentTtlMs) {
        await this.store.delete(steamId);
        return { status: "idle" };
      }
      return this.ready(rec);
    }

    if (rec.state === "creating" || !rec.ticketId) {
      if (t - rec.createdAt > this.cfg.creatingStaleMs) {
        await this.store.delete(steamId);
        return fail("error", "ticket_not_created", true);
      }
      return { status: "searching", since: rec.createdAt };
    }

    if (rec.state === "searching" && t - rec.createdAt > this.cfg.searchTimeoutMs) {
      await this.api("DELETE", `/tickets/${encodeURIComponent(rec.ticketId)}`);
      await this.store.delete(steamId);
      return fail("timeout", "no_match_in_time", true);
    }
    if (rec.state === "match_found" && rec.matchFoundAt && t - rec.matchFoundAt > this.cfg.allocationTimeoutMs) {
      await this.api("DELETE", `/tickets/${encodeURIComponent(rec.ticketId)}`);
      await this.store.delete(steamId);
      return fail("error", "server_allocation_timeout", true);
    }

    // Rate limits are per matchmaker (free tier: 10 ticket reads/s in total), so throttle per player.
    if (rec.lastPolledAt && t - rec.lastPolledAt < this.cfg.pollIntervalMs) return view(rec);

    const res = await this.api("GET", `/tickets/${encodeURIComponent(rec.ticketId)}`);
    rec.lastPolledAt = t;

    if (res.status === 404) {
      // Removed: expired, deleted, or a group member left.
      await this.store.delete(steamId);
      return fail("expired", "ticket_removed", true);
    }
    if (res.status === 429) {
      await this.store.put(rec);
      return { ...view(rec), retryAfterMs: 3_000 } as MatchmakingResult;
    }
    if (!res.ok) {
      rec.errorCount++;
      await this.store.put(rec);
      return rec.errorCount >= 5 ? fail("error", "matchmaker_unavailable", true) : view(rec);
    }
    rec.errorCount = 0;

    const ticket = res.body ?? {};
    switch (ticket.status) {
      case "SEARCHING":
        if (rec.state === "match_found") {
          // Back to searching after MATCH_FOUND: the deployment failed and the matchmaker retries.
          rec.deployRetries++;
          rec.matchFoundAt = undefined;
          if (rec.deployRetries > this.cfg.maxDeploymentRetries) {
            await this.api("DELETE", `/tickets/${encodeURIComponent(rec.ticketId)}`);
            await this.store.delete(steamId);
            return fail("error", "server_allocation_failed", true);
          }
        }
        rec.state = "searching";
        break;
      case "MATCH_FOUND":
        rec.state = "match_found";
        rec.matchFoundAt ??= t;
        break;
      case "HOST_ASSIGNED": {
        const assignment = toAssignment(ticket.assignment, this.cfg.gamePortName);
        if (!assignment) {
          await this.store.delete(steamId);
          return fail("error", "game_port_missing", false); // app version has no port with that name
        }
        rec.state = "host_assigned";
        rec.assignment = assignment;
        rec.updatedAt = t;
        await this.store.put(rec);
        return this.ready(rec);
      }
      case "CANCELLED":
        await this.store.delete(steamId);
        return fail("cancelled", "ticket_cancelled", true);
      default:
        break;
    }
    await this.store.put(rec);
    return view(rec);
  }

  async cancel(steamId: string): Promise<MatchmakingResult> {
    const rec = await this.store.get(steamId);
    if (!rec) return { status: "idle" };
    if (rec.state === "host_assigned") return fail("error", "already_matched", false); // use leave()
    if (!rec.ticketId) {
      await this.store.delete(steamId); // join() deletes the ticket when its create returns
      return fail("cancelled", "cancelled_by_player", true);
    }
    const res = await this.api("DELETE", `/tickets/${encodeURIComponent(rec.ticketId)}`);
    if (res.ok || res.status === 404) {
      await this.store.delete(steamId);
      return fail("cancelled", "cancelled_by_player", true);
    }
    if (res.status === 409) {
      // Too late: a match already formed. Keep polling; the server address follows.
      rec.state = "match_found";
      rec.matchFoundAt ??= this.now();
      await this.store.put(rec);
      return { status: "match_found" };
    }
    return fail("error", "cancel_failed", true);
  }

  /** The player left their match for good: forget the assignment so they can queue again. */
  async leave(steamId: string): Promise<MatchmakingResult> {
    const rec = await this.store.get(steamId);
    if (rec && rec.state !== "host_assigned") return this.cancel(steamId);
    await this.store.delete(steamId);
    return { status: "idle" };
  }

  // ---------- internals ----------

  private async liveRecord(steamId: string): Promise<QueueRecord | null> {
    const rec = await this.store.get(steamId);
    if (!rec) return null;
    const t = this.now();
    const stale =
      (rec.state === "creating" && t - rec.createdAt > this.cfg.creatingStaleMs) ||
      (rec.state === "host_assigned" && t - rec.updatedAt > this.cfg.assignmentTtlMs);
    if (stale) {
      await this.store.delete(steamId);
      return null;
    }
    return rec;
  }

  private ready(rec: QueueRecord): MatchmakingResult {
    const a = rec.assignment!;
    const ttl = this.cfg.joinTokenTtlSeconds;
    return {
      status: "ready",
      server: a,
      joinToken: signJoinToken({ steamId: rec.steamId, ticketId: rec.ticketId!, requestId: a.requestId }, ttl),
      expiresInSeconds: ttl,
    };
  }

  private async api(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    try {
      const res = await fetch(this.cfg.url + path, {
        method,
        headers: { Authorization: this.cfg.token, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
      });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      if (!res.ok) console.warn(`Edgegap matchmaker ${method} ${path.split("/")[1]} -> ${res.status}`, parsed);
      return { ok: res.ok, status: res.status, body: parsed };
    } catch (err) {
      console.warn(`Edgegap matchmaker ${method} ${path.split("/")[1]} failed`, (err as Error).message);
      return { ok: false, status: 0, body: null };
    }
  }
}

interface ApiResponse { ok: boolean; status: number; body: any }

function fail(status: "cancelled" | "timeout" | "expired" | "error", reason: string, retryable: boolean): MatchmakingResult {
  return { status, reason, retryable };
}

function createError(status: number): MatchmakingResult {
  if (status === 400) return fail("error", "ticket_rejected", false); // profile or attributes don't match the config
  if (status === 401 || status === 403) return fail("error", "matchmaker_auth", false);
  if (status === 429) return fail("error", "matchmaker_busy", true);
  return fail("error", "matchmaker_unavailable", true); // 5xx, network, offline matchmaker
}

function view(rec: QueueRecord): MatchmakingResult {
  return rec.state === "match_found" ? { status: "match_found" } : { status: "searching", since: rec.createdAt };
}

function toAssignment(a: any, portName: string): Assignment | null {
  const port = a?.ports?.[portName]?.external;
  if (!a?.fqdn || typeof port !== "number") return null;
  const requestId: string = a.request_id ?? String(a.fqdn).split(".")[0];
  const loc = a.location ?? {};
  return {
    requestId,
    host: a.fqdn,
    port,
    url: `wss://${a.fqdn}:${port}`,
    location: { city: loc.city, country: loc.country, continent: loc.continent },
  };
}

// ---------- Stores ----------

/** Single-process store for local tests. Use a database table in production (see references/backend.md). */
export class MemoryQueueStore implements QueueStore {
  private rows = new Map<string, QueueRecord>();
  async get(id: string) { const r = this.rows.get(id); return r ? { ...r } : null; }
  async insert(r: QueueRecord) { if (this.rows.has(r.steamId)) return false; this.rows.set(r.steamId, { ...r }); return true; }
  async put(r: QueueRecord) { this.rows.set(r.steamId, { ...r }); }
  async delete(id: string) { this.rows.delete(id); }
}
```
