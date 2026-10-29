"""Check whether Edgegap's published OpenAPI specs changed since the skills were last checked.

  python scripts/check_spec.py            exit 1 and print a diff if main differs from the pin
  python scripts/check_spec.py --update   move the pin to the current main commit

The skills' API facts (edgegap-deployments-api/references/api-reference.md) were checked
against https://github.com/edgegap/openapi-specification at the commit in
scripts/spec-pin.txt. The specs themselves are not copied into this repository: their
examples contain token-shaped values, and the plugin must not ship anything that looks like
a secret. When the published spec changes, re-read the changed operations, fix the skills,
bump their metadata.version, then move the pin.
"""
import argparse
import difflib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIN = ROOT / "scripts" / "spec-pin.txt"
REPO = "edgegap/openapi-specification"
FILES = ["edgegap-v1-openapi.yaml", "edgegap-v2-openapi.yaml"]


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "llm-agent-skills-spec-check"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8").replace("\r\n", "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()

    pinned = PIN.read_text(encoding="utf-8").strip()
    head = json.loads(get(f"https://api.github.com/repos/{REPO}/commits/main"))["sha"]
    if head == pinned:
        print(f"OK: published spec is still at the pinned commit {pinned[:12]}")
        return 0
    if args.update:
        PIN.write_text(head + "\n", encoding="utf-8", newline="\n")
        print(f"UPDATED: pin {pinned[:12]} -> {head[:12]}")
        return 0

    changed = False
    for name in FILES:
        raw = f"https://raw.githubusercontent.com/{REPO}/{{}}/{name}"
        old, new = get(raw.format(pinned)), get(raw.format(head))
        if old == new:
            print(f"OK: {name} unchanged")
            continue
        changed = True
        diff = list(difflib.unified_diff(old.splitlines(), new.splitlines(),
                                         f"{name}@{pinned[:12]}", f"{name}@{head[:12]}", lineterm="", n=2))
        print(f"DRIFT: {name} changed ({len(diff)} diff lines)")
        print("\n".join(diff[:400]))
        if len(diff) > 400:
            print(f"... {len(diff) - 400} more lines")
    if not changed:
        print(f"New upstream commit {head[:12]} doesn't touch the specs; run with --update to move the pin.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
