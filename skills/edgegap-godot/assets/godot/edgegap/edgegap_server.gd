extends Node

## Edgegap server lifecycle for Godot 4 high-level multiplayer.
## Register as an autoload named EdgegapServer (Project Settings → Globals →
## Autoload, or `EdgegapServer="*res://edgegap/edgegap_server.gd"` under
## [autoload] in project.godot). It does nothing until the game calls host() or
## begin(), so clients carry it at no cost.
##
## On the server:
##   if EdgegapServer.is_server_launch():
##       EdgegapServer.host()                      # creates the ENet/WebSocket server peer on 0.0.0.0:<port>
##       EdgegapServer.match_ready.connect(_start_round)
##   ...when the match is over: EdgegapServer.match_ended()
## A game that already creates its own server peer sets it on its
## MultiplayerAPI, then calls EdgegapServer.begin(multiplayer) instead of host().
##
## What it does:
## - Reads MM_TICKET_IDS (one ticket per matched player) and emits match_ready
##   once that many players are connected, or START_GRACE seconds after the
##   first one joined, so a no-show doesn't block the others.
## - On an Edgegap deployment (ARBITRIUM_REQUEST_ID set), stops the deployment
##   itself through ARBITRIUM_DELETE_URL: END_GRACE seconds after match_ended(),
##   when nobody joins within JOIN_TIMEOUT, or when everyone left for
##   EMPTY_GRACE. Without the self-stop an empty server bills until it hits the
##   app version's max duration.
## - Quits by itself if the self-stop call fails or SIGTERM never arrives.
##   Godot has no SIGTERM handler, and as PID 1 in a container (the Edgegap
##   plugin's Dockerfile) it ignores SIGTERM, so this quit is what ends it.
## Log lines start with "EDGEGAP". Godot only flushes print() per line when
## application/run/flush_stdout_on_print is on (see the skill's godot.md §5);
## without it, docker and Edgegap logs show nothing until the buffer fills.

signal match_ready(player_count: int)
signal player_joined(peer_id: int)
signal player_left(peer_id: int)
signal stopping(reason: String)

enum Phase { IDLE, WAITING, PLAYING, ENDING, STOPPING }

const LOG_PREFIX := "EDGEGAP"
const QUIT_FALLBACK_SECONDS := 30.0

## Set true when the game decides itself when a peer counts as a player (after
## a name or auth handshake): it then calls player_registered(peer_id).
var count_registered_only := false
var phase := Phase.IDLE
var expected_players := 0
var players: Dictionary = {}

var _mp: MultiplayerAPI
var _elapsed := 0.0
var _first_join_at := -1.0
var _empty_since := -1.0
var _ended_at := -1.0
var _start_grace := 0.0
var _join_timeout := 0.0
var _empty_grace := 0.0
var _end_grace := 0.0


func _ready() -> void:
	set_process(false)


## True on an Edgegap deployment.
func is_edgegap() -> bool:
	return not OS.get_environment("ARBITRIUM_REQUEST_ID").is_empty()


## The deployment's request ID; its address is <request_id>.pr.edgegap.net.
func request_id() -> String:
	return OS.get_environment("ARBITRIUM_REQUEST_ID").to_lower()


## True when this process should run as the dedicated server: an export with
## the dedicated_server feature (Export Mode: Dedicated Server), a `-- --server`
## user argument, or any Edgegap deployment.
func is_server_launch() -> bool:
	return OS.has_feature("dedicated_server") or "--server" in OS.get_cmdline_user_args() or is_edgegap()


## Ticket IDs of the players the matchmaker put in this match. Empty for a
## deployment started without the matchmaker (or a local run).
func matched_ticket_ids() -> Array:
	var text := OS.get_environment("MM_TICKET_IDS")
	if text.is_empty():
		return []
	var parsed: Variant = JSON.parse_string(text)
	return parsed if parsed is Array else []


## Creates the server peer for EdgegapGameSettings.transport() on all interfaces.
## Returns null (and logs why) when the port can't be bound.
func create_server_peer(max_clients: int = 32) -> MultiplayerPeer:
	var port := EdgegapGameSettings.port()
	var error: Error
	var peer: MultiplayerPeer
	if EdgegapGameSettings.transport() == EdgegapGameSettings.Transport.WEBSOCKET:
		var ws := WebSocketMultiplayerPeer.new()
		# Plain ws inside the container: Edgegap's TLS Upgrade terminates wss.
		error = ws.create_server(port, "*")
		peer = ws
	else:
		var enet := ENetMultiplayerPeer.new()
		enet.set_bind_ip("*")
		error = enet.create_server(port, max_clients)
		peer = enet
	if error != OK:
		_log("server_error port=%d error=%s" % [port, error_string(error)])
		return null
	_log("listening transport=%s port=%d" % ["websocket" if peer is WebSocketMultiplayerPeer else "enet", port])
	return peer


## Creates the server peer, sets it on `mp` (the SceneTree's by default) and
## starts the lifecycle. Returns the peer, or null if it couldn't bind.
func host(mp: MultiplayerAPI = null, max_clients: int = 32) -> MultiplayerPeer:
	var api := mp if mp != null else multiplayer
	var peer := create_server_peer(max_clients)
	if peer == null:
		if is_edgegap():
			_quit(1)
		return null
	api.multiplayer_peer = peer
	begin(api)
	return peer


