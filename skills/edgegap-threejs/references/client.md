# Client: Three.js page, Find Match, connection

Contents
1. No-build setup
2. The shell (menu, HUD, flow)
3. Rendering server state
4. Sending input
5. Find Match, direct mode, local mode
6. CORS and hosting the pages
7. Other renderers and bundlers

## 1. No-build setup

Three.js loads from a CDN through an import map, so the page is plain ES modules served by any static server:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "@edgegap/sdk": "https://cdn.jsdelivr.net/npm/@edgegap/sdk@1.1.0/dist/browser/edgegap.js"
    },
    "integrity": {
      "https://cdn.jsdelivr.net/npm/@edgegap/sdk@1.1.0/dist/browser/edgegap.js": "sha384-U8KQMl3e8xF4aAIJJMXV8IdkCKWiHSQhHISsedbG4z/L99dNOq5FoRlMgPDYgNUF"
    }
  }
</script>
<script type="module" src="./game-client.js"></script>
```

Pin both versions. `@edgegap/sdk` is Edgegap's official JS SDK ([source](https://github.com/edgegap/sdk-js-sessions-matchmaker-server-browser), MIT, no dependencies); its browser build exports `matchmaking` and `getConnectionUrl`, which `shell.js` imports. Load it only from npm (`@edgegap/sdk`) or its jsDelivr/unpkg mirrors, never a look-alike package. The `integrity` entry (import maps support it in current Chrome, Edge, Firefox and Safari) makes the browser refuse a modified SDK file; when you change the SDK version, regenerate the hash: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`. A project that already uses Vite or webpack keeps its bundler: `npm i @edgegap/sdk`, copy `net.js` (or `shell.js`) into its sources, change the SDK import to `import { getConnectionUrl } from "@edgegap/sdk"; import { GroupAgent } from "@edgegap/sdk/matchmaking";` (the npm entry points have no `matchmaking` namespace), and `import * as THREE from "three"` as usual.

Use relative paths (`./shell.js`, `../../client/lib/...`) so the pages also work under a sub-path such as GitHub Pages `https://<org>.github.io/<repo>/`.

## 2. The shell

`assets/client/shell.js` is the verified UI shared by the five sample games. A game calls:

```js
runGame({
  game: "coins",            // matchmaker profile name, and LOCAL_PORTS key
  title, tagline, help,
  teams: false,             // colour the scoreboard by team
  scoreText(p, msg), bannerText(msg), bigText(msg, myId),  // optional HUD text
  create(ctx) { return { state(msg), frame(dt), dispose() }; },
});
```

`ctx` = `{ THREE, scene, camera, renderer, sun, myId, info, input(obj) }`. `create` runs after `welcome`, so `info` (map, sizes) is there to build the level. `state(msg)` gets every state message; `frame(dt)` runs every animation frame. `dispose()` removes the level when the match ends, and the menu comes back ("Match finished. Play again?").

The shell also gives: `createStage` (renderer, lights, shadows, resize), `makeLabel` (name sprites), `EntityMap` (one mesh per server entity id, created and removed with the snapshot), `smooth(dt, rate)`, `lerpAngle`, `keys`/`axis()` for keyboard input, `colorOf(id)`, `TEAM_COLORS`, and `window.__game` (`phase`, `server`, `players`, `error`) for browser automation.

## 3. Rendering server state

State arrives at 20 Hz; the screen runs at 60+. Ease each object toward its latest server position every frame:

```js
const t = smooth(dt, 14);          // 1 - exp(-14 dt)
g.position.x += (e.x - g.position.x) * t;
```

Snap instead of easing when the jump is large (respawn, kickoff, new round), otherwise objects fly across the map. This adds roughly 50–100 ms of visual delay, fine for arcade games. For the player's own aim (mouse direction), show the local value immediately and send it; the server still decides what the shot hits.

Don't predict game rules on the client. If the game needs client-side prediction for movement (fast shooters), predict only the local player's movement with the same constants as the server and reconcile on each snapshot.

## 4. Sending input

`ctx.input(obj)` sends `{t:"input", ...obj}` only when it changed (at most every 33 ms) and at least every 250 ms. Send intents, not results: axes in [-1, 1], an aim angle, booleans for buttons, an enum for a direction. Never positions, damage or scores.

