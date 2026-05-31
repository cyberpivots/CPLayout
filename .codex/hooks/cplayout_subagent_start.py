#!/usr/bin/env python3
"""Inject CPLayout repository boundaries into spawned subagents."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENTS_PATH = ROOT / "AGENTS.md"


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
        "- Current AGENTS.md markers:",
    ]
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
