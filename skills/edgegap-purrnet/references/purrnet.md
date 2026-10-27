# PurrNet on a dedicated server

Contents
1. Start flags and the bootstrap
2. Transports, ports and protocols
3. Logic that assumed a host
4. Client connections: the async StartClient
5. Scene reloads and the Edgegap object
6. PurrNet's own Edgegap auto-setup
7. Network rules and authority
8. WebGL

Edgegap runs the Linux dedicated server build in a container and maps a random **external** port per deployment to the fixed **internal** port the transport listens on. The server listens on `0.0.0.0:<port>`; clients connect to the deployment's host or IP and external port.

## 1. Start flags and the bootstrap

PurrNet's `NetworkManager` starts itself according to **Start Server Flags** (default `ServerBuild | Editor`) and **Start Client Flags** (default `ClientBuild | Editor | Clone`). That is why play mode starts a host and a ParrelSync clone joins it, and why a client build connects to the transport's default address (often `127.0.0.1`) on its own.

On Edgegap the client must connect to an address it only learns at runtime, so the templates switch auto start off in builds:
- `EdgegapBootstrap` (`[RuntimeInitializeOnLoadMethod(BeforeSceneLoad)]`) calls `NetworkManager.DisableFlags()` before the NetworkManager's scene loads, then creates a `DontDestroyOnLoad` object named `Edgegap` with the server or client components.
- `EdgegapServerLifecycle` sets `UDPTransport.serverPort = ListenPort` and calls `StartServer()`.
- `EdgegapConnectPanel` / `EdgegapMatchmakingClient` set `address` and `serverPort` on the transport and call `StartClient()`.
- In the Editor nothing changes unless **Apply In Editor** is ticked on `EdgegapSettings`, so the developer's host + clone workflow keeps working.

Editing the flags on the NetworkManager instead also works, but it changes the scene and the Editor workflow; prefer the bootstrap. If a project already calls `DisableFlags()` itself, the counter just goes up once more (`EnableFlags()` must be called as often to re-enable).

## 2. Transports, ports and protocols

| Transport | Default port | App version protocol | Client connects to | Status |
|---|---|---|---|---|
| `UDPTransport` (LiteNetLib) | 5000 (the templates set 7777 at runtime) | **UDP** | `public_ip` | Verified end to end (desktop clients) |
| `WebTransport` (WebSocket) | 5001 | **WS** + `tls_upgrade: true` | `fqdn` over `wss` | Not verified on Edgegap (§8) |
| `CompositeTransport` | one per sub-transport | one app version port per sub-transport, distinct names | the matching one | Not verified |

- The app version's internal port must equal `ListenPort` on `EdgegapSettings` (the lifecycle writes it to the transport). Also set `DirectPort` for local tests.
- Port name `gameport` on the app version must equal `PortName`.
- The lifecycle and the connect code only configure `UDPTransport`; for another transport, change the `NETCODE ADAPTER` region in `EdgegapServerLifecycle` and `EdgegapMatchmakingClient`, and the transport block in `EdgegapConnectPanel.Connect`, using that transport's `address` / `serverPort` properties.

## 3. Logic that assumed a host

In host mode the server is also a client, so code that only ran on clients still ran on the host machine. On a dedicated server there is no local client. Walk the server-side code:

1. **`[ObserversRpc]` that sets up server state.** Without `runLocally: true`, the RPC body never runs on a dedicated server. The Incremental sample's `ResourceSpawner.InitSeed` was `[ObserversRpc(bufferLast: true)]`: the server never seeded its random generator, so it spawned no trees and players had nothing to harvest, with no error anywhere. The fix is `[ObserversRpc(runLocally: true, bufferLast: true)]`. In host mode PurrNet skips the local client's copy when `runLocally` is set, so hosts still run it once. Grep every `[ObserversRpc` and `[TargetRpc` whose body changes state the server needs.
2. **`isHost` / `isClient` checks** on the server path, and "first player" logic in `Start`. Spawn per connected player (PurrNet's `PlayerSpawner`, or `onPlayerJoined`).
3. **Headless safety.** No GPU, screen, audio or input on the server. Guard cameras, UI, `Input.*` and audio with `isServerOnly` checks or `#if !UNITY_SERVER`.
4. **Frame rate.** The lifecycle sets `Application.targetFrameRate = 60` on the server; check that nothing in the game raises it.
5. **Match end.** Call `FindObjectOfType<EdgegapServerLifecycle>().SelfStop("match over")` on the server when the game ends. The 120 s no-player and 30 s empty-server timers are a safety net.

✅ After the change, run the server headless and a client against it, and check that the world the server owns (spawned objects, scores, timers) exists, not just that the client connects.

## 4. Client connections: the async StartClient

`NetworkManager.StartClient()` is asynchronous: `clientState` stays `Disconnected` for a few frames before it becomes `Connecting`. A retry loop that waits for "not Connecting" sees `Disconnected` immediately, decides the attempt failed, calls `StopClient()` and starts over, so it never connects. Both templates wait for the state to leave `Disconnected` (up to 1 s) before waiting on `Connecting`. Keep that when writing other connect code.

## 5. Scene reloads and the Edgegap object

When the client loses its connection, `EdgegapConnectPanel` reloads the active scene to get a clean offline world (PurrNet's NetworkManager and scene objects are recreated). The `Edgegap` object is `DontDestroyOnLoad`, so the panel and matchmaking state survive. The bootstrap runs once per app start, so reloads never create a second `Edgegap` object.

## 6. PurrNet's own Edgegap auto-setup

`UDPTransport` and `WebTransport` have an **Adapt To Edgegap** option (`AutomaticCloudSetups`). It only compiles in when the Edgegap **servers plugin** (`com.edgegap.unity-servers-plugin`) is installed, and only acts in Linux server builds: it reads the deployment's port mapping and sets the listen address to `0.0.0.0` and the port to the first UDP (or WS/WSS) port. The templates use the SDK, not the plugin, so it stays inactive. If the project has the plugin, both set the port before the server starts; keep `ListenPort` equal to the app version's internal port so they agree.

## 7. Network rules and authority

PurrNet's network rules decide who may spawn, move and change state. Many samples (Incremental included) use permissive rules: owner-authoritative movement and actions, responsive but trusting clients. A dedicated server works with them, but it only removes cheating if the rules are strict and the gameplay runs in server RPCs. Mention this in the hand-off for competitive games rather than rewriting the game unasked.

## 8. WebGL

Browsers can't use UDP. Use `WebTransport`, an app version port with protocol **WS** and `tls_upgrade: true`, connect to the `fqdn` with SSL on the client (Edgegap terminates TLS; the server stays plain `ws`, SSL off), add `allowed_cors_origins` to the matchmaker config, and keep latency beacons off. This has not been run on Edgegap with PurrNet: test it early with a direct deployment, and adjust the adapter code from the installed `WebTransport` source.
