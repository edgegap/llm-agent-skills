# `assets/server/src/auth.mjs`

Template file. Write the content of the code block below, without the fences, to `auth.mjs`.

```js
// Verifies join tokens signed by the Manus backend (assets/backend/joinToken.ts).
// The server holds only the public key (JOIN_TOKEN_PUBLIC_KEY, base64 SPKI DER), set as an env var
// on the Edgegap app version. It is not a secret: it can verify tokens, not mint them.
import { createPublicKey, verify } from "node:crypto";

const CLOCK_SKEW_S = 10;

export function createVerifier(env = process.env) {
  if (!env.JOIN_TOKEN_PUBLIC_KEY) throw new Error("JOIN_TOKEN_PUBLIC_KEY is not set");
  const key = createPublicKey({ key: Buffer.from(env.JOIN_TOKEN_PUBLIC_KEY, "base64"), format: "der", type: "spki" });
  // On Edgegap the token must name this deployment; locally (no ARBITRIUM_REQUEST_ID) it must say "local".
  const requestId = env.ARBITRIUM_REQUEST_ID ?? "local";
  // Matchmaker deployments get the matched ticket IDs; only those players may join.
  const ticketIds = env.MM_TICKET_IDS ? new Set(JSON.parse(env.MM_TICKET_IDS)) : null;
  const usedJti = new Map(); // jti -> exp, so a captured token can't be replayed

  return function verifyJoinToken(token) {
    if (typeof token !== "string" || token.length > 2048) return { ok: false, error: "malformed" };
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra !== undefined) return { ok: false, error: "malformed" };
    if (!verify(null, Buffer.from(body), key, Buffer.from(sig, "base64url"))) return { ok: false, error: "bad_signature" };

    let claims;
    try { claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return { ok: false, error: "malformed" }; }
    const now = Math.floor(Date.now() / 1000);
    if (claims.v !== 1 || typeof claims.sub !== "string") return { ok: false, error: "malformed" };
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) return { ok: false, error: "expired" };
    if (claims.rid !== requestId) return { ok: false, error: "wrong_server" };
    if (ticketIds && !ticketIds.has(claims.tid)) return { ok: false, error: "not_in_match" };

    for (const [jti, exp] of usedJti) if (exp + CLOCK_SKEW_S < now) usedJti.delete(jti);
    if (usedJti.has(claims.jti)) return { ok: false, error: "replayed" };
    usedJti.set(claims.jti, claims.exp);

    return { ok: true, steamId: claims.sub, ticketId: claims.tid };
  };
}

export function expectedPlayers(env = process.env) {
  return env.MM_TICKET_IDS ? JSON.parse(env.MM_TICKET_IDS).length : null;
}
```
