# Keeping a third-party matchmaker

Contents
1. The shape every integration shares
2. Per matchmaker
3. Backfill with a third-party matchmaker
4. Moving off a hosting provider

## 1. The shape every integration shares

```
players queue in the third-party matchmaker
  → it forms a match and calls its extension point (rule, Cloud Code, plugin, webhook, director)
  → that backend code: POST /v2/deployments {application, version, users[player IPs], env, tags, webhook_on_ready}
  → Edgegap webhook_on_ready → backend hands the address to players through the matchmaker's own channel
  → players connect; the server checks a per-match join secret; the server stops itself at match end
```

What makes it hold up (code and details: `edgegap-deployments-api`):
- **The Edgegap API token stays in the backend that runs the extension code** (its secret store), never in the client and never in the game server.
- **Don't wait for the server inside the hook.** Matchmaker hooks time out (PlayFab rules after 10 s, for example), while a server takes 5 to 30 s to be ready. Deploy with a ready webhook, return, and deliver the address when the webhook arrives.
- **Send every matched player's IP** in `users`. Third-party matchmakers often don't expose player IPs: have clients put their public IP in their ticket or profile data, or take it from the backend request that created the ticket.
- **Make the hook retry-safe.** Tag the deployment `match-<id>` and check for it before deploying again; the Deploy API has no idempotency key.
- **Deliver the address over something clients can't forge**: the matchmaker's server-written match data, read-only player data, a backend notification.

## 2. Per matchmaker

| Matchmaker | Extension point | Edgegap guide | Status |
|---|---|---|---|
| Nakama | Fleet Manager interface, called from `MatchmakerMatched` | `edgegap-nakama` (the Edgegap Fleet Manager for Nakama) | verified end to end |
| PlayFab Matchmaking | a rule on `playfab.matchmaking.match_found` running an Azure Function | `edgegap-playfab` | verified end to end |
| Unity Matchmaker (UGS) | Unity's official `EdgegapAllocator` Cloud Code module from https://github.com/Unity-Technologies/matchmaker-hosting-providers: store `EDGEGAP_API_TOKEN` in the Unity Dashboard secrets, set `ApplicationName`, `VersionName` and `PortName` in `EdgegapAllocator.cs`, deploy the module | https://docs.edgegap.com/docs/tools-and-integrations/deploy-from-ugs | official, not run in this pack. Unity doesn't pass player IPs: clients add their public IP to the ticket, or servers land in the fallback location |
| EOS lobbies (Unreal) | lobby members store their IP in lobby attributes; a backend service deploys for the lobby and writes the address back | https://docs.edgegap.com/docs/tools-and-integrations/unreal-eos-lobby-integration | documented by Edgegap; guides that call the API from the lobby owner's client are for prototypes only |
| Steam lobbies, or a game backend with Steam sign-in | the backend owns matchmaking: it verifies the Steam ticket, queues players (Edgegap's matchmaker from the backend, or its own queue) and returns the address | `edgegap-manus` `references/backend.md` (the design works outside Manus) | verified with the Manus sample |
| Photon Fusion / Photon Realtime | Photon's cloud matches players into a session; the Edgegap server starts a Photon session as a dedicated server and clients join it by name | `edgegap-fusion` | verified with BR200 and Simple FPS |
| Pragma, AccelByte, other game backends | their match-found or allocation extension (a plugin, a custom session/DS provider, a webhook) | none specific: the shape in section 1 | not built; check the vendor's docs for a "custom dedicated server provider" hook before writing glue |
| Open Match | the director allocates matches from the backend | no public sample | not run in this pack |
| GameLift FlexMatch (standalone mode) | match events (`MatchmakingSucceeded`) delivered to the studio's backend | https://docs.edgegap.com/docs/tools-and-integrations/gamelift-to-arbitrium for the hosting side | not built |
| A custom queue in the studio's backend | the backend itself | `edgegap-deployments-api` | the allocator sketch there |

When the matchmaker has no extension point at all, the game backend that already knows a match formed (it created the tickets, or it receives the matchmaker's events) is the allocator.

## 3. Backfill with a third-party matchmaker

Edgegap's backfill API belongs to Edgegap's matchmaker. With a third-party matchmaker, use its own backfill feature if it has one (Unity Matchmaker and PlayFab both have server backfill tickets), and have the game server report free seats to the backend through it. Without one, the backend keeps a list of running servers with free seats (servers report joins and leaves) and sends new players there before deploying a new server. Keep that list's entries short-lived: a server that stops reporting is gone.

## 4. Moving off a hosting provider

Edgegap has migration guides that map concepts (fleets, builds, allocations, server SDK calls) from:
- Unity Multiplay: https://docs.edgegap.com/docs/tools-and-integrations/switch-from-multiplay
- AWS GameLift: https://docs.edgegap.com/docs/tools-and-integrations/gamelift-to-arbitrium
- Hathora: https://docs.edgegap.com/docs/tools-and-integrations/switch-from-hathora

The matchmaker usually stays where it is (section 2); only the allocation call and the server's SDK calls change. Remove the old provider's server SDK (Multiplay's server query and allocation callbacks, GameLift's `ProcessReady`, PlayFab's GSDK): an Edgegap server reads its match from env vars and stops itself.
