# Netcode for GameObjects on a dedicated server

Contents
1. What the templates do
2. Host → dedicated server conversion
3. Ports and UnityTransport
4. Games with their own connection flow (Boss Room style)
5. Client-only code on the server
6. Testing two clients on one machine
7. WebGL

## 1. What the templates do

`EdgegapBootstrap` runs before the first scene loads (`[RuntimeInitializeOnLoadMethod(BeforeSceneLoad)]`) and adds an `Edgegap` object that survives scene loads, so scenes and prefabs stay unchanged.

- **Server build** (Linux Dedicated Server, or `-batchmode`): `EdgegapServerLifecycle`. With `AutoStartServer` on (default), it waits for `NetworkManager.Singleton`, sets UnityTransport to listen on `0.0.0.0` and the port from `ARBITRIUM_PORT_GAMEPORT_INTERNAL` (or `ListenPort`, 7777, when not on Edgegap), and calls `StartServer()`. On Edgegap it parses the injected variables, logs `N matched player(s)`, logs player count changes, and stops its own deployment when nobody joins in 120 s or 30 s after the last player leaves.
- **Client build**: nothing changes unless **Use Edgegap Matchmaker** is ticked. Then `EdgegapMatchmakingClient` draws a Find Match panel (on `MenuSceneName`, or every scene while disconnected), creates a ticket, waits for `HOST_ASSIGNED`, and connects to the deployment's public IP and external port, retrying while the server boots.

## 2. Host → dedicated server conversion

Grep `StartHost`, `StartServer`, `StartClient`, `IsHost`, `IsServer && IsClient`, `LocalClientId`, `ServerClientId`.

1. **No host on the server.** The server calls `StartServer()`, never `StartHost()`. With `AutoStartServer` the template does this; remove the game's own headless `StartHost`/`StartServer` call or turn `AutoStartServer` off and keep the game's (one start, not two).
2. **No local player on the server.** Code that treats client 0 or `LocalClientId` as a player, spawns "the host's" avatar in `Start`, or waits for `IsHost`, must handle a server with no player. Spawn players from the NetworkManager's Player Prefab or `OnClientConnectedCallback`.
3. **Connection approval.** If `ConnectionApproval` is on, the server's approval callback must accept remote clients only. A host-side branch that approves "ourselves" (`clientId == LocalClientId`) never runs on a dedicated server; that's fine.
4. **Connection payload.** Clients set `NetworkConfig.ConnectionData` before `StartClient`. The server sets none. Boss Room's host path calls `SetConnectionPayload` for its own client: comment it out on the dedicated path.
5. **Debug/release checks.** Boss Room rejects clients whose `Debug.isDebugBuild` differs from the server's (`IncompatibleBuildType`). A development client against a release server is rejected. Match the build types or drop the check.
6. **Unity Gaming Services.** Relay allocations (`SetRelayServerData`), Lobby and Authentication aren't needed with Edgegap. Leave them in for the game's own menus if they're optional, but the dedicated path must not call Relay.

## 3. Ports and UnityTransport

- App version port: name `gameport`, port 7777 (or the game's), protocol **UDP**. Edgegap tells the server the internal port in `ARBITRIUM_PORT_GAMEPORT_INTERNAL`; the template reads it, so the app version's port and the code can't drift.
- The server listens on `0.0.0.0` (`SetConnectionData("0.0.0.0", port, "0.0.0.0")`). `127.0.0.1` would only accept connections from inside the container.
- Clients connect to the deployment's **public IP** and the **external** port. UnityTransport's `SetConnectionData(address, port)` expects an IP address over UDP; `*.pr.edgegap.net` host names fail to parse in many versions. The matchmaking client uses `assignment.PublicIP`.
- UnityTransport's connect timeout is `ConnectTimeoutMS × MaxConnectAttempts` (1000 ms × 60 by default, 10 s in Boss Room). The matchmaking client's per-attempt timeout is 10 s; raise it if the project's transport waits longer.

## 4. Games with their own connection flow (Boss Room style)

Many NGO games, and every project derived from Unity's Boss Room sample, start connections through a `ConnectionManager` state machine (`StartClientIp`, `StartHostIp`) that builds the payload, runs approval and loads scenes. Calling `NetworkManager.StartClient()` behind its back leaves the state machine offline. For those games:

- **Server**: set `AutoStartServer = false` and start through the game. Boss Room's sample uses `Examples/BossRoom/EdgegapServerStarter.cs`, a component in the MainMenu scene that calls `connectionManager.StartHostIp("SERVER", "0.0.0.0", port)` in batch mode, with `StartingHostState` changed to call `StartServer()` instead of `StartHost()`. Outside Edgegap it falls back to `EdgegapSettings.ListenPort`.
- **Client**: replace the `NETCODE ADAPTER` region of `EdgegapMatchmakingClient.cs` with `Examples/BossRoom/EdgegapMatchmakingClient.BossRoomAdapter.cs.txt`. It calls `ConnectionManager.StartClientIp(name, publicIp, port)`. That call awaits the connection setup before `NetworkManager.StartClient`, so `IsClient` stays false for a few frames; the adapter treats the first second after the call as "connecting".
- Set `MenuSceneName` to the main menu scene so the panel doesn't draw over gameplay or other menus.
- `Examples/BossRoom/EdgegapTestDriver.cs` shows a Boss Room test driver: join an IP, take a hero seat and lock in, take screenshots, quit (see `deploy.md` §6).

Both Boss Room pieces are the files from the verified run.

## 5. Client-only code on the server

A headless server still runs every `NetworkBehaviour` on server-side objects, including visual and animation code written for clients. Typical results:
- `NullReferenceException` in animation event handlers, camera, UI or audio code (Boss Room: `ClientCharacter.OnAnimEvent`, `ClientPlayerAvatarNetworkAnimator.OnNetworkDespawn`). They're noisy but harmless if gameplay works. Guard them with `if (!IsClient) return;` or `#if !UNITY_SERVER` when they spam.
- Hundreds of `Shader ... is not supported on this GPU` lines and `No mesh data available for mesh ...`: normal for a Dedicated Server build (null graphics device). Ignore.
- Code that only runs in an `if (IsHost)` or a client callback that also set up server state: move the server part out.

## 6. Testing two clients on one machine

- Games that identify players by a saved GUID or PlayerPrefs see two local copies as the same player (Boss Room: `LoggedInAgain`, the second client is kicked). Boss Room has `-AuthProfile <name>`; other games need a per-instance id.
- Windowed: `-screen-fullscreen 0 -screen-width 960 -screen-height 540`.
- Unity's `-logFile <path>` per instance keeps the logs apart.

## 7. WebGL

The path is UnityTransport with **Use WebSockets** on both sides, the app version port as `WS` with **TLS Upgrade**, and on the client `UseEncryption = true` with `SetClientSecrets(fqdn)`, connecting to the `fqdn` (not the IP) and the external port. The matchmaker needs `allowed_cors_origins`, no `latencies` rule, and `UseLatencyBeacons` off. Test it early with a direct deploy before building on it. Mirror's WebGL path is verified (`edgegap-unity`).
