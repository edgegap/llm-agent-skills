# Azure Functions (the bridge)

`assets/azure-functions/` is a Node.js 22 Function App (v4 programming model, `@azure/functions` only, global `fetch`, no PlayFab or Edgegap SDK):

| Function | Called by | Does |
| --- | --- | --- |
| `StartEdgegapDeployment` | The PlayFab rule on `match_found` (or `ExecuteFunction` with `FunctionArgument: {MatchId, QueueName}`) | `Match/GetMatch` + `Profile/GetProfiles` with the title entity token from the context, then `Server/GetPlayerProfile` locations. Then `POST /v2/deployments` with `geo_coordinates` users, tags `[matchId[0..20], "playfab"]`, env `PLAYFAB_MATCH_ID` / `PLAYFAB_QUEUE_NAME` and the hidden `EDGEGAP_JOIN_TOKENS` (one token per member, from `src/lib/join.js`), and `webhook_on_ready` / `webhook_on_error` pointing at the next function. Returns in about 1 to 2 s. |
| `EdgegapDeploymentReady` | Edgegap's webhooks (`?matchId=&queue=`, plus `&failed=true` for errors) | `GET /v1/status/{request_id}` from the Edgegap API, a check of the match tag, re-reading the members from PlayFab, then `Server/UpdateUserReadOnlyData` key `EdgegapServer` = `{"matchId","status":"ready","host","port","requestId","joinToken"}`, each player getting their own token (or `status:"error"` with a message). |

Both use `authLevel: 'function'`: the key is in the URL PlayFab and Edgegap call. A C# (isolated worker) port is fine if the studio prefers it. Keep the same two steps and the same verification.

## 1. Azure resources

The developer runs `az login` and chooses the subscription. Two snags seen on Windows:
- *No subscriptions found* even though the portal shows some: Windows' account broker picked another account with the same email (a personal Microsoft account). Fix: `az config set core.enable_broker_on_windows=false`, then `az login --tenant <directory id from the portal>`.
- No `winget`/admin rights: `python -m venv ~/.azcli && ~/.azcli/Scripts/pip install azure-cli` works (`~/.azcli/Scripts/az.bat` on Windows).

```bash
az group create -n rg-<game>-playfab -l westus2
az storage account create -n <storage> -g rg-<game>-playfab -l westus2 --sku Standard_LRS --allow-blob-public-access false
az functionapp create -g rg-<game>-playfab -n <function-app> --storage-account <storage> \
  --flexconsumption-location westus2 --runtime node --runtime-version 22
```

PlayFab recommends US West regions (westus, westus2, westus3) for functions it calls. Flex Consumption also creates Application Insights, which is where the logs are. A new subscription may need `az provider register --namespace Microsoft.Web` (and `Microsoft.Storage`) first.

## 2. Deploy and settings

`assets/scripts/deploy-functions.sh` (bash; `AZ=<path to az>` if it isn't on PATH):

```bash
RG=rg-<game>-playfab APP=<function-app> EDGEGAP_APP_NAME=<app> EDGEGAP_APP_VERSION=<version> \
START_URL_FILE=/tmp/start-url.txt ./deploy-functions.sh path/to/azure-functions
# with PLAYFAB_TITLE_ID, PLAYFAB_SECRET_KEY, EDGEGAP_API_TOKEN exported from the developer's env file
```

It runs `npm ci --omit=dev`, zips `host.json`, `package.json`, `src/` and `node_modules/`, and deploys with `az functionapp deployment source config-zip`. Then it sets:

| Setting | Value |
| --- | --- |
| `PLAYFAB_TITLE_ID`, `PLAYFAB_SECRET_KEY` | The title and its secret key |
| `EDGEGAP_API_TOKEN` | Edgegap API token without the `token ` prefix (the code strips one anyway) |
| `EDGEGAP_APP_NAME`, `EDGEGAP_APP_VERSION` | The Edgegap app version to deploy |
| `EDGEGAP_PORT_NAME` | Port name on the app version, default `gameport` |
| `EDGEGAP_QUEUES` | Optional, comma-separated: only matches from these queues get a server. `match_found` fires for every queue of the title, so set it when some queues still use PlayFab Multiplayer Servers or another host. Unset means every queue. |
| `EDGEGAP_READY_WEBHOOK_URL` | `https://<app>.azurewebsites.net/api/EdgegapDeploymentReady?code=<its function key>` |
| `FALLBACK_LATITUDE`, `FALLBACK_LONGITUDE` | Optional, used when no player has a location (default Montreal) |

Then register the start function in PlayFab: `START_FUNCTION_URL=$(cat /tmp/start-url.txt) QUEUE_NAME=… node playfab-setup.mjs`, and delete the file. To change only one setting later: `az functionapp config appsettings set -g … -n … --settings KEY=value -o none`.

## 3. Keys and security

- Function keys: `az functionapp function keys list -g … -n … --function-name <name> --query default -o tsv`. Treat them like passwords. Anyone with the start URL can start servers on the Edgegap account; anyone with the ready URL can make the function re-read a deployment. It still verifies everything, so a forged call can't redirect players.
- Join tokens are an HMAC of `edgegap-join:<matchId>:<playFabId>` keyed with `PLAYFAB_SECRET_KEY`, cut to 24 characters. Both functions compute the same tokens, so nothing is stored. Rotating the secret key changes the tokens of matches whose server is already running: rotate between matches.
- The PlayFab secret key can do anything on the title. Keep it in app settings only, never in a client or server image. Rotate it in Game Manager if it leaks.
- The Edgegap token can deploy and stop anything in the organization. Same rule.

## 4. Logs

Function App > the function > **Monitor** (invocations), or Application Insights > Logs:

```kusto
traces | where timestamp > ago(30m) | where message has "Match" | project timestamp, message, severityLevel | order by timestamp desc
```

Each function logs one line per match: `Match <id>: Edgegap deployment <request_id> for N player(s).` and `Match <id>: sent ready <host>:<port> to N player(s).` Errors carry the PlayFab or Edgegap response body.

## 5. Chain test (before the rule exists)

Prove PlayFab → function → Edgegap → webhook → player data without a game client: match two test players (`references/playfab.md` §4), then post the rule's payload to the start URL and poll a player's read-only data:

```js
await fetch(START_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ PlayStreamEvent: { Payload: { MatchId: matchId, QueueName: queue } } }) });
// then every 3 s: POST /Server/GetUserReadOnlyData {PlayFabId, Keys:["EdgegapServer"]} with X-SecretKey
```

Expected (verified): the function returns 200 `{"requestId":…,"players":2}` in about 1.5 to 2 s (cold start included), and `EdgegapServer` holds `{"status":"ready","host","port"}` about 8 s later. The server then stops itself after its first-player timeout, since nobody connects.

**After the rule exists, don't do this.** The rule also fires for the same match, and you get two servers (one stops itself after about 2 minutes, but the free tier allows only one at a time).

## 6. Costs

Flex Consumption bills per execution and GB-second, with a monthly free grant. Two short executions per match fall well inside it for a demo. The storage account and Application Insights cost cents. Delete the resource group to remove everything: `az group delete -n rg-<game>-playfab`. Ask the developer first.
