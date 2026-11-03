// Edge Function "matchmaking": the browser's only way into the Edgegap matchmaker.
//
//   POST {action: "join"}    -> queue the signed-in player, returns {status}
//   POST {action: "status"}  -> {status, ticket_id?, url?} (both once HOST_ASSIGNED)
//   POST {action: "cancel"}  -> leave the queue: {status: "CANCELLED"}, or the current status if
//                               the match was already formed (the matchmaker refuses then)
//
// The player must send their Supabase session (Authorization: Bearer <access token>). The
// matchmaker URL and Auth Token stay in Supabase secrets, so only signed-in players can queue and
// every ticket is tied to a Supabase user in public.tickets. The game server later reports results
// per ticket, and record_match() checks each ticket against that row.
//
// Edgegap matchmaker group API (a solo player is a group of one):
//   POST   /groups                               {profile, attributes, is_ready} -> {group_id, member_id}
//   GET    /groups/{group_id}/members/{member_id} -> {status, ticket_id, assignment: {ports: {gameport: {link}}}}
//   (ticket_id stays null until the player is matched)
//   DELETE /groups/{group_id}                  (the player owns their group of one; 409 once matched)

import { admin, corsHeaders, env, json } from "../_shared/supabase.ts";

const MM_URL = env("EDGEGAP_MM_URL").replace(/\/+$/, "");
const MM_TOKEN = env("EDGEGAP_MM_TOKEN");
const PROFILE = Deno.env.get("EDGEGAP_MM_PROFILE") ?? "sumo";
const PORT_NAME = "gameport";

async function mm(method: string, path: string, body?: unknown) {
  const res = await fetch(`${MM_URL}${path}`, {
    method,
    headers: { Authorization: MM_TOKEN, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { status: res.status, ok: res.ok, data };
}

/** The ticket this player queued last that hasn't been played yet. */
async function openTicket(userId: string) {
  const { data } = await admin
    .from("tickets")
    .select("*")
    .eq("user_id", userId)
    .is("match_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Leave the queue. Returns the ticket's status afterwards: "CANCELLED" when the matchmaker let the
 * player go, or what it is now when it refused because the match was already formed (a deployment
 * is starting; the game server stops itself if this player never joins).
 */
async function cancel(ticket: any): Promise<string | null> {
  if (!ticket) return null;
  if (ticket.connect_url || ["CANCELLED", "EXPIRED"].includes(ticket.status)) return ticket.status;
  const res = await mm("DELETE", `/groups/${ticket.group_id}`);
  if (res.ok || res.status === 404) {
    await admin.from("tickets").update({ status: "CANCELLED" }).eq("id", ticket.id);
    return "CANCELLED";
  }
  console.warn(`cancel ${ticket.id}: matchmaker HTTP ${res.status} ${JSON.stringify(res.data)}`);
  return ticket.status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  const user = auth?.user;
  if (authError || !user) return json({ error: "Sign in first" }, 401);

  const { action } = await req.json().catch(() => ({ action: null }));

  if (action === "join") {
    // One queue entry per player: a second Find Match replaces the first.
    await cancel(await openTicket(user.id));
    const res = await mm("POST", "/groups", { profile: PROFILE, attributes: {}, is_ready: true });
    if (!res.ok) return json({ error: `Matchmaker: HTTP ${res.status} ${res.data?.message ?? ""}`.trim() }, 502);
    const { group_id, member_id } = res.data;
    const { error } = await admin.from("tickets").insert({ id: member_id, user_id: user.id, group_id, profile: PROFILE });
    if (error) return json({ error: error.message }, 500);
    return json({ status: "SEARCHING" });
  }

  const ticket = await openTicket(user.id);
  if (!ticket) return json({ error: "No open ticket: join first" }, 404);

  if (action === "status") {
    if (ticket.connect_url) return json({ ticket_id: ticket.ticket_id, status: ticket.status, url: ticket.connect_url });
    if (["CANCELLED", "EXPIRED"].includes(ticket.status)) return json({ status: ticket.status });
    const res = await mm("GET", `/groups/${ticket.group_id}/members/${ticket.id}`);
    // The matchmaker drops expired tickets: tell the page to queue again.
    if (res.status === 404) {
      await admin.from("tickets").update({ status: "EXPIRED" }).eq("id", ticket.id);
      return json({ status: "EXPIRED" });
    }
    if (!res.ok) return json({ error: `Matchmaker: HTTP ${res.status}` }, 502);
    const status: string = res.data.status ?? "SEARCHING";
    const ticketId: string | null = res.data.ticket_id ?? null;
    const link = res.data.assignment?.ports?.[PORT_NAME]?.link;
    // TLS Upgrade is on for the port, so connect by fqdn with wss: the certificate matches it.
    const url = status === "HOST_ASSIGNED" && link ? `wss://${link}` : null;
    if (status !== ticket.status || ticketId !== ticket.ticket_id || url) {
      await admin.from("tickets").update({ status, ticket_id: ticketId, connect_url: url }).eq("id", ticket.id);
    }
    return json({ status, ticket_id: ticketId, url });
  }

  if (action === "cancel") {
    return json({ status: await cancel(ticket) });
  }

  return json({ error: "action must be join, status or cancel" }, 400);
});
