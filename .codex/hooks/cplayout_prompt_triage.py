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
from pathlib import Path


@dataclass(frozen=True)
class Keyword:
    term: str
    weight: int


@dataclass(frozen=True)
class RouteDefinition:
    route_id: str
    skill: str
    note: str
    priority: int
    positive_keywords: tuple[Keyword, ...]
    negative_keywords: tuple[Keyword, ...]


@dataclass(frozen=True)
class RouteMatch:
    route: RouteDefinition
    score: int


ROUTE_DATA_PATH = Path(__file__).with_name("cplayout_route_data.json")


def _keywords(raw_keywords: object) -> tuple[Keyword, ...]:
    if not isinstance(raw_keywords, list):
        raise ValueError("route keywords must be lists")
    keywords: list[Keyword] = []
    for raw_keyword in raw_keywords:
        if not isinstance(raw_keyword, dict):
            raise ValueError("route keyword must be an object")
        term = raw_keyword.get("term")
        weight = raw_keyword.get("weight")
        if not isinstance(term, str) or not term.strip():
            raise ValueError("route keyword term must be a non-empty string")
        if not isinstance(weight, int) or weight <= 0:
            raise ValueError("route keyword weight must be a positive integer")
        keywords.append(Keyword(term=term.lower(), weight=weight))
    return tuple(keywords)


def load_route_data(path: Path = ROUTE_DATA_PATH) -> tuple[int, int, tuple[RouteDefinition, ...]]:
    raw_data = json.loads(path.read_text(encoding="utf-8"))
    max_routes = raw_data.get("maxRoutes")
    min_score = raw_data.get("minScore")
    raw_routes = raw_data.get("routes")
    if not isinstance(max_routes, int) or max_routes <= 0:
        raise ValueError("maxRoutes must be a positive integer")
    if not isinstance(min_score, int) or min_score < 0:
        raise ValueError("minScore must be a non-negative integer")
    if not isinstance(raw_routes, list):
        raise ValueError("routes must be a list")

    routes: list[RouteDefinition] = []
    for raw_route in raw_routes:
        if not isinstance(raw_route, dict):
            raise ValueError("route must be an object")
        route_id = raw_route.get("id")
        skill = raw_route.get("skill")
        note = raw_route.get("note")
        priority = raw_route.get("priority")
        if not isinstance(route_id, str) or not route_id.strip():
            raise ValueError("route id must be a non-empty string")
        if not isinstance(skill, str) or not skill.strip():
            raise ValueError(f"{route_id}: skill must be a non-empty string")
        if not isinstance(note, str) or not note.strip():
            raise ValueError(f"{route_id}: note must be a non-empty string")
        if not isinstance(priority, int):
            raise ValueError(f"{route_id}: priority must be an integer")
        routes.append(
            RouteDefinition(
                route_id=route_id,
                skill=skill,
                note=note,
                priority=priority,
                positive_keywords=_keywords(raw_route.get("positiveKeywords")),
                negative_keywords=_keywords(raw_route.get("negativeKeywords")),
            )
        )
    return max_routes, min_score, tuple(routes)


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


def _score_route(normalized_prompt: str, route: RouteDefinition) -> int:
    positive = sum(keyword.weight for keyword in route.positive_keywords if keyword.term in normalized_prompt)
    negative = sum(keyword.weight for keyword in route.negative_keywords if keyword.term in normalized_prompt)
    return positive - negative


def match_routes(
    prompt: str,
    *,
    max_routes: int | None = None,
    min_score: int | None = None,
    routes: tuple[RouteDefinition, ...] | None = None,
) -> list[RouteMatch]:
    loaded_max_routes, loaded_min_score, loaded_routes = load_route_data()
    max_routes = loaded_max_routes if max_routes is None else max_routes
    min_score = loaded_min_score if min_score is None else min_score
    routes = loaded_routes if routes is None else routes
    normalized = prompt.lower()
    matches: list[RouteMatch] = []
    for route in routes:
        score = _score_route(normalized, route)
        if score >= min_score:
            matches.append(RouteMatch(route=route, score=score))
    matches.sort(key=lambda match: (-match.score, match.route.priority, match.route.route_id))
    return matches[:max_routes]


def _context(matches: list[RouteMatch], shape_unknown: bool) -> str:
    lines = [
        "CPLayout prompt triage advisory:",
        "- Start non-trivial work with AGENTS.md plus git status preflight.",
        "- Preserve offline-first, no-cost operation and projected/local XY canonical geometry.",
        "- Treat Google Earth/KML styling and imagery/CV output as evidence unless the project schema explicitly changes.",
        "- Hooks are advisory context, not enforcement or proof of runtime behavior.",
    ]
    if matches:
        lines.append("- Matched specialists:")
        for match in matches:
            route = match.route
            lines.append(f"  - {route.route_id} via ${route.skill} (score {match.score}): {route.note}")
    else:
        lines.append("- No specialist keywords matched; use workspace preflight and narrow source-backed planning.")
    if shape_unknown:
        lines.append("- Hook input shape was incomplete or non-JSON; verify prompt scope before mutation.")
    return "\n".join(lines)


def main() -> int:
    payload, shape_unknown = _read_payload()
    if payload.get("hook_event_name") not in (None, "UserPromptSubmit"):
        return 0

    matches = match_routes(_prompt_from_payload(payload))
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
