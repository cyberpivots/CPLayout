# Expert Agent Panels Research

Date: 2026-05-19

## Scope

Create a CPLayout-local expert-agent panel skill that coordinates source-backed review, bounded subagent delegation, validation gates, and durable knowledge-record updates without changing product runtime code.

## Local Facts Verified

| Source ID | Source | Accessed | Verified use and limits |
| --- | --- | --- | --- |
| LOCAL-001 | `AGENTS.md` | 2026-05-19 | Confirms CPLayout repository shape, offline-first/no-cost constraints, projected/local `XY` canonical geometry, repo-local skill usage, subagent boundary, and validation requirements. Does not prove runtime behavior. |
| LOCAL-002 | `git status --short` | 2026-05-19 | Confirms pre-existing dirty work in mobile, core, geometry, and map-adapter files before this skill/doc pass. These files were treated as user or prior-agent work and were not modified. |
| LOCAL-003 | `.codex/config.toml` | 2026-05-19 | Confirms `model = "gpt-5.5"`, `model_reasoning_effort = "medium"`, `plan_mode_reasoning_effort = "high"`, and `[features].multi_agent = true`. Does not prove a fresh session has loaded newly created skills. |
| LOCAL-004 | `codex --version` | 2026-05-19 | Confirms active local CLI reports `codex-cli 0.130.0`. |
| LOCAL-005 | `docs/cplayout-decision-complete-improvement-plan.md` | 2026-05-19 | Confirms existing CPLayout expert-panel product/process direction and native/web gate language. Some external-source references in that document are not revalidated by this note unless listed below. |

## Official Codex Sources Checked

| Source ID | Source | Accessed | Verified use and limits |
| --- | --- | --- | --- |
| OAI-001 | OpenAI Codex AGENTS.md guide, `https://developers.openai.com/codex/guides/agents-md` | 2026-05-19 | Confirms Codex discovers and layers `AGENTS.md` files, with closer project guidance overriding broader guidance. Does not define repo-local skill semantics. |
| OAI-002 | OpenAI Codex subagents docs, `https://developers.openai.com/codex/subagents` | 2026-05-19 | Confirms built-in `default`, `worker`, and `explorer` agents; explicit user request requirement for subagent spawning; subagents inherit sandbox/approval controls; custom agents can live in `.codex/agents/`. |
| OAI-003 | OpenAI Codex config reference, `https://developers.openai.com/codex/config-reference` | 2026-05-19 | Confirms project-scoped `.codex/config.toml`, `model`, `model_reasoning_effort`, `plan_mode_reasoning_effort`, `features.multi_agent`, and custom agent-related config keys. Does not imply this repo should add custom agents in v1. |
| OAI-004 | OpenAI Codex best practices, `https://developers.openai.com/codex/learn/best-practices` | 2026-05-19 | Confirms practical guidance for reusable `AGENTS.md`, repo-specific `.codex/config.toml`, bounded subagent use for exploration/tests/triage, and running tests/review before accepting changes. |

## V1 Decision

The CPLayout expert-panel workflow is implemented as `.agents/skills/cplayout-expert-agent-panels/` with:

- `SKILL.md` for trigger metadata and concise operating rules.
- `agents/openai.yaml` for UI-facing metadata.
- `references/panel-lifecycle.md` for the panel loop.
- `references/agent-prompts.md` for role prompts.
- `references/reasoning-routing.md` for automatic reasoning selection.
- `references/evidence-and-records.md` for source hierarchy, gap tables, ledgers, task logs, and prompt-registry templates.

No project-scoped `.codex/agents/*.toml` files were added in v1. Built-in `explorer`, `worker`, and `default` agents plus role-specific prompts are sufficient until repeated usage proves custom TOML agents are worth the maintenance cost.

## Skill Routing

Relevant for this task:

- `skill-creator`: used to initialize and validate the skill structure.
- `openai-docs`: used to verify current Codex docs.
- `cplayout-workspace-preflight`: used to verify CPLayout worktree and validation gates.
- `cplayout-planning-review`: used to preserve bounded, source-backed plan shape.

Conditional or irrelevant for this task unless a future panel enters their domain:

- `imagegen`, `plugin-creator`, `skill-installer`, Canva, GitHub, and DaVinci Resolve skills.

## Remaining Gaps

| Gap | Why it matters | Next verification |
| --- | --- | --- |
| Fresh-session automatic discoverability of the new repo-local skill | The current session's active skill list was created before this skill existed. | Start a fresh Codex session in `/mnt/h/CPLayout` or use the CLI skills surface if available. |
| Runtime behavior of future spawned panels | Subagent behavior depends on the active runtime tools, user authorization, sandbox, and approval mode. | Forward-test with a bounded prompt after skill discovery is refreshed. |
| CPLayout product code state | Existing dirty TypeScript/UI changes predate this skill/doc pass. | Review and validate those changes separately before claiming product behavior. |
