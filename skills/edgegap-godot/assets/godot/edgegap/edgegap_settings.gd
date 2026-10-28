class_name EdgegapGameSettings
extends RefCounted

## Edgegap settings shared by the server lifecycle and the matchmaker client.
## Edit the constants, or override them with environment variables at launch
## (handy for test builds and for the app version's env vars on Edgegap).
##
## The matchmaker Auth Token is the matchmaker's client token: it is meant to
## ship in game clients and grants no access to the Edgegap account. Never put
## the Edgegap API token (dashboard → User Settings → Tokens) in a Godot project.

enum Transport { ENET, WEBSOCKET }

## ENET = ENetMultiplayerPeer (UDP; app version port protocol UDP).
## WEBSOCKET = WebSocketMultiplayerPeer (TCP; app version port protocol WS,
## with TLS Upgrade on for web exports and any wss:// client).
const TRANSPORT := Transport.ENET
## Port the server binds inside the container. Must equal the app version's
## internal port (and the plugin dock's Docker run parameters). Env: EDGEGAP_PORT.
const PORT := 7777
## Port name on the app version. The client reads the external port by name.
const PORT_NAME := "gameport"
## WebSocket only: true when the app version's port has TLS Upgrade on, so
## clients connect with wss://. Required for web exports served over https.
const USE_TLS := true

## Matchmaker (dashboard → Matchmaker → your matchmaker: API URL, Auth Token).
## Env: EDGEGAP_MATCHMAKER_URL, EDGEGAP_MATCHMAKER_TOKEN.
const MATCHMAKER_URL := ""
const MATCHMAKER_AUTH_TOKEN := ""
## Profile name in matchmaker-config.json. Env: EDGEGAP_MATCHMAKER_PROFILE.
const PROFILE := "casual"
const POLL_SECONDS := 2.0
## The client gives up (and deletes its ticket) after this long.
const SEARCH_TIMEOUT_SECONDS := 300.0

## Server lifecycle (seconds). Env: EDGEGAP_START_GRACE, EDGEGAP_JOIN_TIMEOUT,
## EDGEGAP_EMPTY_GRACE, EDGEGAP_END_GRACE.
## Start short-handed this long after the first player joined.
const START_GRACE_SECONDS := 30.0
## Stop the deployment if nobody joins within this time.
const JOIN_TIMEOUT_SECONDS := 120.0
## Stop when every player has been gone this long.
const EMPTY_GRACE_SECONDS := 30.0
## After match_ended(), wait this long (results screen) before stopping.
const END_GRACE_SECONDS := 15.0


static func transport() -> Transport:
	match _env("EDGEGAP_TRANSPORT").to_lower():
		"enet", "udp":
			return Transport.ENET
		"websocket", "ws":
			return Transport.WEBSOCKET
	return TRANSPORT


static func port() -> int:
	var value := _env("EDGEGAP_PORT")
	return int(value) if value.is_valid_int() else PORT


static func matchmaker_url() -> String:
	return _env_or("EDGEGAP_MATCHMAKER_URL", MATCHMAKER_URL).trim_suffix("/")


static func auth_token() -> String:
	return _env_or("EDGEGAP_MATCHMAKER_TOKEN", MATCHMAKER_AUTH_TOKEN)


static func profile() -> String:
	return _env_or("EDGEGAP_MATCHMAKER_PROFILE", PROFILE)


static func is_matchmaker_configured() -> bool:
	return not matchmaker_url().is_empty() and not auth_token().is_empty()


static func seconds(key: String, fallback: float) -> float:
	var value := _env(key)
	return float(value) if value.is_valid_float() else fallback


static func _env(key: String) -> String:
	return OS.get_environment(key).strip_edges()


static func _env_or(key: String, fallback: String) -> String:
	var value := _env(key)
	return value if not value.is_empty() else fallback
