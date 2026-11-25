# `assets/backend/routes.example.ts`

Template file. Write the content of the code block below, without the fences, to `routes.example.ts`.

```ts
// Example wiring for an Express-style backend. Manus projects differ (Express, tRPC, Hono, ...):
// keep the behaviour, adapt the syntax. What matters:
//   - the Steam ID comes from the server-side session set by the Steam callback, never from the body;
//   - the player's IP comes from the hosting proxy's header, so Edgegap places the server near them;
//   - responses carry only queue status, server address and the join token. No matchmaker URL or token.
import type { Request, Response, Router } from "express";
import { configFromEnv, Matchmaking, MemoryQueueStore, type Member } from "./edgegapMatchmaker";
import { steamLoginUrl, verifySteamLogin } from "./steamAuth";

// Replace MemoryQueueStore with a database-backed QueueStore (references/backend.md §3) before
// running more than one backend instance; the in-memory one loses the queue on every restart.
const matchmaking = new Matchmaking(configFromEnv(), new MemoryQueueStore());

/** The app's own session. Set it only in the Steam callback below. */
function sessionSteamId(req: Request): string | null {
  return (req as any).session?.steamId ?? null;
}

/**
 * Player's public IP. Use the header the hosting proxy sets, read from the right: the left-most
 * X-Forwarded-For entries are whatever the browser sent. Log it once on the deployed site to
 * check it is the player's IP and not the proxy's. Private or missing IP: send none, and Edgegap
 * uses the request IP, which is the backend's, so servers land near the backend instead.
 */
function playerIp(req: Request): string | undefined {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = forwarded.at(-1) ?? req.socket.remoteAddress ?? "";
  const plain = ip.replace(/^::ffff:/, "");
  const isPrivate = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(plain);
  return plain && !isPrivate ? plain : undefined;
}

function requireSteam(req: Request, res: Response): string | null {
  const steamId = sessionSteamId(req);
  if (!steamId) res.status(401).json({ status: "error", reason: "not_signed_in", retryable: false });
  return steamId;
}

const httpStatus: Record<string, number> = { idle: 200, searching: 200, match_found: 200, ready: 200, cancelled: 200, timeout: 200, expired: 200 };

export function mountEdgegapRoutes(router: Router) {
  // --- Steam sign-in ---
  router.get("/api/auth/steam", (_req, res) => res.redirect(steamLoginUrl()));

  router.get("/api/auth/steam/callback", async (req, res) => {
    const steamId = await verifySteamLogin(req.query as Record<string, string>);
    if (!steamId) return res.status(401).send("Steam sign-in failed");
    const r = req as any;
    // New session ID after login (express-session), so a pre-login session ID can't be reused.
    // regenerate() replaces req.session, so set the Steam ID in its callback.
    const save = () => { r.session.steamId = steamId; res.redirect("/"); };
    if (typeof r.session?.regenerate === "function") r.session.regenerate(() => save());
    else save();
  });

  // --- Matchmaking ---
  router.post("/api/matchmaking/join", async (req, res) => {
    const steamId = requireSteam(req, res);
    if (!steamId) return;
    const { mode, regions } = req.body ?? {};
    // Parties: resolve members from the backend's own party table, never from the request.
    const members: Member[] = [{ steamId, ip: playerIp(req) }];
    const result = await matchmaking.join(members, { mode: String(mode ?? ""), regions: Array.isArray(regions) ? regions.map(String) : [] });
    res.status(httpStatus[result.status] ?? (("retryable" in result && result.retryable) ? 503 : 400)).json(result);
  });

  router.get("/api/matchmaking/status", async (req, res) => {
    const steamId = requireSteam(req, res);
    if (!steamId) return;
    res.set("Cache-Control", "no-store").json(await matchmaking.status(steamId));
  });

  router.post("/api/matchmaking/cancel", async (req, res) => {
    const steamId = requireSteam(req, res);
    if (!steamId) return;
    res.json(await matchmaking.cancel(steamId));
  });

  router.post("/api/matchmaking/leave", async (req, res) => {
    const steamId = requireSteam(req, res);
    if (!steamId) return;
    res.json(await matchmaking.leave(steamId));
  });
}
```
