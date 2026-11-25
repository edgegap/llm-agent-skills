# `assets/br200/scripts/run-local.sh`

Template file. Write the content of the code block below, without the fences, to `run-local.sh`.

```bash
#!/usr/bin/env bash
# Runs the packaged image the way Edgegap would, with the same injected
# variables, so the start script takes its real code path.
# Usage: scripts/run-local.sh [photon-region]   (default: auto from the fake location)
# Then join from two editors: Menu scene, or Standalone Manager with the session
# name printed below and the same region.
set -euo pipefail

id="local$(date +%s)"
args=(-e "ARBITRIUM_REQUEST_ID=$id"
      -e "ARBITRIUM_PORT_GAMEPORT_INTERNAL=7777"
      -e "ARBITRIUM_PORT_GAMEPORT_EXTERNAL=7777"
      -e "ARBITRIUM_PUBLIC_IP=127.0.0.1"
      -e 'ARBITRIUM_DEPLOYMENT_LOCATION={"city": "Amsterdam", "country": "Netherlands", "latitude": 52.37, "longitude": 4.9}')
[[ -z "${1:-}" ]] || args+=(-e "BR200_REGION=$1")
for v in BR200_MAX_PLAYERS BR200_MODE BR200_SCENE BR200_LOBBY BR200_FPS BR200_RECORD BR200_EXTRA_ARGS; do
    [[ -z "${!v:-}" ]] || args+=(-e "$v=${!v}")
done

echo "Session name: $id.pr.edgegap.net   (Ctrl+C stops the server)"
docker run --rm -it -p 7777:7777/udp "${args[@]}" br200-edgegap:local
```
