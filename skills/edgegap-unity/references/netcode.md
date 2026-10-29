# Netcode guide: dedicated-server readiness and adapters

Contents
1. Picking a netcode (projects with no multiplayer yet)
2. Converting host/client or listen-server games to a dedicated server
3. Port and protocol table
4. Adapter snippets: Netcode for GameObjects, Mirror, FishNet
5. WebGL clients
6. Testing locally before Edgegap

Edgegap runs your **Linux dedicated server build** in a container. It assigns a random *external* port per deployment and maps it to the *internal* port your transport listens on. So the server listens on a fixed internal port on `0.0.0.0`, and the client connects to `fqdn`/`public_ip` + the external port that the matchmaker assignment returns.

## 1. Picking a netcode

Only relevant when the project has no networking yet. Check `Packages/manifest.json` first: `com.unity.netcode.gameobjects` = NGO, `Assets/Mirror` or `com.mirror-networking.mirror` = Mirror, `Assets/FishNet` = FishNet. If one is present, keep it.

Without one, recommend:
- **Netcode for GameObjects (NGO)** for desktop/mobile targets on Unity 6. Official Unity package, UDP via Unity Transport, and many tutorials. Install `com.unity.netcode.gameobjects`.
- **Mirror** if the game must run in a **browser (WebGL)**. Its SimpleWebTransport + Edgegap TLS Upgrade path was verified end to end with the Edgegap matchmaker (sample: github.com/edgegap/netcode-game-sample-webgl-mirror-tanks).
- FishNet is also well supported by Edgegap. Pick it if the developer already knows it.

Get basic multiplayer working **locally** first: two players can move and see each other with one Editor running as server and one as client (Unity 6 Multiplayer Play Mode, or a second build). Don't containerize a game whose netcode doesn't work on localhost. Every later failure becomes ambiguous.

NGO, PurrNet, FishNet and Photon Fusion 2 have their own skills (`edgegap-ngo`, `edgegap-purrnet`, `edgegap-fishnet`, `edgegap-fusion`). Other netcodes also work on Edgegap. The same principles apply (server build, bind 0.0.0.0, fixed internal port, connect to external port). Write the adapter from that library's docs.

## 2. Converting host/client (listen server) to a dedicated server

Many games "work with my friend" because one player hosts. On Edgegap nobody hosts: a headless server owns the game. Walk the code for these, in this order:

