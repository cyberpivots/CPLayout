#!/usr/bin/env python3
"""Inject CPLayout repository boundaries into spawned subagents."""

from __future__ import annotations

import json
import sys
import tomllib
from pathlib import Path


def _repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "AGENTS.md").exists() and (candidate / ".codex" / "agents").exists():
            return candidate
    return Path(__file__).resolve().parents[2]


ROOT = _repo_root(Path.cwd())
AGENTS_PATH = ROOT / "AGENTS.md"
AGENT_DIR = ROOT / ".codex" / "agents"
CONTEXT_MAP_FILENAME = "cplayout_context_map.json"


def _read_payload() -> dict[str, object]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _agents_markers() -> list[str]:
    try:
        text = AGENTS_PATH.read_text(encoding="utf-8")
    except OSError:
        return ["AGENTS.md could not be read; re-open it before making CPLayout claims."]

    markers: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if (
            "projected/local `XY`" in stripped
            or "paid Mapbox" in stripped
            or "hidden API keys" in stripped
            or "KML/KMZ" in stripped
            or "runtime proof" in stripped
            or "Google Earth Pro" in stripped
        ):
            markers.append(stripped.lstrip("- "))
    return markers[:8]


def _agent_config(agent_type: object) -> tuple[Path, dict[str, object]] | None:
    if not isinstance(agent_type, str) or not agent_type.strip():
        return None
    requested = agent_type.strip()
    for path in sorted(AGENT_DIR.glob("*.toml")):
        try:
            config = tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError):
            continue
        name = config.get("name")
        if name == requested or path.stem == requested:
            return path, config
    return None


def _context_map_path() -> Path | None:
    repo_path = ROOT / ".codex" / "hooks" / CONTEXT_MAP_FILENAME
    if repo_path.exists():
        return repo_path
    managed_path = Path(__file__).with_name(CONTEXT_MAP_FILENAME)
    return managed_path if managed_path.exists() else None


def _load_context_map() -> dict[str, object] | None:
    path = _context_map_path()
    if path is None:
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict) or parsed.get("schemaVersion") != 1:
        return None
    if not isinstance(parsed.get("contextPacks"), list) or not isinstance(parsed.get("agentContext"), dict):
        return None
    return parsed


def _max_context_packs(context_map: dict[str, object]) -> int:
    limits = context_map.get("limits")
    if isinstance(limits, dict):
        value = limits.get("maxContextPacksPerHook")
        if isinstance(value, int) and value > 0:
            return value
    return 3


def _context_pack_lookup(context_map: dict[str, object]) -> dict[str, dict[str, object]]:
    packs: dict[str, dict[str, object]] = {}
    raw_packs = context_map.get("contextPacks")
    if not isinstance(raw_packs, list):
        return packs
    for raw_pack in raw_packs:
        if not isinstance(raw_pack, dict):
            continue
        pack_id = raw_pack.get("id")
        if isinstance(pack_id, str) and pack_id:
            packs[pack_id] = raw_pack
    return packs


def _agent_context_lines(agent_type: object) -> list[str]:
    if not isinstance(agent_type, str) or not agent_type.strip():
        return []
    context_map = _load_context_map()
    if context_map is None:
        return []
    agent_context = context_map.get("agentContext")
    if not isinstance(agent_context, dict):
        return []
    raw_pack_ids = agent_context.get(agent_type.strip())
    if not isinstance(raw_pack_ids, list):
        return []
    packs_by_id = _context_pack_lookup(context_map)
    pack_ids = [
        pack_id
        for pack_id in raw_pack_ids
        if isinstance(pack_id, str) and pack_id in packs_by_id
    ][:_max_context_packs(context_map)]
    if not pack_ids:
        return []

    lines = ["Context packs:"]
    for pack_id in pack_ids:
        pack = packs_by_id[pack_id]
        purpose = pack.get("purpose")
        read_first = pack.get("readFirstPaths")
        expected_output = pack.get("expectedOutput")
        if not isinstance(purpose, str):
            continue
        lines.append(f"  - {pack_id}: {purpose}")
        if isinstance(read_first, list):
            paths = [path for path in read_first if isinstance(path, str)]
            if paths:
                lines.append(f"    read first: {'; '.join(paths)}")
        if isinstance(expected_output, str) and expected_output.strip():
            lines.append(f"    expected output: {expected_output.strip()}")
    lines.append("No-overlap boundary: stay read-only unless the coordinator assigns a bounded worker scope.")
    return lines


def _scope_lines(config: dict[str, object]) -> list[str]:
    instructions = config.get("developer_instructions")
    if not isinstance(instructions, str):
        return ["developer_instructions missing; re-open the custom agent file before making claims."]
    markers: list[str] = []
    important_terms = (
        "stay read-only",
        "use agents.md",
        "preserve",
        "keep ",
        "do not",
        "require",
        "return",
        "route",
        "visible ui",
        "runtime proof",
        "projected",
        "sqlite",
        "kml",
        "paid",
    )
    for line in instructions.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(term in lower for term in important_terms):
            markers.append(stripped)
    return markers[:9]


def _agent_scope(payload: dict[str, object]) -> list[str]:
    loaded = _agent_config(payload.get("agent_type"))
    if loaded is None:
        return ["No matching .codex/agents/*.toml file found; stay read-only and ask the coordinator for scope."]
    path, config = loaded
    relpath = path.relative_to(ROOT)
    lines = [f"Agent config: {relpath}"]
    description = config.get("description")
    if isinstance(description, str) and description.strip():
        lines.append(f"Description: {description.strip()}")
    sandbox_mode = config.get("sandbox_mode")
    reasoning = config.get("model_reasoning_effort")
    if isinstance(sandbox_mode, str) or isinstance(reasoning, str):
        lines.append(f"Configured sandbox/reasoning: {sandbox_mode or 'inherited'} / {reasoning or 'inherited'}")
    lines.append("Agent-specific read-only scope:")
    lines.extend(f"  - {marker}" for marker in _scope_lines(config))
    context_lines = _agent_context_lines(config.get("name"))
    if context_lines:
        lines.extend(context_lines)
    return lines


def _context(payload: dict[str, object]) -> str:
    agent_type = payload.get("agent_type")
    heading = "CPLayout subagent boundary advisory"
    if isinstance(agent_type, str) and agent_type.strip():
        heading += f" for {agent_type}"

    lines = [
        f"{heading}:",
        "- Re-read AGENTS.md and inspect current repo evidence before making claims.",
        "- Preserve canonical geometry as projected/local XY in the project CRS; WGS84 is input/display unless a schema explicitly changes.",
        "- Keep CPLayout free, no-cost, and offline-first; do not add paid map APIs, hidden keys, paid imagery, or paid cloud backends.",
        "- Treat KML/KMZ Style, LineStyle, PolyStyle, IconStyle, LabelStyle, and styleUrl as visual interchange metadata only.",
        "- Do not claim Google Earth, native MapLibre, SQLite, ZIP sharing, or other runtime behavior is proved without direct checklist evidence.",
        "- Matching agent scope:",
    ]
    lines.extend(f"  - {marker}" for marker in _agent_scope(payload))
    lines.append(
        "- Current AGENTS.md markers:",
    )
    lines.extend(f"  - {marker}" for marker in _agents_markers())
    return "\n".join(lines)


def main() -> int:
    payload = _read_payload()
    if payload.get("hook_event_name") not in (None, "SubagentStart"):
        return 0
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SubagentStart",
                    "additionalContext": _context(payload),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
