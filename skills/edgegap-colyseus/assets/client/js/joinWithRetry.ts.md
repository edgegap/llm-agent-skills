# `assets/client/js/joinWithRetry.ts`

Template file. Write the content of the code block below, without the fences, to `joinWithRetry.ts`.

```ts
// Join a Colyseus room on a freshly started Edgegap deployment.
//
// Right after a ticket reaches HOST_ASSIGNED (or a deployment reports running), the deployment's
// address can answer 502 for a few seconds while the route to the container comes up. Retry the
// first join instead of failing; 10 attempts 2 s apart covered every case seen on Edgegap.
//
// Works with @colyseus/sdk (0.17) and colyseus.js (0.15/0.16): both expose client.joinOrCreate.

export interface JoinableClient<R> {
  joinOrCreate(roomName: string, options?: any): Promise<R>;
}

export async function joinWithRetry<R>(
  client: JoinableClient<R>,
  roomName: string,
  options: any = {},
  attempts = 10,
  delayMs = 2000
): Promise<R> {
  for (let i = 1; ; i++) {
    try {
      return await client.joinOrCreate(roomName, options);
    } catch (e) {
      if (i >= attempts) throw e;
      console.warn(`Join attempt ${i} failed, retrying`, e);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
```
