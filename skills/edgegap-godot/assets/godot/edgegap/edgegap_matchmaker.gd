class_name EdgegapMatchmaker
extends Node

## Edgegap matchmaker client for Godot 4: one ticket per player, then join the
## assigned server with ENetMultiplayerPeer or WebSocketMultiplayerPeer.
##
##   POST   {url}/tickets {"profile": ..., "attributes": {...}}  → {"id": ...}
##   GET    {url}/tickets/{id} every POLL_SECONDS
##          SEARCHING → MATCH_FOUND/TEAM_FOUND → HOST_ASSIGNED {assignment: {fqdn, public_ip, ports{<name>{external}}}}
##   DELETE {url}/tickets/{id} to cancel (409: already matched, keep polling)
## Header: "Authorization: <matchmaker auth token>", raw, no Bearer/token prefix.
##
## Usage (add as a child of a menu, or as an autoload):
##   var mm := EdgegapMatchmaker.new()
##   add_child(mm)
##   mm.status_changed.connect(func(_s, text): status_label.text = text)
##   mm.assigned.connect(func(address): mm.join(address, multiplayer))  # or your own join code
##   mm.find_match()
## join() retries while the fresh server boots and emits joined or failed.

signal status_changed(state: State, message: String)
## address = {host, port, url, fqdn, public_ip}: url is ws(s)://fqdn:port for
## WebSocket, host:port for ENet. host is the public IP for ENet when the
## assignment has one, else the fqdn.
signal assigned(address: Dictionary)
signal joined
signal failed(message: String)

enum State { IDLE, CREATING, SEARCHING, MATCH_FOUND, ASSIGNED, JOINING, JOINED }

const JOIN_ATTEMPTS := 10
const JOIN_ATTEMPT_SECONDS := 5.0
const JOIN_RETRY_DELAY := 2.0

var state := State.IDLE
var ticket_id := ""
## The ticket that got this player matched; send it to the server if it checks
## joiners against MM_TICKET_IDS.
var matched_ticket_id := ""
var _poll_timer: Timer
var _poll_in_flight := false
var _searching_since := 0.0
var _search := 0


func _ready() -> void:
	_poll_timer = Timer.new()
	_poll_timer.wait_time = EdgegapGameSettings.POLL_SECONDS
	_poll_timer.timeout.connect(_poll)
	add_child(_poll_timer)


## Queues this player. `attributes` must carry one entry per non-player_count
## rule in the profile (e.g. "latencies"), or the matchmaker answers 400.
func find_match(attributes: Dictionary = {}) -> void:
	if state not in [State.IDLE, State.JOINED]:
		return
	if not EdgegapGameSettings.is_matchmaker_configured():
		_fail("Set the matchmaker URL and Auth Token in edgegap_settings.gd.")
		return
	_searching_since = _now()
	_search += 1
	_set_state(State.CREATING, "Joining the queue…")
	var body := JSON.stringify({"profile": EdgegapGameSettings.profile(), "attributes": attributes})
	_send(HTTPClient.METHOD_POST, "/tickets", body, _on_ticket_created.bind(_search))


## Deletes the ticket. A cancel that races a match keeps the match (409).
func cancel() -> void:
	if state == State.CREATING:
		# The POST is still in flight: _on_ticket_created deletes the ticket.
		_set_state(State.IDLE, "Search cancelled.")
		return
	if state not in [State.SEARCHING, State.MATCH_FOUND] or ticket_id.is_empty():
		return
	_poll_timer.stop()
	_send(HTTPClient.METHOD_DELETE, "/tickets/%s" % ticket_id, "", func(code: int, _data: Variant) -> void:
		if code == 409:
			_set_state(State.MATCH_FOUND, "Match already found. Joining…")
			_poll_timer.start()
			return
		ticket_id = ""
		_set_state(State.IDLE, "Search cancelled.")
	)


func is_searching() -> bool:
	return state in [State.CREATING, State.SEARCHING, State.MATCH_FOUND]


## Connects `mp` (the SceneTree's MultiplayerAPI by default) to the assigned
## server, retrying while it boots. Emits joined, or failed after JOIN_ATTEMPTS.
func join(address: Dictionary, mp: MultiplayerAPI = null) -> void:
	var api := mp if mp != null else multiplayer
	_set_state(State.JOINING, "Joining %s…" % address.get("fqdn", address.get("host", "")))
	for attempt in JOIN_ATTEMPTS:
		var peer := create_client_peer(address)
		if peer != null:
			api.multiplayer_peer = peer
			var deadline := _now() + JOIN_ATTEMPT_SECONDS
			while _now() < deadline and peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTING:
				await get_tree().process_frame
			if peer.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED:
				print("EDGEGAP_MM joined=%s attempt=%d" % [address.get("url", ""), attempt + 1])
				_set_state(State.JOINED, "Connected.")
				joined.emit()
				return
			peer.close()
			api.multiplayer_peer = null
		print("EDGEGAP_MM join_retry attempt=%d" % (attempt + 1))
		await get_tree().create_timer(JOIN_RETRY_DELAY).timeout
	_fail("Couldn't connect to the server.")


## Client peer for an assigned address, or null if it can't be created.
static func create_client_peer(address: Dictionary) -> MultiplayerPeer:
	var error: Error
	var peer: MultiplayerPeer
	if EdgegapGameSettings.transport() == EdgegapGameSettings.Transport.WEBSOCKET:
		var ws := WebSocketMultiplayerPeer.new()
		# wss:// to Edgegap's TLS Upgrade uses a public certificate: default options.
		error = ws.create_client(String(address.url), TLSOptions.client() if String(address.url).begins_with("wss://") else null)
		peer = ws
	else:
		var enet := ENetMultiplayerPeer.new()
		error = enet.create_client(String(address.host), int(address.port))
		peer = enet
	if error != OK:
		print("EDGEGAP_MM client_error=%s" % error_string(error))
		return null
	return peer


