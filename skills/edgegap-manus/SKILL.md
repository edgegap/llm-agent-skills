---
name: edgegap-manus
description: 'Manus + Edgegap: turn a browser game built with Manus (manus.im, Manus Game Dev, a Manus web app, or its code exported to GitHub) into an online multiplayer game with an authoritative dedicated server and matchmaking on Edgegap. Load this before using any Edgegap MCP tool on a Manus project. It has templates: Steam sign-in verified on the backend, backend join/status/cancel/leave routes that create Edgegap matchmaker tickets (mode, region, party, player IP) and return only the server address and a signed join token, a Node.js WebSocket game server that self-stops, a browser client with reconnect, a Dockerfile, a GitHub Actions image build, and a matchmaker config. Use when a Manus user wants online play: "make my Manus game multiplayer", "add matchmaking", "Find Match", "Steam login for my web game", "host my HTML5/JavaScript game server", or is debugging wss, CORS, tickets or deployments for a Manus game. Other Three.js/web games without sign-in: edgegap-threejs. Unity: edgegap-unity.'
metadata:
  version: "0.1.5"
---

# Edgegap for Manus games: dedicated servers + matchmaking

Goal: a player signs in with Steam on the Manus site, clicks **Find Match**, the Manus backend gets them a seat on an Edgegap server near them, the browser connects over `wss`, the server runs the game, and the server stops its own deployment when the match is over. Done means two real players did that on the published site, not that the code compiles.

```
Browser (Manus site)  ──session cookie──▶  Manus backend  ──Auth Token──▶  Edgegap matchmaker
   │  join / status / cancel / leave           │  Steam OpenID check          │  match found → deploys
   │◀── server address + join token ───────────┘  signs join token (Ed25519)  ▼  the game server image
   └──────────── wss://<id>.pr.edgegap.net:<port>  {join, token} ───────▶  Game server (Edgegap)
                                                              verifies token with the public key
```

Why this shape, so you can defend it when the developer asks for shortcuts:
- **The backend creates tickets, not the browser.** The matchmaker Auth Token is client-safe by design, but keeping it on the backend lets the backend tie every ticket to a verified Steam account, stop duplicates and enforce parties. It also means no `allowed_cors_origins`.
- **Steam IDs come only from the backend session.** A Steam ID in a request body is a claim anyone can type.
- **The join token is what lets a player in.** Signed by the backend, bound to the Steam ID, the ticket and the deployment, valid 60 s, single use. The server holds only the public key, so a leaked image or env var can't mint tokens.
- **The server is authoritative.** Browser code is readable by anyone. Rules, scores and timers that stay in the browser can be changed from the console.

This skill's templates were tested locally against a mock matchmaker: the backend flow (join, duplicate join, cancel, timeout, allocation failures, 400 and 404), join tokens (accepted once; wrong server, wrong ticket, forged, expired and replayed tokens rejected), reconnect, snapshots, self-stop, and the Docker image. The browser client is type-checked only. **Not yet run end to end on Edgegap and Manus hosting**: verify each phase's check, and tell the developer that.

## How to work

