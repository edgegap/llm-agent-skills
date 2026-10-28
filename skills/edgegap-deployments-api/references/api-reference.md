# Deployments API reference (the parts a backend needs)

Source: the published OpenAPI specs, https://github.com/edgegap/openapi-specification (`edgegap-v1-openapi.yaml`, `edgegap-v2-openapi.yaml`). These notes were checked against the commit pinned in this repository's `scripts/spec-pin.txt`, and a weekly CI job reports when the published spec changes. If the live API disagrees with this page, the live API wins.

Auth on every call: `Authorization: token <uuid>` (the Edgegap API token). `Content-Type: application/json`.

## Deploy: `POST https://api.edgegap.com/v2/deployments` (40 req/s)

```json
{
  "application": "my-game-server",
  "version": "20261022-1430",
  "users": [
    { "user_type": "ip_address", "user_data": { "ip_address": "75.28.35.192" } },
    { "user_type": "geo_coordinates", "user_data": { "latitude": 45.508888, "longitude": -73.561668 } }
  ],
  "environment_variables": [ { "key": "MATCH_ID", "value": "m-123", "is_hidden": false } ],
  "tags": [ "match-m-123" ],
  "require_cached_locations": false,
  "resources": { "cpu_units": 1024, "memory_mib": 2048 },
  "webhook_on_ready": { "url": "https://backend.example/edgegap/ready/<token>" },
  "webhook_on_error": { "url": "https://backend.example/edgegap/error/<token>" },
  "webhook_on_terminated": { "url": "https://backend.example/edgegap/terminated/<token>" }
}
```

- Required: `application`, `version`, `users` (at least one).
- `resources` (optional) overrides the version's vCPU/memory for this deployment: `cpu_units` ≥ 256, `memory_mib` ≥ 256 and at most 2× `cpu_units`.
- `require_cached_locations: true` deploys only where the image is cached (faster, but more 422s during spikes). Caching is a paid-tier feature on the app version.
- Responses: `202 {"request_id": "a69f8e3e0555"}`; `400 {message, details}`; `401`; `422 {request_id, message}` couldn't allocate; `500`.

## Webhook payload (ready / error / terminated)

```json
{
  "request_id": "f68e011bfb01",
  "application": "my-game-server",
  "version": "20261022-1430",
  "fqdn": "f68e011bfb01.pr.edgegap.net",
  "public_ip": "162.254.141.66",
  "deployed_at": "2026-02-10T20:35:48Z",
  "termination_scheduled_at": "2026-02-10T21:35:48Z",
  "ports": {
    "gameport": { "external": 31504, "internal": 7777, "protocol": "UDP", "name": "gameport",
                  "tls_upgrade": false, "link": "f68e011bfb01.pr.edgegap.net:31504", "proxy": null }
  },
  "location": { "city": "Montreal", "country": "Canada", "continent": "North America",
                "latitude": 45.513707, "longitude": -73.619073 },
  "tags": [ "tag1" ],
  "host_id": "alpha-north-america-70364ef8",
  "vcpu_units": 256,
  "memory_mib": 512
}
```

Not retried. Ready and Error are mutually exclusive. Ready fires when the container started, before the engine finished loading.

## Status: `GET https://api.edgegap.com/v1/status/{request_id}` (20 req/s, shared with Context)

Key fields: `request_id`, `fqdn`, `public_ip`, `app_name`, `app_version`, `current_status` (string), `running` (true when Ready), `error` (bool), `error_detail`, `start_time`, `elapsed_time` (s), `max_duration` (min), `removal_time`, `ports` (`{name: {external, internal, protocol, ...}}`), `location`, `tags`.

Poll with backoff (start at 2 s) and decide on `running` / `error` rather than parsing `current_status`.

## List: `GET https://api.edgegap.com/v1/deployments?query=<url-encoded JSON>` (10 req/s)

```json
{
  "filters": [
    { "field": "application", "operator": "eq", "value": "my-game-server" },
    { "field": "status", "operator": "eq", "value": "ready" },
    { "field": "tags", "operator": "eq", "value": "match-m-123" }
  ],
  "order_by": [ { "field": "created_at", "order": "desc" } ]
}
```

Fields: `status` (eq/neq: `ready`, `error`), `request_id` (eq/in/nin), `tags` (eq/neq/in/nin), `created_at` (eq/lte/gte, ISO 8601), `application`, `version` (eq/neq/in/nin), `fleet_name`, `host_name` (also `ilike`). At most one operator per field per request. Paginated: `page`, `limit`, response has `total_count`, `data`, `pagination.has_next`.

## Stop: `DELETE https://api.edgegap.com/v1/stop/{request_id}`

