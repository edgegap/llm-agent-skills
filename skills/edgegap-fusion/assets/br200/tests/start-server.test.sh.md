# `assets/br200/tests/start-server.test.sh`

Template file. Write the content of the code block below, without the fences, to `start-server.test.sh`.

```bash
#!/usr/bin/env bash
# Tests edgegap/start-server.sh against a stand-in server binary.
# No Unity build or BR200 needed. Run: bash tests/start-server.test.sh
# CI or a second check: scripts/test-in-container.sh runs the same file in ubuntu:22.04.

set -u
cd "$(dirname "$0")/.."
SCRIPT="$PWD/edgegap/start-server.sh"
TMP="$PWD/tests/.tmp"
rm -rf "$TMP" && mkdir -p "$TMP"

# Stand-in for the Unity server: records its arguments, then sleeps or exits.
cat > "$TMP/ServerBuild" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FAKE_ARGS"
trap 'echo TERM >> "$FAKE_ARGS"; exit 0' TERM
if [[ -n "${FAKE_SLEEP:-}" ]]; then sleep "$FAKE_SLEEP" & wait $!; fi
exit "${FAKE_EXIT:-0}"
EOF
# Stand-in for curl: records the self-stop request.
cat > "$TMP/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FAKE_CURL"
EOF
chmod +x "$TMP/ServerBuild" "$TMP/curl"

MONTREAL='{"city": "Montreal", "country": "Canada", "continent": "North America", "latitude": 45.5088, "longitude": -73.5878}'
FRANKFURT='{"city": "Frankfurt", "country": "Germany", "continent": "Europe", "latitude": 50.1109, "longitude": 8.6821}'
DALLAS='{"city": "Dallas", "country": "United States", "continent": "North America", "latitude": 32.7767, "longitude": -96.797}'
SYDNEY='{"city": "Sydney", "country": "Australia", "continent": "Oceania", "latitude": -33.8688, "longitude": 151.2093}'

pass=0 fail=0
run() { # run <env assignments...>: runs the script in a clean environment
    rm -f "$TMP/args" "$TMP/curlreq"
    env -i PATH="$PATH" BR200_BINARY="$TMP/ServerBuild" BR200_CURL="$TMP/curl" \
        FAKE_ARGS="$TMP/args" FAKE_CURL="$TMP/curlreq" "$@" bash "$SCRIPT" > "$TMP/out" 2>&1
}
edgegap() { # an Edgegap deployment with the given location
    run ARBITRIUM_REQUEST_ID=f68e011bfb01 ARBITRIUM_DEPLOYMENT_LOCATION="$1" \
        ARBITRIUM_PORT_GAMEPORT_INTERNAL=7777 ARBITRIUM_PUBLIC_IP=203.0.113.10 \
        ARBITRIUM_PORT_GAMEPORT_EXTERNAL=31502 "${@:2}"
}
arg_after() { grep -A1 -x -- "$1" "$TMP/args" | sed -n 2p; }
check() { # check <name> <condition...>
    local name="$1"; shift
    if "$@"; then pass=$((pass + 1)); echo "ok   $name"
    else fail=$((fail + 1)); echo "FAIL $name"; sed 's/^/     | /' "$TMP/out"; fi
}
is() { [[ "$1" == "$2" ]] || { echo "     expected '$2', got '$1'"; return 1; }; }

# Session, server name, address and port come from Edgegap.
edgegap "$MONTREAL"
check "session name is the deployment FQDN" is "$(arg_after -sessionName)" f68e011bfb01.pr.edgegap.net
check "server name defaults to the session name" is "$(arg_after -serverName)" f68e011bfb01.pr.edgegap.net
check "binds 0.0.0.0 (BR200's -ip is the bind address)" is "$(arg_after -ip)" 0.0.0.0
check "binds the internal game port" is "$(arg_after -port)" 7777
check "passes no public address (Fusion discovers it)" bash -c "! grep -qx -- -publicIP '$TMP/args'"
check "runs as a dedicated server" grep -qx -- -dedicatedServer "$TMP/args"
check "logs to stdout" is "$(arg_after -logFile)" -
check "200 players by default" is "$(arg_after -maxPlayers)" 200
check "no scene unless asked (Loader's Batch Mode Scene applies)" bash -c "! grep -qx -- -scene '$TMP/args'"
check "boot line shows the public address" grep -q "public=203.0.113.10:31502" "$TMP/out"
check "boot line shows bind and public address" grep -q "bind=0.0.0.0:7777/udp public=203.0.113.10:31502" "$TMP/out"

# Port lookup.
MAPPING='{"ports": {"Game Port": {"name": "Game Port", "internal": 7777, "external": 30411, "protocol": "UDP", "tls_upgrade": false}, "web": {"name": "web", "internal": 8080, "external": 30999, "protocol": "TCP"}}}'
run ARBITRIUM_REQUEST_ID=abc ARBITRIUM_DEPLOYMENT_LOCATION="$FRANKFURT" ARBITRIUM_PUBLIC_IP=203.0.113.10 \
    ARBITRIUM_PORTS_MAPPING="$MAPPING"
check "ports mapping: finds the UDP port whatever its name" grep -q "public=203.0.113.10:30411" "$TMP/out"
run ARBITRIUM_REQUEST_ID=abc ARBITRIUM_DEPLOYMENT_LOCATION="$FRANKFURT" ARBITRIUM_PUBLIC_IP=203.0.113.10 \
    ARBITRIUM_PORTS_MAPPING="$MAPPING"
check "ports mapping: binds the internal port" is "$(arg_after -port)" 7777

# Photon region follows the deployment location.
edgegap "$MONTREAL";  check "Montreal -> cae" is "$(arg_after -region)" cae
edgegap "$FRANKFURT"; check "Frankfurt -> eu" is "$(arg_after -region)" eu
edgegap "$DALLAS";    check "Dallas -> ussc" is "$(arg_after -region)" ussc
edgegap "$SYDNEY";    check "Sydney -> au" is "$(arg_after -region)" au
edgegap "$MONTREAL" BR200_REGION_ALLOWLIST="eu, us, usw"
check "allowlist: Montreal -> us" is "$(arg_after -region)" us
edgegap "$FRANKFURT" BR200_REGION=USW
check "explicit region wins, case-insensitive" is "$(arg_after -region)" usw
edgegap "$FRANKFURT" BR200_REGION=best
check "region=best leaves the choice to Fusion" bash -c "! grep -qx -- -region '$TMP/args'"

# Optional settings.
edgegap "$FRANKFURT" BR200_MAX_PLAYERS=40 BR200_MODE=deathmatch BR200_SCENE=GenArea7 \
    BR200_LOBBY=edgegap BR200_FPS=30 BR200_RECORD=true BR200_EXTRA_ARGS="-foo bar"
check "max players" is "$(arg_after -maxPlayers)" 40
check "game mode flag" grep -qx -- -deathmatch "$TMP/args"
check "scene" is "$(arg_after -scene)" GenArea7
check "lobby" is "$(arg_after -lobby)" edgegap
check "fps" is "$(arg_after -fps)" 30
check "record session writes to /data" is "$(arg_after -dataPath)" /data
check "extra args go last" is "$(tail -n 2 "$TMP/args" | tr '\n' ' ')" "-foo bar "

# Bad configuration fails before the server starts.
for bad in "BR200_MAX_PLAYERS=0" "BR200_MAX_PLAYERS=201" "BR200_MODE=coop" "BR200_REGION=mars" \
           "BR200_EXTRA_ARGS=-client" "BR200_EXTRA_ARGS=-port 9000" "BR200_EXTRA_ARGS=-ip 127.0.0.1" "BR200_REGION_ALLOWLIST=nowhere" "BR200_FPS=fast"; do
    edgegap "$FRANKFURT" "$bad"
    check "rejects $bad" bash -c "[[ ! -e '$TMP/args' ]] && grep -q error '$TMP/out'"
done
run ARBITRIUM_DEPLOYMENT_LOCATION="$FRANKFURT"
check "needs a session name outside Edgegap" grep -q "no session name" "$TMP/out"
run BR200_SESSION=local-test
check "auto region needs a location outside Edgegap" grep -q "needs ARBITRIUM_DEPLOYMENT_LOCATION" "$TMP/out"
run BR200_SESSION=local-test BR200_REGION=eu BR200_PORT=7000
check "runs locally with explicit values" is "$(arg_after -port)" 7000

# Self-stop and signals.
edgegap "$FRANKFURT" ARBITRIUM_DELETE_URL=https://api.edgegap.com/v1/self/stop/abc ARBITRIUM_DELETE_TOKEN=secret-token
check "match end calls the self-stop URL" grep -qx https://api.edgegap.com/v1/self/stop/abc "$TMP/curlreq"
check "self-stop sends the delete token" grep -qx "Authorization: secret-token" "$TMP/curlreq"
check "never prints the delete token" bash -c "! grep -q secret-token '$TMP/out'"

edgegap "$FRANKFURT" ARBITRIUM_DELETE_URL=https://x ARBITRIUM_DELETE_TOKEN=t BR200_SELF_STOP=false
check "BR200_SELF_STOP=false skips self-stop" bash -c "[[ ! -e '$TMP/curlreq' ]]"

edgegap "$FRANKFURT" FAKE_EXIT=3
check "exit code of the server is kept" grep -q "exited with code 3" "$TMP/out"

rm -f "$TMP/args" "$TMP/curlreq"
env -i PATH="$PATH" BR200_BINARY="$TMP/ServerBuild" BR200_CURL="$TMP/curl" FAKE_ARGS="$TMP/args" \
    FAKE_CURL="$TMP/curlreq" FAKE_SLEEP=30 ARBITRIUM_REQUEST_ID=sig ARBITRIUM_DEPLOYMENT_LOCATION="$FRANKFURT" ARBITRIUM_PUBLIC_IP=203.0.113.10 \
    ARBITRIUM_DELETE_URL=https://x ARBITRIUM_DELETE_TOKEN=t bash "$SCRIPT" > "$TMP/out" 2>&1 &
pid=$!
for _ in $(seq 50); do [[ -s "$TMP/args" ]] && break; sleep 0.1; done
kill -TERM "$pid"; wait "$pid"
check "SIGTERM reaches the server" grep -qx TERM "$TMP/args"
check "no self-stop when Edgegap is already stopping it" bash -c "[[ ! -e '$TMP/curlreq' ]]"

echo; echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
```
