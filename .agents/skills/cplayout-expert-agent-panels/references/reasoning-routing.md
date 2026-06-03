# Reasoning Routing

Use CPLayout's `AGENTS.md` reasoning policy as the source of truth. There is no repo-wide reasoning-effort fallback. Every non-trivial pass records the task complexity band, selected reasoning effort, subagent decision or fallback, and validation gates before mutation.

## Complexity Bands

Use `xhigh` only when the task analysis warrants it, including:

- package architecture, storage, maps, native gates, cross-package changes, and source-backed research,
- release arbitration, reviewer disagreement, security/safety, and native verification disputes.
- managed Codex policy, hook deployment, subagent process, Google Earth proof, and broad cross-module mutation.

Use `high` for bounded implementation or review with meaningful behavior risk. Use `medium` for narrow docs, tests, fixtures, or read-only scans. Use `low` only for trivial status or formatting work.

## Routing Output

Every panel cycle should state:

- complexity band,
- selected reasoning level,
- why that level is sufficient,
- what would trigger escalation,
- validation gate that must pass before stronger claims are made.
