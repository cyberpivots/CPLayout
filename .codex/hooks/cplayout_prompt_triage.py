#!/usr/bin/env python3
"""Advisory prompt triage for CPLayout specialist routing.

The hook is intentionally non-blocking. It adds concise context for Codex
sessions that support UserPromptSubmit hooks, but AGENTS.md and verified
workspace evidence remain authoritative.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Route:
    name: str
    skill: str
    keywords: tuple[str, ...]
    note: str


ROUTES = (
    Route(
        name="cplayout_imagery_mapper",
        skill="cplayout-imagery-mapping-agent",
        keywords=(
            "google earth",
            "earth pro",
            "kml",
            "kmz",
            "imagery",
            "image",
            "cv",
            "computer vision",
            "boundary",
            "operator boundary",
            "field boundary",
            "visual fidelity",
        ),
        note="Keep KML/KMZ styling visual-only and require evidence before any imagery/CV claim.",
    ),
    Route(
        name="cplayout_interface_developer",
        skill="cplayout-interface-development-agent",
        keywords=(
            "ui",
            "ux",
            "interface",
            "component",
            "screen",
            "expo",
            "react native",
            "playwright",
            "svg map",
            "mobile",
            "web",
        ),
        note="Preserve offline-first Expo boundaries and run visible UI proof when screens change.",
    ),
    Route(
        name="cplayout_center_pivot_designer",
        skill="cplayout-center-pivot-design-agent",
        keywords=(
            "pivot",
            "center pivot",
            "corner arm",
            "linear",
            "lateral move",
            "irrigation",
            "sprinkler",
            "tower",
            "span",
            "acre",
            "layout",
        ),
        note="Separate source-backed design evidence from advisory software scoring.",
    ),
    Route(
        name="cplayout_database_specialist",
        skill="cplayout-database-agent",
        keywords=(
            "database",
            "sqlite",
            "expo sqlite",
            "project-store",
            "crud",
            "migration",
            "archive",
            "zip",
            "persistence",
            "storage",
            "schema",
        ),
        note="Keep native SQLite, web storage, and project archive contracts explicit.",
    ),
    Route(
        name="cplayout_kb_curator",
        skill="cplayout-expert-agent-panels",
        keywords=(
            "skill",
            "agent",
            "prompt",
            "knowledge",
            "source ledger",
            "known gap",
            "registry",
            "multi-agent",
            "subagent",
            "hook",
        ),
        note="Record verified facts, sources, validation, and unresolved gaps separately.",
    ),
)


def _read_payload() -> tuple[dict[str, object], bool]:
    try:
        raw = sys.stdin.read()
    except OSError:
        return {}, True
    if not raw.strip():
        return {}, True
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"prompt": raw}, True
    if isinstance(payload, dict):
        return payload, False
    return {}, True


def _prompt_from_payload(payload: dict[str, object]) -> str:
    prompt = payload.get("prompt")
    if isinstance(prompt, str):
        return prompt
    messages = payload.get("messages")
    if isinstance(messages, list):
        parts: list[str] = []
        for message in messages:
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    parts.append(content)
        return "\n".join(parts)
    return ""


def _match_routes(prompt: str) -> list[Route]:
    normalized = prompt.lower()
    matches: list[Route] = []
    for route in ROUTES:
        if any(keyword in normalized for keyword in route.keywords):
            matches.append(route)
    return matches


def _context(matches: list[Route], shape_unknown: bool) -> str:
    lines = [
        "CPLayout prompt triage advisory:",
        "- Start non-trivial work with AGENTS.md plus git status preflight.",
        "- Preserve offline-first, no-cost operation and projected/local XY canonical geometry.",
        "- Treat Google Earth/KML styling and imagery/CV output as evidence unless the project schema explicitly changes.",
        "- Hooks are advisory context, not enforcement or proof of runtime behavior.",
    ]
    if matches:
        lines.append("- Matched specialists:")
        for route in matches:
            lines.append(f"  - {route.name} via ${route.skill}: {route.note}")
    else:
        lines.append("- No specialist keywords matched; use workspace preflight and narrow source-backed planning.")
    if shape_unknown:
        lines.append("- Hook input shape was incomplete or non-JSON; verify prompt scope before mutation.")
    return "\n".join(lines)


def main() -> int:
    payload, shape_unknown = _read_payload()
    if payload.get("hook_event_name") not in (None, "UserPromptSubmit"):
        return 0

    matches = _match_routes(_prompt_from_payload(payload))
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": _context(matches, shape_unknown),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
