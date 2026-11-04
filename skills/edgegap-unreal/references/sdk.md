# Edgegap SDK for Unreal Engine (recommended on UE 5.0-5.8)

Edgegap's own Unreal plugin: https://github.com/edgegap/sdk-unreal-engine (MIT). It is in **beta** (`0.1.1` on `main`, no tagged release yet), and its API can still change between versions, so tell the developer that and note the commit you installed. Everything below comes from the SDK's README, `docs/` and source on `main` (checked 2026-11-04). Its docs are the source of truth if this page disagrees.

Contents
1. When to use it, when to use the drop-ins
2. What it contains
3. Install
4. Client: Find Match
5. Server: ticket check, match details, self-stop
6. Generator: typed nodes for your profiles
7. Editor panel (optional build path)
8. What was verified, what wasn't
9. Pitfalls

## 1. When to use it, when to use the drop-ins

| Situation | Use |
|---|---|
| UE 5.0 to 5.8, C++ project or a Blueprint project that can take one C++ class | **The SDK.** It replaces both drop-ins, adds a server-side ticket check the drop-ins don't have, and is maintained by Edgegap. |
| UE 5.9+ or any version outside 5.0-5.8 | The drop-ins in `assets/unreal/Source/` (`server-ready.md` §4). The SDK's floor is 5.0 (it needs Blueprint `double` and `FTSTicker`); newer engines are untested. |
| The team won't add a third-party plugin, or wants a few hundred lines of code it fully owns | The drop-ins. |
| A Lyra project | The Lyra sample (`lyra.md`), which has its own plugin. |

Never install the SDK and the drop-ins (or the Lyra sample plugin) together: both define `UEdgegapMatchmakerSubsystem` and/or `UEdgegapServerSubsystem`, and Unreal refuses two classes with the same name. Moving a project from the drop-ins to the SDK means deleting the four drop-in files and their ini sections first.

## 2. What it contains

`Plugin/EdgegapSDK`, four modules:

| Module | Built into | Does |
|---|---|---|
| `EdgegapSDK` | everything | HTTP, JSON, settings, and the generated matchmaker (`EdgegapMM*`, `FEdgegapMMApi`) and Edgegap API (`EdgegapAPI*`, `FEdgegapAPIApi`) layers |
| `EdgegapClient` | clients and editor, never dedicated servers | `UEdgegapMatchmakerSubsystem` (game instance subsystem): beacons, queue, wait, travel; `UEdgegapMatchmakingLibrary` travel helpers |
| `EdgegapServer` | dedicated servers and editor, never clients | `UEdgegapTicketGate`, `AEdgegapGameModeBase`/`AEdgegapGameMode`, `UEdgegapServerLibrary` (env readers, `Self Stop`), `UEdgegapServerSubsystem` (self-stop on exit) |
| `EdgegapSDKEditor` | editor | **Tools > Edgegap** panel and `Edgegap.*` console commands (§7), automation tests |

Requirements from its README: UE 5.0-5.8, a C++ project (or a Blueprint project with one C++ class added), an Edgegap app and a matchmaker. The server still needs a `<Project>Server.Target.cs` (`server-ready.md` §2).

## 3. Install

The SDK's own steps (`docs/getting-started.md`):
1. Get the repo (clone `https://github.com/edgegap/sdk-unreal-engine` or download it) and copy `Plugin/EdgegapSDK` into `<Project>/Plugins/`.
2. Regenerate project files (right-click the `.uproject` → **Generate Visual Studio project files**) and build the `<Project>Editor` target. Blueprint-only project: add one C++ class first (**Tools > New C++ Class**), `server-ready.md` §1.
3. Make sure a `Source/<Project>Server.Target.cs` exists (`server-ready.md` §2).
4. **Edit > Project Settings > Plugins > Edgegap**: **Matchmaker Url** and **Matchmaker Token** from the dashboard's matchmaker page (Phase 6). They are saved in `Config/DefaultGame.ini`:

```ini
[/Script/EdgegapSDK.EdgegapSettings]
MatchmakerUrl="<matchmaker API URL>"
MatchmakerToken="<matchmaker auth token>"
```

