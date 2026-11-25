# `assets/br200/edgegap/start-server.sh`

Template file. Write the content of the code block below, without the fences, to `start-server.sh`.

```bash
#!/usr/bin/env bash
# Starts the BR200 dedicated server inside an Edgegap deployment.
#
# Turns Edgegap's injected variables (ARBITRIUM_*) and the optional BR200_*
# variables into BR200's own command-line options, so the sample's C# code
# stays untouched. See README.md, "Runtime variables".

set -uo pipefail

BINARY="${BR200_BINARY:-/srv/br200/ServerBuild}"
CURL="${BR200_CURL:-curl}"

log() { printf '[edgegap-br200] %s\n' "$*"; }
die() { printf '[edgegap-br200] error: %s\n' "$*" >&2; exit 2; }

# --- Photon region ----------------------------------------------------------
# Photon Cloud regions that Fusion can use, with the city each one runs in.
# The Chinese mainland region (cn) is left out: it has to be unlocked by Photon.
PHOTON_REGIONS='
asia 1.35 103.82
au -33.87 151.21
cae 45.50 -73.57
eu 52.37 4.90
hk 22.32 114.17
in 13.08 80.27
jp 35.68 139.69
kr 37.57 126.98
sa -23.55 -46.63
tr 41.01 28.98
uae 25.20 55.27
us 38.91 -77.04
usw 37.34 -121.89
ussc 32.78 -96.80
za -26.20 28.05
'

json_number() { # json_number <key> <json>: first numeric value of "key"
    printf '%s' "$2" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\(-\{0,1\}[0-9][0-9.]*\).*/\1/p" | head -n 1
}

json_string() { # json_string <key> <json>
    printf '%s' "$2" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# Picks the Photon region closest (great-circle distance) to lat/lon,
# restricted to the comma-separated allowlist when one is given.
nearest_region() {
    printf '%s' "$PHOTON_REGIONS" | awk -v lat="$1" -v lon="$2" -v allow="$3" '
        BEGIN { rad = atan2(0, -1) / 180; best = ""; n = split(allow, a, ",")
                for (i = 1; i <= n; i++) { gsub(/ /, "", a[i]); if (a[i] != "") ok[tolower(a[i])] = 1 } }
        NF == 3 {
            if (n > 0 && !($1 in ok)) next
            dlat = ($2 - lat) * rad; dlon = ($3 - lon) * rad
            h = sin(dlat / 2) ^ 2 + cos(lat * rad) * cos($2 * rad) * sin(dlon / 2) ^ 2
            d = atan2(sqrt(h), sqrt(1 - h))
            if (best == "" || d < bestd) { best = $1; bestd = d }
        }
        END { print best }'
}

resolve_region() {
    local wanted="${BR200_REGION:-auto}"
    case "$wanted" in
        best)
            REGION=""   # let Fusion ping and pick; clients must then do the same
            return ;;
        auto)
            local location="${ARBITRIUM_DEPLOYMENT_LOCATION:-}" lat lon
            lat="$(json_number latitude "$location")"
            lon="$(json_number longitude "$location")"
            [[ -n "$lat" && -n "$lon" ]] || die "BR200_REGION=auto needs ARBITRIUM_DEPLOYMENT_LOCATION; set BR200_REGION to a Photon region code outside Edgegap"
            REGION="$(nearest_region "$lat" "$lon" "${BR200_REGION_ALLOWLIST:-}")"
            [[ -n "$REGION" ]] || die "BR200_REGION_ALLOWLIST matches no Photon region"
            REGION_SOURCE="nearest to $(json_string city "$location") ($lat, $lon)" ;;
        *)
            REGION="$(printf '%s' "$wanted" | tr '[:upper:]' '[:lower:]')"
            printf '%s' "$PHOTON_REGIONS" | awk '{print $1}' | grep -qx "$REGION" \
                || [[ "$REGION" == cn ]] \
                || die "BR200_REGION=$wanted is not a Photon region code"
            REGION_SOURCE="set by BR200_REGION" ;;
    esac
}

# --- Configuration ----------------------------------------------------------
REQUEST_ID="${ARBITRIUM_REQUEST_ID:-}"
FQDN="${BR200_FQDN:-${REQUEST_ID:+$REQUEST_ID.pr.edgegap.net}}"

SESSION="${BR200_SESSION:-$FQDN}"
[[ -n "$SESSION" ]] || die "no session name: run on Edgegap (ARBITRIUM_REQUEST_ID) or set BR200_SESSION"
SERVER_NAME="${BR200_SERVER_NAME:-$SESSION}"

# --- Address and port -------------------------------------------------------
# Edgegap gives each deployment a public IP and maps a random public port to
# the fixed port the server listens on (7777). ARBITRIUM_PORTS_MAPPING lists
# both whatever the port is named; the first UDP entry is the game port.
udp_entry="$(printf '%s' "${ARBITRIUM_PORTS_MAPPING:-}" | tr '}' '\n' \
    | grep -i '"protocol"[[:space:]]*:[[:space:]]*"udp"' | head -n 1)"
MAP_INTERNAL="$(json_number internal "$udp_entry")"
MAP_EXTERNAL="$(json_number external "$udp_entry")"

PORT="${ARBITRIUM_PORT_GAMEPORT_INTERNAL:-${MAP_INTERNAL:-${BR200_PORT:-7777}}}"
PUBLIC_PORT="${ARBITRIUM_PORT_GAMEPORT_EXTERNAL:-${MAP_EXTERNAL:-$PORT}}"
PUBLIC_IP="${ARBITRIUM_PUBLIC_IP:-}"
for p in "$PORT" "$PUBLIC_PORT"; do
    [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= 65535 )) || die "port must be 1-65535, got '$p'"
done

# BR200's -ip/-port set Fusion's *bind* address (StartGameArgs.Address), so the
# server binds 0.0.0.0. Fusion then finds its public address itself and clients
# connect Direct. Binding 127.0.0.1 forces every client through a Photon relay,
# and binding the public IP fails: the container doesn't own that address.

PLAYERS="${BR200_MAX_PLAYERS:-200}"
[[ "$PLAYERS" =~ ^[0-9]+$ ]] && (( PLAYERS >= 1 && PLAYERS <= 200 )) || die "BR200_MAX_PLAYERS must be 1-200, got '$PLAYERS'"

REGION="" REGION_SOURCE="Fusion best-region ping"
resolve_region

args=(-batchmode -nographics -logFile - -dedicatedServer
      -ip 0.0.0.0 -port "$PORT"
      -sessionName "$SESSION" -serverName "$SERVER_NAME"
      -maxPlayers "$PLAYERS")
[[ -z "$REGION" ]] || args+=(-region "$REGION")

case "${BR200_MODE:-}" in
    "") ;;
    battleRoyale|deathmatch|elimination) args+=("-$BR200_MODE") ;;
    *) die "BR200_MODE must be battleRoyale, deathmatch or elimination" ;;
esac
[[ -z "${BR200_SCENE:-}" ]] || args+=(-scene "$BR200_SCENE")
[[ -z "${BR200_LOBBY:-}" ]] || args+=(-lobby "$BR200_LOBBY")
if [[ -n "${BR200_FPS:-}" ]]; then
    [[ "$BR200_FPS" =~ ^[0-9]+$ ]] || die "BR200_FPS must be a whole number"
    args+=(-fps "$BR200_FPS")
fi
if [[ "${BR200_RECORD:-false}" == true ]]; then
    args+=(-recordSession -dataPath "${BR200_DATA_PATH:-/data}")
fi

# BR200 keeps the first copy of an option it sees, so extra arguments must not
# try to override the ones above. They are passed after everything else.
if [[ -n "${BR200_EXTRA_ARGS:-}" ]]; then
    read -r -a extra <<< "$BR200_EXTRA_ARGS"
    for a in "${extra[@]}"; do
        case "$a" in
            -client|-host|-ip|-port|-sessionName|-serverName|-region|-maxPlayers|-dedicatedServer)
                die "BR200_EXTRA_ARGS cannot contain $a; use the matching BR200_* variable" ;;
        esac
    done
    args+=("${extra[@]}")
fi

[[ -x "$BINARY" ]] || die "server binary not found or not executable: $BINARY"

# Never print the environment: ARBITRIUM_DELETE_TOKEN would end up in the logs.
log "deployment=${REQUEST_ID:-local} session=$SESSION bind=0.0.0.0:$PORT/udp public=${PUBLIC_IP:-?}:$PUBLIC_PORT"
log "photon_region=${REGION:-best} ($REGION_SOURCE) max_players=$PLAYERS mode=${BR200_MODE:-default} scene=${BR200_SCENE:-default}"

# --- Run, forward stop signals, stop the deployment when the match ends -----
stopping=false
forward() { stopping=true; log "received $1, stopping BR200"; kill -s "$1" "$child" 2>/dev/null; }

"$BINARY" "${args[@]}" &
child=$!
trap 'forward TERM' TERM
trap 'forward INT' INT

# wait returns early when a trapped signal arrives; keep waiting for the child.
while :; do
    wait "$child"; status=$?
    kill -0 "$child" 2>/dev/null || break
done
log "BR200 exited with code $status"

if [[ "$stopping" == false && "${BR200_SELF_STOP:-true}" == true \
      && -n "${ARBITRIUM_DELETE_URL:-}" && -n "${ARBITRIUM_DELETE_TOKEN:-}" ]]; then
    log "match over, asking Edgegap to stop this deployment"
    "$CURL" -fsS -X DELETE -H "Authorization: $ARBITRIUM_DELETE_TOKEN" "$ARBITRIUM_DELETE_URL" >/dev/null \
        || log "self-stop request failed; restart_policy=never still ends the deployment"
fi
exit "$status"
```
