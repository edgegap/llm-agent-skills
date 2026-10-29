# Clients: direct URL and matchmaker

Every client needs one thing from Edgegap: the server URL, `wss://<fqdn>:<external port>`. It comes either from outside (direct mode: a launch argument, a page parameter, the developer's backend) or from the matchmaker. Put both behind one rule: **an explicit server URL wins over the matchmaker**, so a tester can always point a client at one deployment.

Two things every client must do on Edgegap:
- **Retry the first join.** Right after `HOST_ASSIGNED` (or a deployment turning running), the address can answer **502** for a few seconds while the route to the container comes up. Measured on every fresh deployment in the verified run. Retry `joinOrCreate` up to 10 times, 2 s apart, before showing an error. Only the first join after matchmaking needs it.
- **Connect by FQDN** with `wss://`. The TLS certificate is for `*.pr.edgegap.net`; `wss://<ip>:<port>` fails the TLS check.

The matchmaker templates have no dependencies (no Edgegap SDK) and work in web builds. Each queues one player into a profile, polls every 2 s, reports status text, returns the URL, and cancels the ticket on quit (the Auth Token is raw in `Authorization`).

## JavaScript / TypeScript (browser)

Files: `assets/client/js/Matchmaker.ts`, `assets/client/js/joinWithRetry.ts`. Verified in a Three.js + Vite client with `@colyseus/sdk` 0.17.

```ts
import { Client } from "@colyseus/sdk";          // or "colyseus.js" on 0.15/0.16
import { Matchmaker } from "./Matchmaker";
import { joinWithRetry } from "./joinWithRetry";

const params = new URLSearchParams(location.search);
const direct = params.get("server");                              // ?server=wss://<fqdn>:<port>
const mmUrl = params.get("mm") || import.meta.env.VITE_MM_URL;    // matchmaker API URL
const mmToken = params.get("mmToken") || import.meta.env.VITE_MM_TOKEN;

let url = direct || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
let attempts = 1;
if (!direct && mmUrl && mmToken) {
  const mm = new Matchmaker({ url: mmUrl, token: mmToken, profile: "casual", onStatus: (s) => (status.textContent = s) });
  url = await mm.findMatch();       // throws on expiry or HTTP errors: show the message
  attempts = 10;                    // fresh server: 502 for a few seconds
}
const room = await joinWithRetry(new Client(url), "battle", {}, attempts);
room.onLeave(() => (status.textContent = "Disconnected. Reload to play again."));
```

`Matchmaker` cancels its ticket on `pagehide`. The page's origin must be in the matchmaker's `allowed_cors_origins`, or the browser blocks the `POST` (a CORS error in the console, no HTTP status). Vite env vars must start with `VITE_`. A game embedded on itch.io runs in an iframe whose origin is the itch CDN host (usually `https://html-classic.itch.zone`), not `https://<you>.itch.io`: confirm it with `location.origin` in the embedded game's console and list that.

**Reconnection after a drop or reload.** With one deployment per match there is no fixed server URL any more, so a client that saves `room.reconnectionToken` must save the endpoint with it and call `reconnect` on a `Client` for that endpoint:

```ts
sessionStorage.setItem("reconnect", JSON.stringify({ url, token: room.reconnectionToken }));
// later (page reload, or room.onLeave with a non-consented code):
const saved = JSON.parse(sessionStorage.getItem("reconnect") ?? "null");
if (saved) room = await new Client(saved.url).reconnect(saved.token);   // fails once the window or the deployment is gone: clear it, back to Find Match
```

Not run on Edgegap in the verified test (the tanks room has no reconnection).

PlayCanvas, Phaser, PixiJS, Construct 3 scripts and other web engines can use the same two files; only the "read a page parameter" part differs.

## Cocos Creator 3.x

Same two files as the browser: copy `assets/client/js/Matchmaker.ts` and `joinWithRetry.ts` into the project's scripts folder (Cocos compiles them like any component script; they only use `fetch`, `setTimeout` and `window`). Verified with Cocos Creator 3.8.8, web-desktop build in Chrome, on [backend-game-sample-cocos-colyseus-tictactoe](https://github.com/edgegap/backend-game-sample-cocos-colyseus-tictactoe).

**Server build, upload and test deploy: the Edgegap Cocos extension.** [edgegap/edgegap-cocos-plugin](https://github.com/edgegap/edgegap-cocos-plugin) 2.0 (Cocos Creator 3.8+, Docker Desktop) does Phase 2 from a panel, like the Unity and Godot plugins: sign in, build the server folder's Dockerfile for linux/amd64, run it locally, push to registry.edgegap.com, create the application and version, deploy one test server near the developer and show its `wss://` URL, stop it. Verified on the tic-tac-toe sample: built, ran locally, pushed, created and updated a version, deployed, two bots played over `wss://`.
- Install: copy the repo into the project as `extensions/edgegap-extension/` (`dist/` is prebuilt), enable it in Extension Manager → Project, open **Extension → Edgegap → Open Panel**.
- Preset it for the developer: write `settings/v2/packages/edgegap-extension.json` with `{"server": {"serverDir": "Server", "imageName": "<game>", "tag": "<YYYYMMDD-HHMM>", "app": "<app>", "port": {"name": "gameport", "port": 2567, "protocol": "WS", "tlsUpgrade": true}, "cpuUnits": 256, "memoryMb": 512, "maxDurationMinutes": 60}}`. Keep the server's own Dockerfile (`assets/server/Dockerfile`); the panel's **Create Dockerfile** is only a generic `npm start` starter.
- **Token type matters.** The panel's **Get a token** is the dashboard's one-click sign-in: a quick-start token, which also gets the registry login. A regular API token (User Settings → Tokens) answers `403 This token is not a quick start token` on the registry endpoints, and the panel then asks for Project, Username and Token from the Container Registry page. The token stays in the Cocos user profile, never in the project; never type it into the panel yourself.
- Headless, same code: `EDGEGAP_API_TOKEN=<token> node <extension>/scripts/e2e.mjs --project <cocos project> --deploy --check "node Server/scripts/e2e.mjs --server={url}"` (regular tokens also need `EDGEGAP_REGISTRY_PROJECT/USERNAME/TOKEN`). Run it only with the developer's go-ahead: it deploys (and stops) one server.
- The panel's test server is for the developer. Players still go through the matchmaker (Phase 3): point `application.version` at the tag the panel uploaded.

**SDK version must match the server.** The Cocos Store extension and Colyseus's old Cocos demos ship colyseus.js 0.14, which can't talk to a 0.17 server. For 0.17 take `colyseus-sdk.zip` from the `@colyseus/sdk@0.17.x` release on github.com/colyseus/colyseus (one UMD file, `colyseus.js`, no typings). Put it where the project's extension mounts it (`extensions/colyseus-sdk/runtime/colyseus.js`, imported as `import Colyseus from 'db://colyseus-sdk/colyseus.js'` with `esModuleInterop`), or in `assets/` with **Import As Plugin** and use the `Colyseus` global. Write a small `.d.ts` for what the game uses; the full typings are in the npm package `@colyseus/sdk`.

```ts
import { _decorator, Component, sys } from 'cc';
import Colyseus from 'db://colyseus-sdk/colyseus.js';
import { Matchmaker } from './edgegap/Matchmaker';
import { joinWithRetry } from './edgegap/joinWithRetry';

// in the component; matchmakerURL / matchmakerToken are @property fields (the Auth Token is client-safe)
const params = new URLSearchParams(sys.isBrowser ? window.location.search : "");
let url = params.get("server") ?? "";          // direct: ?server=wss://<fqdn>:<port>
const mmUrl = params.get("mm") || this.matchmakerURL;
const mmToken = params.get("mmToken") || this.matchmakerToken;
let attempts = 10;                             // a fresh deployment answers 502 for a few seconds
if (!url && mmUrl && mmToken) {
    const mm = new Matchmaker({ url: mmUrl, token: mmToken, profile: "casual",
                                onStatus: (s) => this.statusLabel.string = s });
    url = await mm.findMatch();                // call mm.cancel() in onDestroy while searching
} else if (!url) {
    url = "ws://localhost:2567"; attempts = 1;
}
this.room = await joinWithRetry(new Colyseus.Client(url), "my_room", {}, attempts);
const $ = Colyseus.Callbacks.get(this.room);   // 0.17: no more state.x.onAdd = ... / state.listen
```

Porting a 0.14/0.15 Cocos client to 0.17:
- `room.state.players.onAdd = cb` → `$.onAdd("players", (item, key) => ...)`; `room.state.listen("x", cb)` → `$.listen("x", (value, previous) => ...)`; `room.onError.once(cb)` → `room.onError(cb)`.
- **`$.onChange("board", ...)` on an array passes `(index, value)`**, the reverse of 0.14's `(value, index)`. Measured; swapping them puts every mark in the wrong cell.
- `listen` fires right away when the value is already set, and arrays start with their default items: ignore empty strings and default values instead of treating them as moves or results.
- `systemEvent` is deprecated in 3.8: use `input.on(Input.EventType.MOUSE_DOWN / TOUCH_START, ...)`.

Opening a 3.1 project in 3.8 migrates every `.meta` and the scenes; commit that churn on its own or with the upgrade. Headless build: `CocosCreator --project <path> --build "platform=web-desktop;debug=true"`; exit code **36 means success**. A Cocos web build in a background browser tab renders no frames, so it never loads its scene: test with the tab in front. Add the build's origin (Cocos preview is `http://localhost:7456`) to `allowed_cors_origins`.

Cocos mini-game targets (WeChat, Douyin...) need the platform's domain allowlist for every `wss://` and `https://` host, which per-match Edgegap hostnames (`<id>.pr.edgegap.net`) and the matchmaker host would have to satisfy. Not run; check the platform's rules before promising it.

## Unity (Colyseus Unity SDK)

File: `assets/client/unity/EdgegapMatchmaker.cs`. Uses `UnityWebRequest` and `Awaitable`, so Unity 2023.1+ / Unity 6 (verified on 6000.3 with `io.colyseus.sdk` from `https://github.com/colyseus/colyseus-unity-sdk.git#upm`, Windows build). For older Unity, swap `Awaitable` for a coroutine or `Task`. `JsonUtility` needs fixed field names, so the port name `gameport` is a field in the `Ports` class: rename it if the app version uses another name.

```csharp
int attempts = 1;
if (directServer == null && !string.IsNullOrWhiteSpace(matchmakerUrl) && !string.IsNullOrWhiteSpace(matchmakerToken))
{
    matchmaker = new EdgegapMatchmaker(matchmakerUrl, matchmakerToken, "casual");
    matchmaker.OnStatus += s => connectStatus = s;
    serverUrl = await matchmaker.FindMatch();
    attempts = 10; // a server that just started can need a few more seconds
}
client = new Client(serverUrl);
for (int attempt = 1; ; attempt++)
{
    try { room = await client.JoinOrCreate<MyState>("battle"); break; }
    catch (System.Exception e) when (attempt < attempts)
    {
        Debug.LogWarning($"Join attempt {attempt} failed ({e.Message}), retrying");
        await Awaitable.WaitForSecondsAsync(2f);
    }
}
```

Call `matchmaker?.Cancel()` in `OnDestroy`. Launch settings: `--server=wss://...` or `--mm=<url> --mm-token=<token>` from `System.Environment.GetCommandLineArgs()`; on WebGL read `?server=` / `?mm=` / `?mmToken=` from `Application.absoluteURL`. Inspector fields for the matchmaker URL and token are fine too: the Auth Token is client-safe. Unity WebGL was not run in the verified test.

## Godot 4 (Colyseus Godot SDK)

File: `assets/client/godot/edgegap_matchmaker.gd` (`class_name EdgegapMatchmaker`, a `Node` using `HTTPRequest`). Verified with Godot 4.5.2 and Colyseus Godot SDK 0.17.12, desktop. Add it as a child so it can create timers and requests:

```gdscript
var attempts := 1
if not direct_server and mm_url != "" and mm_token != "":
	matchmaker = EdgegapMatchmaker.new(mm_url, mm_token, "casual")
	add_child(matchmaker)
	matchmaker.status_changed.connect(func(text: String) -> void: status_label.text = text)
	var url := await matchmaker.find_match()
	if url == "":
		return  # the last status says why
	server_url = url
	attempts = 10  # a server that just started can need a few more seconds
_join(attempts)
```

`find_match()` returns `""` on failure instead of throwing. The Godot SDK reports join failures through the room's error signal, so retry there: if not joined yet and attempts are left, wait 2 s (`get_tree().create_timer(2.0).timeout`) and call `_join(attempts - 1)`.

Launch arguments: read both `OS.get_cmdline_args()` and `OS.get_cmdline_user_args()` (arguments after `--` land in the second; from the editor, put them after `--` in the main run args). Web export: `JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('server') || ''")`. The web export was not run in the verified test.

## Other Colyseus clients: direct mode

The tanks fork added a `server` override to every client; the same patterns work for any game. These were written but not run on Edgegap:

| Client | Override |
|---|---|
| Construct 3 | `?server=wss://...` read in a script at startup |
| Defold | HTML5: `?server=`; native: `--config=<section>.server_url=wss://...` or a `game.project` entry |
| GameMaker | `--server=wss://...` via `parameter_string()`; HTML5: `?server=` |
| Haxe | JS: `?server=`; HashLink: `--server=wss://...` |
| MonoGame | `--server=wss://...` or an environment variable |

To give them matchmaking, port `Matchmaker.ts`: it's three HTTP calls and a poll loop.

**GameMaker on Windows:** its sprite paths exceed 260 characters inside a cloned repo. Before cloning (or checking out) a project with a GameMaker client, run `git config --global core.longpaths true` (or `git -c core.longpaths=true clone ...`), or checkout fails partway with `Filename too long`.
