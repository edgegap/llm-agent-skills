# LightNet on the relay

LightNet (https://github.com/Ben1138/lightnet-unity) is a small raw-bytes networking library for Unity: `NetworkComponent` on a GameObject, `NetworkData` types whose first byte is their ID, `StartServer`/`StartClient` over TCP (reliable) and UDP (unreliable). The relay transport keeps all of that and replaces only the sockets.

Contents: 1. Install · 2. Host and join · 3. Host forwarding · 4. Upstream LightNet bugs

## 1. Install

1. Copy `assets/unity/Edgegap/Relay/` into the project's `Assets/`, and `assets/unity/LightNet/INetworkService.cs` next to LightNet's `NetworkService.cs`. The files use namespaces `LightNet` and `LightNet.Edgegap`, with no asmdef. If LightNet sits in an asmdef, put the relay files in it, or add an asmdef that references it.
2. `NetworkService.cs`: `public class NetworkService : INetworkService`.
3. `NetworkComponent.cs`: hold the interface and let it be swapped while closed.

```csharp
INetworkService Net = new NetworkService();          // was: NetworkService Net = ...

public bool UseNetworkService(INetworkService service)
{
    if (Net.GetState() != ENetworkState.Closed) { Debug.LogWarning("Cannot switch the network service while networking is running!"); return false; }
    Net = service;
    return true;
}

public INetworkService GetNetworkService() { return Net; }

NetworkService UseDirectService()
{
    if (Net is NetworkService direct) return direct;
    direct = new NetworkService();
    return UseNetworkService(direct) ? direct : null;
}

// StartServer / StartClient now go through UseDirectService():
NetworkService direct = UseDirectService();
return direct != null && direct.StartServer(portReliable, portUnreliable, maxClients);
```

Also guard `OnApplicationQuit` so it only closes a running service. The sample repo's `Assets/LightNet/NetworkComponent.cs` has the finished file.

## 2. Host and join

```csharp
using LightNet.Edgegap;

// RelayTicket comes from the lobby service (RelayLobbyClient) or your own backend
RelayNetworkService relay = net.StartRelayHost(ticket.ToEndpoint(), maxClients: 3);   // host: server port
RelayNetworkService relay = net.StartRelayClient(ticket.ToEndpoint());                // client: client port

relay.GetRelayState();     // Checking -> Valid; show it in the UI
relay.GetLastError();      // why it closed on its own (Invalid tokens, host gone, timeouts)
relay.GetResendCount();    // growing fast = packet loss to the relay
```

Without a lobby, build the endpoint by hand: `new RelayEndpoint { Address = relay.ip, Port = server or client port, SessionAuthorizationToken = session token, UserAuthorizationToken = that player's token }`.

Behaviour that matches direct LightNet: `IsServer()` is true on the host, `OnClientConnected` fires on the host for each joiner and on the client when the host answers, `OnClientDisconnected` fires on timeouts and remote leaves (not when you call `Close()` yourself), `ConnectionHandle`s are unique per connection. Differences: unreliable messages are limited to 1182 bytes, and reliable messages to 64 KB.

## 3. Host forwarding

Clients only reach the host. Anything one client sends that the others must see goes to the host, which sends it on, typically with the sender's player ID set by the host (don't trust the ID a client claims):

```csharp
void OnData(object s, ReceivedNetworkDataEventArgs e)
{
    if (net.IsServer() && e.Type == PlayerStateData.ID)
    {
        var state = (PlayerStateData)e.Data;
        state.PlayerId = playerIdByConnection[e.Connection.GetInternalHandle()];
        foreach (ConnectionHandle other in net.GetConnections())
            if (other.GetInternalHandle() != e.Connection.GetInternalHandle())
                net.SendNetworkData(other, ENetChannel.Unreliable, state);
    }
}
```

`RelaySample.cs` in the sample repo shows the full pattern: player IDs handed out in a reliable Welcome message, unreliable state forwarding, reliable chat broadcast, and a PlayerLeft message on disconnect.

## 4. Upstream LightNet bugs

Upstream LightNet (last commit 2021) has bugs in its direct TCP/UDP mode. They don't affect the relay transport, but fix them if the game also keeps direct play:
- Reliable (TCP) receive handles one message per read and throws away the rest of the buffer, so messages that arrive together are lost. Parse every complete message in the buffer and keep the incomplete rest.
- UDP receive copies `length - 8` bytes on the server but advances the buffer head by `length`, and the unreliable buffer keeps only one message.
- UDP from an unknown connection handle throws `KeyNotFoundException` and kills the server thread. Use `TryGetValue`.
- `SetNetworkErrorEmulation` uses `Math.Min(maxSendDelay, 0)`, so the delay is always 0.
- The example's `CubeTransformData.Deserialize` never reads the rotation.
- The upstream repo's `.gitignore` ignores `*.meta` and `Packages/`, so the example scene's script references break after cloning. The sample repo's `Assets/LightNet/**/*.meta` files restore the GUIDs the scene expects.

The sample repo has all of these fixed.
