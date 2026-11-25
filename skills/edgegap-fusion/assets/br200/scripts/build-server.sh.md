# `assets/br200/scripts/build-server.sh`

Template file. Write the content of the code block below, without the fences, to `build-server.sh`.

```bash
#!/usr/bin/env bash
# Builds the Linux dedicated server with the Unity CLI into Builds/EdgegapServer.
# Usage: scripts/build-server.sh [path/to/Unity]   (or set UNITY)
# Run from the BR200 project root, with the kit copied in.
set -euo pipefail
cd "$(dirname "$0")/.."

version="$(sed -n 's/^m_EditorVersion: //p' ProjectSettings/ProjectVersion.txt)"
unity="${1:-${UNITY:-}}"
if [[ -z "$unity" ]]; then
    for candidate in \
        "/c/Program Files/Unity/Hub/Editor/$version/Editor/Unity.exe" \
        "/Applications/Unity/Hub/Editor/$version/Unity.app/Contents/MacOS/Unity" \
        "$HOME/Unity/Hub/Editor/$version/Editor/Unity"; do
        [[ -x "$candidate" ]] && unity="$candidate" && break
    done
fi
[[ -n "$unity" ]] || { echo "Unity $version not found; pass its path or set UNITY" >&2; exit 1; }

mkdir -p Builds
echo "Building with Unity $version, log in Builds/server-build.log"
"$unity" -batchmode -nographics -quit -projectPath "$PWD" \
    -executeMethod Edgegap.BR200.Editor.BR200ServerBuilder.BuildFromCommandLine \
    -logFile Builds/server-build.log
cat Builds/EdgegapServer/edgegap-build.txt
```
