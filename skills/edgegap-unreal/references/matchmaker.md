# Edgegap matchmaker for Unreal: config, latency, client settings

Contents
1. How it fits together
2. Designing the profile
3. Latency beacons
4. Timing: expiration and expansions
5. Creating the matchmaker in the dashboard
6. Client settings (DefaultGame.ini / UserGame.ini)
7. Ticket contract
8. What the server receives
9. Matchmaker troubleshooting

The profile, beacon and timing sections apply to both integrations. The client code differs: the Edgegap SDK (recommended on UE 5.0-5.8) is configured in `sdk.md` §3-4; the drop-in `EdgegapMatchmakerSubsystem` (fallback) in §6 here.

## 1. How it fits together

1. Client: `GET /locations/beacons` → ping each beacon → queue with `{"profile": "...", "attributes": {"beacons": {"Newark": 12.9, ...}}}`. The drop-in sends `POST /tickets`; the SDK creates a one-member Group Up group (same attributes, and the path parties use too).
2. Matchmaker groups compatible tickets, starts a deployment of the profile's `application.version` near the players, and sets each ticket to `HOST_ASSIGNED` with `assignment.public_ip` and `assignment.ports.<name>.external`.
3. Client polls every 2 s and `ClientTravel`s to `public_ip:external`. The SDK appends `?edgegap_mm_ticket_id=<ticket>`, which its server-side ticket check needs.
4. Server (started with `MM_*` variables): the drop-in stops its deployment once the match is empty; the SDK admits only players with a ticket for this server and stops the deployment when the process exits, so the game ends the match itself (`sdk.md` §5).

The matchmaker API lives at the URL the dashboard shows; its OpenAPI spec is at `<url>/swagger/v1/swagger.json` (Swagger UI at `<url>/swagger/index.html`) and reflects your profiles exactly, which is the fastest way to check a request body.

## 2. Designing the profile

- `team_count` 1 for free-for-all or co-op, 2+ for team games; `min_team_size`/`max_team_size` per team.
- First runs: let a lone player get a server after a short wait (an expansion to `min_team_size: 1`), so one person can test.
- Add a `latencies` rule from the start, named `beacons`: it costs nothing on the client (the SDK and the drop-in both measure beacons) and keeps players on nearby servers. The SDK's console command and `-EdgegapFindMatch=` launch option measure an attribute called `beacons`, so that name keeps them working.
- `edgegap_build_matchmaker_config` generates a valid config (team sizes, `max_latency_ms`, `latency_difference_ms`, `ticket_expiration`, expansions). It doesn't create the matchmaker: the developer uploads the JSON.
- The config must reference an **existing** app and version, or the dashboard rejects it with `.profiles: The application configuration is not valid for profile <name>`. Create the app and version first (Phase 5), even if the image comes later.

## 3. Latency beacons

`assets/matchmaker/latency.json` (verified):

```json
"beacons": { "type": "latencies", "attributes": { "difference": 100, "max_latency": 150 } }
```

- `max_latency`: drop beacons where a player's ping is above it. `difference`: players' pings to the same beacon must be within this.
- Beacons answer TCP, UDP and ICMP pings. The SDK sends a UDP echo to each beacon's `udp_port` and falls back to TCP connect time when UDP gets no answer, averaging 3 samples with a 1 s timeout (settings under **Matchmaker > Beacons**). The drop-in times a TCP handshake to each beacon's `tcp_port` (no special payload, no admin rights), best of three, in parallel, 1 s timeout, and leaves out beacons that don't answer.
- Ticket attribute keys are the beacon **city names** exactly as `GET /locations/beacons` returns them (`"Los Angeles"`, `"Sao Paulo"`), values in ms. Fetch the list for every search: beacons are rescaled in real time.
- The request body schema is strict (`additionalProperties: false`): sending `beacons` to a profile without a `latencies` rule is rejected, and so is leaving it out when the rule exists. Keep the client in sync with the profile: with the SDK, list `beacons` in `FindMatch`'s `MeasureLatencyInto` only when the rule exists (development builds log a mismatch against the live spec); with the drop-in, `bSendBeaconLatencies`.

## 4. Timing: expiration and expansions

- `ticket_expiration_period`: how long a ticket may search before it's `CANCELLED`. Short values (`20s`) keep the queue honest; the client shows "No match found in time, try again".
- Expansions are keyed by seconds since the ticket was created and overwrite the rule attributes they set, e.g. at `"10"`: `match_size.min_team_size: 1` and `beacons.max_latency: 250`.
- Keep expansion times below the expiration, or they never apply.
- Verified timing (UE 5.5, free tier, Toronto): tickets created → `HOST_ASSIGNED` in 6-8 s with two players, the server already running. A 20 s expiration with a 10 s solo expansion worked.

## 5. Creating the matchmaker in the dashboard

The developer, at https://app.edgegap.com → **Matchmaker** → **Create Matchmaker**: name it, paste the JSON, create and start, wait for "ready". Then copy the **API URL** and **Auth Token** from the matchmaker page. To change the config later: stop → edit → start (or create a new one). The free tier restarts every few hours, and a restarted or recreated matchmaker can have a new URL.

Check it before touching the client:
```bash
curl -s -H "Authorization: <auth token>" <api url>/locations/beacons
```
A JSON list of beacons means the URL and token work (DNS for a new matchmaker can take a few minutes).

## 6. Client settings (DefaultGame.ini / UserGame.ini)

