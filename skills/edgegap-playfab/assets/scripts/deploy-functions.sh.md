# `assets/scripts/deploy-functions.sh`

Template file. Write the content of the code block below, without the fences, to `deploy-functions.sh`.

```bash
#!/usr/bin/env bash
# Package and deploy the bridge functions to an existing Azure Function App (Node 22, Flex Consumption),
# then set the app settings, including EDGEGAP_READY_WEBHOOK_URL with EdgegapDeploymentReady's function key.
# Secrets come from the environment and go straight into app settings; nothing secret is printed.
#
#   RG=<resource group> APP=<function app> \
#   PLAYFAB_TITLE_ID=... PLAYFAB_SECRET_KEY=... EDGEGAP_API_TOKEN=... \
#   EDGEGAP_APP_NAME=<app> EDGEGAP_APP_VERSION=<version> \
#   [EDGEGAP_QUEUES=<queue,queue>  only these PlayFab queues get Edgegap servers; unset = all] \
#   [START_URL_FILE=<file to receive the StartEdgegapDeployment URL, for playfab-setup.mjs>] \
#   ./deploy-functions.sh <path to the azure-functions folder>
set -euo pipefail
SRC="${1:-.}"
: "${RG:?set RG}" "${APP:?set APP}"
: "${PLAYFAB_TITLE_ID:?}" "${PLAYFAB_SECRET_KEY:?}" "${EDGEGAP_API_TOKEN:?}" "${EDGEGAP_APP_NAME:?}" "${EDGEGAP_APP_VERSION:?}"
AZ="${AZ:-az}"
PY="$(command -v python3 || command -v python)"
ZIP="$(mktemp -d)/bridge.zip"

(cd "$SRC" && npm ci --omit=dev --silent)

# Flex Consumption runs the package as is: host.json, package.json, src/ and node_modules/.
"$PY" - "$SRC" "$ZIP" <<'PYTHON'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root in ['host.json', 'package.json', 'src', 'node_modules']:
        path = os.path.join(src, root)
        if os.path.isfile(path):
            z.write(path, root)
            continue
        for d, _, files in os.walk(path):
            for f in files:
                full = os.path.join(d, f)
                z.write(full, os.path.relpath(full, src))
PYTHON

"$AZ" functionapp deployment source config-zip -g "$RG" -n "$APP" --src "$ZIP" -o none
echo "Deployed. Functions: $("$AZ" functionapp function list -g "$RG" -n "$APP" --query "[].name" -o tsv | tr '\n' ' ')"

key() { "$AZ" functionapp function keys list -g "$RG" -n "$APP" --function-name "$1" --query default -o tsv; }

"$AZ" functionapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  "PLAYFAB_TITLE_ID=$PLAYFAB_TITLE_ID" \
  "PLAYFAB_SECRET_KEY=$PLAYFAB_SECRET_KEY" \
  "EDGEGAP_API_TOKEN=${EDGEGAP_API_TOKEN#token }" \
  "EDGEGAP_APP_NAME=$EDGEGAP_APP_NAME" \
  "EDGEGAP_APP_VERSION=$EDGEGAP_APP_VERSION" \
  "EDGEGAP_PORT_NAME=${EDGEGAP_PORT_NAME:-gameport}" \
  "EDGEGAP_QUEUES=${EDGEGAP_QUEUES:-}" \
  "EDGEGAP_READY_WEBHOOK_URL=https://$APP.azurewebsites.net/api/EdgegapDeploymentReady?code=$(key EdgegapDeploymentReady)"
echo "App settings set."

if [ -n "${START_URL_FILE:-}" ]; then
  printf 'https://%s.azurewebsites.net/api/StartEdgegapDeployment?code=%s' "$APP" "$(key StartEdgegapDeployment)" > "$START_URL_FILE"
  echo "StartEdgegapDeployment URL written to $START_URL_FILE (it holds the function key: don't commit it)."
fi
```