- The matchmaker token is the client-safe one; it only queues players. Same public/private repo rule as the drop-ins (`matchmaker.md` §6): placeholders in `DefaultGame.ini` and real values in git-ignored `Config/UserGame.ini` for public repos. The SDK also reads `-EdgegapMMUrl=`/`-EdgegapMMToken=` and `EDGEGAP_MM_URL`/`EDGEGAP_MM_TOKEN` (command line wins over environment, environment over Project Settings), and `Set Connection` switches them at runtime. The `UserGame.ini` route follows Unreal's normal config layering; it was verified with the drop-ins, not with the SDK.
- Quote the URL if you edit the ini by hand: unquoted, Unreal's parser cuts it at `//`.
- Blueprints reach the SDK without `Build.cs` changes. When game C++ includes SDK headers, add the module it uses (`EdgegapClient`, `EdgegapServer`) to the game's `Build.cs`. `EdgegapClient` is `ClientOnly` (left out of Server targets) and `EdgegapServer` is `ServerOnly` (left out of Client targets), so a game module built into both should add each one only for the targets that have it (`Target.Type != TargetType.Server` / `!= TargetType.Client`) and guard the calls (`#if !UE_SERVER` / `#if WITH_SERVER_CODE`). The SDK docs don't cover this and this skill hasn't compiled it: compile the editor and Server targets once after adding it.

## 4. Client: Find Match

`UEdgegapMatchmakerSubsystem` (`docs/client.md`) runs one search at a time:
1. Pings every beacon the matchmaker lists, in parallel (UDP echo, TCP connect time when UDP gets no answer; 3 samples averaged, 1 s timeout; **Matchmaker > Beacons** settings), and fills the latency attributes you name with `{ city: ms }`.
2. Development builds only: checks the attributes against the matchmaker's live OpenAPI description and logs unknown profiles, missing or extra fields, wrong types.
3. Queues the player as a one-member, ready Group Up group (solo players and parties go through the same path).
4. Polls every **Poll Interval Seconds** (default 2, minimum 1) until a server is assigned.
5. With **Travel On Match** on (default), `ClientTravel`s to `ip:port?edgegap_mm_ticket_id=<ticket>`, using the app version port named **Game Port Name** (default `gameport`), or the only port if there is one.

Starting a search:

| Way | Notes |
|---|---|
| `Find Match (<profile>)` Blueprint node | Generated per profile (§6), typed attributes struct, latency attributes measured for you. The checked-in code has `Find Match (casual)` only. |
| `FindMatch(Profile, AttributesJson, MeasureLatencyInto)` | Any profile. Pass `{ "beacons" }` in `MeasureLatencyInto` only when the profile has a `latencies` rule named `beacons`; the matchmaker rejects attributes the profile doesn't have, and requires the ones it does. |
| `EdgegapMM.FindMatch <profile> [attributes JSON]` console command | Always measures an attribute named `beacons`. |
| `-EdgegapFindMatch=<profile>` launch option | Search at startup, measures `beacons`, sends no other attribute: fine for test profiles whose only rule besides `match_size` is `beacons`. |

```cpp
#include "EdgegapMatchmakerSubsystem.h"

UEdgegapMatchmakerSubsystem* Matchmaker = GetGameInstance()->GetSubsystem<UEdgegapMatchmakerSubsystem>();
Matchmaker->OnFailed.AddDynamic(this, &UMyMenu::HandleMatchmakingFailed);
Matchmaker->FindMatch(TEXT("casual"), TEXT("{}"), { TEXT("beacons") });
```

Events: `OnStatus` (progress text for the UI), `OnMatchFound` (`Assignment`, `JoinUrl`, `TicketId`), `OnFailed` (`FEdgegapError`: `HttpStatus`, `Message`, `bRateLimited`). `CancelMatch` / `EdgegapMM.Cancel` leaves the queue and deletes the group. There is **no built-in Find Match UI** (the drop-in had an overlay): bind a button in the game's menu, or use the console command / launch option for tests.

