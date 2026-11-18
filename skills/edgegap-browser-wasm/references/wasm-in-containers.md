# WebAssembly in the server image (and on the static host)

Contents
1. Embedded vs separate `.wasm`
2. Other WASM physics engines
3. Keeping the image small
4. Container scanners and "runtime download" findings
5. Proving it

## 1. Embedded vs separate `.wasm`

| Package style | Example | Server (Node.js in Docker) | Browser (static host) |
| --- | --- | --- | --- |
| WASM embedded (base64) in the JS | `@dimforge/rapier3d-compat`, `@dimforge/rapier2d-compat` | `await RAPIER.init()` reads it from memory: nothing to copy, no path | one bigger JS file (the sample's bundle: 4.9 MB, 1.8 MB gzipped), no MIME setup |
| Separate `.wasm` file | `@dimforge/rapier3d` (bundler build), many Emscripten builds | the `.wasm` must be in the image at the path the loader expects; some loaders `fetch()` it, which fails in Node or without network | serve it with `Content-Type: application/wasm`; the bundler must emit it; streaming compile fails on a wrong MIME type |

Prefer the embedded build for a sample or a small game: one less thing to get wrong in two places. Switch to a separate `.wasm` only when the extra ~33% (base64) bundle size matters, and then test both the container and the static host.

Initialise once, before anything else: in Rapier, creating a `World` before `init()` resolves throws `TypeError: Cannot read properties of undefined (reading 'rawintegrationparameters_new')`. On the server, use top-level `await RAPIER.init()` in an ES module; on the client, start `RAPIER.init()` at load and `await` it before building the predictor.

## 2. Other WASM physics engines

The pattern is the same for any engine that runs in both Node.js and the browser: one shared module that builds the world and applies an input, initialised once per side.

- **Box2D** (`box2d-wasm`, `box2d3-wasm`) and **planck.js** (plain JS port, no WASM): 2D games.
- **Jolt** (`jolt-physics`): check the package's entry points for a build with the WASM inlined.
- **ammo.js** (Bullet): older Emscripten builds load `ammo.wasm.wasm` by path; ship the asm.js build or the file.
- **cannon-es**: plain JavaScript, no WASM; the same architecture applies, without the init step.

Not verified on Edgegap with this skill: anything but Rapier. Check that the engine runs under Node.js 22 without DOM globals (`window`, `document`, `self`) before planning on it.

## 3. Keeping the image small

Measured with the sample (node:22.23.4-alpine3.23 base, 61.6 MB compressed): final image 63.5 MB compressed, 249 MB unpacked.

- Build context = repo root with an **allowlist** `.dockerignore` (`*`, then `!` the manifests, `shared/src`, `server/src`). The client never reaches Docker, so it can't end up in the image.
- Runtime stage: `npm ci --omit=dev --workspace server --workspace shared`. The client's `package.json` must be copied (npm checks every workspace in the lockfile), but its dependencies are not installed.
- Delete files the server never loads. Rapier compat 0.21 ships `rapier.mjs` (used, 4.3 MB), `rapier.cjs` (4.3 MB), two source maps (2.4 MB), `rapier_wasm3d_bg.wasm` (3 MB) and `rapier_wasm3d.js`: removing all but `rapier.mjs` saves ~10 MB unpacked. Check the package's entry first (`grep import dist/rapier.mjs` should show no relative imports).
- Alpine works for Rapier (no native modules). If a dependency has native addons, use `node:22-slim` (glibc) instead.

## 4. Container scanners and "runtime download" findings

Scanners flag images that fetch code at runtime, and images that bundle a whole website. The sample avoids both:
- no client assets in the image (allowlist above);
- WASM embedded, so nothing is fetched at startup. Rapier's wasm-bindgen glue still contains a `fetch(` call for the case where `init()` is given a URL; the compat build never takes that branch. If a scanner matches on the string alone, the `--network none` test below is the evidence.
- the only outbound request the server makes is the self-stop `DELETE` to `ARBITRIUM_DELETE_URL`, an Edgegap API call, not a download.

## 5. Proving it

```bash
docker build --platform linux/amd64 --provenance=false --sbom=false -f server/Dockerfile -t game-server:20261118-1644 .
docker run --network none game-server:20261118-1644      # must log "listening on 0.0.0.0:7777"
docker run -p 7778:7777 game-server:20261118-1644          # then the smoke test against ws://127.0.0.1:7778
docker run --entrypoint sh game-server:20261118-1644 -c 'ls node_modules; ls client'   # no three, no vite; client/ holds only package.json
```

Don't add `--rm` to `docker run` in instructions you give: a crashed container then takes its logs with it.
