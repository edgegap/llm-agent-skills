# `assets/br200/scripts/package.sh`

Template file. Write the content of the code block below, without the fences, to `package.sh`.

```bash
#!/usr/bin/env bash
# Packages Builds/EdgegapServer into a linux/amd64 image, and pushes it when a
# registry is given.
# Usage: scripts/package.sh [registry.edgegap.com/<project>/br200 [tag]]
# Log in first with the credentials from the Edgegap dashboard (Container Registry):
#   docker login registry.edgegap.com
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -x Builds/EdgegapServer/ServerBuild || -f Builds/EdgegapServer/ServerBuild ]] \
    || { echo "No server build in Builds/EdgegapServer; run scripts/build-server.sh" >&2; exit 1; }
grep -qx "subtarget=Server" Builds/EdgegapServer/edgegap-build.txt 2>/dev/null \
    || echo "warning: edgegap-build.txt does not say subtarget=Server; was this a dedicated server build?" >&2

docker buildx build --platform linux/amd64 --load -f edgegap/Dockerfile -t br200-edgegap:local .

if [[ -n "${1:-}" ]]; then
    tag="${2:-$(date -u +%Y%m%d-%H%M)}"   # UTC timestamp: a new tag per build that shows when it was built; use it as the app version name too
    docker tag br200-edgegap:local "$1:$tag"
    docker push "$1:$tag"
    echo "Pushed $1:$tag. Use this tag in your app version."
fi
```