Other settings in **Project Settings > Plugins > Edgegap**: **Search Timeout Seconds** (0 = rely on the matchmaker's ticket expiration), **Request Timeout Seconds**, **Max Retries**. Test launch options: `-EdgegapNoTravel`, `-EdgegapQuitOnMatch`.

Parties: every matchmaker call (groups, members, tickets, backfills) is a generated async node and an `FEdgegapMMApi` function. With the server's ticket check on, every member needs their own ticket in their join URL, so each member follows its own group membership and travels with `Make Join Url`; a party leader can't travel others in. The SDK has no lobby calls.

## 5. Server: ticket check, match details, self-stop

From `docs/server.md`:

**Ticket check.** `UEdgegapTicketGate` admits a joining player only when the URL carries `?edgegap_mm_ticket_id=<ticket>`, the ticket is one of this server's `MM_TICKET_IDS` (exact match), and no other connected player holds it. A ticket is held by the connection (so a game that swaps controllers, like Lyra, keeps it) and freed when that connection closes, so a dropped player can rejoin. Refusal reasons: `no matchmaking ticket`, `ticket not assigned to this server`, `ticket already in use`.

The check is **off** when `MM_TICKET_IDS` is missing (local runs, direct deploys from Phase 5, where `open <ip>:<port>` keeps working) or when **Require Matchmaker Ticket** is off under **Dedicated Server**. Choose how refused players leave:

| Setup | Result |
|---|---|
| `AEdgegapGameModeBase` / `AEdgegapGameMode` or a subclass | Refused in `PreLogin` with `403: Unauthorized (<reason>)`; never spawns. `Validate Join` Blueprint event runs after the check for your own rules (bans, client version). |
| The game's own game mode calling `EdgegapGameMode::CheckPreLogin` after `Super::PreLogin` | Same as above. **Use this for an existing game**: it keeps the game's own game mode. |
| Any other game mode | The player is kicked right after login. |

```cpp
#include "EdgegapGameMode.h"

void AMyGameMode::PreLogin(const FString& Options, const FString& Address, const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage)
{
    Super::PreLogin(Options, Address, UniqueId, ErrorMessage);
    EdgegapGameMode::CheckPreLogin(this, Options, Address, ErrorMessage);
}
```

The game module then needs `EdgegapServer` in its `Build.cs` (see §3 on `ServerOnly` modules and Client targets). The SDK docs also show `GlobalDefaultServerGameMode=/Script/EdgegapServer.EdgegapGameModeBase` in `DefaultEngine.ini`: that makes the Edgegap game mode the server's default, so only use it for a game with no game mode of its own (a per-map GameMode override still wins).

Backfill: call `Allow Ticket` or `Allow Backfill Tickets` on the gate when a backfill seats a new player, or the gate refuses them. `Revoke Ticket`, `Get Player Ticket`, `Get Allowed Tickets`, `On Join Rejected` are there too.

**Match details.** `UEdgegapServerLibrary`: `Is Running On Edgegap`, `Is Matchmaker Deployment`, `Get Deployment Id`, `Get External Port` / `Get Internal Port` (by port name), `Get Match Id`, `Get Match Profile`, `Get Expansion Stage`, `Get Ticket Ids`, `Get Ticket Json` (one ticket's attributes), `Get Group Ticket Mapping`, `Get Team Group Mapping`, `Get Equality Json`, `Get Intersection Json`. These read the `MM_*` and `ARBITRIUM_*` variables (`matchmaker.md` §8), so no hand parsing.

**Self-stop.** `Self Stop` deletes this deployment with the injected `ARBITRIUM_DELETE_URL`/`ARBITRIUM_DELETE_TOKEN` (no API token on the server). `UEdgegapServerSubsystem` calls it on its own when the server process exits or crashes (**Self Stop On Exit**, on by default, Edgegap deployments only).

This differs from the drop-in: **the SDK does not stop a server that is merely empty.** A deployment whose last player left keeps running (and billing) until the game exits or calls `Self Stop`, or until the app version's max duration. So the game has to end the match: when the match is over, or a short grace period after the last player leaves on a matchmaker deployment, call `UEdgegapServerLibrary::SelfStop()` or request engine exit. Write that in the game mode (for example in `Logout` when `GetNumPlayers()` reaches 0, with a timer), and test it in Phase 7.

## 6. Generator: typed nodes for your profiles

`generator/generate.py` (Python 3, no dependencies) reads the matchmaker's OpenAPI description and writes one attributes struct and one `Find Match (<profile>)` node per profile:

```bash
python generator/generate.py --service matchmaker --spec <matchmaker API URL> --out <Project>/Plugins/EdgegapSDK/Source
```

- A URL that doesn't end in `.json` gets `/swagger/v1/swagger.json` appended. Only `EdgegapMM*` files under `Public/Generated` and `Private/Generated` are written. Rebuild the editor afterwards.
- Run it again whenever profiles or rules change; the compiler then flags attributes the game no longer sends.
- Optional: `FindMatch(Profile, AttributesJson, ...)` works for any profile without regenerating.
- Each generated file records the spec it came from, so generating from a URL writes the matchmaker hostname into the source. In a public repo, save the spec to a file (`curl -s <url>/swagger/v1/swagger.json -o matchmaker-spec.json`, keep it out of git) and generate from that.

## 7. Editor panel (optional build path)

**Tools > Edgegap** (`docs/editor.md`) can do Phases 4-5 for the developer: **Build and Push** packages the Linux server inside Epic's image (`ghcr.io/epicgames/unreal-engine:dev-slim-<engine version>`, so no source engine), writes an Ubuntu 22.04 image with a non-root user and an `exec` start (`-log -port=<port> -stdout -FullStdOutLogOutput -unattended`), pushes it, creates the app if needed and registers a version named with the UTC time (`YYYYMMDD-HHMM`), port `gameport` 7777 UDP by default. **Deploy Test Server** and **Running deployments** (with **Stop**) cover the direct-deploy check. Headless: `UnrealEditor-Cmd <Project>.uproject -ExecCmds="Edgegap.BuildAndPush" -EdgegapQuitWhenDone -unattended -nullrhi`.

It needs Docker Desktop, `docker login ghcr.io` with an Epic-linked GitHub account (images are 15-25 GB compressed), and the API token plus registry credentials in **Project Settings > Plugins > Edgegap (my secrets)** (saved under `Saved/`, never committed) or `EDGEGAP_API_TOKEN` / `EDGEGAP_REGISTRY_USERNAME` / `EDGEGAP_REGISTRY_TOKEN`. Those are the developer's secrets: they type them in the editor themselves, never you. The skill's own path (`deploy.md`, the Edgegap MCP) stays the default when you're driving the work; offer the panel to developers who want a one-click rebuild later. Never turn on **Include API Token In Packaged Builds (unsafe)** for a game build: the API token controls the whole organization.

## 8. What was verified, what wasn't

From the SDK's `docs/compatibility.md`:
- **UE 5.8:** compiled (Win64 and Linux, editor and server targets), automation tests pass, and live on Edgegap (2026-11-02): two clients matched on a real matchmaker and both joined the server it started; the server refused a missing ticket, a made-up ticket, a prefix of a real ticket and a ticket in use; a ticket rejoined after its connection closed; the editor built, pushed, registered, deployed, listed and stopped a deployment.
- **UE 5.5.4, 5.3.2, 5.0.3:** compiled (Linux, editor target with all four modules) and automation tests pass. Not run live on Edgegap.
- **UE 5.1, 5.2, 5.4, 5.6, 5.7:** engine API check only (headers at each release tag), not compiled.

Not run by this skill: the SDK in a real game project beyond the SDK's host project, parties through the group nodes, backfill with `Allow Backfill Tickets`, the server browser layer. Say so when the developer relies on them.

## 9. Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Duplicate class errors (`UEdgegapMatchmakerSubsystem` / `UEdgegapServerSubsystem`) | SDK installed next to the drop-ins or the Lyra sample plugin | Keep one integration; delete the other's files and ini sections. |
| Matched player refused: `no matchmaking ticket` | The client travelled with its own `open ip:port` or a party leader travelled it | Travel with the SDK (`Travel On Match`, or `Make Join Url`), each player with its own ticket. |
| Backfilled player refused: `ticket not assigned to this server` | Ticket gate wasn't told | `Allow Ticket` / `Allow Backfill Tickets` when the backfill is `ASSIGNED`. |
| Ticket or group refused with 400 | Attributes don't match the profile (often `beacons` sent to a profile without a `latencies` rule, or missing from one that has it) | Read the development-build validation log; use `Validate Matchmaking Attributes`; regenerate (§6). |
| Matchmaker deployment never stops after players leave | The SDK stops on exit, not when empty | End the match in game code (§5). `edgegap_stop_deployment` meanwhile. |
| Server game mode suddenly wrong after following the SDK guide | `GlobalDefaultServerGameMode` set to `EdgegapGameModeBase` on a game that has its own | Remove it, call `EdgegapGameMode::CheckPreLogin` from the game's `PreLogin`. |
| Client can't connect after a match is found | App version port isn't named `gameport` (or **Game Port Name** differs) | Match the names; check the port is 7777 UDP. |
