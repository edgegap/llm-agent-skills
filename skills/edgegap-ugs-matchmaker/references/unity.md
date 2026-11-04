# Unity client and server with Unity Matchmaker on Edgegap

Contents
1. Client: ticket with `player_ip`, poll, connect
2. The sessions flow (`MatchmakeSessionAsync`) and why it is harder
3. Server: port, `MATCH_ID`, self-stop
4. Moving off Multiplay Hosting

The snippets below use API names from Unity's Matchmaker SDK reference (`IMatchmakerService`, `CreateTicketOptions`, `Player`, `TicketStatusResponse`, `MultiplayAssignment`). They were not compiled for this skill: adapt them to the project's code and compile.

## 1. Client: ticket with `player_ip`, poll, connect

The game already signs in with Unity Authentication and creates tickets. Two things change: the player's public IP goes into the ticket, and the assignment's address is used as an Edgegap address.

**The player's IP.** The module reads `CustomData.player_ip` of each player in the match. Unity does not fill it, and the client doesn't know its public IP, so ask a public echo service before queueing. Edgegap's UGS guide uses `https://api.ipify.org?format=json` (`{"ip":"..."}`). If the call fails, queue anyway without the key: the match still gets a server, just badly placed. Every player in a multi-player ticket (party) needs their own `player_ip`.

```csharp
// Unity.Services.Matchmaker (com.unity.services.matchmaker, or the same namespace in com.unity.services.multiplayer)
var customData = new Dictionary<string, object>(existingPlayerData) // keep what the queue's rules read
{
    ["player_ip"] = publicIp // string, e.g. from api.ipify.org
};
var players = new List<Player> { new Player(AuthenticationService.Instance.PlayerId, customData) };
var options = new CreateTicketOptions(queueName, ticketAttributes); // attributes choose the pool
var created = await MatchmakerService.Instance.CreateTicketAsync(players, options);
string ticketId = created.Id;
```

**Polling.** Unity's ticket-flow docs have clients check the ticket about once a second.

```csharp
while (true)
{
    await Task.Delay(1000);
    var status = await MatchmakerService.Instance.GetTicketAsync(ticketId);
    if (status?.Value is not MultiplayAssignment a) continue;          // not assigned yet
    switch (a.Status)
    {
        case MultiplayAssignment.StatusOptions.Found:
            Connect(a.Ip, (ushort)a.Port.Value);                        // Edgegap public IP + external port
            return;
        case MultiplayAssignment.StatusOptions.InProgress:
            continue;                                                   // matched or allocating
        case MultiplayAssignment.StatusOptions.Failed:
        case MultiplayAssignment.StatusOptions.Timeout:
            ShowError(a.Message);                                        // may hold the reason; the module's own text is in Cloud Code logs
            return;
    }
}
```

- The class is called `MultiplayAssignment` for historical reasons; it is the assignment for any Cloud Code allocator.
- `Port` is the **external** port Edgegap mapped (e.g. 7777 inside, 31xxx outside). Use it as given; never the internal port.
- A deployment is reachable a moment after it reports ready, and some transports give up quickly: let the netcode retry the connect for a few seconds.
- Cancel: `MatchmakerService.Instance.DeleteTicketAsync(ticketId)`.
- `a.MatchId` is the same value the server gets as `MATCH_ID`: send it in the connection payload if the server should check that players belong to its match.

## 2. The sessions flow (`MatchmakeSessionAsync`) and why it is harder

With the Multiplayer Services package, `MultiplayerService.Instance.MatchmakeSessionAsync(MatchmakerOptions, SessionOptions)` queues and then **joins the UGS session whose ID is the match ID**. Unity's `LocalServerAllocator/CONFIGURATION.md` says the client does not retry if that session doesn't exist yet, and that a hosting provider's per-match server is expected to create it with `MultiplayerServerService.Instance.CreateMatchSessionAsync(matchId, options)`. `MatchmakerOptions.PlayerProperties` become the players' `CustomData`, so `player_ip` would go there.

For Edgegap that means the game server must sign in to UGS (`ServerAuthenticationService.Instance.SignInWithServiceAccountAsync`, so a service account key in a hidden env var on the deployment), read `MATCH_ID`, and create the match session with a direct network that publishes its Edgegap public IP and external port, before Poll reports ready (the module's Poll does not wait for that today). None of this was tried with Edgegap. Prefer the ticket API in §1: the client gets the address directly and the server holds no UGS secret. If the game is built around sessions (lobby UI, session properties), tell the developer the extra work and that it is unverified.

## 3. Server: port, `MATCH_ID`, self-stop

Build and containerize with `edgegap-unity` (or `edgegap-ngo` / `edgegap-fishnet` / `edgegap-purrnet`). The server is a normal Edgegap per-match server; only these points are specific:

- **Port.** Listen on `0.0.0.0` at the app version's internal port. Edgegap also injects `ARBITRIUM_PORT_GAMEPORT_INTERNAL` (and `_EXTERNAL`, `_PROTOCOL`) for the port named `gameport`.
- **`MATCH_ID`.** The only match data the module sends. It is not secret (`is_hidden: false`). The server gets no player list, teams or ticket attributes, and none of the Edgegap matchmaker's `MM_*` variables. If the server needs teams or player IDs, either add env vars in the module's Allocate (`references/allocator.md` §5) or have players announce their UGS player ID and `MatchId` on connect.
- **Self-stop.** Nothing else stops the deployment: the module never does. Stop when nobody joins within a couple of minutes (players who gave up), when everyone has left, and at match end: `DELETE $ARBITRIUM_DELETE_URL` with header `Authorization: $ARBITRIUM_DELETE_TOKEN`. `EdgegapServerLifecycle.cs` from `edgegap-unity` does this and treats a deployment without Edgegap matchmaker variables as a plain deployment, which is what this module creates. Keep `max_duration` on the version as the backstop.
- **No UGS on the server** for the ticket flow: no service account, no Matchmaker or Multiplay SDK calls.

## 4. Moving off Multiplay Hosting

Edgegap's [switch from Multiplay](https://docs.edgegap.com/docs/tools-and-integrations/switch-from-multiplay) maps the concepts (fleets and build configurations → apps and versions; no server SDK needed). Concretely in the project:

- Remove the Multiplay server SDK calls (`MultiplayService.Instance.ReadyServerForPlayersAsync`, `StartServerQueryHandlerAsync` / `ServerQueryHandler`, `SubscribeToServerEventsAsync`, `GetPayloadAllocationAsJson`, reading `server.json`). The Edgegap server reads env vars and stops itself.
- Matchmaking results that the server used to read from the allocation payload now come from env vars the module sets (`MATCH_ID` only by default).
- Multiplay QoS regions: the queue may keep them for matching, but placement is by `player_ip`. The module ignores `MatchProperties["Region"]`.
- Backfill: Unity Matchmaker's backfill tickets (`CreateBackfillTicketAsync`, `ApproveBackfillTicketAsync`) were driven by a Multiplay server holding UGS credentials. On Edgegap that needs the server to sign in to UGS as above; not covered or tested here.
- Switch the pool's Match Hosting from Multiplay to Cloud Code only after the client that sends `player_ip` is out (test first on a copy of the queue).
