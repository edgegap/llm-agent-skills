# Clients

The client keeps the Nakama SDK it already uses. What changes: it no longer joins a Nakama (relayed or authoritative) match after matchmaking; it waits for a notification with a server address and connects there with the game's own netcode.

## 1. Flow

1. **Connect to Nakama's public URL**: the tunnel or real host, port 443, scheme `https` (`infra.md` §3). Not `127.0.0.1:7350`, even on the developer's machine: Nakama must see the player's public IP for placement. Make host, port and scheme settable (Fish Game: `--nakama-host=... --nakama-port=443 --nakama-scheme=https`).
2. **Authenticate** with the method the module hooks (`nakama-module.md` §2). Existing sessions from before the hook was added carry no IP: sign in again.
3. **Open the realtime socket** and listen for notifications before queueing.
4. **Add a matchmaker ticket** (`add_matchmaker_async` / `addMatchmaker` / `AddMatchmakerAsync`) with min/max counts and the version property/query the game uses.
5. **On `matchmaker_matched`**: don't call `join_matched_async`; show "Match found, starting a server...". The ticket is consumed.
6. **On notification 111** (`connection-info`): read `IpAddress` and `Port` (or `DnsName` for TLS/WebSocket), connect with the game's transport, then send the Nakama **session token** (and client version) as the first message. The server checks it (`game-server.md` §4).
7. **On 112 / 113**: show "Couldn't start a game server" and return to the menu. Also time out on the client (60 to 90 s after `matchmaker_matched`), because a server that never sends READY produces no notification.
8. Once connected to the game server, the Nakama socket can close without affecting the match; keep it if the game uses chat, parties or status.

Notification content is the JSON object the module sent. Some SDKs hand it over as a string (nakama-godot: `notification.content`), so parse it.

## 2. Godot example (Fish Game, verified)

From `autoload/OnlineMatch.gd` in edgegap/backend-game-sample-godot-nakama-fishgame:

```gdscript
const NOTIFICATION_CONNECTION_INFO := 111
const NOTIFICATION_CREATE_TIMEOUT := 112
const NOTIFICATION_CREATE_FAILED := 113

func _on_nakama_notification(notification) -> void:
	if match_state != MatchState.MATCHING:
		return
	match notification.code:
		NOTIFICATION_CONNECTION_INFO:
			var info = JSON.parse_string(notification.content)
			if not info is Dictionary or not info.has('IpAddress') or int(info.get('Port', 0)) == 0:
				leave()
				emit_signal("error", "Got an invalid game server address")
				return
			_connect_to_server(info['IpAddress'], int(info['Port']))   # ENetMultiplayerPeer.create_client
		NOTIFICATION_CREATE_TIMEOUT:
			leave()
			emit_signal("error", "Timed out starting a game server")
		NOTIFICATION_CREATE_FAILED:
			leave()
			emit_signal("error", "Unable to start a game server")

func _on_connected_to_server() -> void:
	rpc_id(1, "_hello", Online.nakama_session.token, client_version)
```

The server is ENet peer 1 and is not a player. The client cancels its ticket (`remove_matchmaker_async`) when the player backs out while searching. The sample also keeps a direct mode for netcode work: `-- --connect=127.0.0.1:7777` skips Nakama.

## 3. Other SDKs

Same steps; only the API names differ:

| SDK | Notifications | Matchmaker |
|---|---|---|
| nakama-unity (C#) | `socket.ReceivedNotification += n => ...` (`n.Code`, `n.Content`) | `socket.AddMatchmakerAsync(query, min, max, props)` |
| nakama-js | `socket.onnotification = n => ...` | `socket.addMatchmaker(query, min, max, props)` |
| nakama-godot | `socket.received_notification` | `socket.add_matchmaker_async(...)` |

Only nakama-godot was run end to end. Unity: the server side goes through edgegap-server-nakama-plugin-unity, which uses the same codes.

## 4. Removing the old match code

Relayed play (`NakamaMultiplayerBridge`, `socket.join_matched_async`, `send_match_state`) and host election go away for these matches. Keep anything else Nakama does: friends, chat, storage, leaderboards (now read-only for clients when authoritative).
