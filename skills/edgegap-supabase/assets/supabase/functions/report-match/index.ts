// Edge Function "report-match": the game server on Edgegap posts the result here when a match ends.
//
//   POST  x-game-server-secret: <GAME_SERVER_SECRET>
//   {deployment_id, matchmaker_match_id, profile, result, winner_id, players: [{ticket_id, user_id, score, place}]}
//
// The game server holds no Supabase key, only this shared secret (an Edgegap secret env var on the
// app version, a Supabase secret here). record_match() then checks that every player came with
// their own unused matchmaker ticket, so even a leaked secret can't hand out wins to players who
// were never matched together.

import { admin, corsHeaders, env, json } from "../_shared/supabase.ts";

const SECRET = env("GAME_SERVER_SECRET");

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!sameSecret(req.headers.get("x-game-server-secret") ?? "", SECRET)) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => null);
  if (!body?.deployment_id || !Array.isArray(body.players)) return json({ error: "deployment_id and players are required" }, 400);

  const { data, error } = await admin.rpc("record_match", {
    p_deployment_id: String(body.deployment_id),
    p_matchmaker_match_id: body.matchmaker_match_id ?? null,
    p_profile: body.profile ?? null,
    p_result: String(body.result ?? "").slice(0, 120),
    p_winner_id: body.winner_id ?? null,
    p_players: body.players.map((p: any) => ({
      ticket_id: String(p.ticket_id),
      user_id: String(p.user_id),
      score: Math.trunc(Number(p.score) || 0),
      place: Math.trunc(Number(p.place) || 0),
    })),
  });
  if (error) {
    console.error("record_match:", error.message);
    // 409 for a duplicate report (unique deployment_id), 422 for anything record_match refused.
    return json({ error: error.message }, error.code === "23505" ? 409 : 422);
  }
  return json({ match_id: data });
});
