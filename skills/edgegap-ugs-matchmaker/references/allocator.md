# The EdgegapAllocator Cloud Code module

Contents
1. What it is and where it lives
2. What it sends to Edgegap and returns to Matchmaker
3. Configuration: constants and the secret
4. Deploying the module and the queue
5. Changes worth making
6. Limits

Everything in §2 and §3 comes from reading `modules/EdgegapAllocator/` (`Project/EdgegapAllocator.cs`, `Project/Client/EdgegapClient.cs`, `Project/Client/Models/*.cs`, `CONFIGURATION.md`) and `tests/AllocatorTests/EdgegapAllocatorTests.cs` in Unity's repo. The repo is under the Unity Companion License: link to it, don't copy its code here.

## 1. What it is and where it lives

A Cloud Code C# module (.NET 9, `Com.Unity.Services.CloudCode.Apis`) implementing Unity's `IMatchmakerAllocator` with two functions that Matchmaker calls when a pool's Match Hosting is **Cloud Code**:

| Function | Called | Does |
|---|---|---|
| `Matchmaker_AllocateServer` | once per match | starts one Edgegap deployment, returns its `request_id` |
| `Matchmaker_PollAllocation` | repeatedly until it returns Allocated or Error | reads the deployment's status, returns IP and port when ready |

Copies:
- Unity's repo, `main`: https://github.com/Unity-Technologies/matchmaker-hosting-providers/tree/main/modules/EdgegapAllocator. Merged from Edgegap's PR #11 (January 2026). Since then, PR #25 (October 2026) made the HTTP handler shared and pooled with a 10 s timeout, because Cloud Code cancels invocations at 15 s and per-call handshakes failed at high throughput. Unity's CI builds and tests it. **Use this one.**
- Edgegap's fork, branch `edgagap-allocator-integration` (one commit, 2026-01-27): https://github.com/edgegap/backend-unity-ugs-matchmaker-template-model/tree/edgagap-allocator-integration/modules/EdgegapAllocator. Same logic without the PR #25 fix; not merged into the fork's `main`, whose CI matrix also leaves the module out. Useful only to see the original contribution.

Unity's README asks for the repo to be cloned separately from the Unity project: it is not a package.

## 2. What it sends to Edgegap and returns to Matchmaker

**Allocate** (`Matchmaker_AllocateServer(context, AllocateRequest request)`):
1. Reads the secret `EDGEGAP_API_TOKEN` from UGS Secret Manager.
2. Collects player IPs: `request.MatchmakingResults.MatchProperties["Players"]`, each player's `CustomData.player_ip` (a string that parses as an IP; anything else is skipped and logged at debug level).
3. Builds `users`: one `{"user_type": "ip_address", "user_data": {"ip_address": "<ip>"}}` per IP. With **no** valid IP it logs a warning ("please add player_ip to player custom data") and sends one `{"user_type": "geo_coordinates", "user_data": {"latitude": 35.891111, "longitude": -106.263889}}`: Los Alamos, New Mexico. Every match without IPs lands near there.
4. `POST https://api.edgegap.com/v2/deployments` with:
   ```json
   {
     "application": "<ApplicationName>",
     "version": "<VersionName>",
     "require_cached_locations": false,
     "users": [ ... ],
     "environment_variables": [ { "key": "MATCH_ID", "value": "<request.MatchId>", "is_hidden": false } ],
     "tags": [ "ugs-matchmaker" ]
   }
   ```
   No webhooks, no other env vars, no per-match tag.
5. Non-2xx: returns `AllocateStatus.Error` with Edgegap's response body as `Message`. 2xx: returns `AllocateStatus.Created` with `AllocationData = { "requestId": <request_id> }`. Exceptions also become `Error`.

**Poll** (`Matchmaker_PollAllocation(context, PollRequest request)`):
1. `GET https://api.edgegap.com/v1/status/{requestId}` (the `requestId` from AllocationData).
2. Maps `current_status` (`Status.READY` etc., prefix stripped):
   - `READY` → needs `ports[PortName]` and `public_ip`. Returns `PollStatus.Allocated` with `AssignmentData.IpPort(public_ip, ports[PortName].external)`. A missing port name, no ports or no `public_ip` → `Error` with a message saying which.
   - `ERROR` → `Error` with `error_detail`.
   - `TERMINATING` / `TERMINATED` → `Error` ("can't receive connection anymore").
   - `DEPLOYING`, `SEEKING`, anything else → `PollStatus.Pending`; Matchmaker calls again.
   - An unknown status string throws in the JSON converter and comes back as `Error`.
3. Non-2xx from Edgegap → `Error` with the body.

Matchmaker turns `Allocated` into each ticket's assignment (`MultiplayAssignment` with `Ip`, `Port`, `MatchId` on the client). An `Error` fails every ticket of the match.

What the module does **not** do: stop deployments (an Error after Edgegap created one leaves it running until it errors out, self-stops or hits `max_duration`), retry, deduplicate (Allocate called twice for one match would deploy twice), send the FQDN, or read `MatchProperties["Region"]` / QoS.

The HTTP header is `Authorization: <secret value>` exactly: the factory adds no `token ` prefix.

## 3. Configuration: constants and the secret

From `CONFIGURATION.md`, plus what the code shows:

