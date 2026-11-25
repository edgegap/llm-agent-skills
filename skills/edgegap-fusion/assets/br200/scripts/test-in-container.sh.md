# `assets/br200/scripts/test-in-container.sh`

Template file. Write the content of the code block below, without the fences, to `test-in-container.sh`.

```bash
#!/usr/bin/env bash
# Runs tests/start-server.test.sh inside ubuntu:22.04, the server's base image
# (its awk and sed differ from the ones in Git Bash or macOS).
set -euo pipefail
cd "$(dirname "$0")/.."
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/kit" -w /kit ubuntu:22.04 bash tests/start-server.test.sh
```
