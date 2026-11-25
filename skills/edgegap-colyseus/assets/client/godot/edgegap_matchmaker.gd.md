# `assets/client/godot/edgegap_matchmaker.gd`

Template file. Write the content of the code block below, without the fences, to `edgegap_matchmaker.gd`.

```gdscript
class_name EdgegapMatchmaker
extends Node

## Edgegap matchmaker client (matchmaker 3.x ticket API). Works on desktop and web exports.
##
##   POST   {url}/tickets        { profile, attributes }  -> { id, status }
##   GET    {url}/tickets/{id}   SEARCHING | MATCH_FOUND | HOST_ASSIGNED (+ assignment) | CANCELLED
##   DELETE {url}/tickets/{id}   leave the queue
##
## Header: Authorization: the matchmaker Auth Token, raw. It is made to ship in game clients: it only
## creates and reads tickets and grants no access to the Edgegap account. Web exports also need their
## page origin in the matchmaker config's allowed_cors_origins.

signal status_changed(text: String)

var url: String
var token: String
var profile: String
var port_name := "gameport"
var poll_seconds := 2.0

var _ticket_id := ""
var _cancelled := false


func _init(p_url: String, p_token: String, p_profile: String = "casual") -> void:
	url = p_url.strip_edges().trim_suffix("/")
	token = p_token.strip_edges()
	profile = p_profile


## Queues one player. Returns the game server's wss:// URL, or "" on failure (see the last status).
func find_match() -> String:
	_cancelled = false
	status_changed.emit("Joining queue...")
	var created = await _request(HTTPClient.METHOD_POST, "/tickets", {"profile": profile, "attributes": {}})
	if created == null or not created.has("id"):
		return ""
	_ticket_id = created["id"]
	var started := Time.get_ticks_msec()

	while not _cancelled:
		await get_tree().create_timer(poll_seconds).timeout
		if _cancelled:
			break
		var t = await _request(HTTPClient.METHOD_GET, "/tickets/" + _ticket_id.uri_encode())
		if t == null:
			return ""
		match t.get("status", ""):
			"SEARCHING":
				status_changed.emit("Searching for players... %ds" % ((Time.get_ticks_msec() - started) / 1000))
			"TEAM_FOUND", "MATCH_FOUND":
				status_changed.emit("Match found, starting server...")
			"HOST_ASSIGNED":
				_ticket_id = ""  # matched: a DELETE now would only get a 409
				var a: Dictionary = t.get("assignment", {})
				var port := int(a.get("ports", {}).get(port_name, {}).get("external", 0))
				if a.get("fqdn", "") == "" or port == 0:
					status_changed.emit("Assignment has no %s" % port_name)
					return ""
				# TLS Upgrade on the port: connect by fqdn, the certificate matches it.
				return "wss://%s:%d" % [a["fqdn"], port]
			"CANCELLED":
				_ticket_id = ""
				status_changed.emit("Ticket expired before a match was found")
				return ""
			var other:
				status_changed.emit("Unexpected ticket status %s" % other)
				return ""
	return ""


## Leaves the queue. Safe to call any time.
func cancel() -> void:
	_cancelled = true
	if _ticket_id == "":
		return
	var id := _ticket_id
	_ticket_id = ""
	_request(HTTPClient.METHOD_DELETE, "/tickets/" + id.uri_encode())


func _request(method: int, path: String, body = null):
	var http := HTTPRequest.new()
	add_child(http)
	var headers := PackedStringArray(["Authorization: " + token])
	var data := ""
	if body != null:
		headers.append("Content-Type: application/json")
		data = JSON.stringify(body)
	var err := http.request(url + path, headers, method, data)
	if err != OK:
		http.queue_free()
		status_changed.emit("Matchmaker request failed (%d)" % err)
		return null
	var res: Array = await http.request_completed  # [result, code, headers, body]
	http.queue_free()
	var code: int = res[1]
	var text: String = res[3].get_string_from_utf8()
	if res[0] != HTTPRequest.RESULT_SUCCESS or code < 200 or code >= 300:
		status_changed.emit("Matchmaker HTTP %d %s" % [code, text])
		return null
	if text == "":
		return {}
	return JSON.parse_string(text)
```
