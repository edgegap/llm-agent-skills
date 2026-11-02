# Photon Fusion 2 dedicated servers on Edgegap

## 1. How a Fusion dedicated server serves players

A Fusion server is a `NetworkRunner` started with `GameMode.Server`. When it starts, it connects to **Photon Cloud** in one region, creates a session with a name (and optional lobby and properties), and waits. A client starts its own runner with `GameMode.Client` and the same session name. Photon matches them, and the two runners then try to talk **directly** over UDP. If that fails, Photon relays the traffic.

So three things must match between server and client, or the client gets `GameNotFound`:
- the **App ID** (`PhotonAppSettings.AppSettings.AppIdFusion`). A wrong one gives `InvalidAuthentication` instead.
- the **App Version** (`AppSettings.AppVersion`, empty by default). BR200 also puts it into its lobby name (`FusionBR.<Application.version>`).
- the **region** (`AppSettings.FixedRegion`, or the best region by ping when empty).

On Edgegap, one deployment is one Fusion server and one session. The kit names the session after the deployment's FQDN (`<ARBITRIUM_REQUEST_ID>.pr.edgegap.net`). Clients that know the deployment (from your backend, a server list, or the Photon lobby) join it by that name.

## 2. Bind address vs public address (measured)

`StartGameArgs` has two address fields (see `Fusion.Runtime.xml`):
- `Address`: the **peer binding address**. Default `NetAddress.Any(port)`.
- `CustomPublicAddress`: a custom **public reflexive address**. Default null; Fusion discovers it with STUN.

On Edgegap the container listens on an internal port (7777), and players reach it on the deployment's public IP and a **random external port**. Results with two clients and BR200 2.1.0 on Fusion 2.1.1 (CT = `runner.CurrentConnectionType` on the client):

| `Address` (BR200's `IP` / `-ip`) | Result |
|---|---|
| `0.0.0.0:7777` (or `NetAddress.Any(7777)`) | **Direct** on Edgegap: 14 to 15 ms to Newark, 11 to 126 ms to Toronto. No `CustomPublicAddress` needed. |
| `127.0.0.1:7777` | The server starts, but clients are **Relayed** (about 235 ms). Nothing outside the container reaches loopback. |
| the deployment's public IP | The server **doesn't start**: `Failed to bind socket to [Address Ip=… Port=7777]`. The container doesn't own that address. Clients get `GameNotFound`. |

So bind `0.0.0.0` (or leave the IP empty) and let Fusion find the public address. Don't try to "give Fusion its public IP" through the bind address. If a network ever needs an explicit public address, it goes in `CustomPublicAddress` (public IP and the external port, `ARBITRIUM_PUBLIC_IP` and `ARBITRIUM_PORT_GAMEPORT_EXTERNAL`). BR200 has no option for it. Setting it from a code patch also gave Direct, but it wasn't needed in any Edgegap test.

In a local Docker Desktop test, clients on the same machine show **Relayed** with `0.0.0.0`: Fusion discovers the host's NAT address, and a client on that host can't loop back through it. That only happens locally.

## 3. IL2CPP on the server

On a **Mono** Linux server build, BR200's RPCs fail. `Player.RPC_SendPlayerData` throws `MethodAccessException: Method 'Fusion.NetworkBehaviourUtils.CheckInvokeRpc(Fusion.NetworkBehaviour)' is inaccessible`, and the player never gets a character. A Mono Windows client fails the same way. The IL2CPP builds ran with no exceptions. Keep BR200's default, IL2CPP, for the Dedicated Server backend, and use IL2CPP for test clients too. For other Fusion games, assume the same until a Mono build has been tested with RPCs.

Building Linux IL2CPP on Windows or macOS needs Unity's Linux toolchain packages (`deploy.md` §1). BR200's IL2CPP server build took about 55 minutes; a Mono build takes 2.

## 4. Regions

Photon Cloud regions for Fusion: `asia` Singapore, `au` Sydney, `cae` Montreal, `cn` Shanghai (unlock needed), `eu` Amsterdam, `hk` Hong Kong, `in` Chennai, `jp` Tokyo, `kr` Seoul, `sa` São Paulo, `tr` Istanbul, `uae` Dubai, `us` Washington DC, `usw` San José, `ussc` Dallas, `za` Johannesburg (https://doc.photonengine.com/fusion/v2/manual/connection-and-matchmaking/regions).

Edgegap places the deployment near the players, so the kit's start script picks the Photon region closest to `ARBITRIUM_DEPLOYMENT_LOCATION`: Toronto → `cae`, Newark → `us`. That's usually what the players' clients pick by ping. When the clients use a fixed region, or the Photon app allows only some regions, pass `BR200_REGION` on the deployment or restrict the choice with `BR200_REGION_ALLOWLIST`. The client's region must equal the one in the server's `photon_region=` log line.

## 5. Other Fusion games

The same rules apply without the BR200 kit. Untested beyond BR200:
- Start the server in batch mode with `GameMode.Server`, `Address = NetAddress.Any(<internal port>)`, `SessionName` from `ARBITRIUM_REQUEST_ID`, and a fixed region the clients will use.
- Bind the port from `ARBITRIUM_PORT_GAMEPORT_INTERNAL` (7777), declared UDP in the app version.
- IL2CPP on the server (§3). Headless: build the Server subtarget so `UNITY_SERVER` is defined.
- End the match by shutting the runner down and exiting the process (restart policy `never`), or by calling `ARBITRIUM_DELETE_URL`.
- Never print the environment at boot: it holds `ARBITRIUM_DELETE_TOKEN`. The Edgegap Unity plugin's default Dockerfile ran `env` up to 3.2.1 (fixed in 3.2.2); the kit's Dockerfile never did.

## 6. Checking the connection type

BR200 shows the connection type in its Tab overlay (**CT**, top left), from `runner.CurrentConnectionType` (`Direct`, `Relayed`, or `None` on a server). Headless clients can't show the overlay, so `assets/test/ConnectionTypeProbe.cs` logs the same value every 5 s:

```
[probe] mode=Client CT=Direct rtt=14ms players=2 session=<fqdn> region=us
```

It adds itself at startup (`RuntimeInitializeOnLoadMethod`) and needs no scene change. Delete it before shipping.