1. **Server start path.** In server builds (`#if UNITY_SERVER`, or `Application.isBatchMode`), call `StartServer()`, never `StartHost()`. Nothing should wait for a button click or a menu scene. `EdgegapServerLifecycle` does this when `AutoStartServer` is on.
2. **No local player on the server.** Find code that assumes the host is also a player: `IsHost`, `LocalClient` / `NetworkManager.LocalClientId == 0` / `isLocalPlayer` on the server, `OwnerClientId == NetworkManager.ServerClientId`, spawning the "first player" in `Start`. Spawn players when *clients* connect (NGO: `OnClientConnectedCallback` or the NetworkManager's Player Prefab; Mirror: `OnServerAddPlayer`; FishNet: `PlayerSpawner`/`OnRemoteConnectionState`).
3. **Server authority.** Game state changes (damage, score, pickups, win conditions) must run on the server (`IsServer` checks, ServerRpc/Command handlers), not in a host player's Update.
4. **Headless safety.** The server has no GPU, screen, audio device, or input. Guard or strip: cameras/post-processing, UI that runs logic in `Update`, `Input.*` reads in server code paths, audio, `Screen.*`, shader/material work, anything that `Find`s UI objects and throws when missing. The Dedicated Server build target strips a lot, but scripts still run. Wrap client-only code in `if (!IsServer)` / `#if !UNITY_SERVER`.
5. **Scenes.** The scene that contains the network manager must be in Build Settings and load first (or be loaded by the server path). The plugin's **Build server** (and `EdgegapPluginBuild`) only builds *enabled* scenes in Build Settings. A missing scene causes OOM or restart loops on Edgegap.
6. **Match end.** Decide when a match is over and call `EdgegapServerLifecycle.SelfStop("match over")`. The empty-server timers are a fallback.
7. **Relay/lobby leftovers.** Remove Unity Relay/Lobby or Steam P2P host code from the dedicated path. Edgegap matchmaking replaces "join code" flows. (Keep a direct-IP debug path. It's handy for testing.)
8. **Frame rate.** Set `Application.targetFrameRate` (e.g. 30-60) on the server. Headless servers otherwise spin a core at 100%.

## 3. Port and protocol table

The app version port must use the transport's protocol, and its **internal** port must equal the port the server listens on.

| Netcode / transport | Default port | App version protocol | Notes |
|---|---|---|---|
| NGO + UnityTransport | 7777 | UDP | `ConnectionData.Port`; server listen address `0.0.0.0` |
| NGO + UnityTransport (Use WebSockets) | 7777 | WS (+TLS Upgrade) | WebGL; see section 5 |
| Mirror KcpTransport | 7777 | UDP | |
| Mirror TelepathyTransport | 7777 | TCP | |
| Mirror SimpleWebTransport | 7778 (often) | WS + TLS Upgrade | client `clientUseWss`; server `sslEnabled` off |
| FishNet Tugboat | 7770 | UDP | enable `Reuse Server Address` |
| FishNet Bayou | 7770 | WS (+TLS Upgrade) | WebGL |

Use the port name `gameport` on the app version and in `EdgegapMatchmakingClient.PortName`. The plugin's dashboard pre-fill uses "Game Port", and a mismatch gives "Assignment has no port named ...".

## 4. Adapter snippets

Paste these into the `#region NETCODE ADAPTER` of `EdgegapMatchmakingClient.cs` and `EdgegapServerLifecycle.cs`, and add the `using` lines at the top. The NGO and Mirror snippets, together with the templates, were compile-tested on Unity 6000.3 with NGO 2.4.3, Mirror 86.13 and SDK 3.5.5, including a Linux Dedicated Server build. The FishNet snippet is the one verified end to end on Edgegap in the FishNet sample (FishNet 4.1.6R, Bayou, Unity 2021.3); the `edgegap-fishnet` skill has the complete FishNet workflow. These APIs vary slightly between library versions. Check against the installed version (look at the package source in `Library/PackageCache` or `Assets/`) and fix compile errors from the actual API rather than guessing.

### Netcode for GameObjects (1.x / 2.x, UnityTransport)

Client (`using Unity.Netcode; using Unity.Netcode.Transports.UTP;`):
```csharp
private void StartClientConnection(string fqdn, string publicIp, ushort port)
{
    NetworkManager nm = NetworkManager.Singleton;
    UnityTransport utp = nm.GetComponent<UnityTransport>();
    // UDP: use the IP. UnityTransport expects an IP address, not a hostname, in many versions.
    utp.SetConnectionData(publicIp, port);
    nm.StartClient();
}
private bool IsClientConnecting() =>
    NetworkManager.Singleton != null && NetworkManager.Singleton.IsClient && !NetworkManager.Singleton.IsConnectedClient;
private bool IsClientConnected() => NetworkManager.Singleton != null && NetworkManager.Singleton.IsConnectedClient;
private bool IsClientActive() => NetworkManager.Singleton != null && NetworkManager.Singleton.IsClient;
private void StopClientConnection()
{
    if (NetworkManager.Singleton != null && NetworkManager.Singleton.IsClient)
        NetworkManager.Singleton.Shutdown();
}
```
Server:
```csharp
private void StartDedicatedServer(ushort port)
{
    NetworkManager nm = NetworkManager.Singleton;
    nm.GetComponent<UnityTransport>().SetConnectionData("0.0.0.0", port, "0.0.0.0"); // listen on all interfaces
    nm.StartServer();
}
private bool IsServerRunning() => NetworkManager.Singleton != null && NetworkManager.Singleton.IsServer;
private int ConnectedPlayerCount() => NetworkManager.Singleton.ConnectedClientsIds.Count; // excludes the server itself on a dedicated server
```
NGO notes: if the project uses a connection approval payload or a custom ConnectionManager (Boss Room style), call its server-start method instead of `StartServer()` directly. NGO with `UnityTransport` and "Use Relay" or Unity Relay allocations: remove those calls on the dedicated path.

### Mirror

Client (`using System; using Mirror;`):
```csharp
private void StartClientConnection(string fqdn, string publicIp, ushort port)
{
    NetworkManager nm = NetworkManager.singleton;
    if (Transport.active is SimpleWeb.SimpleWebTransport)
    {
        // Every deployment has its own external port: connect by URI instead of ClientPortOption.
        nm.StartClient(new UriBuilder { Scheme = UseSecureWebSocket ? "wss" : "ws", Host = fqdn, Port = port }.Uri);
        return;
    }
    nm.networkAddress = publicIp;
    if (Transport.active is PortTransport portTransport)
        portTransport.Port = port;
    nm.StartClient();
}
private bool IsClientConnecting() => NetworkClient.isConnecting;
private bool IsClientConnected() => NetworkClient.isConnected;
private bool IsClientActive() => NetworkClient.active;
private void StopClientConnection()
{
    if (NetworkClient.active)
        NetworkManager.singleton.StopClient();
}
```
Server:
```csharp
private void StartDedicatedServer(ushort port)
{
    if (Transport.active is PortTransport portTransport)
        portTransport.Port = port;
    NetworkManager.singleton.StartServer();
}
private bool IsServerRunning() => NetworkServer.active;
private int ConnectedPlayerCount() => NetworkServer.connections.Count;
```
Mirror notes:
- Older Mirror uses `Transport.activeTransport` instead of `Transport.active`, and `SimpleWebTransport` may be in namespace `Mirror.SimpleWeb`.
- Mirror's NetworkManager can auto-start the server in headless builds (`Headless Start Mode = Auto Start Server`, older: "Auto Start Server Build"). Use either that or `AutoStartServer` on `EdgegapServerLifecycle`, not both. Starting twice logs "Server already started".
- If the Mirror project contains the Edgegap plugin embedded under `Assets/Mirror/Hosting/Edgegap`, don't also add the plugin via UPM (duplicate types).

### FishNet (4.x)

Client (`using FishNet; using FishNet.Managing; using FishNet.Transporting; using FishNet.Transporting.Bayou;`):
```csharp
private void StartClientConnection(string fqdn, string publicIp, ushort port)
{
    NetworkManager nm = InstanceFinder.NetworkManager;
    // Bayou (WebSocket + TLS Upgrade): wss to the fqdn. Tugboat (UDP): the IP.
    if (nm.TransportManager.Transport is Bayou bayou)
    {
        bayou.SetUseWSS(UseSecureWebSocket);
        nm.ClientManager.StartConnection(fqdn, port);
        return;
    }
    nm.ClientManager.StartConnection(publicIp, port);
}
private bool IsClientConnecting() =>
    InstanceFinder.NetworkManager.TransportManager.Transport.GetConnectionState(false) == LocalConnectionState.Starting;
private bool IsClientConnected() => InstanceFinder.NetworkManager.ClientManager.Started;
private bool IsClientActive() =>
    InstanceFinder.NetworkManager.TransportManager.Transport.GetConnectionState(false) != LocalConnectionState.Stopped;
private void StopClientConnection() => InstanceFinder.NetworkManager.ClientManager.StopConnection();
```
Server:
```csharp
private void StartDedicatedServer(ushort port)
{
    NetworkManager nm = InstanceFinder.NetworkManager;
    nm.TransportManager.Transport.SetPort(port);
    nm.ServerManager.StartConnection();
}
private bool IsServerRunning() => InstanceFinder.NetworkManager != null && InstanceFinder.NetworkManager.ServerManager.Started;
private int ConnectedPlayerCount() => InstanceFinder.NetworkManager.ServerManager.Clients.Count;
```
FishNet notes: either use ServerManager's **Start On Headless** or `AutoStartServer`, not both (the verified setup turns Start On Headless off). Games that change scenes need the `Edgegap` object kept alive across loads (`EdgegapPersistence` in `edgegap-fishnet`). On Unity before 2022.3, SDK 3.5.5 and older form-encode matchmaker POSTs and every ticket gets HTTP 400: use SDK 3.5.6+ (`troubleshooting.md`). Enable **Reuse Server Address** on Tugboat. Leave the server bind address empty or `0.0.0.0`. Set any NetworkHudCanvases `Auto Start Type` to Disabled in client builds.

## 5. WebGL clients

Browsers can't open UDP sockets or send ICMP pings. For a WebGL client:
- Use a WebSocket transport (Mirror SimpleWebTransport, FishNet Bayou, or UnityTransport with Use WebSockets).
- App version port: protocol **WS**, **TLS Upgrade enabled**. Edgegap terminates TLS with a certificate for `*.pr.edgegap.net`. The server runs plain `ws` (no certificate, `sslEnabled` off). The client connects with `wss://{fqdn}:{external}` (must use the fqdn, not the IP, or the certificate check fails).
  - Without TLS Upgrade, a wss client makes the server log `First bytes from client was not 'GET' for handshake, instead was 16-03-01`.
  - Set it with `"tls_upgrade": true` on the WS port in `edgegap_create_app_version` (MCP 0.3.3+), or tick **TLS Upgrade** on the port in the dashboard.
- Matchmaker config needs `allowed_cors_origins` listing every origin that serves the build (e.g. `http://localhost:8080`, `https://<user>.itch.io`, `https://html-classic.itch.zone`). Otherwise the browser blocks matchmaker calls.
- No latency beacons: keep `UseLatencyBeacons` off and use a profile **without** a `latencies` rule. The matchmaker then places the server from player IPs.
- SDK must be **3.5.6 or newer**: install it from the git URL with no `#tag`, which gives the latest. Versions before 3.5.5 fail the WebGL build with `CS0234` in `Runtime/Ping.cs`.
- IL2CPP stripping: include `link.xml` from `assets/unity/`.
- Player Settings > Publishing: Compression **Gzip** with **Decompression Fallback** for hosts that don't set encoding headers (itch.io).
- NGO WebGL path (UnityTransport WebSockets + TLS Upgrade): client `UseWebSockets = true`, `UseEncryption = true`, `SetClientSecrets(fqdn)`; server `UseWebSockets = true`, no encryption. This path has **not** been verified on Edgegap the way Mirror's has. Test it early, and suggest Mirror if it fights you.

## 6. Testing locally before Edgegap

Do these in order. Each one isolates a layer:
1. **Editor**: server in one instance, client in another (Multiplayer Play Mode / second build) on `127.0.0.1:7777`.
2. **Server build on the host**: run `Builds/EdgegapServer/ServerBuild` in Linux/WSL with `-batchmode -nographics`, or skip to Docker.
3. **Docker**: `docker run --rm -p 7777:7777/udp <image>:<tag>` (WS/TCP: `-p 7778:7778/tcp`). Connect a client to `127.0.0.1:7777`. Logs must show the server started and listening. `EdgegapServerLifecycle` logs "Not running on Edgegap, self-stop disabled" here, which is expected.
4. **Edgegap direct deploy** (MCP `edgegap_deploy`), connect a client to `fqdn`:`external`. Only then add the matchmaker.
