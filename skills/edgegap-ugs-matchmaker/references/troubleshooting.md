# Troubleshooting Unity Matchmaker + Edgegap

Where to look: Cloud Code logs in the Unity Dashboard (the module logs Edgegap's error bodies), the Edgegap dashboard or `edgegap_list_deployments` (deployments tagged `ugs-matchmaker`), the deployment's container logs (`edgegap_get_deployment_logs`, before it stops), and the client's ticket status.

## Symptom → cause

| Symptom | Likely cause | Fix |
|---|---|---|
| Tickets stay `InProgress`, no Edgegap deployment, no Cloud Code log | Pool's Match Hosting isn't Cloud Code, the module name or function names are misspelled, or the module is in another environment | Check the pool's hosting block (`references/allocator.md` §4) and the environment the CLI deployed to |
| Allocate error 401 in Cloud Code logs | `EDGEGAP_API_TOKEN` missing, from another organization, revoked, or stored without the `token ` prefix | The module sends the secret verbatim as `Authorization`; store `token <uuid>` |
| Allocate error 404 / 422 naming the app or version | `ApplicationName` / `VersionName` don't match Edgegap exactly, or the version has no image or registry credentials | Fix the constants, redeploy the module |
| Allocate error on the second match, first match still running | Free tier: one deployment at a time; or a leftover test deployment | Stop the leftover; upgrade for concurrent matches |
| Poll error "Requested port gameport is not exposed" | `PortName` doesn't match the version's port name | Rename the port on the version or the constant |
| Poll error "Deployment failed with the current error" | The server crashed or the image can't be pulled | Read the container logs; fix the server; the same version fails the same way |
| Tickets `Timeout` while the deployment becomes ready later | Pool timeout shorter than boot time, or a slow image | Raise the pool timeout; smaller image; `ForceCachedLocation` with caching on |
| Every match lands in New Mexico | No `player_ip` in the players' custom data; Cloud Code shows the "No valid player IPs" warning | Send `player_ip` from every client (`references/unity.md` §1) |
| `Found` but the client can't connect | Client uses the internal port, the protocol on the version is wrong (TCP vs UDP), the server binds `127.0.0.1`, or it isn't listening yet | Use `Port` as given; match the protocol; bind `0.0.0.0`; retry the connect for a few seconds |
| WebGL client can't connect | The module returns an IP; browsers need `wss://` to the FQDN | `references/allocator.md` §5 |
| Client using `MatchmakeSessionAsync` fails after `Found` with "session not found" | Sessions flow expects the server to create a UGS session named after the match ID | Use the ticket API, or implement `references/unity.md` §2 |
| Deployments pile up | The server never self-stops (no first-player timeout, no match-end stop), or Allocate ran twice | Add self-stop; keep `max_duration` low; check for duplicate allocations in Cloud Code logs |
| Matches fail at peak with 429 in Cloud Code logs | Status API limit (20/s per organization) shared by every pending match; Poll turns any non-2xx into Error, so one 429 fails the whole match | Treat 429 as Pending in Poll, or the webhook variant (`references/allocator.md` §5) |

## Smoke tests, cheapest first

1. `dotnet test tests/AllocatorTests` in Unity's repo: the module builds and its request and poll mapping hold (mocked HTTP; no account needed).
2. One deployment by hand with the same app, version and port name (`edgegap_deploy`, `edgegap_wait_for_deployment`): proves the version before Matchmaker is involved. Stop it.
3. Two clients in a test queue. Watch Cloud Code logs, then the deployment, then both tickets reaching `Found` with the same IP and port.

## Not verified in this pack (say so when it matters)

- The full chain (UGS queue → module → Edgegap → two clients connected → self-stop) has not been run.
- The exact `Authorization` value the secret needs: derived from the code (no prefix added) and Edgegap's API (`token <uuid>`), not observed against the live API.
- Whether `MatchProperties["Players"][].CustomData` arrives in Cloud Code in the shape the module expects: covered by its unit test with a mocked payload, not seen live here.
- Matchmaker's poll interval and how it behaves under the Status API limit; free-tier behaviour with two concurrent matches.
- The sessions flow, backfill, WebGL/FQDN, and the webhook variant.
- Client snippets in `references/unity.md` were written from the SDK reference and not compiled.
