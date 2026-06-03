#!/usr/bin/env python3
"""Advisory Stop hook for CPLayout prompts that need subagent accounting.

When a required subagent decision is missing, the hook asks Codex for one more
turn via the documented Stop continuation shape. Repo-local execution still
depends on trust and local hook configuration.
"""

from __future__ import annotations

import json
import re
import sys
import importlib.util
from pathlib import Path
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
DECISION_RE = re.compile(
    r"\b(?:Subagent decision|Accepted fallback)\s*:",
    re.IGNORECASE,
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
    return bool(DECISION_RE.search(text))


def has_matched_cplayout_route(text: str) -> bool:
    if not text.strip():
        return False
    triage_path = Path(__file__).with_name("cplayout_prompt_triage.py")
    spec = importlib.util.spec_from_file_location("cplayout_prompt_triage_for_stop", triage_path)
    if spec is None or spec.loader is None:
        return False
    triage = importlib.util.module_from_spec(spec)
    try:
        sys.modules[spec.name] = triage
        spec.loader.exec_module(triage)
        return bool(triage.match_routes(text))
    except Exception:  # noqa: BLE001 - Stop hook must stay advisory/non-fatal.
        return False


def _continuation_reason() -> str:
    return "\n".join(
        [
            "CPLayout Stop hook continuation:",
            "Explicit multi-agent request or matched CPLayout specialist prompt ended without auditable subagent accounting.",
            "Continue the turn with either `Subagent decision: required/optional/not useful` plus specialist summary, or `Accepted fallback:` plus why local coordinator-only handling is acceptable.",
            "Keep the explanation source-backed; hooks remain advisory unless installed through managed requirements.toml and verified after restart.",
        ]
    )


def main() -> int:
    payload = _read_payload()
    if payload.get("hook_event_name") not in (None, "Stop"):
        return 0
    if payload.get("stop_hook_active") is True:
        return 0

    prompt_text = _field_text(payload, ("prompt", "user_prompt", "messages", "transcript", "conversation"))
    final_text = _field_text(
        payload,
        (
            "last_assistant_message",
            "response",
            "assistant_response",
            "final_response",
            "messages",
            "transcript",
        ),
    )
    combined_text = "\n".join(part for part in (prompt_text, final_text) if part)

    prompt_requires_decision = has_explicit_multi_agent_request(prompt_text or combined_text) or has_matched_cplayout_route(
        prompt_text
    )
    if prompt_requires_decision and not has_subagent_decision(final_text):
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": _continuation_reason(),
                }
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
