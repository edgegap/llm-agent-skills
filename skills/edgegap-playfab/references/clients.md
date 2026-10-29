# Clients

The client never talks to Edgegap and holds no secret. It needs only the PlayFab title ID and the queue name.

## 1. The REST contract (any engine)

All calls are `POST https://<TitleId>.playfabapi.com<path>` with `Content-Type: application/json`. Responses are `{"code":200,"status":"OK","data":{…}}`; errors carry `errorMessage`.

| Step | Path | Headers | Body → what to keep |
| --- | --- | --- | --- |
| 1. Login | `/Client/LoginWithCustomID` (or the game's login: Steam, device, OpenID…) | none | `{"TitleId","CustomId","CreateAccount":true}` → `data.SessionTicket`, `data.EntityToken.EntityToken`, `data.EntityToken.Entity` (`{Id, Type:"title_player_account"}`) |
| 2. Queue | `/Match/CreateMatchmakingTicket` | `X-EntityToken` | `{"Creator":{"Entity":<entity>,"Attributes":…optional},"GiveUpAfterSeconds":120,"QueueName"}` → `data.TicketId` |
| 3. Wait for a match | `/Match/GetMatchmakingTicket` every **6 s** | `X-EntityToken` | `{"TicketId","QueueName"}` → `data.Status`: `WaitingForPlayers`/`WaitingForMatch` (keep polling), `Matched` (`data.MatchId`), `Canceled` (`data.CancellationReason`) |
| 4. Wait for the server | `/Client/GetUserReadOnlyData` every 2 to 3 s, up to ~3 min | `X-Authorization: <SessionTicket>` | `{"Keys":["EdgegapServer"]}` → `data.Data.EdgegapServer.Value`, a JSON **string**: `{"matchId","status","host","port","joinToken"}` |
| 5. Connect | the netcode | | when `matchId` equals this match's ID: `status:"ready"` → connect to `host:port` and send `joinToken` as soon as the connection is up (FishNet: `JoinTokenAuthenticator`; NGO: the connection payload; Mirror: an authenticator message); `status:"error"` → show `message`, allow re-queueing. A different `matchId` is left over from an earlier match: keep polling. |

To leave the queue: `/Match/CancelAllMatchmakingTicketsForPlayer` `{"Entity","QueueName"}`. One player can hold only one ticket per queue at a time.

`host` is the server's public IP, and `port` is the **external** port of the app version's `gameport` (Edgegap maps the internal port, e.g. 7770 → 31843). Use them as they are.

## 2. Unity

`assets/unity/PlayFabMatchmakingClient.cs` implements the contract with `UnityWebRequest` + `JsonUtility` only:
- Fields: `TitleId`, `QueueName`, `GiveUpAfterSeconds`, `ServerWaitTimeoutSeconds`. Command line: `-playfabTitleId`, `-playfabQueue`, `-playfabCustomId <id>` (a different PlayFab player per process), `-autoMatch` (queue right after login, for headless tests).
- API: `Login()`, `FindMatch()`, events `OnStatus(string message, bool isError)` and `OnCanQueue(bool)`, property `IsLoggedIn`. It lives in `DontDestroyOnLoad`. When the menu scene reloads after a match, don't log in again: check `IsLoggedIn`.
- NETCODE ADAPTER: `ConnectToServer(host, port)`. FishNet is filled in. NGO: `GetComponent<UnityTransport>().SetConnectionData(host, port)` then `NetworkManager.Singleton.StartClient()`. Mirror: `NetworkManager.singleton.networkAddress = host`, set the transport's port, `StartClient()`. PurrNet: set the UDP transport's address and port, then start the client.
- It builds its own JSON body with `UploadHandlerRaw`. `UnityWebRequest.Post(url, string)` form-encodes the body before Unity 2022.3, and PlayFab rejects that.
- It waits with `Task.Yield` loops, not `Task.Delay`, so it has no thread dependency (WebGL; not tested in WebGL yet).
- It uses a custom ID per install (a GUID in PlayerPrefs). For a shipped game, swap step 1 for the platform login the game already has.

If the game already uses the **PlayFab Unity SDK**, keep its login and make the same calls through it:

```csharp
PlayFabMultiplayerAPI.CreateMatchmakingTicket(new CreateMatchmakingTicketRequest {
    Creator = new MatchmakingPlayer { Entity = new PlayFab.MultiplayerModels.EntityKey { Id = entityId, Type = entityType } },
    GiveUpAfterSeconds = 120, QueueName = queue }, r => ticketId = r.TicketId, OnError);
PlayFabMultiplayerAPI.GetMatchmakingTicket(new GetMatchmakingTicketRequest { TicketId = ticketId, QueueName = queue }, r => { /* r.Status, r.MatchId */ }, OnError);
PlayFabClientAPI.GetUserReadOnlyData(new GetUserDataRequest { Keys = new List<string> { "EdgegapServer" } },
    r => { if (r.Data.TryGetValue("EdgegapServer", out var v)) { var info = JsonUtility.FromJson<ConnectionInfo>(v.Value); } }, OnError);
```

The entity comes from the login result (`result.EntityToken.Entity`). Delete any `RequestMultiplayerServer` / `GetMatch` → `ServerDetails` code left over from PlayFab Multiplayer Servers.

## 3. Unreal and Godot

- **Unreal**: the PlayFab plugin exposes the same calls (`UPlayFabMultiplayerAPI::CreateMatchmakingTicket`, `GetMatchmakingTicket`, `UPlayFabClientAPI::GetUserReadOnlyData`), or use `FHttpModule` with the table above. Connect with `ClientTravel("<host>:<port>", TRAVEL_Absolute)`. Server build and container: `edgegap-unreal`.
- **Godot 4**: `HTTPRequest` with the table above (`JSON.stringify` bodies, `Timer` nodes for the 6 s / 3 s polls), then `ENetMultiplayerPeer.create_client(host, port)`. Server side: `edgegap-godot`.

Neither has been run against this bridge yet. The contract is the same one the verified Unity client uses.

## 4. Testing several clients on one machine

- Every client must be a **different PlayFab player**. Unity builds share PlayerPrefs, so pass `-playfabCustomId player-a` / `player-b`. In the Editor plus a build, give one of them the argument.
- Build Windows test clients with `-executeMethod EdgegapPluginBuild.BuildClient`, not `-buildWindows64Player`: after the plugin's server build, Unity stays on the Dedicated Server subtarget and the player build fails with "Dedicated Server support for Win is not installed".
- Headless Unity test clients: `Game.exe -batchmode -nographics -client -autoMatch -playfabCustomId e2e-a -logFile a.log`. Against a local server container without PlayFab: `-connect 127.0.0.1:7770 -joinToken <token>`. `EdgegapServer` treats `-batchmode` as a server unless `-client` is there.
- Read the client logs for: `Logged in to PlayFab` → `Searching for players` → `Match found (<id>)` → `Server ready at <host>:<port>`. Read the server logs (`edgegap_get_deployment_logs`) for `N player(s) connected`.