- **Be the engineer.** Read the code, write it, run what you can (Manus has a sandbox; Claude Code has a terminal). Hand the developer only account steps: Steam Web API key, Edgegap dashboard, GitHub secrets, playtesting.
- **One layer at a time**: local server → Docker → one Edgegap deployment → matchmaker → published site. Each phase has a check; don't stack the next layer on an unproven one.
- **Secrets** (full rules: [the edgegap skill's agent rules](../edgegap/references/agent-rules.md) when the pack is installed): the matchmaker Auth Token, Steam Web API key and join-token private key live only in the Manus backend's secrets (Manus stores keys given in chat as server-side env vars). The Edgegap API token is not needed by the game at all; never put it in the Manus project. Ask the developer to run `assets/scripts/gen-join-keys.mjs` in their own terminal so the private key doesn't pass through chat; if they paste a secret anyway, use it once and don't repeat it.
- **Money.** Ask before deploying. Tag test deployments, stop only those you started. Free tier: one deployment at a time.

## Phase 0: Understand the game

Read, don't ask:
- Where the game runs: a Manus web app with a backend (look for a server folder, `package.json` scripts, API routes, a database layer) or a static page. A static page needs a backend first: ask Manus to make it a full-stack web app.
- The framework and language of the backend (Express, tRPC, Hono, Next.js API routes...): the templates are TypeScript on Node; adapt syntax, keep behaviour.
- The game loop: canvas/Phaser/Three.js/PixiJS, where state lives, what the player controls, what decides winning. List the rules that must move to the server.
- Existing multiplayer: none, peer-to-peer (WebRTC), a Manus-hosted realtime server, or a third-party service. Whatever it is, the Edgegap server replaces the match part.
- Existing auth: Steam already, Manus login, or none. GitHub sync: is the project connected (Manus → GitHub integration)? The image build uses it.

Then ask, in one message, only what you couldn't infer: players per match per mode, which regions to offer, party size, whether a solo player should get a match after a wait (useful for testing), Edgegap account, Steam Web API key (optional, for names). Offer defaults: modes `casual` (2-8) and `duel` (1v1), all regions, parties up to 4.

## Phase 1: Authoritative game server, local

Read `references/server.md`.
1. Create `game-server/` from `assets/server/` (`package.json`, `Dockerfile`, `.dockerignore`, `src/`). Keep it outside the web app's build: own `package.json`, not imported by the frontend.
2. Move the game rules into `src/game.mjs` (replace the example; keep its interface: `addPlayer`, `setConnected`, `input`, `tick`, `snapshot`, `overReason`, `results`). The browser keeps rendering, input capture and prediction only.
3. Change the browser game to send inputs and render `state` snapshots, through `MatchClient.send` and `onMessage` (`assets/client/matchmakingClient.ts`). Interpolate between snapshots; the server ticks at 20 Hz.
4. Local run: `node assets/scripts/gen-join-keys.mjs` (test keys), start the server with `JOIN_TOKEN_PUBLIC_KEY`, mint tokens with `assets/scripts/dev-token.mjs`, and connect two tabs to `ws://localhost:7777` (`references/server.md` §4).

✅ Check: the server logs `Listening on 0.0.0.0:7777` and `2 player(s) connected.`, both tabs see each other move, a wrong or reused token is rejected, and closing both tabs logs `Stopping deployment: all players left` 30 s later.

## Phase 2: Steam sign-in and the matchmaking backend

Read `references/backend.md`.
1. Copy `assets/backend/` (`steamAuth.ts`, `joinToken.ts`, `edgegapMatchmaker.ts`) into the backend, and wire the routes like `routes.example.ts` in the backend's own framework.
2. Replace `MemoryQueueStore` with a database table with a unique key on the Steam ID (`references/backend.md` §3). That unique key is the duplicate-ticket guard.
3. Server-side secrets: `EDGEGAP_MATCHMAKER_URL`, `EDGEGAP_MATCHMAKER_TOKEN` (Phase 4), `JOIN_TOKEN_PRIVATE_KEY`, `PUBLIC_BASE_URL`, optional `STEAM_WEB_API_KEY`. Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`.
4. Edit the `modes` and `regions` in `configFromEnv()` to the game's, matching the matchmaker config.
5. Add Find Match / Cancel / status UI with `MatchClient`; call `resume()` on page load so a reload rejoins.

✅ Check: on the published site, Steam sign-in shows the player's Steam ID from `/api/me` (or similar) and a forged `steamid` in a request body changes nothing; `POST /api/matchmaking/join` twice returns the same queue entry, not two tickets. The matchmaker itself comes in Phase 4.

## Phase 3: Image, registry, one Edgegap deployment

Read `references/deploy.md`.
1. Registry: the developer copies the registry username and token from the Edgegap dashboard (Container Registry) into GitHub repository secrets; `EDGEGAP_IMAGE` as a repository variable.
2. Copy `assets/github/edgegap-game-server.yml` to `.github/workflows/`. Manus pushes to GitHub, the workflow builds `linux/amd64` and pushes a dated tag. (Docker on a machine works too: `references/deploy.md` §2.)
3. App and version (Edgegap MCP `edgegap_create_app` / `edgegap_create_app_version`, or the dashboard): port `7777`, name `gameport`, protocol **WS**, **TLS Upgrade on**; env `JOIN_TOKEN_PUBLIC_KEY`; 0.25 vCPU / 512 MB to start; registry credentials set.
4. One test deployment (ask first), then connect with a token minted for its request ID: `node dev-token.mjs <steamId> <request_id>` and `wss://<fqdn>:<external port>`.

✅ Check: the browser connects over `wss` to the deployment and gets `welcome`; the server logs `1 player(s) connected.`; after you close it, it stops itself (or you stop it by request ID). Don't add the matchmaker on an unproven server.

## Phase 4: Matchmaker

Read `references/deploy.md` §5.
1. Start from `assets/matchmaker/manus-modes-regions.json`: set `application.name`/`version`, one profile per mode with its player count, the `regions` rule kept as is. No `allowed_cors_origins`: browsers never call the matchmaker.
2. Dashboard: Matchmaker → Create → upload → Create and Start → copy the **API URL** and **Auth Token** into the backend secrets.
3. `curl -H "Authorization: <token>" <url>/monitor` answers.

## Phase 5: End-to-end test and hand-off

1. `edgegap_list_deployments`: nothing of yours left running (free tier: a leftover blocks matchmaker deployments).
2. Two Steam accounts in two browsers (or one normal and one private window), same mode and region, Find Match in both: searching → server starting → connecting → connected, same server.
3. Reload one tab mid-match: it reconnects to the same server and keeps its state.
4. Cancel while searching: the queue entry and ticket are gone; Find Match works again.
5. Both leave: `Stopping deployment: all players left`, the deployment disappears.
6. Debug with `references/troubleshooting.md`.

Hand-off: what was built and where, secrets and where each lives, app/version/matchmaker names, how to ship a new server build (push → new tag → new app version → matchmaker Stop → Edit `application.version` → Start), free-tier limits (matchmaker stops every 3 hours, one deployment at a time), and next steps: real parties, match results to the backend, a production matchmaker tier.

## Reference files

- `references/backend.md`: the browser ↔ backend contract, Steam OpenID, the queue table, player IP, join tokens, every error and what the UI shows.
- `references/server.md`: moving rules to the server, the WebSocket protocol, lifecycle and self-stop, local testing, porting tips for common browser engines.
- `references/deploy.md`: registry, GitHub Actions, app version with TLS Upgrade, test deployment, matchmaker config and dashboard, shipping updates, the Edgegap MCP in Manus.
- `references/troubleshooting.md`: symptom → fix.
- `assets/`: `backend/`, `server/`, `client/`, `matchmaker/`, `github/`, `scripts/`, and `manus-prompts.md` (phase-by-phase prompts for Manus users).

Related skills in this pack, if installed: `edgegap` (platform and safety rules), `edgegap-server-design`, `edgegap-containerize`, `edgegap-troubleshoot`, `edgegap-launch` before going live. Edgegap's Server Browser (open beta, https://docs.edgegap.com/learn/server-browser) fits games where players pick a room or a persistent world instead of being matched; this skill uses the matchmaker.

Sources of truth: https://docs.edgegap.com/learn/matchmaking, https://docs.edgegap.com/learn/matchmaking/matchmaker-in-depth, https://manus.im/docs/website-builder/third-party-integrations, https://manus.im/docs/website-builder/github-integration, https://partner.steamgames.com/doc/features/auth.
