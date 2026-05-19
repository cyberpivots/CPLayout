# Reasoning Routing

Use CPLayout's `AGENTS.md` reasoning policy as the source of truth. Escalate only when risk or ambiguity justifies it.

## Low

Use `low` for:

- file lookup,
- skill inventory,
- formatting,
- simple command output,
- narrow documentation checks,
- dirty-tree snapshots.

Typical agents: main agent locally, `explorer` for read-only mapping.

## Medium

Use `medium` for:

- ordinary TypeScript changes,
- UI changes without native/runtime implications,
- docs updates,
- skill edits,
- bounded implementation workers,
- normal test triage.

Typical agents: main agent, `worker` for disjoint edits, local product/UX review.

## High

Use `high` for:

- package architecture,
- storage migrations or repository splits,
- map/provider decisions,
- native verification gates,
- source-backed dependency decisions,
- cross-package changes,
- CPLayout project archive or schema implications,
- current OpenAI/Codex source research.

Typical agents: `default` source researcher, `explorer` architecture reviewer, main agent for critical-path design.

## Xhigh

Use `xhigh` only for:

- release arbitration,
- severe reviewer disagreement,
- security or safety disputes,
- native verification disputes,
- high-risk cross-platform architecture decisions where wrong claims could mislead downstream implementation.

Do not use `xhigh` for ordinary implementation, formatting, or routine documentation.

## Routing Output

Every panel cycle should state:

- selected reasoning level,
- why that level is sufficient,
- what would trigger escalation,
- validation gate that must pass before stronger claims are made.
