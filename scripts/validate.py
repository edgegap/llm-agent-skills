"""Repository checks: skill frontmatter, JSON files, Claude and Codex plugin manifests. Run: python scripts/validate.py"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []


def check_skill(skill_md: Path) -> None:
    text = skill_md.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"{skill_md}: missing YAML frontmatter")
        return
    fields = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip().strip("'\"")
    name, desc = fields.get("name", ""), fields.get("description", "")
    if name != skill_md.parent.name:
        errors.append(f"{skill_md}: name '{name}' must match folder '{skill_md.parent.name}'")
    if not re.fullmatch(r"[a-z0-9-]{1,64}", name):
        errors.append(f"{skill_md}: name must be lowercase letters, digits and hyphens")
    if not desc:
        errors.append(f"{skill_md}: missing description")
    elif len(desc) > 1024:
        errors.append(f"{skill_md}: description is {len(desc)} chars (max 1024)")
    raw = m.group(1).split("description:", 1)[1].strip() if "description:" in m.group(1) else ""
    if ": " in raw and not raw.startswith(("'", '"', ">", "|")):
        errors.append(f"{skill_md}: quote the description, it contains ': ' (invalid plain YAML scalar)")
    first = raw.splitlines()[0] if raw else ""
    if first.startswith("'") and "'" in first[1:-1].replace("''", ""):
        errors.append(f"{skill_md}: the single-quoted description contains a lone ' (write '' or rephrase); strict YAML parsers such as Codex's reject it")
    if first.startswith('"') and re.search(r'(?<!\)"', first[1:-1]):
        errors.append(f"{skill_md}: the double-quoted description contains an unescaped \"")
    if not (skill_md.parent / "agents/openai.yaml").exists():
        errors.append(f"{skill_md.parent.name}: missing agents/openai.yaml (Codex display name and default prompt)")
    lines = text.count("\n")
    if lines > 500:
        errors.append(f"{skill_md}: {lines} lines, keep SKILL.md under 500")
    for ref in re.findall(r"`((?:references|assets)/[^`*]+?)`", text):
        if not (skill_md.parent / ref.split(" ")[0]).exists():
            errors.append(f"{skill_md}: referenced file not found: {ref}")
    if not re.search(r'^metadata:\n  version: "\d+\.\d+\.\d+"$', m.group(1), re.M):
        errors.append(f"{skill_md}: frontmatter needs metadata.version as a quoted semver, e.g. version: \"0.2.0\"")


def check_links() -> None:
    """Every relative markdown link and every `edgegap-*` skill name mentioned must exist."""
    skills = {p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md")}
    for md in (ROOT / "skills").rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        for target in re.findall(r"\]\((?!https?://|#|mailto:)([^)\s]+)\)", text):
            if not (md.parent / target.split("#")[0]).exists():
                errors.append(f"{md.relative_to(ROOT)}: broken link {target}")
        for name in set(re.findall(r"`(edgegap(?:-[a-z]+)*)`", text)):
            if name not in skills:
                errors.append(f"{md.relative_to(ROOT)}: mentions skill `{name}`, which doesn't exist")


def check_json() -> None:
    for path in ROOT.rglob("*.json"):
        if any(part.startswith(".git") and part != ".github" for part in path.parts):
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{path.relative_to(ROOT)}: invalid JSON ({e})")


def check_manifests() -> None:
    plugin = json.loads((ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
    market = json.loads((ROOT / ".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
    versions = {plugin.get("version")} | {p.get("version") for p in market.get("plugins", []) if p.get("name") == plugin.get("name")}
    if len(versions) != 1:
        errors.append(f"plugin.json and marketplace.json versions differ: {versions}")
    codex = json.loads((ROOT / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    if codex.get("version") != plugin.get("version"):
        errors.append(f".codex-plugin/plugin.json version {codex.get('version')} differs from .claude-plugin/plugin.json {plugin.get('version')}")
    ui = codex.get("interface", {})
    for key, limit in (("displayName", 30), ("shortDescription", 30), ("longDescription", 4000), ("developerName", 80)):
        if len(ui.get(key, "")) > limit:
            errors.append(f".codex-plugin/plugin.json: interface.{key} is over {limit} characters (Plugins Directory limit)")
    if len(codex.get("description", "")) > 4000 or len(codex.get("keywords", [])) > 25:
        errors.append(".codex-plugin/plugin.json: description over 4000 characters or more than 25 keywords")
    for prompt in ui.get("defaultPrompt", []):
        if len(prompt) > 128:
            errors.append(f".codex-plugin/plugin.json: defaultPrompt over 128 characters: {prompt[:40]}...")
    for key in ("logo", "composerIcon"):
        if not (ROOT / ui.get(key, "missing")).exists():
            errors.append(f".codex-plugin/plugin.json: interface.{key} file not found")
    for key in ("skills", "mcpServers"):
        if not (ROOT / codex.get(key, "")).exists():
            errors.append(f".codex-plugin/plugin.json: {key} path {codex.get(key)} not found")
    if plugin.get("version") and plugin["version"] not in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"):
        errors.append(f"CHANGELOG.md has no entry for {plugin['version']}")


def check_secrets() -> None:
    uuid = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")
    for path in ROOT.rglob("*"):
        if path.is_file() and ".git" not in path.parts and path.suffix in {".md", ".json", ".cs", ".txt", ".asset", ".gd", ".cfg", ".godot", ""}:
            for hit in uuid.findall(path.read_text(encoding="utf-8", errors="ignore")):
                if not hit.startswith("xxxxxxxx"):
                    errors.append(f"{path.relative_to(ROOT)}: looks like a real token/UUID ({hit[:8]}...)")


for skill in sorted((ROOT / "skills").glob("*/SKILL.md")):
    check_skill(skill)
check_links()
check_json()
check_manifests()
check_secrets()

if errors:
    print("\n".join(f"FAIL {e}" for e in errors))
    sys.exit(1)
print("All checks passed.")