## {host, port, url, fqdn, public_ip} from a HOST_ASSIGNED assignment, or {} if
## it has no port named EdgegapGameSettings.PORT_NAME.
static func address_from_assignment(assignment: Variant) -> Dictionary:
	if not assignment is Dictionary:
		return {}
	var fqdn := String(assignment.get("fqdn", ""))
	var public_ip := String(assignment.get("public_ip", ""))
	var ports: Variant = assignment.get("ports", {})
	if fqdn.is_empty() or not ports is Dictionary or not ports.has(EdgegapGameSettings.PORT_NAME):
		return {}
	var port := int((ports[EdgegapGameSettings.PORT_NAME] as Dictionary).get("external", 0))
	if port <= 0:
		return {}
	var websocket := EdgegapGameSettings.transport() == EdgegapGameSettings.Transport.WEBSOCKET
	var host := fqdn if websocket or public_ip.is_empty() else public_ip
	var url := "%s://%s:%d" % ["wss" if EdgegapGameSettings.USE_TLS else "ws", fqdn, port] if websocket else "%s:%d" % [host, port]
	return {"host": host, "port": port, "url": url, "fqdn": fqdn, "public_ip": public_ip}


func _on_ticket_created(code: int, data: Variant, search: int) -> void:
	var created: bool = code in [200, 201] and data is Dictionary and data.has("id")
	if state != State.CREATING or search != _search:
		# Cancelled while the POST was in flight: drop the new ticket.
		if created:
			_send(HTTPClient.METHOD_DELETE, "/tickets/%s" % data.id, "", Callable())
		return
	if not created:
		_fail(_error_text(code))
		return
	ticket_id = String(data.id)
	print("EDGEGAP_MM ticket=%s" % ticket_id)
	_set_state(State.SEARCHING, "Searching for players…")
	_poll_timer.start()


func _poll() -> void:
	if ticket_id.is_empty() or _poll_in_flight or state not in [State.SEARCHING, State.MATCH_FOUND]:
		return
	if _now() - _searching_since > EdgegapGameSettings.SEARCH_TIMEOUT_SECONDS:
		_poll_timer.stop()
		_send(HTTPClient.METHOD_DELETE, "/tickets/%s" % ticket_id, "", Callable())
		_fail("No match found in time. Try again.")
		return
	_poll_in_flight = true
	_send(HTTPClient.METHOD_GET, "/tickets/%s" % ticket_id, "", _on_ticket_status)


func _on_ticket_status(code: int, data: Variant) -> void:
	_poll_in_flight = false
	if state not in [State.SEARCHING, State.MATCH_FOUND]:
		return
	if code == 404:
		_fail("The ticket expired. Try again.")
		return
	if code != 200 or not data is Dictionary:
		return # Transient: keep polling.
	match String(data.get("status", "")):
		"SEARCHING":
			_set_state(State.SEARCHING, "Searching for players…")
		"MATCH_FOUND", "TEAM_FOUND":
			_set_state(State.MATCH_FOUND, "Match found. Starting a server near you…")
		"HOST_ASSIGNED":
			_poll_timer.stop()
			var address := address_from_assignment(data.get("assignment", {}))
			if address.is_empty():
				_fail("The server has no port named '%s'. Check the app version." % EdgegapGameSettings.PORT_NAME)
				return
			matched_ticket_id = ticket_id
			ticket_id = ""
			print("EDGEGAP_MM assigned=%s" % address.url)
			_set_state(State.ASSIGNED, "Server ready.")
			assigned.emit(address)
		"CANCELLED":
			_fail("The matchmaker cancelled the ticket. Try again.")


func _send(method: int, path: String, body: String, on_done: Callable) -> void:
	var headers := PackedStringArray(["Authorization: %s" % EdgegapGameSettings.auth_token()])
	if not body.is_empty():
		headers.append("Content-Type: application/json")
	var http := HTTPRequest.new()
	http.timeout = 10.0
	add_child(http)
	http.request_completed.connect(func(result: int, code: int, _response_headers: PackedStringArray, response: PackedByteArray) -> void:
		http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS:
			code = 0
		var text := response.get_string_from_utf8()
		if code == 0 or code >= 400:
			print("EDGEGAP_MM %s %s -> %d %s" % [_method_name(method), path.get_slice("/", 1), code, text.left(200)])
		if on_done.is_valid():
			on_done.call(code, JSON.parse_string(text) if not text.is_empty() else null)
	, CONNECT_ONE_SHOT)
	var error := http.request(EdgegapGameSettings.matchmaker_url() + path, headers, method, body)
	if error != OK:
		http.queue_free()
		if on_done.is_valid():
			on_done.call(0, null)


func _set_state(next: State, message: String) -> void:
	state = next
	status_changed.emit(next, message)


func _fail(message: String) -> void:
	_poll_timer.stop()
	_poll_in_flight = false
	ticket_id = ""
	_set_state(State.IDLE, message)
	failed.emit(message)


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


static func _method_name(method: int) -> String:
	match method:
		HTTPClient.METHOD_GET:
			return "GET"
		HTTPClient.METHOD_POST:
			return "POST"
		HTTPClient.METHOD_DELETE:
			return "DELETE"
	return str(method)


static func _error_text(code: int) -> String:
	match code:
		0:
			return "Couldn't reach the matchmaker. Is it running?"
		400:
			return "The matchmaker rejected the ticket (profile or attributes don't match its config)."
		401, 403:
			return "The matchmaker refused the Auth Token."
		429:
			return "The matchmaker is busy. Try again."
	return "Couldn't create the ticket (HTTP %d)." % code
