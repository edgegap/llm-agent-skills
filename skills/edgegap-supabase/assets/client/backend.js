// Supabase on the client: anonymous sign-in, the player's profile, the live leaderboard and Find
// Match through the "matchmaking" Edge Function. supabase-js is loaded as a classic script in
// index.html (global `supabase`).
//
// The page only ever holds the project URL and the publishable key, both made to ship in clients.
// Row Level Security decides what a player can read and change; the Edgegap matchmaker token lives
// in the Edge Function's secrets.

const MATCHMAKING_STATUS = {
  SEARCHING: "Searching for players...",
  TEAM_FOUND: "Match found! Starting a server near you...",
  MATCH_FOUND: "Match found! Starting a server near you...",
  HOST_ASSIGNED: "Server ready!",
};

export async function connectBackend({ supabaseUrl, supabasePublishableKey }) {
  const db = globalThis.supabase.createClient(supabaseUrl, supabasePublishableKey);

  // Anonymous sign-in: a real Supabase user with no email or password. The session is kept in
  // localStorage, so the same player (and their wins) comes back on the next visit.
  let {
    data: { session },
  } = await db.auth.getSession();
  if (!session) {
    const { data, error } = await db.auth.signInAnonymously();
    if (error) throw new Error(`Supabase sign-in failed: ${error.message}`);
    session = data.session;
  }
  const userId = session.user.id;

  const loadProfile = async () => {
    const { data, error } = await db.from("profiles").select("display_name, wins, matches_played").eq("id", userId).single();
    if (error) throw new Error(`Profile: ${error.message}`);
    return data;
  };

  /** Calls the matchmaking Edge Function with the player's session. */
  const matchmaking = async (action) => {
    const { data, error } = await db.functions.invoke("matchmaking", { body: { action } });
    if (error) {
      const detail = await error.context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    return data;
  };

  /**
   * Cancel when the page is closing. A normal invoke() is usually killed with the page, which
   * leaves the search in the queue until it expires and can still start a server for nobody, so
   * this sends a keepalive request the browser finishes after the page is gone.
   */
  const cancelOnExit = () => {
    if (!sessionToken) return;
    fetch(`${supabaseUrl}/functions/v1/matchmaking`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}`, apikey: supabasePublishableKey },
      body: JSON.stringify({ action: "cancel" }),
    }).catch(() => {});
  };
  let sessionToken = session.access_token;
  db.auth.onAuthStateChange((_event, s) => (sessionToken = s?.access_token ?? null));

  return {
    db,
    userId,
    profile: await loadProfile(),
    loadProfile,

    /** Current access token, refreshed by supabase-js when needed. The game server verifies it. */
    async accessToken() {
      const { data } = await db.auth.getSession();
      return data.session?.access_token;
    },

    async rename(name) {
      const { error } = await db.from("profiles").update({ display_name: name }).eq("id", userId);
      if (error) throw new Error(error.message);
    },

    /** Top players, refreshed live through Supabase Realtime whenever a profile changes. */
    watchLeaderboard(onChange, limit = 10) {
      const load = async () => {
        const { data } = await db
          .from("profiles")
          .select("id, display_name, wins, matches_played")
          .gt("matches_played", 0)
          .order("wins", { ascending: false })
          .order("matches_played", { ascending: true })
          .limit(limit);
        onChange(data ?? []);
      };
      load();
      db.channel("leaderboard")
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
        .subscribe();
    },

    /**
     * Queue for a match and wait for the server. Resolves with { url, ticketId }.
     * `signal` (AbortSignal) cancels the ticket.
     */
    async findMatch(onStatus, signal) {
      await matchmaking("join");
      onStatus(MATCHMAKING_STATUS.SEARCHING);
      const cancel = () => matchmaking("cancel").catch(() => {});
      signal?.addEventListener("abort", cancel, { once: true });
      addEventListener("pagehide", cancelOnExit);
      try {
        for (;;) {
          await new Promise((r) => setTimeout(r, 1500));
          if (signal?.aborted) throw new Error("Cancelled.");
          const res = await matchmaking("status");
          if (res.url) return { url: res.url, ticketId: res.ticket_id };
          if (res.status === "EXPIRED" || res.status === "CANCELLED") throw new Error("No match found in time. Try again.");
          onStatus(MATCHMAKING_STATUS[res.status] ?? res.status);
        }
      } finally {
        signal?.removeEventListener("abort", cancel);
        removeEventListener("pagehide", cancelOnExit);
      }
    },
  };
}
