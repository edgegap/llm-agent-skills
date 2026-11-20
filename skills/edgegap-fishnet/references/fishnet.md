# FishNet on a dedicated server

Contents
1. Transports, ports and protocols
2. Host/client → dedicated server
3. Who starts the server: Start On Headless vs EdgegapServerLifecycle
4. Scene changes: the Edgegap object and the game's objects
5. Removing client-side Edgegap API calls (old samples)
6. FishNet 2.x and 3.x
7. WebGL with Bayou
8. Testing locally

Edgegap runs the Linux dedicated server build in a container and maps a random **external** port per deployment to the fixed **internal** port the transport listens on. The server listens on `0.0.0.0:<port>`; clients connect to the deployment's host and external port from the matchmaker assignment.

## 1. Transports, ports and protocols

| Transport | Default port | App version protocol | Client connects to | Status |
|---|---|---|---|---|
| Bayou (WebSocket) | 7770 | **WS** + `tls_upgrade: true` | `fqdn`, with `SetUseWSS(true)` | Verified end to end (WebGL and desktop clients) |
| Tugboat (UDP, LiteNetLib) | 7770 | **UDP** | `public_ip` | Adapter compiles; prove it with a direct deployment first |
| Multipass (Tugboat + Bayou) | one port per sub-transport | one app version port per sub-transport, with different names | the matching sub-transport | Prove each sub-transport with a direct deployment; see below |

- The internal port on the app version must equal the transport's port. `EdgegapServerLifecycle.ListenPort` (default 7770) is written to the transport with `Transport.SetPort` before the server starts.
- Leave Tugboat's IPv4 bind address empty (all interfaces) or `0.0.0.0`. Never `127.0.0.1` or a LAN IP.
- Port name `gameport` on the app version must equal `EdgegapMatchmakingClient.PortName`.
- **Multipass**: give the two sub-transports distinct ports (e.g. Tugboat 7770/UDP `gameport`, Bayou 7771/WS `webport`), set each port on its sub-transport rather than through `SetPort` on Multipass, and on the client pick `PortName` and the sub-transport per platform (`Multipass.SetClientTransport<Bayou>()` in WebGL). Write and test this against the installed Multipass API; it is not part of the verified path.

## 2. Host/client → dedicated server

FishNet games often "work with a friend" because one player runs **Host**. On Edgegap nobody hosts. Walk the code:

1. **Start path.** Server builds start only the server (`ServerManager.StartConnection()`), never a client. `EdgegapServerLifecycle` does this when `AutoStartServer` is on (§3).
2. **NetworkHudCanvas** (FishNet demo HUD): set **Auto Start Type** to Disabled. In batch mode it starts a server on its own when set to Host or Server, which double-starts the server; the menu's Start Game button or the matchmaker drives clients.
3. **No local player on the server.** Code that assumes the host is a player (`base.IsHost`, `IsOwner` on the server, `ClientManager.Connection` used on the server, spawning "player 1" in `Start`) breaks. Spawn players for remote clients: FishNet's `PlayerSpawner` component, or `ServerManager.OnRemoteConnectionState` / `SceneManager.OnClientLoadedStartScenes`.
4. **Server authority.** Damage, score, pickups and win conditions run in `[Server]` methods or `ServerRpc` handlers, not in an owner's `Update`.
5. **Headless safety.** No GPU, screen, audio or input on the server. Guard `Camera`, UI, `Input.*` and audio with `if (!base.IsServerInitialized)` / `#if !UNITY_SERVER`, and don't `FindObjectOfType` UI objects that the server build doesn't have.
6. **Frame rate.** `ServerManager` has **Change Frame Rate** / **Frame Rate**, which FishNet applies on the server and which can override the lifecycle's `Application.targetFrameRate = 60`. The SpaceEdge sample shipped with 500, which burns a full core on a headless server: set it to 30-60 (the verified sample uses 60).
7. **Match end.** Call `FindObjectOfType<EdgegapServerLifecycle>().SelfStop("match over")` from the server when the game is over. The no-player (120 s) and empty-server (30 s) timers are only a safety net.

## 3. Who starts the server

FishNet's `ServerManager` has **Start On Headless**: in a headless build it starts the server by itself. Pick exactly one starter:

- **Recommended (verified):** Start On Headless **off**, `EdgegapServerLifecycle.AutoStartServer` **on**. The lifecycle sets the port and starts the server in every server build and `-batchmode` run, so the same scene works for client and server builds.
- Or: Start On Headless **on**, `-edgegapAutoStart false`. The transport's inspector port is then the listen port; keep it equal to the app version's internal port.

Both on: the second start fails or logs that the server is already started. Both off: the server never listens, clients time out, and the process spins at 100% CPU. The shipped SpaceEdge scenes had Start On Headless off with nothing else starting the server, which is exactly that failure.

## 4. Scene changes: the Edgegap object and the game's objects

FishNet games usually change scenes (menu → game → menu) with `SceneManager.LoadGlobalScenes`, which unloads the menu scene on the server and every client. Anything in the menu scene dies with it, including `EdgegapServerLifecycle` (no more self-stop, so the empty server bills until the 60-minute cap) and the client's matchmaking state.

