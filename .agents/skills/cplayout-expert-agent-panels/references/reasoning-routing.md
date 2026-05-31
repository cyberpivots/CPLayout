# Reasoning Routing

Use CPLayout's `AGENTS.md` reasoning policy as the source of truth. The repo default is xhigh; lower reasoning is allowed only when the user explicitly requests it.

## Xhigh

Use `xhigh` for all CPLayout panel roles by default, including:

- file lookup, skill inventory, formatting, and dirty-tree snapshots,
- ordinary TypeScript, UI, documentation, skill, and bounded implementation work,
- package architecture, storage, maps, native gates, cross-package changes, and source-backed research,
- release arbitration, reviewer disagreement, security/safety, and native verification disputes.

Do not route CPLayout panel work to a lower reasoning level unless the user explicitly asks for a lower setting.

## Routing Output

Every panel cycle should state:

- selected reasoning level,
- why that level is sufficient,
- what would trigger escalation,
- validation gate that must pass before stronger claims are made.
