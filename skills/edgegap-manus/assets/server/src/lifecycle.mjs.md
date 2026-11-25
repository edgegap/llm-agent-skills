# `assets/server/src/lifecycle.mjs`

Template file. Write the content of the code block below, without the fences, to `lifecycle.mjs`.

```js
// Deployment lifecycle on Edgegap: stop our own deployment when the match is over, so an empty
// server stops billing. Uses the self-stop URL Edgegap injects into every deployment.
//   ARBITRIUM_DELETE_URL + header Authorization: ARBITRIUM_DELETE_TOKEN  (raw, no prefix)
// Outside Edgegap (local runs) the process just exits.

export function createLifecycle({ log = console.log, env = process.env, joinGraceMs = 120_000, emptyGraceMs = 30_000 } = {}) {
  let stopping = false;
  let someoneJoined = false;
  let emptyTimer = null;

  // Nobody connected (players gave up, or the match was never joined): stop anyway.
  const joinTimer = setTimeout(() => {
    if (!someoneJoined) stop("no player joined in time");
  }, joinGraceMs);

  async function stop(reason) {
    if (stopping) return;
    stopping = true;
    clearTimeout(joinTimer);
    clearTimeout(emptyTimer);
    log(`Edgegap Server | Stopping deployment: ${reason}`);
    if (env.ARBITRIUM_DELETE_URL && env.ARBITRIUM_DELETE_TOKEN) {
      try {
        const res = await fetch(env.ARBITRIUM_DELETE_URL, {
          method: "DELETE",
          headers: { Authorization: env.ARBITRIUM_DELETE_TOKEN },
          signal: AbortSignal.timeout(10_000),
        });
        log(`Edgegap Server | Self-stop answered ${res.status}`);
        // Edgegap now sends SIGTERM; the handler below exits. Fallback if it never comes:
        setTimeout(() => process.exit(0), 60_000).unref();
        return;
      } catch (err) {
        log(`Edgegap Server | Self-stop failed: ${err.message}`);
      }
    }
    process.exit(0);
  }

  return {
    get stopping() { return stopping; },
    playerCountChanged(count) {
      if (count > 0) {
        someoneJoined = true;
        clearTimeout(emptyTimer);
        emptyTimer = null;
      } else if (someoneJoined && !emptyTimer) {
        // Grace period so a player who reloads the page can reconnect.
        emptyTimer = setTimeout(() => stop("all players left"), emptyGraceMs);
      }
    },
    matchOver(reason = "match over") {
      setTimeout(() => stop(reason), 10_000); // let clients show the results first
    },
    stop,
  };
}

/** SIGTERM from Edgegap (stop, max duration) or docker stop: tell clients, then exit. */
export function onShutdown(handler) {
  let done = false;
  const run = async (signal) => {
    if (done) return;
    done = true;
    try { await handler(signal); } finally { process.exit(0); }
  };
  process.on("SIGTERM", () => run("SIGTERM"));
  process.on("SIGINT", () => run("SIGINT"));
}
```