`EdgegapPersistence` on the `Edgegap` object fixes both: `DontDestroyOnLoad` keeps one instance alive, and when the menu scene loads again its fresh copy destroys itself, so the client keeps a single matchmaking client and its status. `EdgegapSceneSetup` adds it. If the game's NetworkManager itself is not persistent, put the `Edgegap` object in the scene that stays loaded instead.

### The game's own objects across a scene replace

The same unload destroys the **game's** networked objects in that scene: a match or race manager placed in the lobby scene, and players spawned while the lobby was active. Host builds hide this when the host's code reloads things locally; on a dedicated server the countdown, scoring and match-end logic (and any self-stop called from it) silently stop. Check every `LoadGlobalScenes` / `LoadConnectionScenes` with `ReplaceScenes = ReplaceOption.All` (or one that unloads the scene) and decide, per object:

| Object | Survives the load? | What to do |
|---|---|---|
| Placed in the scene (scene object), e.g. a `RaceManager` in Lobby | No, and it **cannot** be moved: `MovedNetworkObjects` refuses scene objects (`cannot be moved as it is a scene object`) | Either put an instance in the destination scene (Track01 gets its own manager), or turn it into a prefab the server instantiates, calls `SetIsGlobal(true)` on right after `Instantiate`, and spawns with `ServerManager.Spawn`. Global objects live in DontDestroyOnLoad and survive every load. Add the prefab to the NetworkManager's spawnable prefabs. |
| Spawned at runtime and root (player karts from `PlayerSpawner`) | No, unless moved | Pass them in `SceneLoadData.MovedNetworkObjects` (root objects only, not global), or despawn and respawn them in the new scene (e.g. at spawn points in `OnClientLoadedStartScenes` / `SceneManager.OnLoadEnd`). |
| Global (`IsGlobal`) | Yes | Nothing; don't also list it in `MovedNetworkObjects` (refused for global objects). |
| Client-only references to scene objects (`Camera.main`, UI) | Rebuilt per scene | Re-acquire after the load (e.g. the chase camera finds the local player on `OnLoadEnd`), and never assume a component exists on `Camera.main`: null-check `GetComponent`. |

Code that moves server logic out of host-only paths (`IsHostStarted` → `OnStartServer`) must also survive this load, or the dedicated server never finishes a match. Write the fix, not only a warning in the hand-off.

## 5. Removing client-side Edgegap API calls

The older FishNet Edgegap samples (`MatchmakingSystem` calling `https://api.edgegap.com` with `Authorization: token ...`, listing deployments and deploying from the client) ship the organization-wide API token inside every build. Anyone can extract it and control the account.

- Delete those calls and the token field from the client. The client talks only to the matchmaker, with the matchmaker Auth Token.
- Tell the developer to rotate the API token in the dashboard (User Settings → Tokens), since it has already shipped.
- The **legacy matchmaker** project (`selectors` / `filters` config) uses a format the current matchmaker rejects; rebuild the config from `assets/matchmaker/`.
- Keep a direct-connection path for testing: the example bridge `assets/unity/Examples/MatchmakingSystem.cs` connects straight to an address and port when its matchmaker toggle is off, and disables `EdgegapMatchmakingClient` so it never calls the matchmaker.

## 6. FishNet 2.x and 3.x

The templates target FishNet 4.x (verified on 4.1.6R). The server side carries over: `Transport.SetPort`, `ServerManager.StartConnection()`, `ServerManager.Clients` and Start On Headless exist in 2.5.2 and 3.11.14. The client adapter uses `ClientManager.Started` and `Transport.GetConnectionState(false)`; if those don't compile on an older version, read the installed `ClientManager.cs` / `Transport.cs` and use the equivalents. Bayou's `SetUseWSS` may be missing on old Bayou versions; set **Use WSS** in the inspector for client builds instead. Recommend upgrading to FishNet 4 if the project allows it.

## 7. WebGL with Bayou

- App version port: **WS**, `tls_upgrade: true`. Edgegap terminates TLS with a `*.pr.edgegap.net` certificate; the server speaks plain `ws`. The client connects with `wss://<fqdn>:<external>` (the IP fails the certificate check). The client template calls `bayou.SetUseWSS(UseSecureWebSocket)` before connecting; keep `UseSecureWebSocket` on.
- Without TLS Upgrade a `wss` client fails during the handshake and the server logs that the first bytes were not `GET`.
- Local tests use plain `ws://localhost:7770`: Use WSS off (the example bridge's `directUseWss`).
- Matchmaker `allowed_cors_origins` must list every origin that serves the build, or the browser blocks ticket calls.
- No latency beacons in WebGL (no ICMP): no `latencies` rule in the profile.
- Player Settings → Publishing: Gzip with **Decompression Fallback** on, so the build loads from hosts that don't send `Content-Encoding` (itch.io, `python -m http.server`).
- Bayou also serves desktop clients, so one WS server can take WebGL and native players.

## 8. Testing locally

1. Editor or `-batchmode` server + a client on `localhost:7770`.
2. Linux server build in Docker: `docker run --rm -p 7770:7770 <image>` (Tugboat: `-p 7770:7770/udp`). Expect `Edgegap Server | Starting server on 0.0.0.0:7770.` then `Not running on Edgegap, self-stop disabled.`
3. Direct Edgegap deployment, client on `<fqdn>:<external>` with WSS.
4. Matchmaker, two clients.