## Starts the lifecycle on a MultiplayerAPI whose server peer is already set.
func begin(mp: MultiplayerAPI = null) -> void:
	if phase != Phase.IDLE:
		return
	_mp = mp if mp != null else multiplayer
	expected_players = matched_ticket_ids().size()
	var default_grace := EdgegapGameSettings.START_GRACE_SECONDS if expected_players > 0 else 10.0
	_start_grace = EdgegapGameSettings.seconds("EDGEGAP_START_GRACE", default_grace)
	_join_timeout = EdgegapGameSettings.seconds("EDGEGAP_JOIN_TIMEOUT", EdgegapGameSettings.JOIN_TIMEOUT_SECONDS)
	_empty_grace = EdgegapGameSettings.seconds("EDGEGAP_EMPTY_GRACE", EdgegapGameSettings.EMPTY_GRACE_SECONDS)
	_end_grace = EdgegapGameSettings.seconds("EDGEGAP_END_GRACE", EdgegapGameSettings.END_GRACE_SECONDS)
	_mp.peer_connected.connect(_on_peer_connected)
	_mp.peer_disconnected.connect(_on_peer_disconnected)
	phase = Phase.WAITING
	set_process(true)
	_log("ready edgegap=%s request_id=%s match_id=%s profile=%s expected_players=%d" % [
		is_edgegap(), request_id(), OS.get_environment("MM_MATCH_ID"),
		OS.get_environment("MM_MATCH_PROFILE"), expected_players,
	])


## Call when a peer finished the game's own join handshake. Only needed with
## count_registered_only = true.
func player_registered(peer_id: int) -> void:
	if players.has(peer_id) or peer_id not in _mp.get_peers():
		return
	players[peer_id] = true
	_log("player_joined peer=%d players=%d" % [peer_id, players.size()])
	player_joined.emit(peer_id)


## Call when the match is over. The deployment stops END_GRACE seconds later
## (time for a results screen). One match per deployment: players queue again.
func match_ended() -> void:
	if phase in [Phase.ENDING, Phase.STOPPING]:
		return
	phase = Phase.ENDING
	_ended_at = _elapsed
	_log("match_ended players=%d" % players.size())


func player_count() -> int:
	return players.size()


func _on_peer_connected(peer_id: int) -> void:
	if not count_registered_only:
		player_registered(peer_id)


func _on_peer_disconnected(peer_id: int) -> void:
	if players.erase(peer_id):
		_log("player_left peer=%d players=%d" % [peer_id, players.size()])
		player_left.emit(peer_id)


func _process(delta: float) -> void:
	_elapsed += delta
	var count := players.size()
	if count > 0:
		_empty_since = -1.0
		if _first_join_at < 0.0:
			_first_join_at = _elapsed
	elif _empty_since < 0.0:
		_empty_since = _elapsed

	match phase:
		Phase.WAITING:
			if count > 0 and ((expected_players > 0 and count >= expected_players) or _elapsed - _first_join_at >= _start_grace):
				phase = Phase.PLAYING
				_log("match_ready players=%d expected=%d" % [count, expected_players])
				match_ready.emit(count)
			elif count == 0 and _first_join_at < 0.0 and _elapsed > _join_timeout:
				stop("no player joined within %d s" % int(_join_timeout))
			elif count == 0 and _first_join_at >= 0.0 and _elapsed - _empty_since > _empty_grace:
				stop("all players left before the match started")
		Phase.PLAYING:
			if count == 0 and _elapsed - _empty_since > _empty_grace:
				stop("all players left")
		Phase.ENDING:
			if _elapsed - _ended_at > _end_grace or (count == 0 and _elapsed - _empty_since > 2.0):
				stop("match over")


## Stops this deployment through the self-stop URL Edgegap injects. Edgegap then
## sends SIGTERM. Outside Edgegap (local runs) it only quits when
## EDGEGAP_QUIT_LOCALLY=1, so a dev server keeps running between tests.
func stop(reason: String) -> void:
	if phase == Phase.STOPPING:
		return
	phase = Phase.STOPPING
	_log("stopping reason=\"%s\"" % reason)
	stopping.emit(reason)
	var url := OS.get_environment("ARBITRIUM_DELETE_URL")
	var token := OS.get_environment("ARBITRIUM_DELETE_TOKEN")
	if url.is_empty() or token.is_empty():
		if is_edgegap() or OS.get_environment("EDGEGAP_QUIT_LOCALLY") == "1":
			_quit(0)
		return
	# If SIGTERM never comes, quit anyway: the container then exits on its own.
	get_tree().create_timer(QUIT_FALLBACK_SECONDS).timeout.connect(_quit.bind(0))
	var http := HTTPRequest.new()
	http.timeout = 10.0
	add_child(http)
	http.request_completed.connect(func(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
		_log("self_stop result=%d http=%d" % [result, code])
		if result != HTTPRequest.RESULT_SUCCESS or code >= 400:
			_quit(0)
	)
	# The delete token goes in the header raw, with no "Bearer"/"token" prefix.
	var error := http.request(url, ["Authorization: %s" % token], HTTPClient.METHOD_DELETE)
	if error != OK:
		_log("self_stop request_error=%s" % error_string(error))
		_quit(0)


func _quit(code: int) -> void:
	if _mp != null and _mp.multiplayer_peer != null:
		_mp.multiplayer_peer.close()
	_log("exit code=%d" % code)
	get_tree().quit(code)


func _log(message: String) -> void:
	print("%s %s" % [LOG_PREFIX, message])
