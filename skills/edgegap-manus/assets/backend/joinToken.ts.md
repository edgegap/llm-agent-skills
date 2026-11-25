# `assets/backend/joinToken.ts`

Template file. Write the content of the code block below, without the fences, to `joinToken.ts`.

```ts
// Short-lived join tokens: the Manus backend signs them, the Edgegap game server verifies them.
// Ed25519 keeps the signing key on the backend only; the game server gets the public key,
// which is not a secret. Generate the pair with assets/scripts/gen-join-keys.mjs.
//
// Token format: base64url(JSON payload) + "." + base64url(signature)
// Payload: { v, sub (Steam ID), tid (matchmaker ticket ID), rid (deployment request ID), iat, exp, jti }
import { createPrivateKey, randomUUID, sign, type KeyObject } from "node:crypto";

export interface JoinTokenClaims {
  steamId: string;
  ticketId: string;
  requestId: string;
}

let cachedKey: KeyObject | null = null;

function privateKey(): KeyObject {
  if (cachedKey) return cachedKey;
  const b64 = process.env.JOIN_TOKEN_PRIVATE_KEY; // server-side secret, base64 PKCS#8 DER
  if (!b64) throw new Error("JOIN_TOKEN_PRIVATE_KEY is not set");
  cachedKey = createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
  return cachedKey;
}

export function signJoinToken(claims: JoinTokenClaims, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    sub: claims.steamId,
    tid: claims.ticketId,
    rid: claims.requestId,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(body), privateKey()).toString("base64url");
  return `${body}.${signature}`;
}
```
