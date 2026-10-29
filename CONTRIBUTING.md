# Contributing

Thanks for helping. The most valuable contributions are **end-to-end reports**: what you tried (netcode, transport, Unity version, platform), where the skill went wrong, and the logs.

## Editing the skills

- Each `skills/<name>/SKILL.md` is a workflow. Keep it under ~500 lines and put details in `references/`.
- The safety rules for acting on an Edgegap account live once, in `skills/edgegap/references/agent-rules.md`. Link to it instead of restating them.
- API facts come from Edgegap's published OpenAPI spec (checked at the commit in `scripts/spec-pin.txt`). If the live API disagrees, the live API wins: fix the skill and say so in the changelog.
- Every skill has `metadata.version` in its frontmatter. Bump it when you change the skill (patch: wording and fixes; minor: new guidance; major: changed workflow), and bump `Pack version:` in `skills/edgegap/SKILL.md` with each release.
- The frontmatter `description` decides when agents load the skill. It must stay **under 1024 characters**, because longer descriptions get cut off or ignored. After changing it, re-run the trigger eval (below).
- Explain *why* in instructions rather than adding MUSTs. Agents follow reasons better.
- Never commit tokens, registry credentials, matchmaker URLs, or anything specific to a real account.

## Checks

```bash
python scripts/validate.py
python scripts/scan_private_refs.py
python scripts/check_spec.py
```

`validate.py` checks skill frontmatter (name, description length, `metadata.version`), relative links and skill names across skills, every JSON file, and the plugin manifests. `scan_private_refs.py` fails on anything that must not be public: personal paths and emails, real matchmaker or deployment hosts, registry robot accounts, token-shaped strings. CI runs both on every pull request. `check_spec.py` diffs the published Edgegap OpenAPI spec against the pinned commit; a weekly workflow runs it and opens an issue on drift (`--update` moves the pin). Don't copy the specs into the repo: their examples contain token-shaped values, and the plugin directory rejects anything that looks like a shipped secret.

If you change the C# templates or adapters, compile them in a real Unity project (Unity 6 LTS, SDK `https://github.com/edgegap/sdk-unity-sessions-matchmaker-server-browser.git`, the latest) with the netcode you touched, and build a Linux Dedicated Server once:

```bash
<Unity> -batchmode -quit -projectPath <project> -executeMethod EdgegapServerBuild.Build -logFile -
```

## Evals

- `evals/evals.json`: task prompts with assertions, run with and without the skill.
- `evals/trigger-eval.json`: 20 prompts (10 should trigger, 10 near-misses) to measure `edgegap-unity` triggering.
- `evals/routing-eval.json`: 20 prompts with the skill that should load (or none), to check the pack's descriptions don't steal each other's prompts.
- `evals/guardrails.json`: safety scenarios run with the MCP connected, in a test organization with no live game. An entry passes only if every `expect` holds and no `forbid` occurs. Record date and pass/total in the changelog; never commit transcripts, tokens or IDs.
- `evals/fusion-evals.json` and `evals/fusion-routing-eval.json`: Photon Fusion tasks and routing. The Fusion fixtures (`br200-shell`, `skyraid`, `broken-br200`) hold scripts and trimmed settings only: never commit BR200 or Photon Fusion files, they are licensed.
- `evals/fusion-simplefps-routing-eval.json`: routing between `edgegap-fusion-simplefps`, `edgegap-fusion` and no skill. The same licence rule holds for Photon's Simple FPS sample: the kit in `skills/edgegap-fusion-simplefps/assets/` holds only Edgegap's files.
- `evals/godot-evals.json` and `evals/godot-routing-eval.json`: Godot tasks (fixtures `skyarena`, an ENet host/join game; `pixelparty`, a WebSocket web game with export allowlists; `broken-skyarena`, a half-done Edgegap setup with planted bugs) and routing. Check delivered outputs by loading them in the Godot version the fixtures name (`godot --headless --path <project> --import`, then a client run and a `-- --server` run): a script that doesn't parse, or an autoload or `class_name` it can't find, shows up there as `SCRIPT ERROR`. If you change the GDScript templates, run them once as an exported Linux dedicated server in Docker with two clients (`references/deploy.md` §3 of `edgegap-godot`).
- `evals/colyseus-routing-eval.json`: routing between `edgegap-colyseus`, other pack skills and no skill (Colyseus gameplay questions).
- `evals/nakama-evals.json`: Nakama tasks with fixtures `reefrush` (Godot, relayed play), `starhaul` (TypeScript module, Node server, Steam) and `broken-tidewars` (planted bugs; its `.env` holds no real token). Check delivered Go modules by building them in `heroiclabs/nakama-pluginbuilder:3.39.0`.
- `evals/nakama-routing-eval.json`: routing between `edgegap-nakama`, other pack skills and no skill (Nakama questions unrelated to hosting). If you change `skills/edgegap-nakama/assets/nakama/`, build it with `docker build --target builder` (pluginbuilder) before committing.
- `evals/playfab-evals.json`: PlayFab tasks with fixtures `mps-skirmish` (Unity NGO on PlayFab Multiplayer Servers with the GSDK), `driftclash` (Godot 4 with PlayFab REST login) and `broken-playfab-bridge` (an Azure Function bridge with planted bugs and playtest logs). Check delivered Azure Functions with `node --check` on every file, and if you change `skills/edgegap-playfab/assets/`, run them once end to end (`references/azure-functions.md` §5 chain test, then two clients).
- `evals/playfab-routing-eval.json`: routing between `edgegap-playfab`, other pack skills and no skill (PlayFab questions unrelated to hosting).
- `evals/threejs-routing-eval.json`: routing between `edgegap-threejs`, its neighbours (Colyseus, Manus, Godot web, Unity WebGL) and no skill (Three.js and browser-game questions unrelated to hosting). If you change `skills/edgegap-threejs/assets/`, copy them into an empty project and play a match with two headless players locally and in Docker (`references/server.md` §8 of `edgegap-threejs`).
- `evals/fixtures/ngo-arena`: a minimal Netcode for GameObjects host/client project (scripts only) for the NGO eval. The Mirror WebGL eval uses https://github.com/edgegap/netcode-game-sample-webgl-mirror-tanks.

When measuring triggering with skill-creator's `run_eval.py`, use `--num-workers 1`. Parallel workers share one `.claude/commands` folder, so each run sees several copies of the skill and the trigger rate is understated.

## Releases

Bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and add an entry to `CHANGELOG.md`.
