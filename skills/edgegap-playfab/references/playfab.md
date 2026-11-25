# PlayFab side

## 1. The queue

PlayFab only forms matches here; Edgegap hosts them. So on the queue:
- **`ServerAllocationEnabled: false`** (Game Manager: *Enable server allocation* off). With it on, PlayFab tries to start a PlayFab Multiplayer Servers build and the match fails or waits for one.
- `MinMatchSize` / `MaxMatchSize`: players per match. With no rules, any players match as soon as `MinMatchSize` tickets are waiting (verified with 2-2).
- Rules: keep the game's existing rules (skill, platform, region, team rules). PlayFab's latency rules need the client to measure latency itself and put it in the ticket's attributes. Edgegap already places the server near the players, so a latency rule is optional, and `StartEdgegapDeployment` doesn't use ticket attributes.

`assets/scripts/playfab-setup.mjs` calls `Match/SetMatchmakingQueue`, which creates or **replaces** the whole queue. So the script reads an existing queue first (`Match/GetMatchmakingQueue`), keeps its sizes, teams and rules, turns allocation off and drops `BuildId` / `ServerAllocationSettings`. `DRY_RUN=1` prints the queue without changing it.

The `match_found` event fires for **every** queue of the title. If some queues should keep another host for now (a gradual move off PlayFab Multiplayer Servers), set `EDGEGAP_QUEUES` on the function app. Both need a title entity token (`/Authentication/GetEntityToken` with `X-SecretKey`).

## 2. Title settings that bite

- **Player creation through client logins is off on new titles.** Game Manager > gear > Title settings > API Features > *Disable player creation using Client/LoginWithCustomId* (and AndroidDeviceId, IOSDeviceId, NintendoSwitchDeviceId) are ticked. `LoginWithCustomID` with `CreateAccount: true` then fails with `PlayerCreationDisabled` (400, error code 22000). Untick the one the game uses. Platform logins (Steam, Xbox, PSN, OpenID) are not affected.
- **Player locations.** `Server/GetPlayerProfile` with `ShowLocations: true` returns where PlayFab geolocated the player's last login IP. That's what `StartEdgegapDeployment` sends to Edgegap. Players created through `Server/LoginWithServerCustomId` (test players) get the location of the machine that called it.
- **Development mode** caps the number of players (1,000 on the free tier since March 2026). Test players count.

## 3. The rule, and what PlayFab sends

Game Manager > **Automation > Rules > New Rule**:
- Event type: **`playfab.matchmaking.match_found`**. It fires once per match formed in any queue of the title.
- Action: **Execute Azure Function** > `StartEdgegapDeployment` (it must be registered first: Automation > CloudScript > Functions, or `CloudScript/RegisterHttpFunction`).

There is no public API for rules; the developer creates it. Verified on 2026-10-21: the rule fires for a queue with server allocation off. Older forum threads say matchmaking events can't trigger rules; that was not the case here.

PlayFab POSTs an `EntityPlayStreamFunctionExecutionContext` to the function:

```json
{
  "PlayStreamEvent": {
    "FullName": { "Namespace": "playfab.matchmaking", "Name": "match_found" },
    "Payload": { "MatchId": "…", "QueueName": "…", "TicketIds": ["…"] }
  },
  "TitleAuthenticationContext": { "Id": "<title id>", "EntityToken": "<title entity token>" },
  "CallerEntityProfile": { … }
}
```

The title entity token is enough for `Match/GetMatch` and `Profile/GetProfiles`. Classic Server APIs (`GetPlayerProfile`, `UpdateUserReadOnlyData`) need the title secret key, so the function app has it in its settings.

Limits:
- **Rule (PlayStream V2) and `ExecuteFunction` HTTP calls time out after 10 s**, and scheduled tasks after 4.5 s. Never wait for a server inside the rule's function. The function keeps running after PlayFab gives up, but don't rely on it.
- No documented retry. A second call for the same match would start a second server. The extra one never gets players and stops itself (the first-player timeout), so it costs about 2 minutes.
- `GetMatchmakingTicket`: 10 calls per minute per ticket → poll every 6 s.

## 4. Test players and a queue check without a client

Create players server-side, so the test doesn't depend on the API Features setting, and queue them:

```js
// node test-queue.mjs — env: PLAYFAB_TITLE_ID, PLAYFAB_SECRET_KEY, QUEUE
const T = process.env.PLAYFAB_TITLE_ID, B = `https://${T}.playfabapi.com`;
const post = async (p, b, h = {}) => { const r = await (await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) })).json(); if (r.code !== 200) throw new Error(p + ' ' + r.errorMessage); return r.data; };
const players = [];
for (const id of ['test-a', 'test-b']) {
  const d = await post('/Server/LoginWithServerCustomId', { ServerCustomId: id, CreateAccount: true }, { 'X-SecretKey': process.env.PLAYFAB_SECRET_KEY });
  const t = await post('/Match/CreateMatchmakingTicket', { Creator: { Entity: d.EntityToken.Entity }, GiveUpAfterSeconds: 60, QueueName: process.env.QUEUE }, { 'X-EntityToken': d.EntityToken.EntityToken });
  players.push({ token: d.EntityToken.EntityToken, ticket: t.TicketId, playFabId: d.PlayFabId });
}
for (;;) {
  await new Promise((r) => setTimeout(r, 6000));
  const s = await post('/Match/GetMatchmakingTicket', { TicketId: players[0].ticket, QueueName: process.env.QUEUE }, { 'X-EntityToken': players[0].token });
  console.log(s.Status, s.MatchId ?? '');
  if (s.Status === 'Matched' || s.Status === 'Canceled') break;
}
```

**Once the rule exists, every match these players form starts a real Edgegap server.**

## 5. Moving off PlayFab Multiplayer Servers (MPS)

- Queue: server allocation off; drop the build ID / region selection on the queue.
- Server: remove the GSDK (`PlayFabMultiplayerAgentAPI.Start`, `ReadyForPlayers`, heartbeats, `GetConfigSettings`). Edgegap needs nothing like it: the server listens on its port, and Edgegap's port check plus the ready webhook replace `ReadyForPlayers`. Session config from MPS (`SessionCookie`, initial players) comes from deployment environment variables if you need it (`StartEdgegapDeployment` sets `PLAYFAB_MATCH_ID` and `PLAYFAB_QUEUE_NAME`).
- Client: the address no longer comes from `GetMatch` → `ServerDetails` or `RequestMultiplayerServer`. It comes from the player's read-only data (`references/clients.md`).
- The MPS build's ports become the Edgegap app version's ports. Name the game port `gameport`.

## 6. Legacy CloudScript

Existing JavaScript CloudScript keeps running, and the same rule can call a CloudScript handler. Don't build on it: Microsoft labels it "Legacy" in Game Manager and recommends Azure Functions (a title created on 2026-10-21 still had it). When a project has the old Edgegap bridge (`handlers.StartEdgegapDeployment` calling `/v1/deploy`), replace it with the functions here. That bridge had three problems: it referenced an undefined `TitleSecret`, sent the title secret to every game server as an env var, and made the game server write player data.
