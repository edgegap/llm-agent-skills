# `assets/backend/steamAuth.ts`

Template file. Write the content of the code block below, without the fences, to `steamAuth.ts`.

```ts
// Steam sign-in for a browser game: OpenID 2.0 against steamcommunity.com, verified on the backend.
// The browser never sends a Steam ID we trust. It is redirected to Steam, comes back with signed
// OpenID fields, and the backend asks Steam (check_authentication) whether they are genuine.
// Only then does it read the Steam ID and put it in the app's own server-side session.
//
// Env (server-side): PUBLIC_BASE_URL, e.g. https://mygame.manus.space (no trailing slash).
// Optional: STEAM_WEB_API_KEY for the persona name (never sent to the browser).

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

function baseUrl(): string {
  const url = process.env.PUBLIC_BASE_URL;
  if (!url) throw new Error("PUBLIC_BASE_URL is not set");
  return url.replace(/\/+$/, "");
}

/** URL to redirect the browser to. `returnPath` is the backend route that calls verifySteamLogin. */
export function steamLoginUrl(returnPath = "/api/auth/steam/callback"): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": baseUrl() + returnPath,
    "openid.realm": baseUrl(),
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * Verifies the query string Steam redirected back with. Returns the SteamID64, or null.
 * `query` is the parsed query of the callback request (all `openid.*` fields).
 */
export async function verifySteamLogin(
  query: Record<string, string | undefined>,
  returnPath = "/api/auth/steam/callback",
): Promise<string | null> {
  if (query["openid.mode"] !== "id_res") return null;
  if (query["openid.op_endpoint"] !== STEAM_OPENID) return null;
  // return_to must be ours, or a login made for another site could be replayed here.
  const returnTo = query["openid.return_to"] ?? "";
  if (returnTo.split("?")[0] !== baseUrl() + returnPath) return null;
  const match = CLAIMED_ID.exec(query["openid.claimed_id"] ?? "");
  if (!match || query["openid.identity"] !== query["openid.claimed_id"]) return null;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && value !== undefined) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");

  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return /^is_valid\s*:\s*true\s*$/m.test(text) ? match[1] : null;
}

/** Optional: persona name and avatar, read with the Web API key on the backend. */
export async function steamProfile(steamId: string): Promise<{ name: string; avatar: string } | null> {
  const key = process.env.STEAM_WEB_API_KEY;
  if (!key) return null;
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const player = (await res.json())?.response?.players?.[0];
  return player ? { name: player.personaname, avatar: player.avatarfull } : null;
}
```
