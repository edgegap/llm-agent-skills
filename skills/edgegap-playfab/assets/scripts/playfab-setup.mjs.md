# `assets/scripts/playfab-setup.mjs`

Template file. Write the content of the code block below, without the fences, to `playfab-setup.mjs`.

```js
// Creates (or updates) the PlayFab matchmaking queue and registers the StartEdgegapDeployment Azure Function.
// The match_found rule itself has no public API: create it in Game Manager (Automation > Rules).
//
// Usage (Node 20+), secrets from the environment, never on the command line:
//   PLAYFAB_TITLE_ID=XXXXX PLAYFAB_SECRET_KEY=... START_FUNCTION_URL='https://<app>.azurewebsites.net/api/StartEdgegapDeployment?code=...' \
//   QUEUE_NAME=edgegap-fishnet MATCH_SIZE=2 [DRY_RUN=1] node playfab-setup.mjs
// An existing queue keeps its sizes, teams and rules (MATCH_SIZE only applies to a new queue); DRY_RUN prints it.
const { PLAYFAB_TITLE_ID: title, PLAYFAB_SECRET_KEY: secret, START_FUNCTION_URL: functionUrl } = process.env;
const queueName = process.env.QUEUE_NAME || 'edgegap';
const [minSize, maxSize] = (process.env.MATCH_SIZE || '2').split('-').map(Number);

if (!title || !secret) {
  console.error('Set PLAYFAB_TITLE_ID and PLAYFAB_SECRET_KEY.');
  process.exit(1);
}

async function call(path, body, headers) {
  const res = await fetch(`https://${title}.playfabapi.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error(`${path}: ${json.errorMessage ?? JSON.stringify(json)}`);
  return json.data;
}

const { EntityToken: token } = await call('/Authentication/GetEntityToken', {}, { 'X-SecretKey': secret });
const auth = { 'X-EntityToken': token };

// SetMatchmakingQueue replaces the whole queue: keep an existing queue's sizes, teams and rules, and only turn
// PlayFab's server allocation off (Edgegap hosts the servers). A new queue gets MATCH_SIZE and no rules.
const existing = await call('/Match/GetMatchmakingQueue', { QueueName: queueName }, auth)
  .then((d) => d.MatchmakingQueue)
  .catch(() => null);

const queue = existing
  ? { ...existing, ServerAllocationEnabled: false }
  : {
      Name: queueName,
      MinMatchSize: minSize,
      MaxMatchSize: maxSize ?? minSize,
      ServerAllocationEnabled: false,
      Rules: [],
      StatisticsVisibilityToPlayers: { ShowNumberOfPlayersMatching: true, ShowTimeToMatch: true },
    };
delete queue.BuildId; // PlayFab Multiplayer Servers settings, unused once allocation is off
delete queue.ServerAllocationSettings;

if (process.env.DRY_RUN) {
  console.log(JSON.stringify(queue, null, 2));
  process.exit(0);
}
await call('/Match/SetMatchmakingQueue', { MatchmakingQueue: queue }, auth);
console.log(
  `Queue '${queueName}' ${existing ? 'updated (rules and teams kept)' : 'created'}: ` +
    `${queue.MinMatchSize}-${queue.MaxMatchSize} players, server allocation off.`
);

if (functionUrl) {
  await call('/CloudScript/RegisterHttpFunction', { FunctionName: 'StartEdgegapDeployment', FunctionUrl: functionUrl }, auth);
  console.log('Registered Azure Function StartEdgegapDeployment.');
} else {
  console.log('START_FUNCTION_URL not set: function not registered.');
}

const { Functions } = await call('/CloudScript/ListFunctions', {}, auth);
console.log(`Registered functions: ${Functions.map((f) => f.FunctionName).join(', ') || 'none'}.`);
console.log("Next, in Game Manager: Automation > Rules > New Rule, event 'playfab.matchmaking.match_found', " +
  "action 'Execute Azure Function' > StartEdgegapDeployment.");
```
