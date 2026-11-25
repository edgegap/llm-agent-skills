# Edgegap setup for a fal game

Everything here was done for Orb Arena on 2026-11-09. Values in `<angle brackets>` are the developer's.

## 1. The server image (GitHub Actions)

Copy `edgegap-threejs` `assets/ci/server-image.yml` to `.github/workflows/`, set `IMAGE` to the game name, and add `client/rules.js` to the `paths` filter (the server imports it). Replace its test step with the game's local match test (`MATCH_SECONDS=90 node tests/local-match.mjs`).

Repository settings:
- variable `EDGEGAP_REGISTRY_PROJECT` = `<project>`, the first part of the repository names on the dashboard's Container Registry page; not a secret, the agent can set it;
- secrets `EDGEGAP_REGISTRY_USERNAME` and `EDGEGAP_REGISTRY_TOKEN` from the Credentials box on that page. The developer types them into GitHub; they never go through chat. Warn them not to click Regenerate Token if other pipelines push to that registry.

`docker/build-push-action` must have:

```yaml
          provenance: false
          sbom: false
```

With the defaults, BuildKit adds provenance attestations and pushes an image index instead of a plain manifest. Orb Arena's first image (built with the defaults) failed every deployment of the version in about 8 s with `Unable to pull image from registry. Make sure the registry, repository and tag are valid`; rebuilt with the two lines above and put on the same version (same registry login), it pulled and ran. Each failed deployment is retried by the matchmaker (`max_deployment_retry_count`), so one bad image shows up as a burst of short deployments.

The agent's sandbox often can't build or push: Docker Hub base images and `registry.edgegap.com` may be blocked by its network policy. CI avoids both.

## 2. The app version

| Field | Value |
|---|---|
| Name | the image tag (`YYYYMMDD-HHMM`) |
| Image | `registry.edgegap.com`, `<project>/<game>`, tag = name |
| Registry login | none with the MCP (`registry_profile: "Edgegap"` is sent for you); the dashboard fills the Edgegap pull login itself |
| vCPU / memory | 256 units (0.25 vCPU) / 512 MB |
| Port | 7777, protocol WS, name `gameport`, TLS Upgrade on, verifications off |
| Restart policy | Never |
| Max duration | 30 minutes |
| Env | `EMPTY_TIMEOUT_S=15`, `FIRST_JOIN_TIMEOUT_S=60`, `RESULTS_SECONDS=8`; add `REQUIRE_TICKET=1` once only matched players should get in |

With an API token: `edgegap_create_app` and `edgegap_create_app_version` with these values, then `edgegap_list_app_versions` shows `registry_credentials_set: true`.

Without a usable token (for example a hosted MCP connection that can't forward the developer's Edgegap token: `edgegap_context` says `token_status: foreign`), use the dashboard with the developer signed in:
1. Applications > Create application, name.
2. The version form: name, vCPU slider to 0.25, Registry "Edgegap (registry.edgegap.com)", repository and tag, max duration, restart policy. Submit.
3. The Create Port dialog opens right after: port, protocol WS (default is UDP), name, TLS Upgrade on. Submit.
4. Environment variables > Create, one per variable.

To ship a new build: change the tag on the version and save (dashboard) or `edgegap_update_app_version`. The version name can stay; matches already running are not affected.

## 3. The matchmaker

Start from `edgegap-threejs` `assets/matchmaker/casual.json`. Orb Arena's:

```json
{
  "version": "3.3.2",
  "inspect": true,
  "max_deployment_retry_count": 3,
  "allowed_cors_origins": ["http://localhost:8080", "https://<org>.github.io"],
  "profiles": {
    "arena": {
      "ticket_expiration_period": "30s",
      "ticket_removal_period": "1m",
      "group_inactivity_removal_period": "5m",
      "application": { "name": "<game>", "version": "<image-tag>" },
      "rules": {
        "initial": { "match_size": { "type": "player_count", "attributes": { "team_count": 1, "min_team_size": 2, "max_team_size": 4 } } },
        "expansions": { "20": { "match_size": { "min_team_size": 1 } } }
      }
    }
  }
}
```

The developer creates it: Matchmakers > Create Matchmaker > upload > Create and Start. "Docker image ... is not cached" and "Container image ... is not valid" warnings appeared for a working private image; continue and let the e2e test decide. Changing the config later: Stop > Configuration tab > edit > Save Configuration > Start; the API URL and Auth Token stayed the same across that restart.

The free tier stops the matchmaker about 3 hours after each start and runs one deployment at a time.

## 4. Where the page lives

The page calls the matchmaker from the browser, so its origin must be in `allowed_cors_origins`.
- `http://localhost:8080` works only on the machine serving it; the agent's sandbox localhost is not the developer's.
- GitHub Pages (`edgegap-threejs` `assets/ci/pages.yml`): Settings > Pages > Source: GitHub Actions. Free GitHub plans (personal and organization) serve Pages only from public repos; on a private repo the settings page says "Upgrade or make this repository public". A new site's first deployment sat in `deployment_queued` for about 5 minutes; a run started before Pages was turned on fails with `Get Pages site failed` and needs a re-run. For an example repo, make the workflow `workflow_dispatch` only so the page isn't republished on every push.
- Before making a repo public: `client/config.js` holds only the matchmaker's client token (made to ship), no API token, registry login or deployment URL. Blank it if the matchmaker will be deleted.

## 5. Tests that need the network

`tests/e2e.mjs` reaches the matchmaker and the deployment from Node. When the agent's sandbox blocks those hosts, run it from a `workflow_dispatch` GitHub Actions job that reads `client/config.js`:

```yaml
      - name: Play a match through the matchmaker
        run: |
          export MM_URL=$(node -e 'import("./client/config.js").then(m=>console.log(m.default.matchmakerUrl))')
          export MM_TOKEN=$(node -e 'import("./client/config.js").then(m=>console.log(m.default.matchmakerToken))')
          node tests/e2e.mjs arena 2
```

For the browser test, the developer's own browser (or a browser tool driving it) on the served page; `?autoplay=1` starts Find match on load.
