// Edgegap matchmaker client on the official Edgegap JS SDK (npm i @edgegap/sdk: MIT, no
// dependencies), called straight from the browser.
//
// The SDK's GroupAgent queues the player as a group of one, polls it until a server is assigned,
// retries 429/5xx with jittered backoff, and leaves the queue on stopMatchmaking(). Its token is the
// matchmaker's client token: it is made to ship in game clients and can never touch the Edgegap
// account. The page's origin must be listed in the matchmaker config's allowed_cors_origins.

import { getConnectionUrl } from "@edgegap/sdk";
import { GroupAgent, type MatchmakingError } from "@edgegap/sdk/matchmaking";

export interface MatchmakerOptions {
  url: string;
  token: string;
  profile: string;
  attributes?: Record<string, unknown>; // only for profiles with rules besides player_count
  portName?: string; // port name in the Edgegap app version
  onStatus?: (status: string) => void;
}

const FOUND = "Match found, starting server...";
const STATUS: Record<string, string> = { SEARCHING: "Searching for players...", TEAM_FOUND: FOUND, MATCH_FOUND: FOUND };

export class Matchmaker {
  /** The matchmaker ticket ID once queued. Send it in the join options if the server checks MM_TICKET_IDS. */
  ticketId: string | null = null;
  private agent: GroupAgent<Record<string, unknown>> | null = null;
  private o: Required<MatchmakerOptions>;

  constructor(options: MatchmakerOptions) {
    this.o = { attributes: {}, portName: "gameport", onStatus: () => {}, ...options };
    // Leave the queue if the tab closes while searching (web builds; native and mini-game builds may
    // have no window events, so the component's onDestroy calls cancel() too).
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", () => this.cancel());
    }
  }

  /** Queues one player and resolves with the game server's wss:// URL once a server is assigned. */
  async findMatch(): Promise<string> {
    this.o.onStatus("Joining queue...");
    this.ticketId = null;
    this.agent?.dispose();
    const agent = (this.agent = new GroupAgent({ baseUrl: this.o.url, authToken: this.o.token, logGroupUpdates: false }));
    agent.initialize(undefined, (group, _type, _message, event) => {
      this.ticketId = group.current?.ticket_id ?? this.ticketId;
      const status = event.code === "updated" ? STATUS[event.status ?? ""] : undefined;
      if (status) this.o.onStatus(status);
    });
    agent.createGroup({ profile: this.o.profile, attributes: this.o.attributes, is_ready: true }, true);
    try {
      const assignment = await agent.nextAssignment();
      // Matched: dispose so the agent's timers stop; leaving the group now would only get a 409.
      agent.dispose();
      this.agent = null;
      // The port is WS with TLS Upgrade on: wss://<fqdn>:<port>, and the certificate matches the fqdn.
      return getConnectionUrl(assignment, this.o.portName);
    } catch (e) {
      const err = e as MatchmakingError;
      // The ticket expired (CANCELLED), the search was cancelled, or polling gave up.
      const expired = err.event?.code === "updated" && err.event.status === "CANCELLED";
      throw new Error(expired ? "Ticket expired before a match was found" : err.message);
    }
  }

  cancel() {
    // Leaves the queue while searching (also aborts a group creation still in flight). After a match
    // the agent is already disposed. On pagehide the DELETE may not get out: the ticket then
    // expires on its own after the profile's ticket_expiration_period.
    this.agent?.stopMatchmaking();
  }
}
