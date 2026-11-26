"""Build the Claude plugin directory variant of this skills pack.

The plugin directory only accepts Markdown, text, JSON, YAML and images from
organizations that are not Verified. This script copies the pack into OUT_DIR
with only those files: every template under skills/*/assets that is code, a
script, a package manifest or a dotfile becomes `<file>.md` holding the file in
one fenced code block, and each SKILL.md gets a short note saying so.
evals/, scripts/, the Codex plugin and the marketplace file are left out.

Usage: python scripts/build_claude_directory.py OUT_DIR
OUT_DIR is emptied first (except .git), so point it at a worktree of the
`claude-directory` branch.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ALLOWED_EXT = {".md", ".txt", ".json", ".yaml", ".yml", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
# Files the directory refuses whatever their extension.
REFUSED_NAMES = {
    "package.json", "package-lock.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "yarn.lock",
    "requirements.txt", "agents.md", "claude.md", "claude.local.md", ".npmrc", ".yarnrc",
    ".yarnrc.yml", "pip.conf", "bunfig.toml",
    # Compose files pass credentials to commands; ship them as text.
    "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
}

# plugin.json fields Claude Code reads.
PLUGIN_FIELDS = ["name", "version", "description", "author", "homepage", "repository", "license", "privacyPolicyUrl", "keywords"]

LANG = {
    ".cs": "csharp", ".ts": "ts", ".js": "js", ".mjs": "js", ".cjs": "js", ".gd": "gdscript",
    ".sh": "bash", ".ps1": "powershell", ".bat": "bat", ".py": "python", ".go": "go",
    ".cpp": "cpp", ".h": "cpp", ".css": "css", ".html": "html", ".xml": "xml", ".ini": "ini",
    ".cfg": "ini", ".json": "json", ".sql": "sql", ".tscn": "ini", ".godot": "ini",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "toml",
}

# Line edits the directory's checks ask for, applied after conversion.
# (path relative to skills/, regex, replacement)
PATCHES: list[tuple[str, str, str]] = []

NOTE = (
    "> **Templates in this plugin:** every code or config template under `assets/` is stored as "
    "Markdown: `assets/<path>.md` holds the file `assets/<path>` in a single code block. "
    "When a step says to copy `assets/<path>`, write that block's content (without the fences) "
    "to `<path>` in the project.\n"
)


def needs_conversion(path: Path) -> bool:
    name = path.name.lower()
    if name in REFUSED_NAMES or name.startswith(".env"):
        return True
    if path.suffix.lower() not in ALLOWED_EXT:
        return True
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        return False
    return path.read_bytes()[:2] == b"#!"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def fence_for(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`{3,}|~{3,}", text)), default=0)
    return "`" * max(3, longest + 1)


def convert(src: Path, rel: Path) -> str:
    text = read_text(src)
    lang = LANG.get(src.suffix.lower(), "")
    if src.name == "Dockerfile":
        lang = "dockerfile"
    fence = fence_for(text)
    body = text if text.endswith("\n") else text + "\n"
    return (
        f"# `{Path(*rel.parts[1:]).as_posix()}`\n\n"
        f"Template file. Write the content of the code block below, without the fences, to "
        f"`{rel.name}`.\n\n{fence}{lang}\n{body}{fence}\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name == ".git":
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()

    # Plugin manifest with the remote MCP server inline.
    manifest = json.loads((ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
    plugin = {k: manifest[k] for k in PLUGIN_FIELDS if k in manifest}
    mcp = json.loads((ROOT / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]
    plugin["mcpServers"] = {
        name: {k: v for k, v in server.items() if k in {"type", "url"}}
        for name, server in mcp.items()
    }
    (out / ".claude-plugin").mkdir()
    (out / ".claude-plugin/plugin.json").write_text(json.dumps(plugin, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(ROOT / ".claude-plugin/icon.png", out / ".claude-plugin/icon.png")
    shutil.copy2(ROOT / "LICENSE", out / "LICENSE")

    converted = 0
    for src in sorted((ROOT / "skills").rglob("*")):
        if not src.is_file():
            continue
        rel = src.relative_to(ROOT / "skills")
        if needs_conversion(src):
            dest = out / "skills" / rel.parent / (rel.name + ".md")
            text = convert(src, rel)
            converted += 1
        else:
            dest = out / "skills" / rel
            text = None
        dest.parent.mkdir(parents=True, exist_ok=True)
        if text is None:
            if src.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                shutil.copy2(src, dest)
                continue
            text = read_text(src)
        if src.name == "SKILL.md" and (src.parent / "assets").is_dir():
            # Note goes right after the front matter.
            parts = text.split("---\n", 2)
            text = f"---\n{parts[1]}---\n\n{NOTE}{parts[2]}"
        dest.write_text(text, encoding="utf-8", newline="\n")

    for rel, pattern, repl in PATCHES:
        f = out / "skills" / rel
        new, n = re.subn(pattern, repl, f.read_text(encoding="utf-8"), flags=re.M)
        if not n:
            sys.exit(f"patch did not apply: {rel}: {pattern}")
        f.write_text(new, encoding="utf-8", newline="\n")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    title = readme.splitlines()[0]
    (out / "README.md").write_text(
        f"{title}\n\n{plugin['description']}\n\n"
        f"This is the Claude plugin directory build of [{manifest['repository'].split('github.com/')[-1]}]"
        f"({manifest['repository']}), generated from `main` by `scripts/build_claude_directory.py`. "
        "Templates are stored as Markdown code blocks; edit the skills on `main`, not here.\n",
        encoding="utf-8",
        newline="\n",
    )
    files = sum(1 for p in out.rglob("*") if p.is_file() and ".git" not in p.parts)
    print(f"{files} files, {converted} templates converted to Markdown")


if __name__ == "__main__":
    main()
