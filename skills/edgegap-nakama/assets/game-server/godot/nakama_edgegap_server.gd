extends Node
## Game server side of the Edgegap Fleet Manager for Nakama, for Godot 4.
##
## Add as an autoload (e.g. "NakamaEdgegap"). From edgegap/backend-game-sample-godot-nakama-fishgame
## (autoload/EdgegapServer.gd), verified on Edgegap with Godot 4.7.2 and
## nakama-edgegap 20d849e; the game-specific parts were moved out.
##
## On an Edgegap deployment started by Nakama, the plugin injects:
##   NAKAMA_INSTANCE_EVENT_URL    READY once listening, STOP when the match is over
##   NAKAMA_CONNECTION_EVENT_URL  the Nakama user IDs connected right now
##   NAKAMA_INSTANCE_METADATA     the metadata nakama/main.go passed to Create (JSON)
## and Edgegap injects ARBITRIUM_REQUEST_ID (= the Nakama instance ID),
## ARBITRIUM_PUBLIC_IP and ARBITRIUM_PORTS_MAPPING.
##
## Wiring, in the game's dedicated server code:
##   1. Listen (e.g. ENetMultiplayerPeer.create_server(7777)), then
##      `await NakamaEdgegap.send_ready()`. Nakama notifies the players only now.
##   2. When a client connects, it sends its Nakama session token (e.g. in a
##      hello RPC). `var account = await NakamaEdgegap.verify_player(token)`;
##      kick the peer if it is empty, else keep account.user_id for that peer.
##   3. Whenever the set of accepted players changes:
##      `NakamaEdgegap.set_connected_users(user_ids)`.
##   4. Match won: `await NakamaEdgegap.report_result(winner_user_id, user_ids)`,
##      then `NakamaEdgegap.stop("Match finished")`.

## Stop if nobody joined this long after READY.
@export var no_players_timeout := 60.0
## Hard cap on a match, below the app version's max duration.
@export var max_match_duration := 20 * 60.0
## Connection events are batched: at most one POST per interval, only on change.
@export var connection_report_interval := 5.0
## After STOP, Nakama asks Edgegap to stop the deployment; quit anyway after this.
@export var stop_grace_period := 30.0

var instance_id := ''
var instance_event_url := ''
var connection_event_url := ''
## Nakama's base URL and "?http_key=...&unwrap", taken from the event URLs, so
## the server can call its own S2S RPCs without being given the key separately.
var nakama_url := ''
var rpc_query := ''
## The NAKAMA_INSTANCE_METADATA object, and its "user_ids" (who may join).
var metadata := {}
var expected_user_ids: Array = []

var _stopping := false
var _had_players := false
var _connected_user_ids: Array = []
var _reported_user_ids: Array = []
var _connections_dirty := false

func _ready() -> void:
	instance_id = OS.get_environment("ARBITRIUM_REQUEST_ID")
	instance_event_url = OS.get_environment("NAKAMA_INSTANCE_EVENT_URL")
	connection_event_url = OS.get_environment("NAKAMA_CONNECTION_EVENT_URL")

	var rpc_index := instance_event_url.find("/v2/rpc/")
	var query_index := instance_event_url.find("?")
	if rpc_index > 0 and query_index > rpc_index:
		nakama_url = instance_event_url.substr(0, rpc_index)
		rpc_query = instance_event_url.substr(query_index)
	# Local tests without Edgegap: point the server at Nakama directly.
	if nakama_url == '':
		nakama_url = OS.get_environment("NAKAMA_URL")

	var parsed = _parse_env_json("NAKAMA_INSTANCE_METADATA")
	if parsed is Dictionary:
		metadata = parsed
		if metadata.get("user_ids") is Array:
			expected_user_ids = metadata["user_ids"]

## True when Nakama started this server through the Fleet Manager.
func is_managed() -> bool:
	return instance_event_url != ''

## Tell Nakama the server is listening. Includes the server's own address,
## because Nakama can run the READY callback before Edgegap's ready webhook
## has stored the connection info.
func send_ready(message := "Game server is listening") -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var timer := Timer.new()
	timer.wait_time = connection_report_interval
	timer.timeout.connect(_report_connections)
	add_child(timer)
	timer.start()
	get_tree().create_timer(no_players_timeout).timeout.connect(func():
		if not _had_players:
			stop("No players connected within %d seconds" % no_players_timeout))
	get_tree().create_timer(max_match_duration).timeout.connect(func():
		stop("Reached the maximum match duration"))

	print("Nakama: %s, instance '%s', expected players: %s" % [nakama_url if nakama_url != '' else "(none)", instance_id, expected_user_ids])
	await _send_instance_event("READY", message, { game_server = _game_server_metadata() })

## Report a failure to start (e.g. the port can't be bound), then quit.
func send_error(message: String) -> void:
	await _send_instance_event("ERROR", message)

