#!/usr/bin/env bash
# Local parity battery for a game server image: run it the way Edgegap does before paying for a
# deployment. Engine-agnostic; configure with environment variables.
#
#   IMAGE=mygame:dev PORT=7777 PROTO=udp READY='READY' bash parity.sh
#
#   IMAGE        image to test (required; build it with --platform linux/amd64 first)
#   PORT         internal port the server binds (default 7777)
#   PROTO        tcp (also WS/HTTP) or udp (default tcp)
#   READY        extended regex for the line printed once the server accepts players (default READY)
#   EXTERNAL     host port standing in for Edgegap's random external port (default 31504)
#   GRACE        seconds between SIGTERM and SIGKILL, = the version's termination grace period (default 5)
#   ENV_FILE     optional docker --env-file with the version's own env vars
#   CLIENT_CMD   optional command that plays a match against $SERVER_HOST:$SERVER_PORT and exits 0 on success
#   SELF_STOP_ENV optional "KEY=VALUE" that makes the server give up quickly when nobody joins
#                (e.g. FIRST_JOIN_TIMEOUT_S=5); enables the self-stop check
#
# Checks: 1 boots and prints READY (time to READY) | 2 random external port (+ CLIENT_CMD) |
# 3 two servers on one host | 4 nothing secret in the logs | 5 SIGTERM drain before SIGKILL |
# 6 self-stop path when "on Edgegap" without a delete URL (SELF_STOP_ENV only).
set -euo pipefail

: "${IMAGE:?set IMAGE}"
PORT="${PORT:-7777}"; PROTO="${PROTO:-tcp}"; READY="${READY:-READY}"
EXTERNAL="${EXTERNAL:-31504}"; GRACE="${GRACE:-5}"
envfile=(); [ -n "${ENV_FILE:-}" ] && envfile=(--env-file "$ENV_FILE")
names=(parity-a parity-b parity-c)
cleanup() { docker rm -f "${names[@]}" >/dev/null 2>&1 || true; }
fail() { echo "FAIL: $*"; echo "--- last log lines (parity-a):"; docker logs --tail 20 parity-a 2>&1 || true; cleanup; exit 1; }
trap cleanup EXIT
cleanup

edgegap_env=(-e "ARBITRIUM_PORT_GAMEPORT_INTERNAL=$PORT" -e "ARBITRIUM_PORT_GAMEPORT_EXTERNAL=$EXTERNAL" -e "ARBITRIUM_PORT_GAMEPORT_PROTOCOL=${PROTO^^}")
wait_ready() { for _ in $(seq 1 300); do docker logs "$1" 2>&1 | grep -qE "$READY" && return 0; docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null | grep -q true || return 1; sleep 0.2; done; return 1; }

echo "1. boot"
t0=$(date +%s%N)
docker run -d --name parity-a --platform linux/amd64 "${envfile[@]}" "${edgegap_env[@]}" -p "$EXTERNAL:$PORT/$PROTO" "$IMAGE" >/dev/null
wait_ready parity-a || fail "no line matching /$READY/ (empty logs on Edgegap too if the server logs to a file)"
echo "   READY after $(( ($(date +%s%N) - t0) / 1000000 )) ms"

echo "2. random external port ($EXTERNAL -> $PORT/$PROTO)"
if [ -n "${CLIENT_CMD:-}" ]; then
  SERVER_HOST=127.0.0.1 SERVER_PORT=$EXTERNAL bash -c "$CLIENT_CMD" || fail "CLIENT_CMD failed against 127.0.0.1:$EXTERNAL"
  echo "   client played on the mapped port"
elif [ "$PROTO" = tcp ]; then
  (exec 3<>"/dev/tcp/127.0.0.1/$EXTERNAL") 2>/dev/null || fail "nothing accepts TCP on the mapped port"
  echo "   accepts connections (set CLIENT_CMD to play a real match)"
else
  echo "   skipped: UDP needs a real client (set CLIENT_CMD)"
fi

echo "3. a second server on the same host"
docker run -d --name parity-b --platform linux/amd64 "${envfile[@]}" -p "$((EXTERNAL + 1)):$PORT/$PROTO" "$IMAGE" >/dev/null
wait_ready parity-b || fail "second server never READY (fixed second port, lock file, shared path?)"
docker inspect -f '{{.State.Running}}' parity-a | grep -q true || fail "first server died when the second started"
echo "   both READY"
docker stats --no-stream --format "   {{.Name}}: CPU {{.CPUPerc}}, memory {{.MemUsage}}" parity-a parity-b

echo "4. logs"
if docker logs parity-a 2>&1 | grep -iE "ARBITRIUM_DELETE_TOKEN|ARBITRIUM_CONTEXT_TOKEN|api[_-]?token|password=|secret="; then fail "secret-looking line in the logs (env dump?)"; fi
echo "   nothing secret"

echo "5. SIGTERM drain (grace ${GRACE}s)"
docker rm -f parity-b >/dev/null
s0=$(date +%s)
docker stop --time "$GRACE" parity-a >/dev/null
took=$(( $(date +%s) - s0 ))
code=$(docker inspect -f '{{.State.ExitCode}}' parity-a)
[ "$code" != 137 ] || fail "killed by SIGKILL after ${took}s: PID 1 is not the server (shell-form CMD, npm start) or SIGTERM is not handled"
echo "   exited with code $code ${took}s after SIGTERM"

if [ -n "${SELF_STOP_ENV:-}" ]; then
  echo "6. self-stop when nobody joins (simulated Edgegap, no delete URL)"
  docker run -d --name parity-c --platform linux/amd64 "${envfile[@]}" -e ARBITRIUM_REQUEST_ID=local-parity -e "$SELF_STOP_ENV" "$IMAGE" >/dev/null
  timeout 120 docker wait parity-c >/dev/null || fail "server still running 120s later: it never stops on its own"
  echo "   stopped itself, exit code $(docker inspect -f '{{.State.ExitCode}}' parity-c)"
fi

echo "PASS"