| Where | Name | Value |
|---|---|---|
| Unity Dashboard, **Administration > Secrets** | `EDGEGAP_API_TOKEN` | The Edgegap API token (dashboard: user settings → tokens). Because the module sends the value verbatim as the `Authorization` header and Edgegap expects `token <uuid>`, store `token <uuid>`. If Allocate errors with 401, this is the first thing to check. |
| `EdgegapAllocator.cs` | `ApplicationName` (default `"MyApp"`) | The Edgegap application name |
| `EdgegapAllocator.cs` | `VersionName` (default `"MyVersion"`) | The app version to deploy. Change it (and redeploy the module) for every new server build |
| `EdgegapAllocator.cs` | `PortName` (default `"gameport"`) | The app version port players connect to |
| `EdgegapAllocator.cs` | `ForceCachedLocation` (default `false`) | Sent as `require_cached_locations`. `true` only if the version has caching enabled in Edgegap: faster starts, fewer locations |

The secret is read per call through `IGameApiClient.SecretManager`, so rotating it in the Dashboard takes effect without redeploying. The token is organization-wide: keep it only in UGS Secrets, never in the module source, a `.mmq`, the client or the server image. The developer types it into the Dashboard themselves.

## 4. Deploying the module and the queue

Requirements from Unity's README: the .NET SDK, the UGS CLI, a service account with **Unity Environments Viewer** and **Cloud Code Editor** on the project (deploying the queue's `.mmq` with the same account likely needs a Matchmaker role too; not checked here).

```bash
git clone https://github.com/Unity-Technologies/matchmaker-hosting-providers.git
cd matchmaker-hosting-providers
# edit modules/EdgegapAllocator/Project/EdgegapAllocator.cs (ApplicationName, VersionName, PortName)
dotnet test tests/AllocatorTests          # optional: the module's unit tests, offline
ugs login                                 # developer enters the service account key id and secret
ugs config set project-id <project id>
ugs config set environment-name <environment>
ugs deploy modules/EdgegapAllocator       # compiles the .sln with its publish profile and uploads the module
```

The UGS CLI deploys a C# module from its `.sln` (it compiles and zips it) or from a prebuilt `.ccm` ([Unity: develop modules with the UGS CLI](https://docs.unity.com/en-us/cloud-code/modules/how-to-guides/write-modules/cli)). Unity's README also gives an Editor route: install `com.unity.services.cloudcode` and `com.unity.services.deployment`, create a **Cloud Code C# Module Reference** pointing at `EdgegapAllocator.sln`, and **Deploy Selected** in **Services > Deployment**.

The queue: in the Dashboard (**Matchmaker > Queues**, edit the pool, Match Hosting **Cloud Code**) or in the `.mmq` file, the pool's hosting block becomes:

```json
"matchHosting": {
  "type": "CloudCode",
  "moduleName": "EdgegapAllocator",
  "allocateFunctionName": "Matchmaker_AllocateServer",
  "pollFunctionName": "Matchmaker_PollAllocation"
}
```

([Unity: Matchmaker hosting providers](https://docs.unity.com/en-us/matchmaker/hosting-providers) names the three fields; the block's shape is from the repo's `LocalServerQueue.mmq`.) Deploy the `.mmq` with `ugs deploy <file>.mmq`, or edit it in the Dashboard. Each pool (default and filtered) has its own hosting block: switch only the ones that should use Edgegap.

## 5. Changes worth making

Edit the cloned module; these are not in it today and none was tested here.
- **WebGL or `wss://`**: Poll returns `public_ip`. TLS needs the deployment's `fqdn` (in the same status response, already deserialized as `Fqdn`). Matchmaker's IpPort assignment carries an IP field; check Unity's `AssignmentData` for an alternative before relying on putting the FQDN there, or deliver the FQDN another way.
- **Match data on the server**: add env vars in Allocate, e.g. the pool name, queue name, team layout serialized from `MatchProperties`, or a per-match join secret (`is_hidden: true`). Keep each env value small.
- **Per-match tag** for tracing: add `MatchId` (or a prefix of it) to `tags`; Edgegap tags are short strings.
- **Region pools**: Unity's other allocators read `MatchProperties["Region"]`. Edgegap places by player IP, which is better, but a region-only pool could map a region to `geo_coordinates` when IPs are missing instead of the Los Alamos fallback.
- **Large launches**: the module polls the Status API, which allows 20 requests per second for the whole organization (shared with the Context API). Edgegap's UGS guide calls polling fine for most games and suggests the webhook variant above about 50,000 CCU: deploy with `webhook_on_ready` to a backend that stores the FQDN and external port in UGS game data, and clients poll that instead. That variant is not in Unity's repo.

After any change, run `dotnet test tests/AllocatorTests`, then redeploy with `ugs deploy`.

## 6. Limits

- Cloud Code cancels an invocation after 15 s (noted in Unity's code); the module's HTTP timeout is 10 s on `main`.
- Status API: 20 requests/s per Edgegap organization, shared. Every pending match polls it.
- Free tier: one Edgegap deployment at a time. Expect a second concurrent match's deploy request to be refused, which Allocate returns as an Error (not observed here).
- `max_duration` on the app version is the safety net for servers that never stop: keep it close to the longest real match.
