# Images, app version, Nakama, public URL

## 1. The game server image and app version

Build a `linux/amd64` image of the dedicated server (`edgegap-containerize`; Unity: `edgegap-unity`; Unreal: `edgegap-unreal`). Godot, as verified in Fish Game: a multi-stage Dockerfile that downloads the official Godot binary (checked against `SHA512-SUMS.txt`), exports the "Linux Server" preset with `--export-pack` (a `.pck` needs no export templates), and runs `godot --headless --main-pack server.pck -- --server --port=7777` as a non-root user. See `server/Dockerfile` in edgegap/backend-game-sample-godot-nakama-fishgame.

```bash
docker build --platform linux/amd64 -f server/Dockerfile -t registry.edgegap.com/<project>/<game>:<tag> .
docker login registry.edgegap.com          # the developer runs this: username and token from the dashboard's Container Registry page
docker push registry.edgegap.com/<project>/<game>:<tag>
```

A new tag for every build, never `latest`: a UTC timestamp `YYYYMMDD-HHMM` (e.g. `20261022-1430`, from `date -u +%Y%m%d-%H%M`), the same string for the image tag and the app version name, so anyone can see when the server was last updated.

Edgegap MCP: `edgegap_create_app` once, then `edgegap_create_app_version`:

| Field | Value |
|---|---|
| image | `registry.edgegap.com`, `<project>/<game>`, the tag |
| `ports` | the game port with the netcode's protocol, e.g. `[{ "port": 7777, "protocol": "UDP", "name": "gameport" }]`. The name must equal `EDGEGAP_PORT_NAME` in Nakama |
| CPU / memory | 0.5 vCPU / 512 MB to start (Fish Game ran with that); measure your own |
| max duration | 30 to 60 min while testing; above the server's own hard cap |
| env | none needed: the Fleet Manager injects the Nakama URLs and metadata |

**Registry login on the app version.** The developer adds the registry username and token to the version (dashboard, or once through the tool); `edgegap_list_app_versions` must show `registry_credentials_set: true`. Without it every deployment fails to pull, and Nakama players get 113.

## 2. One direct deployment first

Before Nakama: ask, then `edgegap_deploy` with the developer's IP and a test tag, `edgegap_wait_for_deployment`, and connect a client to `<public ip>:<external port>`. With no Nakama env vars, the templates let anyone in. Then stop it (`edgegap_stop_deployment`) unless the match ended it.

## 3. Nakama: image, compose, env, public HTTPS

`assets/nakama/`:

- **`Dockerfile`**: builds the Go plugin in `heroiclabs/nakama-pluginbuilder:3.39.0` and copies `backend.so` into `heroiclabs/nakama:3.39.0`. The two tags must be identical, and `nakama-common` in `go.mod` must be the version that Nakama release uses (v1.46.0 for 3.39.0), or Nakama refuses the plugin (`plugin was built with a different version of package`). To move to a newer Nakama, change all three together.
- **`go.mod`**: `github.com/edgegap/nakama-edgegap v0.0.0-20260618130934-20d849e39d46`. Its git tags are `0.1.0` ... `0.4.0`, without the `v` that Go modules require, so `go get github.com/edgegap/nakama-edgegap@0.4.0` fails; pin by commit (`go get github.com/edgegap/nakama-edgegap@20d849e`), which writes this pseudo-version. `go.sum` is from the verified build. The repository is now `edgegap/backend-nakama-edgegap-plugin`, but its `go.mod` still declares `github.com/edgegap/nakama-edgegap`: keep that path in imports and `go get`, since Go refuses a module required under a different path.
- **`docker-compose.yml`**: Postgres 16 + Nakama. `env_file: .env` supplies the values at runtime; the entrypoint passes them to Nakama as `--runtime.env` (the plugin reads Nakama's runtime env, not the container's) and `--runtime.http_key`. It uses `sh -ec`: **never `-x`**, which echoes the expanded command line, Edgegap API token and http_key included, into `docker logs`. The plugin repository's own compose uses `-ecx` with a YAML config file, where nothing secret is on the command line; once secrets are passed as flags, `-x` leaks them (it did in the first Fish Game run).
- **`.env.example`** → `.env` (git-ignored, docker-ignored): `EDGEGAP_API_TOKEN=token <uuid>` (keep the `token ` prefix), `EDGEGAP_APPLICATION`, `INITIAL_EDGEGAP_VERSION`, `EDGEGAP_PORT_NAME`, `NAKAMA_ACCESS_URL`, `NAKAMA_HTTP_KEY` (long and random). The developer pastes the token; you never print it.

**`NAKAMA_ACCESS_URL` must be public HTTPS.** Edgegap's webhooks and every game server call Nakama back at this URL (it is baked into the injected event URLs), so `localhost` or a LAN address can't work, and the plugin expects the `https://` prefix. Options:
- Production: Nakama's real host behind TLS, or the URL Heroic Cloud gives the instance.
- A test on the developer's machine: a Cloudflare quick tunnel, which needs no account. Verified in Fish Game:

  ```bash
  docker run -d --name nakama-tunnel cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:7350
  ```

  `docker logs nakama-tunnel` prints `https://<words>.trycloudflare.com`: put it in `NAKAMA_ACCESS_URL`, then `docker compose up -d --build` (or `up -d` again after changing `.env`). The URL changes each time the tunnel restarts, and quick tunnels are for testing only. Remove the container afterwards.

**Clients reach Nakama through the public URL too.** The AfterAuthenticate hook stores the IP that Nakama sees. A client on the same machine using `127.0.0.1:7350` shows up as a Docker-network address, and Edgegap can't place a server from a private IP. Point the client at the tunnel (`<host>`, port 443, `https`) so Nakama sees the player's public IP.

✅ Check: `docker compose logs nakama` shows the module loaded (`Edgegap module loaded in ...`), no `NAKAMA_ACCESS_URL not found` or Edgegap API error, and the token does not appear anywhere in the log.

## 4. Choosing and updating the deployed version

The plugin stores the current app version in Nakama storage. `INITIAL_EDGEGAP_VERSION` only seeds it the first time. Ship a new server build without restarting Nakama:

```bash
curl -X POST "https://<nakama>/v2/rpc/update_edgegap_version?http_key=<key>&unwrap" -H "Content-Type: application/json" -d '{"version": "<new-version>"}'
curl -X POST "https://<nakama>/v2/rpc/get_edgegap_version?http_key=<key>&unwrap" -H "Content-Type: application/json" -d '{}'
```

The update checks that the version exists in the application. Running matches keep their server; new matches get the new version. The developer runs these (they contain the http_key), or you run them without echoing the key. Changing `INITIAL_EDGEGAP_VERSION` later has no effect once a version is stored. Per match, `metadata["edgegap_version"]` in `Create` overrides it.

Flow for a new build: new image tag → new app version (same ports, registry credentials) → direct test deployment → `update_edgegap_version`.

## 5. Production notes

- Nakama in production: Heroic Cloud or your own Nakama with Postgres/CockroachDB. Set the same runtime env values in its configuration; the Go plugin must be built for that exact Nakama version.
- The Fleet Manager polls Edgegap every `EDGEGAP_POLLING_INTERVAL` (15 m) to reconcile instances; leave it on.
- Rate-limit or monitor deployments: every match, and every `instance_create` call (`nakama-module.md` §7), starts one. `edgegap-launch` for capacity, cost and rollout.
- Deployments are tagged `nakama` by the plugin: `edgegap_list_deployments` can filter on it.