Graceful: SIGTERM, then SIGKILL after the version's termination grace period. `200`/`202` accepted (a deployment that is still starting is stopped once it reaches Ready or Error); `404` unknown (the live API has also returned `400` for an unknown ID: treat both the same); `410` already terminated (treat as done). Optional `container_log_storage` query to save logs to configured Endpoint Storage.

`POST /v1/deployments/bulk-stop` exists (filters on `request_id` or `deployment_tags`). Avoid it in production code.

## From inside a deployment (no API token needed)

- Self-stop: `DELETE $ARBITRIUM_DELETE_URL` with header `Authorization: $ARBITRIUM_DELETE_TOKEN`.
- Context: `GET $ARBITRIUM_CONTEXT_URL` with header `Authorization: $ARBITRIUM_CONTEXT_TOKEN`. Rate limited (20 req/s per organization, shared with Status), so call it once at boot at most.

## Logs: `GET https://api.edgegap.com/v1/deployment/{request_id}/container-logs`

Returns `logs`, `crash_logs`, `crash_data` (`exit_code`, `message` such as `OOM killed`, `restart_count`). Available while the deployment runs; after it stops only if Endpoint Storage was configured.

## Other useful endpoints

- `GET /v1/locations/beacons`: ping beacons (`host`, `fqdn`, `udp_port`, `tcp_port`, `location`) for client-side latency measurement.
- `GET /v1/apps`, `GET /v1/app/{app}/versions`, `POST /v1/app/{app}/version`: applications and versions. Version fields: `req_cpu`, `req_memory`, `docker_repository` (registry host), `docker_image`, `docker_tag`, `private_username` / `private_token` (registry pull credentials), `ports` (`port`, `protocol`, `name`, `to_check`, `tls_upgrade` on WS/HTTP), `envs`, `restart_policy` (`always` default, `never`, `on_failure`), `max_duration` (minutes, default and max 1440, `-1` only for private fleets), `termination_grace_period_seconds` (5 to 3600), `time_to_deploy`, `force_cache`, `verify_image`. Reads never return stored secrets: `private_username`, `private_token` and the `value` of every env var with `is_secret: true` come back as the literal string `This value is set and encrypted`. Never send that string back in a create or update; get the registry login from the dashboard's Container Registry page and secret values from the developer.
- `PATCH /v1/app/{app}/version/{version}`: change an existing version. Fields you leave out keep their value, but `ports` and `envs` replace the whole list: read the version first and send every port or variable to keep, with real values for secret variables (the read returns the placeholder above). Leave `private_username` / `private_token` out to keep the current login. Running deployments keep their old settings.
- `POST /v1/deployments/{request_id}/tags` (`{ "name": "..." }`, 1 to 40 characters), `GET` the same path to list, `DELETE /v1/deployments/{request_id}/tags/{tag}` to remove: tags after deploy. Tags are labels; the running server does not see the change.
- `POST /v1/deployments/{request_id}:report` with `{ "reason": "...", "metadata": { ... } }`: report a deployment from your moderation backend. It does not stop it.
- `DELETE /v1/app/{app}/version/{version}` and `DELETE /v1/app/{app}` (the app and all its versions): clean up. Check `GET /v1/deployments` for running deployments of it first.

## Private fleets (v2)

- `GET https://api.edgegap.com/v2/private-fleets/{fleet}/hosts`: the fleet's hosts, with `host_id`, `status` (only `ACTIVE` accepts deployments), IP and location.
- `POST https://api.edgegap.com/v2/private-fleets/deployments`: the deploy body above plus `private_host_ids` (in order of preference). Edgegap overflows to its cloud when those hosts are full.

## Endpoint Storage (keep logs, pull files into containers)

- `POST /v1/storage/endpoint` with `name`, `endpoint` (https URL of the S3-compatible service, without the bucket), `bucket`, `access_key_id`, `secret_access_key`, optional `output_format` (`TEXT` or `NDJSON`) and `container_log_version` (`v1`: one file per deployment; `v2`: chunks streamed while it runs). `GET /v1/storage/endpoints` lists them (never the secret key).
- Set `endpoint_storage` on the version (create or `PATCH`) to export each deployment's logs there when it ends.
- Pull profiles copy a file or folder from the bucket into the container at boot: `POST /v1/storage/endpoint/{endpoint}/pull-profile` with `name`, `source`, `source_type` (`File` or `Folder`), `destination` (absolute path in the container), then link it to a version with `PUT /v1/storage/endpoint/{endpoint}/pull-profile/{profile}/app/{app}/version/{version}` (`DELETE` unlinks). An unlinked profile does nothing.
