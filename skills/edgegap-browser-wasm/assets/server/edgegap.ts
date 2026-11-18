// The only Edgegap-specific code in the server. Edgegap injects ARBITRIUM_* environment variables
// into every deployment; none of this does anything locally.
//
// Self-stop: DELETE $ARBITRIUM_DELETE_URL with $ARBITRIUM_DELETE_TOKEN in the Authorization header.
// Edgegap then sends SIGTERM, which index.ts handles like any other shutdown, and billing stops.
// https://docs.edgegap.com/learn/orchestration/deployments

const env = process.env;

export const onEdgegap = Boolean(env.ARBITRIUM_REQUEST_ID);

export function describeDeployment(): string {
  if (!onEdgegap) return "local run (not on Edgegap): the empty timer only logs";
  return `Edgegap deployment ${env.ARBITRIUM_REQUEST_ID} at ${env.ARBITRIUM_PUBLIC_IP ?? "?"}`;
}

let stopping = false;

export function selfStop(reason: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`self-stop: ${reason}`);
  const url = env.ARBITRIUM_DELETE_URL;
  const token = env.ARBITRIUM_DELETE_TOKEN;
  if (!url || !token) {
    console.log("ARBITRIUM_DELETE_URL/TOKEN missing: exiting instead");
    process.exit(0);
  }
  fetch(url, { method: "DELETE", headers: { authorization: token } })
    .then((res) => console.log(`self-stop request: HTTP ${res.status}`))
    .catch((err) => {
      // With restart policy "never", exiting ends the deployment too.
      console.log(`self-stop request failed: ${err}`);
      process.exit(0);
    });
}