## The full list of Nakama user IDs connected right now. Sent in batches.
## Stops the server when the last player leaves.
func set_connected_users(user_ids: Array) -> void:
	_connected_user_ids = user_ids.duplicate()
	_connections_dirty = true
	if user_ids.size() > 0:
		_had_players = true
	elif _had_players:
		stop("All players left")

## Checks a Nakama session token with Nakama itself. Returns
## { user_id, username } or {} when the player doesn't belong on this server.
func verify_player(token: String) -> Dictionary:
	if nakama_url == '':
		if instance_id == '':
			# Local test without Nakama: anyone may join.
			return { user_id = "local-%d" % randi(), username = "Player %d" % (randi() % 1000) }
		push_error("No Nakama URL to verify players with")
		return {}
	if token == '':
		return {}

	var response := await _http(HTTPClient.METHOD_GET, nakama_url + "/v2/account", ["Authorization: Bearer " + token])
	if response.code != 200:
		print("Rejected a player: Nakama returned %d for their session" % response.code)
		return {}
	var account = JSON.parse_string(response.body)
	if not account is Dictionary or not account.get("user") is Dictionary:
		return {}
	var user: Dictionary = account["user"]
	if expected_user_ids.size() > 0 and not expected_user_ids.has(user.get("id", "")):
		print("Rejected user %s: not matched to this server" % user.get("id", ""))
		return {}
	return { user_id = user["id"], username = user.get("username", "") }

## Calls a Nakama RPC server-to-server (http_key, "unwrap": the body is the
## payload itself). Returns { code, body }.
func call_rpc(rpc_id: String, payload: Dictionary) -> Dictionary:
	if nakama_url == '' or rpc_query == '':
		return { code = 0, body = "not started by Nakama" }
	return await _http(HTTPClient.METHOD_POST, nakama_url + "/v2/rpc/" + rpc_id + rpc_query, ["Content-Type: application/json"], JSON.stringify(payload))

## Records the winner through the module's report_match_result RPC.
func report_result(winner_user_id: String, user_ids: Array) -> bool:
	var response := await call_rpc("report_match_result", {
		instance_id = instance_id,
		winner_user_id = winner_user_id,
		user_ids = user_ids,
	})
	if response.code != 200:
		push_error("report_match_result failed (%d): %s" % [response.code, response.body])
		return false
	return true

## Asks Nakama to stop this deployment (STOP), and quits if that doesn't happen.
func stop(reason: String) -> void:
	if _stopping:
		return
	_stopping = true
	print("Stopping: " + reason)
	if not is_managed():
		get_tree().quit()
		return
	await _report_connections()
	await _send_instance_event("STOP", reason)
	await get_tree().create_timer(stop_grace_period).timeout
	get_tree().quit()

func _report_connections() -> void:
	if not _connections_dirty or connection_event_url == '':
		return
	_connections_dirty = false
	if _connected_user_ids == _reported_user_ids:
		return
	_reported_user_ids = _connected_user_ids.duplicate()
	var response := await _http(HTTPClient.METHOD_POST, connection_event_url, ["Content-Type: application/json"], JSON.stringify({
		instance_id = instance_id,
		connections = _reported_user_ids,
	}))
	if response.code != 200:
		push_error("Connection event failed (%d): %s" % [response.code, response.body])

func _send_instance_event(action: String, message: String, extra_metadata: Dictionary = {}) -> void:
	if not is_managed():
		return
	var response := await _http(HTTPClient.METHOD_POST, instance_event_url, ["Content-Type: application/json"], JSON.stringify({
		instance_id = instance_id,
		action = action,
		message = message,
		metadata = extra_metadata,
	}))
	if response.code != 200:
		push_error("%s event failed (%d): %s" % [action, response.code, response.body])
	else:
		print("Sent %s to Nakama" % action)

func _game_server_metadata() -> Dictionary:
	var ports_mapping = _parse_env_json("ARBITRIUM_PORTS_MAPPING")
	return {
		ARBITRIUM_REQUEST_ID = instance_id,
		ARBITRIUM_PUBLIC_IP = OS.get_environment("ARBITRIUM_PUBLIC_IP"),
		ARBITRIUM_PORTS_MAPPING = ports_mapping if ports_mapping is Dictionary else {},
	}

func _parse_env_json(env_name: String):
	var value := OS.get_environment(env_name)
	if value == '':
		return null
	return JSON.parse_string(value)

func _http(method: int, url: String, headers: Array, body: String = '') -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = 10.0
	add_child(request)
	var err := request.request(url, PackedStringArray(headers), method, body)
	if err != OK:
		request.queue_free()
		return { code = 0, body = "request error %d" % err }
	var result: Array = await request.request_completed
	request.queue_free()
	return { code = result[1], body = (result[3] as PackedByteArray).get_string_from_utf8() }
