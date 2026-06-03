#!/usr/bin/env python3
"""Advisory prompt triage for CPLayout specialist routing.

The hook is intentionally non-blocking. It adds concise context for Codex
sessions that support UserPromptSubmit hooks, but AGENTS.md and verified
workspace evidence remain authoritative.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Keyword:
    term: str
    tokens: tuple[str, ...]
    weight: int


@dataclass(frozen=True)
class RouteDefinition:
    route_id: str
    skill: str
    agent: str
    note: str
    complexity_band: str
    reasoning_effort: str
    spawn_policy: str
    routing_reason: str
    validation_expectations: tuple[str, ...]
    priority: int
    positive_keywords: tuple[Keyword, ...]
    negative_keywords: tuple[Keyword, ...]


@dataclass(frozen=True)
class RouteMatch:
    route: RouteDefinition
    score: int


ROUTE_DATA_FILENAME = "cplayout_route_data.json"
TOKEN_RE = re.compile(r"[a-z0-9_]+")
COMPLEXITY_ORDER = {"low": 0, "medium": 1, "high": 2, "xhigh": 3}
REASONING_EFFORTS = frozenset(("minimal", "low", "medium", "high", "xhigh"))
SPAWN_POLICIES = frozenset(("required", "optional", "not_useful"))
EXPLICIT_MULTI_AGENT_TERMS = (
    "multi-agent",
    "multi agent",
    "subagent",
    "subagents",
    "expert panel",
    "expert panels",
    "expert-agent panel",
    "expert-agent panels",
    "agent panel",
    "agent panels",
    "parallel agent",
    "parallel agents",
    "spawn agent",
    "spawn agents",
    "specialist team",
    "specialist teams",
    "delegate to agents",
)


@dataclass(frozen=True)
class RouteData:
    max_routes: int
    min_score: int
    unmatched_complexity: str
    unmatched_reasoning_effort: str
    base_validation_expectations: tuple[str, ...]
    routes: tuple[RouteDefinition, ...]


def _repo_route_data_path(start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        route_data_path = candidate / ".codex" / "hooks" / ROUTE_DATA_FILENAME
        if route_data_path.exists():
            return route_data_path
    return None


def _route_data_path() -> Path:
    cwd_route_data = _repo_route_data_path(Path.cwd())
    if cwd_route_data is not None:
        return cwd_route_data
    return Path(__file__).with_name(ROUTE_DATA_FILENAME)


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
        tokens = _tokens(term)
        if not tokens:
            raise ValueError("route keyword term must contain at least one token")
        keywords.append(Keyword(term=term.lower(), tokens=tokens, weight=weight))
    return tuple(keywords)


def _string_list(raw_value: object, field_name: str) -> tuple[str, ...]:
    if not isinstance(raw_value, list):
        raise ValueError(f"{field_name} must be a list")
    values: list[str] = []
    for raw_item in raw_value:
        if not isinstance(raw_item, str) or not raw_item.strip():
            raise ValueError(f"{field_name} entries must be non-empty strings")
        values.append(raw_item.strip())
    return tuple(values)


def load_route_data(path: Path | None = None) -> RouteData:
    path = _route_data_path() if path is None else path
    raw_data = json.loads(path.read_text(encoding="utf-8"))
    max_routes = raw_data.get("maxRoutes")
    min_score = raw_data.get("minScore")
    unmatched_complexity = raw_data.get("unmatchedComplexity")
    unmatched_reasoning_effort = raw_data.get("unmatchedReasoningEffort")
    base_validation_expectations = _string_list(
        raw_data.get("baseValidationExpectations"), "baseValidationExpectations"
    )
    raw_routes = raw_data.get("routes")
    if not isinstance(max_routes, int) or max_routes <= 0:
        raise ValueError("maxRoutes must be a positive integer")
    if not isinstance(min_score, int) or min_score < 0:
        raise ValueError("minScore must be a non-negative integer")
    if not isinstance(unmatched_complexity, str) or not unmatched_complexity.strip():
        raise ValueError("unmatchedComplexity must be a non-empty string")
    if not isinstance(unmatched_reasoning_effort, str) or not unmatched_reasoning_effort.strip():
        raise ValueError("unmatchedReasoningEffort must be a non-empty string")
    if not isinstance(raw_routes, list):
        raise ValueError("routes must be a list")

    routes: list[RouteDefinition] = []
    for raw_route in raw_routes:
        if not isinstance(raw_route, dict):
            raise ValueError("route must be an object")
        route_id = raw_route.get("id")
        skill = raw_route.get("skill")
        agent = raw_route.get("agent")
        note = raw_route.get("note")
        complexity_band = raw_route.get("complexityBand")
        reasoning_effort = raw_route.get("reasoningEffort")
        spawn_policy = raw_route.get("spawnPolicy")
        routing_reason = raw_route.get("routingReason")
        priority = raw_route.get("priority")
        if not isinstance(route_id, str) or not route_id.strip():
            raise ValueError("route id must be a non-empty string")
        if not isinstance(skill, str) or not skill.strip():
            raise ValueError(f"{route_id}: skill must be a non-empty string")
        if not isinstance(agent, str) or not agent.strip():
            raise ValueError(f"{route_id}: agent must be a non-empty string")
        if not isinstance(note, str) or not note.strip():
            raise ValueError(f"{route_id}: note must be a non-empty string")
        if complexity_band not in COMPLEXITY_ORDER:
            raise ValueError(f"{route_id}: complexityBand must be one of low, medium, high, xhigh")
        if reasoning_effort not in REASONING_EFFORTS:
            raise ValueError(f"{route_id}: reasoningEffort must be a supported reasoning effort")
        if spawn_policy not in SPAWN_POLICIES:
            raise ValueError(f"{route_id}: spawnPolicy must be required, optional, or not_useful")
        if not isinstance(routing_reason, str) or not routing_reason.strip():
            raise ValueError(f"{route_id}: routingReason must be a non-empty string")
        if not isinstance(priority, int):
            raise ValueError(f"{route_id}: priority must be an integer")
        routes.append(
            RouteDefinition(
                route_id=route_id,
                skill=skill,
                agent=agent,
                note=note,
                complexity_band=complexity_band,
                reasoning_effort=reasoning_effort,
                spawn_policy=spawn_policy,
                routing_reason=routing_reason,
                validation_expectations=_string_list(
                    raw_route.get("validationExpectations"), f"{route_id}.validationExpectations"
                ),
                priority=priority,
                positive_keywords=_keywords(raw_route.get("positiveKeywords")),
                negative_keywords=_keywords(raw_route.get("negativeKeywords")),
            )
        )
    return RouteData(
        max_routes=max_routes,
        min_score=min_score,
        unmatched_complexity=unmatched_complexity.strip(),
        unmatched_reasoning_effort=unmatched_reasoning_effort.strip(),
        base_validation_expectations=base_validation_expectations,
        routes=tuple(routes),
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


def _tokens(text: str) -> tuple[str, ...]:
    return tuple(TOKEN_RE.findall(text.lower()))


def _has_phrase(prompt_tokens: tuple[str, ...], phrase_tokens: tuple[str, ...]) -> bool:
    if not phrase_tokens or len(phrase_tokens) > len(prompt_tokens):
        return False
    phrase_len = len(phrase_tokens)
    return any(prompt_tokens[index : index + phrase_len] == phrase_tokens for index in range(len(prompt_tokens)))


def _keyword_matches(prompt_tokens: tuple[str, ...], keyword: Keyword) -> bool:
    return _has_phrase(prompt_tokens, keyword.tokens)


def _score_route(prompt_tokens: tuple[str, ...], route: RouteDefinition) -> int:
    positive = sum(keyword.weight for keyword in route.positive_keywords if _keyword_matches(prompt_tokens, keyword))
    negative = sum(keyword.weight for keyword in route.negative_keywords if _keyword_matches(prompt_tokens, keyword))
    return positive - negative


def match_routes(
    prompt: str,
    *,
    max_routes: int | None = None,
    min_score: int | None = None,
    routes: tuple[RouteDefinition, ...] | None = None,
) -> list[RouteMatch]:
    route_data = load_route_data()
    max_routes = route_data.max_routes if max_routes is None else max_routes
    min_score = route_data.min_score if min_score is None else min_score
    routes = route_data.routes if routes is None else routes
    prompt_tokens = _tokens(prompt)
    matches: list[RouteMatch] = []
    for route in routes:
        score = _score_route(prompt_tokens, route)
        if score >= min_score:
            matches.append(RouteMatch(route=route, score=score))
    matches.sort(key=lambda match: (-match.score, match.route.priority, match.route.route_id))
    return matches[:max_routes]


def _selected_complexity(matches: list[RouteMatch], route_data: RouteData) -> str:
    if not matches:
        return route_data.unmatched_complexity
    return max(
        (match.route.complexity_band for match in matches),
        key=lambda band: COMPLEXITY_ORDER.get(band, 0),
    )


def _selected_reasoning(matches: list[RouteMatch], route_data: RouteData) -> str:
    if not matches:
        return route_data.unmatched_reasoning_effort
    reasoning_order = {"minimal": -1, "low": 0, "medium": 1, "high": 2, "xhigh": 3}
    return max(
        (match.route.reasoning_effort for match in matches),
        key=lambda effort: reasoning_order.get(effort, -1),
    )


def has_explicit_multi_agent_request(prompt: str) -> bool:
    prompt_tokens = _tokens(prompt)
    return any(_has_phrase(prompt_tokens, _tokens(term)) for term in EXPLICIT_MULTI_AGENT_TERMS)


def subagent_decision(prompt: str, matches: list[RouteMatch]) -> tuple[str, str]:
    if has_explicit_multi_agent_request(prompt):
        return "required", "Prompt explicitly asks for multi-agent, subagent, panel, parallel-agent, or delegation work."
    if matches:
        return (
            "required",
            "Standing CPLayout owner preference authorizes bounded subagents for non-trivial matched specialist work.",
        )
    return "not useful", "No specialist route matched; use coordinator preflight and narrow source-backed judgment."


def _validation_expectations(route_data: RouteData, matches: list[RouteMatch]) -> list[str]:
    expectations = list(route_data.base_validation_expectations)
    for match in matches:
        for expectation in match.route.validation_expectations:
            if expectation not in expectations:
                expectations.append(expectation)
    return expectations[:5]


def optimized_reprompt(
    prompt: str,
    matches: list[RouteMatch],
    route_data: RouteData | None = None,
) -> str:
    route_data = load_route_data() if route_data is None else route_data
    complexity = _selected_complexity(matches, route_data)
    reasoning = _selected_reasoning(matches, route_data)
    decision, _reason = subagent_decision(prompt, matches)
    specialists = ", ".join(match.route.agent for match in matches) if matches else "coordinator only"
    if matches:
        opening = f"Use {reasoning} reasoning ({complexity})."
    else:
        opening = "Perform complexity analysis before mutation; select reasoning effort from task scope."
    return (
        f"{opening} Start with AGENTS.md plus git status. "
        f"Route through {specialists}. Subagent decision: {decision}. "
        "Keep hooks advisory unless installed through managed requirements. "
        "Preserve offline/no-cost operation, projected/local XY canonical geometry, and evidence-only KML/KMZ/imagery boundaries."
    )


def _context(prompt: str, matches: list[RouteMatch], shape_unknown: bool) -> str:
    route_data = load_route_data()
    complexity = _selected_complexity(matches, route_data)
    reasoning = _selected_reasoning(matches, route_data)
    decision, decision_reason = subagent_decision(prompt, matches)
    validation = _validation_expectations(route_data, matches)
    lines = [
        "CPLayout coordinator contract:",
        "- Preflight: AGENTS.md plus git status --short; preserve unrelated dirty work.",
        "- Hooks: advisory context only, not enforcement or runtime proof.",
        f"- Complexity: {complexity}; reasoning: {reasoning}.",
        f"- Subagents: {decision}. {decision_reason}",
    ]
    if matches:
        lines.append(f"- Matched specialists (max {route_data.max_routes}):")
        for match in matches:
            route = match.route
            lines.append(
                "  - "
                f"{route.route_id} -> {route.agent} "
                f"(score {match.score}; {route.complexity_band}/{route.reasoning_effort}; "
                f"{route.spawn_policy}): {route.routing_reason}"
            )
    else:
        lines.append("- Routes: none; complexity analysis required before mutation.")
    lines.append(f"- Validation expectations (max {len(validation)}):")
    lines.extend(f"  - {expectation}" for expectation in validation)
    lines.append(f"- Optimized re-prompt: {optimized_reprompt(prompt, matches, route_data)}")
    if shape_unknown:
        lines.append("- Hook input shape was incomplete or non-JSON; verify prompt scope before mutation.")
    return "\n".join(lines)


def main() -> int:
    payload, shape_unknown = _read_payload()
    if payload.get("hook_event_name") not in (None, "UserPromptSubmit"):
        return 0

    prompt = _prompt_from_payload(payload)
    matches = match_routes(prompt)
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": _context(prompt, matches, shape_unknown),
                }
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
