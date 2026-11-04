# Client: connecting a Cocos Creator 3.8 game

Contents
1. Files
2. Where to connect (direct, matchmaker, local)
3. The socket: wss by FQDN, first-connection retry
4. Find Match with @edgegap/sdk
5. CORS and page origins
6. Builds and testing in the editor

## 1. Files

Copy into the project's scripts folder (for example `assets/scripts/edgegap/`):

| File | What it is |
|---|---|
| `assets/client/Matchmaker.ts` | Thin wrapper over `GroupAgent` from Edgegap's JS SDK (`@edgegap/sdk`): queues the player as a group of one, reports status, resolves with `wss://<fqdn>:<port>`, exposes `ticketId`, `cancel()`. Same file as `edgegap-colyseus` (verified in Chrome against a live matchmaker on 2026-11-02, bundles in Cocos Creator 3.8.8), plus a guard so it doesn't touch `window` events where they don't exist. |
| `assets/client/GameSocket.ts` | Plain `WebSocket` client: sends `hello`, waits for `welcome`, retries the first connection, treats a server `error` as final. Matches the protocol of `assets/server/server.mjs`; adapt both together if the game has its own protocol. |
| `assets/client/EdgegapConnect.ts` | Example component: picks the server (§2), runs Find Match, connects, exposes `sendInput`. Wire `findAndConnect()` to the Play button and route `onServerMessage` to the game. |

Then `npm i @edgegap/sdk` in the Cocos project root (next to the project's `package.json`). Cocos Creator 3.8 bundles npm packages from `node_modules` (checked on 3.8.8 with a web-desktop build, per `edgegap-colyseus`). Install it only as `@edgegap/sdk`: look-alike names outside the `@edgegap` scope aren't Edgegap's.

The three files type-check together (TypeScript 5, `strict`, `experimentalDecorators`, the real `@edgegap/sdk` 1.1.0 and a stub of `cc`), and `GameSocket.ts` ran against the skeleton server in Node 22. They have not been run inside a Cocos build (see SKILL.md, Not verified).

## 2. Where to connect

`EdgegapConnect` checks, first match wins:
1. `?server=wss://<fqdn>:<port>` on the page: one direct deployment (from the extension's **Deploy near me**, `edgegap_deploy` or the dashboard). Web builds only (`sys.isBrowser`).
2. The matchmaker: `?mm=<API URL>&mmToken=<Auth Token>` on the page, else the Inspector fields `matchmakerUrl` / `matchmakerToken` (and `matchmakerProfile`, default `casual`).
3. `localServer` (default `ws://localhost:7777`): the server on the developer's machine, one attempt.

The matchmaker **Auth Token** is made to ship in clients: it creates and reads tickets for that matchmaker, nothing else. The Edgegap **API token** never goes into a client build, a settings file or the scene. Native and mini-game builds have no page parameters: give them the matchmaker settings through the Inspector fields or a config the game loads.

## 3. The socket

- **URL**: `wss://<fqdn>:<external port>` when the port is WS with TLS Upgrade. Connect by **FQDN**, never by IP: Edgegap's certificate is issued for the FQDN, so `wss://<ip>:<port>` fails the TLS check (the extension's README lists this). `ws://` (no TLS) is refused by browsers on `https` pages and by mini-game platforms.
- **First connection**: right after `HOST_ASSIGNED` (or a direct deployment turning Ready), the address can refuse connections or answer `502` for a few seconds. `GameSocket.connect` retries 10 times, 1.5 s apart, only until the first `welcome`; an `error` message from the server (full, match over, not in this match) is final.
- **After the welcome**: a close you didn't ask for (`onClose`) means the server stopped or the network dropped; show it and go back to the menu. Reconnecting to the same deployment works only while it still runs and the server keeps the seat (not in the skeleton).
- **Inputs, not results**: send intents (axes, buttons, choices) at most ~30 per second; draw what the server's `state` says, easing toward it each frame. Anything a Cocos web build decides can be changed in devtools.

## 4. Find Match with @edgegap/sdk

```ts
const mm = new Matchmaker({ url: mmUrl, token: mmToken, profile: 'casual', onStatus: (s) => label.string = s });
const url = await mm.findMatch();          // SEARCHING -> MATCH_FOUND -> HOST_ASSIGNED, then wss://<fqdn>:<port>
const ticket = mm.ticketId;                // send it in hello; the server can check it against MM_TICKET_IDS
// Cancel button / onDestroy while searching: mm.cancel()
```

- The SDK polls about once a second, retries `429`/`5xx` with backoff, and `findMatch` rejects with "Ticket expired before a match was found" when the ticket reaches `CANCELLED` (`ticket_expiration_period`, 30 s in `assets/matchmaker/casual.json`).
- `getConnectionUrl(assignment, "gameport")` (inside `findMatch`) needs the port named `gameport` and WS; it throws for TCP/UDP ports. Rename `portName` if the app version uses another name.
- The SDK's README requires a global `fetch` and `AbortController` (its Requirements section). Web builds have both. Whether a given Cocos native or mini-game runtime provides them was not checked: test `typeof fetch` on the target before relying on Find Match there, and on a runtime without it call the matchmaker from your own backend or a small `XMLHttpRequest` client.
- Profiles, teams, parties, regions, backfill and the ticket API: `edgegap-matchmaking`. Start from `assets/matchmaker/casual.json` (2 to 8 players, one profile). The developer creates it in the dashboard (Matchmaker → Create → upload → **Create and Start**) and copies the **API URL** and **Auth Token**.

## 5. CORS and page origins

A web build calls the matchmaker cross-origin, so the matchmaker config's `allowed_cors_origins` lists every origin that serves the build, scheme + host + port, no path: Cocos preview `http://localhost:7456`, a local static server (`http://localhost:8080`), the hosted page (`https://<org>.github.io`, an itch.io embed host...). The game server's WebSocket is not subject to CORS. CORS is enforced by browsers, so it concerns web builds; mini-game platforms have their own domain allowlist instead (`platforms.md`).

## 6. Builds and testing in the editor

- Headless build: `CocosCreator --project <path> --build "platform=web-desktop;debug=true"`; exit code **36 is success**, 32 = invalid build parameters, 34 = unexpected error ([Cocos docs: publish from the command line](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-in-command-line.html)).
- A Cocos web build in a background browser tab renders no frames, so it never loads its scene: keep the tab in front when testing (seen on the Colyseus sample).
- Browser preview (`localhost:7456`) is `http`, so `ws://localhost:7777` works for local play; a hosted `https` page needs `wss://`, which means an Edgegap deployment (or your own TLS) — not `ws://` to a laptop.