**SDK:** **Project Settings > Plugins > Edgegap** writes `[/Script/EdgegapSDK.EdgegapSettings]` with `MatchmakerUrl` and `MatchmakerToken`; the profile is an argument of `FindMatch`, not a setting. Full list and the command-line and environment overrides: `sdk.md` §3-4. The quoting and public/private repo rules below apply to it too.

**Drop-in:**

```ini
[/Script/<Module>.EdgegapMatchmakerSubsystem]
bEnabled=True
MatchmakerUrl="<API URL from the dashboard>"
AuthToken="<auth token from the dashboard>"
Profile=casual
PortName=gameport
bSendBeaconLatencies=True
```

- **Quote the URL.** Unquoted, Unreal's ini parser cuts the value at `//`, so requests go to `https://tickets` and fail with `Couldn't resolve host name … tickets`.
- The auth token is safe to ship in game clients: it only creates and reads tickets. Where the real values live depends on the repo:
  - **Private game repo:** put them straight in `DefaultGame.ini`.
  - **Public repo or shared sample:** commit placeholders (`YOUR_MATCHMAKER_URL`, `YOUR_MATCHMAKER_AUTH_TOKEN`) in `DefaultGame.ini` and put real values in `Config/UserGame.ini`, which overrides `DefaultGame.ini` and is git-ignored (`Config/User*.ini`).
- `UserGame.ini` **is packaged** into builds made on that machine (verified in the UE 5.5 staging code and logs), so shipped clients get the real values. Packaging warns that it's "not explicitly allowed or denied"; silence it with `+AllowedConfigFiles=<Project>/Config/UserGame.ini` under `[Staging]` in `DefaultGame.ini`.
- The drop-in refuses empty, placeholder (`YOUR_…`, `REPLACE…`, `<…>`) or non-`https://` values with a clear message instead of an HTTP error.
- The section name uses the C++ module name from `Build.cs`.
- `bEnabled`: the template ships `False` so adding the files changes nothing until the matchmaker exists. Turn it on as soon as the URL and token are in; a game that always matchmakes just keeps it `True`. Keep it off by default only in shared samples where matchmaking is an optional extra.
- Command-line override for quick tests: `-ini:Game:[/Script/<Module>.EdgegapMatchmakerSubsystem]:bEnabled=True`.

## 7. Ticket contract

| Call | Notes |
|---|---|
| `POST /tickets` | `{"profile", "attributes"}`; `player_ip` omitted so the matchmaker uses the caller's address. `201` with `id`, `status: SEARCHING`. |
| `GET /tickets/{id}` | `SEARCHING` → `MATCH_FOUND` → `HOST_ASSIGNED` (with `assignment`) or `CANCELLED`. `404` once removed. `429`: slow down, retry. |
| `DELETE /tickets/{id}` | `204`. The drop-in deletes on Cancel and on game exit mid-search. |

The table is the drop-in's contract. The SDK uses the Group Up endpoints (create group, poll the member, delete the group on cancel), generated from the matchmaker's own spec, so it follows the matchmaker version you run.
| `GET /locations/beacons` | `{count, beacons: [{fqdn, public_ip, tcp_port, udp_port, location: {city, ...}}]}` |

Authentication: header `Authorization: <auth token>` (no `token`/`Bearer` prefix).

## 8. What the server receives

Matchmaker deployments get `MM_MATCH_ID`, `MM_MATCH_PROFILE`, `MM_EXPANSION`, `MM_TICKET_IDS`, `MM_TICKET_<id>` (JSON with attributes, including each player's beacons), `MM_TEAMS`, `MM_GROUPS`, plus the usual `ARBITRIUM_*` variables (`ARBITRIUM_DELETE_URL`/`TOKEN` for self-stop). Values are JSON strings. With the SDK, read them through `UEdgegapServerLibrary` (`Get Ticket Ids`, `Get Ticket Json`, `Get Match Profile`, ...; `sdk.md` §5) instead of parsing them. The deployment is also tagged with the profile, the expansion and each ticket ID, which `edgegap_list_deployments` shows.

## 9. Matchmaker troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard: `application configuration is not valid for profile` | Create the app and version named in the config first. |
| Client: `Couldn't resolve host name` with host `tickets` | Quote `MatchmakerUrl`. |
| Client: `Could not reach the matchmaker`, `curl` gets no answer and the host doesn't resolve | Matchmaker stopped (free tier restart) or recreated with a new URL. Restart it and update the URL. |
| `Ticket refused (400)` | Body doesn't match the profile: check the beacons setting (SDK `MeasureLatencyInto`, drop-in `bSendBeaconLatencies`) against the `latencies` rule and the profile name, against `<url>/swagger/v1/swagger.json`. The SDK's development builds log the mismatch. |
| SDK: player connects then is refused with `no matchmaking ticket` / `ticket not assigned to this server` | The client travelled without its own ticket (manual `open`, party leader travel) or a backfilled ticket wasn't allowed on the gate. See `sdk.md` §9. |
| Two clients get two different servers | They queued further apart than the solo expansion. Click both within that window, or launch both with `-EdgegapFindMatch=<profile>` (SDK) or `-FindMatch` (drop-in). |
| `HOST_ASSIGNED` but the client can't connect | Server problem, not matchmaker: direct-deploy test (deploy.md §6), check the version's port name/protocol against the client's port name (SDK **Game Port Name**, drop-in `PortName`; both default to `gameport`). |
| Ticket `CANCELLED` before a match | Expiration shorter than the wait; raise it or add an earlier expansion. |
