#!/usr/bin/env python3
"""Advisory Stop hook for explicit CPLayout multi-agent prompts.

This script is intended for managed-hook deployments. Repo-local execution is
still advisory because project hooks depend on trust and local configuration.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any


TOKEN_RE = re.compile(r"[a-z0-9_]+")
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
DECISION_TERMS = (
    "subagent decision",
    "subagents required",
    "subagents optional",
    "subagents not useful",
    "subagent summary",
    "multi-agent summary",
    "spawned subagent",
    "spawned agent",
    "accepted fallback",
    "fallback explanation",
    "did not spawn subagents",
    "did not spawn agents",
)


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}
    return parsed if isinstance(parsed, dict) else {}


def _tokens(text: str) -> tuple[str, ...]:
    return tuple(TOKEN_RE.findall(text.lower()))


def _has_phrase(text: str, phrase: str) -> bool:
    text_tokens = _tokens(text)
    phrase_tokens = _tokens(phrase)
    if not phrase_tokens or len(phrase_tokens) > len(text_tokens):
        return False
    phrase_len = len(phrase_tokens)
    return any(text_tokens[index : index + phrase_len] == phrase_tokens for index in range(len(text_tokens)))


def _flatten_text(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        texts: list[str] = []
        for item in value.values():
            texts.extend(_flatten_text(item))
        return texts
    if isinstance(value, list):
        texts = []
        for item in value:
            texts.extend(_flatten_text(item))
        return texts
    return []


def _field_text(payload: dict[str, Any], field_names: tuple[str, ...]) -> str:
    parts: list[str] = []
    for field_name in field_names:
        if field_name in payload:
            parts.extend(_flatten_text(payload[field_name]))
    return "\n".join(parts)


def has_explicit_multi_agent_request(text: str) -> bool:
    return any(_has_phrase(text, phrase) for phrase in EXPLICIT_MULTI_AGENT_TERMS)


def has_subagent_decision(text: str) -> bool:
    return any(_has_phrase(text, phrase) for phrase in DECISION_TERMS)


def _context() -> str:
    return "\n".join(
        [
            "CPLayout Stop hook advisory:",
            "- Explicit multi-agent or subagent request detected without an auditable subagent decision.",
            "- Continue the turn with either `Subagent decision: required/optional/not useful` plus specialist summary, or `Accepted fallback:` plus why local coordinator-only handling is acceptable.",
            "- Keep the explanation source-backed; hooks remain advisory unless installed through managed requirements.toml.",
        ]
    )


def main() -> int:
    payload = _read_payload()
    if payload.get("hook_event_name") not in (None, "Stop"):
        return 0

    prompt_text = _field_text(payload, ("prompt", "user_prompt", "messages", "transcript", "conversation"))
    final_text = _field_text(payload, ("response", "assistant_response", "final_response", "messages", "transcript"))
    combined_text = "\n".join(part for part in (prompt_text, final_text) if part)

    if has_explicit_multi_agent_request(prompt_text or combined_text) and not has_subagent_decision(final_text):
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": _context(),
                    }
                }
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
