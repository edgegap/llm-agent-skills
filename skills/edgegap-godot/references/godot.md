# Godot 4 high-level multiplayer on an Edgegap dedicated server

Contents
1. Reading the project
2. Transports and ports
3. From host/client to a dedicated server
4. Wiring the templates
5. Server logs
6. Exports, feature tags and allowlists
7. Web exports
8. Validating who joins

## 1. Reading the project

Grep before asking:

| Look for | Tells you |
|---|---|
| `config/features=PackedStringArray("4.x"...)` in `project.godot` | Godot version: the export templates must match it exactly. `"C#"` there or a `.csproj` = Godot .NET (§6) |
| `[autoload]` | Where the network code lives (`Network`, `Lobby`, `GameState`...) |
| `ENetMultiplayerPeer`, `WebSocketMultiplayerPeer`, `WebRTCMultiplayerPeer`, `create_server(`, `create_client(` | Transport and port; WebRTC = peer-to-peer today |
| `multiplayer.multiplayer_peer =`, `get_tree().set_multiplayer(`, `MultiplayerAPI.create_default_interface()` | Which `MultiplayerAPI` carries the game (the SceneTree's, or a custom branch: pass that one to `begin()`) |
| `multiplayer.is_server()`, `get_unique_id() == 1`, `is_multiplayer_authority()` | Server-authoritative code, and host assumptions (§3) |
| `peer_connected`, `peer_disconnected`, `connected_to_server`, `connection_failed` | Where players get spawned and the join flow |
| `MultiplayerSpawner`, `MultiplayerSynchronizer`, `@rpc(` | Replication. Spawners need `spawn_path` and an authority of 1 |
| `netfox`, `noray` | netfox runs on top of high-level multiplayer: keep it. noray (NAT punch-through / relay) goes away on a dedicated server |
| `export_filter=`, `export_files=`, `include_filter=`, `exclude_filter=` in `export_presets.cfg` | Allowlists that must list the new scripts (§6) |
| `OS.get_cmdline_args`, `OS.get_cmdline_user_args`, `--server`, `DisplayServer.get_name()` | An existing headless/server mode to reuse |

## 2. Transports and ports

| Peer | Edgegap port protocol | Client connects to | Notes |
|---|---|---|---|
| `ENetMultiplayerPeer` | **UDP** | `public_ip` (or `fqdn`) + external port | Desktop and mobile. Not available in web exports |
| `WebSocketMultiplayerPeer` | **WS**, **TLS Upgrade** on | `wss://<fqdn>:<external>` | Required for web exports. The server stays plain `ws` in the container: Edgegap terminates TLS. Without TLS Upgrade, use `ws://` (desktop only, never from an https page) |
| `WebRTCMultiplayerPeer` | not used | | P2P with signaling; replace with ENet or WebSocket for a dedicated server |

One fixed port inside the container (the templates default to 7777, the sample used 7000), set in two places that must agree: `EdgegapGameSettings.PORT` (or `EDGEGAP_PORT`) and the app version's internal port (the plugin's Dockerfile has no `EXPOSE`, and Edgegap doesn't need one). Players always get a **random external port**: never ship the internal port to clients. Bind all interfaces: the templates use `set_bind_ip("*")` for ENet and `"*"` for WebSocket. A server bound to `127.0.0.1` accepts nothing on Edgegap.

## 3. From host/client to a dedicated server

Most Godot tutorials and demos host from a player's game: a Host button calls `create_server`, then spawns a player for peer 1. On a dedicated server, peer 1 is the server and nobody plays it.
- **Start the server at boot.** In a server launch (`EdgegapServer.is_server_launch()`: the `dedicated_server` feature, a `-- --server` user argument, or an Edgegap deployment), the main scene (or the network autoload) calls the game's host function without the local-player part, then `EdgegapServer.begin(multiplayer)`. Skip the menu: no one is there to click.
- **No player for peer 1.** Code like `add_player(1)` after `create_server`, or `for id in [1] + multiplayer.get_peers()`, must skip 1 when headless.
- **Spawn for remote peers** in `peer_connected` on the server (or when they register, see §4), and remove them in `peer_disconnected`.
- **`is_server()` is not "I'm a player".** Host code often does `if multiplayer.is_server(): update_my_hud()`. Split server logic from local presentation.
- **Client-only code on the server**: cameras, audio, input, `Input.mouse_mode`, UI. `--headless` gives dummy rendering and audio, so most of it runs harmlessly, but input polling or UI-driven state must not drive the server. Guard with `DisplayServer.get_name() == "headless"` or `EdgegapServer.is_server_launch()`.
- **`@rpc("any_peer", "call_local")`** used by the host to apply its own actions still works, but check calls that assume the caller's ID is the host (`get_remote_sender_id() == 0` means a local call).
- **The host's Start button.** Lobbies where the host presses Start become `EdgegapServer.match_ready.connect(start_match)`.

## 4. Wiring the templates

`EdgegapServer` (autoload, `edgegap_server.gd`):
- `host(mp = null)` creates the peer from `EdgegapGameSettings` and calls `begin()`. Games that already create their peer call `begin(multiplayer)` after setting it.
- `match_ready(count)`: once `MM_TICKET_IDS.size()` players are in, or `START_GRACE` (30 s; 10 s without the matchmaker) after the first join, so one no-show doesn't hold the others.
- `match_ended()`: stop `END_GRACE` (15 s) later. Also stops when nobody joins in `JOIN_TIMEOUT` (120 s) or everyone left for `EMPTY_GRACE` (30 s). The self-stop only runs on Edgegap (`ARBITRIUM_REQUEST_ID` set); local runs quit only with `EDGEGAP_QUIT_LOCALLY=1`.
- `count_registered_only = true` + `player_registered(peer_id)`: count a player only after the game's own handshake (name, auth), so a peer that connects and stalls isn't counted.
- Signals `player_joined`, `player_left`, `stopping(reason)`; `matched_ticket_ids()`, `request_id()`, `is_edgegap()`.
- All timings are also env vars (`EDGEGAP_START_GRACE`, `EDGEGAP_JOIN_TIMEOUT`, `EDGEGAP_EMPTY_GRACE`, `EDGEGAP_END_GRACE`), settable on the app version without a rebuild.

`EdgegapMatchmaker` (`edgegap_matchmaker.gd`): `find_match(attributes)`, `cancel()`, `status_changed(state, message)`, `assigned(address)`, `join(address, mp)` (retries 10 × 5 s while the server boots), `joined`, `failed(message)`. `address` = `{host, port, url, fqdn, public_ip}`. `EdgegapFindMatchButton` wraps it in a Button.

**Joining through the game's own connect code.** Many games already have a Direct Connect or Join form, and reusing it keeps the game's handshake (name, password, version check). Set the fields from `address` and call its submit function, but read what it validates first. In the sample, a fresh install had an empty display name and Direct Connect refused it without an error: the clients looked stuck searching while the server waited for them. Defaults for every required field (a random player name, the right password), and a check that the client is actually connecting afterwards (`multiplayer.multiplayer_peer.get_connection_status()`), prevent that. Validators that only accept IP addresses reject the `fqdn`: pass `public_ip` for ENet, or relax the check.

## 5. Server logs

Godot buffers stdout when it isn't a terminal. Without `application/run/flush_stdout_on_print`, `docker logs` and Edgegap's deployment logs show nothing, not even the engine banner, until the buffer fills or the process exits (measured with Godot 4.7.2 in Docker). Set in `project.godot`:
```ini
[application]
run/flush_stdout_on_print=true
```
The `.dedicated_server` override (`run/flush_stdout_on_print.dedicated_server=true`, as in the sample) only applies to exports with the `dedicated_server` feature, so a server started from the editor binary still buffers. The plain setting covers both. `push_error`/`printerr` go to stderr and follow the same rule.

## 6. Exports, feature tags and allowlists

- **Dedicated Server export mode** (`dedicated_server=true` in the plugin's `Edgegap Linux Server` preset, `assets/godot/export_presets.server.cfg`) adds the `dedicated_server` feature tag, starts headless without `--headless`, and replaces textures, meshes and audio with placeholders. Resources that server code reads (a texture's size, image pixels for a map) can be kept with the per-resource "Keep" option in the export dialog's Resources tab.
- **Export templates** must match the editor version exactly (`4.7.2.stable`). Headless CI: download `Godot_v<ver>_export_templates.tpz` and extract to the templates folder, or use a self-contained editor (`_sc_` file) with `editor_data/export_templates/<ver>/`.
- **Allowlists.** With `export_filter="resources"` or `"scenes"`, only the listed files and their dependencies are exported. An autoload is exported, but scripts it reaches only through `class_name` (`EdgegapGameSettings`, `EdgegapMatchmaker`) are not. Measured: the export runs and fails at runtime with `Identifier "EdgegapGameSettings" not declared in the current scope`. Fix it per preset, client and server:
  - `export_filter="resources"`: add every `res://edgegap/*.gd` to `export_files`.
  - `export_filter="scenes"`: listing scripts there does nothing, because that mode only takes scenes from the list (measured: the listed `.gd` files were not packed). Switch the preset to `"resources"` and list the scenes plus the scripts, or to `all_resources`.
  - Regenerate the list if the project has a script that writes it (the sample: `tools/update-export-policy.py`), and check `exclude_filter` doesn't drop the scripts.
  - Verify with `godot --headless --path . --export-pack "<preset>" /tmp/check.pck`: the output lists every stored file, and each `res://edgegap/*.gdc` must be there.
- **`.pck`**: the plugin needs `binary_format/embed_pck=false`, with the `.pck` next to the binary under the same base name.
- **Godot .NET (C#)**: the GDScript templates work beside C# scripts. The Linux export needs the .NET export templates; not verified on Edgegap yet.

## 7. Web exports

- WebSocket only, and `wss://` when the page is served over https (itch.io, any real host): TLS Upgrade on the app version port, `USE_TLS = true`.
- The matchmaker calls are browser `fetch`es: list every origin that serves the build in `allowed_cors_origins` in the matchmaker config (`matchmaker.md` §2). No `latencies` rule: browsers can't ping beacons.
- Export with thread support off unless the host sends COOP/COEP headers (Godot 4.3+ can export without threads); unrelated to Edgegap, but a common reason a web build doesn't start.

## 8. Validating who joins

Anyone with the address can connect. Two simple checks, optional for a first playtest:
- **Request ID as a password** (the sample): the matchmaker hands `<request_id>.pr.edgegap.net` only to matched players. The client sends `fqdn.get_slice(".", 0)` in its join handshake; the server compares it with `EdgegapServer.request_id()`.
- **Ticket IDs**: the client sends its ticket ID (`EdgegapMatchmaker.matched_ticket_id`) and the server kicks peers whose ticket isn't in `matched_ticket_ids()` (`multiplayer.multiplayer_peer.disconnect_peer(id)`).
