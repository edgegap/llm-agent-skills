# Troubleshooting

Work along the chain and stop at the first broken link: login → ticket → match → rule → StartEdgegapDeployment → Edgegap deployment → webhook → player data → client connect → server players → self-stop.

| Symptom | Cause → fix |
| --- | --- |
| Login fails with `PlayerCreationDisabled` | New titles block player creation for client logins. Game Manager > Title settings > API Features: untick *Disable player creation using Client/LoginWithCustomId* (or the device login the game uses). |
| Two clients on one PC are the same player / `CreateMatchmakingTicket` fails because the player already has a ticket | They share PlayerPrefs, so they share the custom ID. Run them with different `-playfabCustomId`. |
| Tickets stay `WaitingForMatch` | Fewer players than `MinMatchSize`, different queue names, or queue rules that keep them apart. Check with `Match/GetMatchmakingQueue`. Two test players from `references/playfab.md` §4 should match in about 10 s on a rules-free queue. |
| Ticket calls get throttled (`TooManyRequests`) | Polling faster than 10 per minute per ticket. Poll every 6 s. |
| Matched, but `StartEdgegapDeployment` never runs (no invocations in Monitor) | The rule is missing, on another event (it must be exactly `playfab.matchmaking.match_found`), or points at an unregistered or wrong URL. Check `CloudScript/ListFunctions`. The queue must have server allocation **off**. |
| Function log: `App setting X is not set` | Run `deploy-functions.sh` again or set it by hand. |
| Server log `Client N rejected: not a player of this match` | The client sent no `joinToken`, or one from another match. Check that the client reads `joinToken` from `EdgegapServer` and sends it on connect, and that both functions run the same code with the same `PLAYFAB_SECRET_KEY`. |
| Deployment logs list the environment, including `EDGEGAP_JOIN_TOKENS` and `ARBITRIUM_DELETE_TOKEN` | The Edgegap Unity plugin's Dockerfile (3.2.1 and older) runs `env` before the server. Remove `env;` from its `CMD`, or use a plugin release with edgegap/buildtool-unity-plugin#62. |
| `PlayFab /Authentication/GetEntityToken failed` or `/Server/… failed` | `PLAYFAB_SECRET_KEY` or `PLAYFAB_TITLE_ID` is wrong. The webhook function always uses them, and the start function uses them for locations. |
| `Edgegap POST /v2/deployments failed (401)` | Wrong `EDGEGAP_API_TOKEN`. Check it once with `GET https://api.edgegap.com/v1/apps`. |
| `… failed (400/422)` | Wrong app or version name, the version is inactive, or no location (players without a location and no fallback). The message says which. |
| Deployment created, but no address ever reaches the players | `EDGEGAP_READY_WEBHOOK_URL` is missing its `?code=` key or points at the wrong app (Edgegap doesn't retry webhooks), or `EdgegapDeploymentReady` failed: read its Monitor log. A `403 Deployment does not belong to this match` means the tag check failed: someone called it by hand with mismatched values. |
| Players receive `status:"error"` | The deployment failed: image pull (no registry credentials on the version), the container crashed, or the port check failed. Read `edgegap_get_deployment_logs`. |
| Clients get the address but can't connect | The protocol doesn't match the netcode (UDP vs TCP vs WS), the server listens on another internal port, or the client used the internal port instead of `port` (the external one). |
| Two deployments for one match | The function was called twice: by hand while the rule existed, or two rules on `match_found`. The extra one stops itself after the first-player timeout. Keep exactly one rule. |
| Deployment stays up after everyone left | The self-stop isn't in the server, `ARBITRIUM_DELETE_*` were not read, or something keeps a connection open (a health probe counts as a player). Server logs show `Stopping deployment:` when it works. |
| `az login`: *No subscriptions found* | Another account with the same email was picked. `az config set core.enable_broker_on_windows=false` and `az login --tenant <directory id>`. |
| Unity client build: *IL2CPP is not installed* | Install the platform's IL2CPP module, or build test clients with `-edgegapMono` (it restores the project setting afterwards). |