## 5. Find Match, direct mode, local mode

- **Find match** in `shell.js`, with the Edgegap JS SDK's `GroupAgent` (copy this block into a game that has its own UI):

```js
import { getConnectionUrl, matchmaking } from "@edgegap/sdk"; // bundlers: GroupAgent from "@edgegap/sdk/matchmaking"

mm?.dispose();
mm = new matchmaking.GroupAgent({ baseUrl: config.matchmakerUrl, authToken: config.matchmakerToken, logGroupUpdates: false });
mm.initialize(undefined, ({ current }) => showStatus(current?.status)); // SEARCHING, MATCH_FOUND, HOST_ASSIGNED...
mm.createGroup({ profile: def.game, attributes: {}, is_ready: true }, true); // a group of one, ready at once
const assignment = await mm.nextAssignment();  // rejects with MatchmakingError on CANCELLED (ticket expired) or errors
const ticketId = mm.group.current.ticket_id;    // goes in hello: the server checks it against MM_TICKET_IDS
mm.dispose();                                   // matched: leaving the group now would only get a 409
connect(getConnectionUrl(assignment, "gameport"), { name, ticket: ticketId }); // wss://<fqdn>:<port>
// Cancel button and pagehide: mm?.stopMatchmaking() deletes the group while searching.
```

- The ticket goes in `hello` so the server can put the player on their matchmaker team and, with `REQUIRE_TICKET=1`, refuse strangers.
- The agent polls about once a second (±20 % jitter). Statuses: `SEARCHING` → `MATCH_FOUND` (a server is starting) → `HOST_ASSIGNED`; `CANCELLED` = the ticket expired.
- `getConnectionUrl` throws for TCP/UDP ports, which browsers can't open; the port must be WS with TLS Upgrade on.
- A `stopMatchmaking()` on `pagehide` that doesn't get out before the tab closes leaves the ticket to expire after `ticket_expiration_period` (30 s in the templates).
- The matchmaker answers **429** to bursts of calls (seen when 14 players queued in the same second). The SDK retries `429` and `5xx` with jittered backoff and honours `Retry-After`; after 10 polling errors in a row it gives up and `nextAssignment()` rejects.
- Parties (friends in one match): `createGroup` with `is_ready: false`, share `group.current.group_id`, friends call `joinGroup(request, groupId, true)`, everyone calls `setReady(true)`. Not wired into `shell.js` and not run here; see the SDK README.
- **First connection**: a deployment can refuse connections for a few seconds after `HOST_ASSIGNED`. `net.js` retries 10 times, 1 s apart, until the server's `welcome`. An `error` message from the server (full, finished) is final and not retried.
- **Direct**: `?server=wss://<fqdn>:<port>` connects straight to a deployment started by `edgegap_deploy` or `edgegap-deploy.mjs`.
- **Local**: a "Local server" button connects to `ws://<page host>:<LOCAL_PORTS[game]>`. Plain `ws://` only works from an `http://` page (localhost); from `https` pages browsers block it.
- Settings: `config.js` (committed, empty or production values), `config.local.js` (git-ignored, same shape, loaded with a dynamic `import()` whose 404 is ignored), or `?mm=<url>&token=<token>`. `?autoplay=1` clicks Find Match on load (handy for tests); `?autoplay=local` connects to the local server.

## 6. CORS and hosting the pages

The browser calls the matchmaker cross-origin, so the matchmaker config's `allowed_cors_origins` must list each page origin exactly: scheme + host + port, no path, no trailing slash (`http://localhost:8080`, `https://<org>.github.io`, `https://html-classic.itch.zone` for itch.io embeds). The game server's WebSocket is not subject to CORS.

The pages can live anywhere static: GitHub Pages, itch.io, a CDN. They never need the Edgegap API token.

## 7. Other renderers and bundlers

Nothing above depends on Three.js except `shell.js`'s stage helpers. For Babylon.js, PlayCanvas engine, Phaser or a 2D canvas, keep the Find Match block (and the SDK import map entry) and `net.js`, keep the protocol and the easing, and draw with that engine. Not run on Edgegap with those engines.
