// Supabase integration on the game server: who is this player, and where do results go.
//
// The server holds no Supabase key. It needs:
//   SUPABASE_URL         https://<project-ref>.supabase.co (public)
//   GAME_SERVER_SECRET   shared with the report-match Edge Function (Edgegap secret env var)
//
// Players send their Supabase access token in the hello message. The server checks its signature
// against the project's public signing keys (JWKS), so it learns the player's user id without a
// round trip to Supabase per player and without trusting anything the browser says about itself.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { log } from "./edgegap.js";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SECRET = process.env.GAME_SERVER_SECRET;

export const supabaseEnabled = !!SUPABASE_URL;

const jwks = SUPABASE_URL ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)) : null;

/** Verify a Supabase access token. Returns { userId } or throws. */
export async function verifyPlayer(token) {
  if (!jwks) throw new Error("SUPABASE_URL is not set");
  if (typeof token !== "string" || !token) throw new Error("Sign in first");
  const { payload } = await jwtVerify(token, jwks, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
  return { userId: payload.sub, anonymous: !!payload.is_anonymous };
}

/**
 * Send a finished match to the report-match Edge Function.
 * players: [{ ticket_id, user_id, score, place }], humans with a verified user id only.
 */
export async function reportMatch({ deploymentId, match, result, winnerId, players }) {
  if (!SUPABASE_URL || !SECRET) return log("supabase: SUPABASE_URL or GAME_SERVER_SECRET not set, result not reported");
  if (!players.length) return log("supabase: no signed-in players to report");
  const body = {
    deployment_id: deploymentId,
    matchmaker_match_id: match?.id ?? null,
    profile: match?.profile ?? null,
    result,
    winner_id: winnerId,
    players,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/report-match`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-game-server-secret": SECRET },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      log(`supabase: report-match HTTP ${res.status} ${text}`);
      if (res.ok || res.status < 500) return;
    } catch (err) {
      log(`supabase: report-match failed (${err.message}), attempt ${attempt}/3`);
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
}
