---
name: cplayout-expert-agent-panels
description: Use when the user says "Implement expert agent panels" or asks for CPLayout expert-agent panel review, continuous improvement loops, specialist teams, multi-agent implementation or review, source-backed research, validation triage, or knowledge-record updates.
---

# CPLayout Expert Agent Panels

## Core Rule

Run CPLayout expert panels as evidence-first coordination loops. The main agent remains coordinator, owns the critical path, preserves unrelated dirty work, and keeps verified facts, assumptions, unknowns, recommended actions, validation gates, and knowledge-record updates separate.

Direct user no-mutation instructions win over this workflow. For read-only tasks, do not implement or update records; list the records that would need updates instead.

## Quick Start

1. Re-read `AGENTS.md`, then run `git status --short` and preserve pre-existing changes.
2. Load repo-local skills that match the task:
   - `.agents/skills/cplayout-workspace-preflight/` for repository and validation gates.
   - `.agents/skills/cplayout-planning-review/` for bounded, source-backed plans.
3. Inventory available skills when the user asks for all skills, when routing is ambiguous, or when the panel task depends on skill selection.
4. Classify the task by risk, owner role, mutation scope, external evidence need, and validation gate.
5. Close local knowledge gaps first, then research current external facts from official or primary sources.
6. Use bounded subagents only when the user explicitly asks for expert panels, delegation, parallel agents, specialist teams, or multi-agent work and the current runtime exposes subagent tools.
7. Synthesize the panel result into the next concrete action, implement only when mutation is allowed, validate, and record durable findings when appropriate.

For the detailed sequence, read `references/panel-lifecycle.md`.

## Specialist Roles

Use these roles as prompted subagents when useful, or as local review lenses when subagents are unavailable or not authorized:

| Role | Agent type | Reasoning | Purpose |
| --- | --- | --- | --- |
| `workspace-cartographer` | `explorer` | `low` or `medium` | Map files, contracts, dirty state, and ownership boundaries. |
| `product-ux-reviewer` | `default` or local lens | `medium` | Check CPLayout workflow usability and visible acceptance risks. |
| `gis-map-reviewer` | `explorer` or `default` | `high` | Check projected `XY` geometry, WGS84 input/display separation, map packages, attribution, and offline/no-cost boundaries. |
| `architecture-storage-native-gate-reviewer` | `explorer` or `default` | `high`; `xhigh` for disputes | Check repository split, SQLite/web/native gates, ZIP archive flow, and unverified native claims. |
| `implementation-worker` | `worker` | `medium` or `high` | Make a bounded change in a disjoint write scope after mutation is allowed. |
| `qa-reviewer` | `explorer` or `default` | `high`; `xhigh` for release gates | Review tests, validation evidence, screenshots, audit findings, and residual risk. |
| `kb-curator` | `default` | `medium` | Update source ledgers, task logs, prompt registry, docs index, and known gaps. |

For role prompts and delegation rules, read `references/agent-prompts.md`.

## Subagent Boundary

Treat "Implement expert agent panels" as explicit authorization to spawn bounded subagents when the runtime permits it and parallel work is useful. Do not spawn agents for broad, vague work.

Use built-in agents in v1:

- `explorer` for workspace mapping, code review, and validation triage.
- `default` for source-backed external research or synthesis.
- `worker` only for disjoint implementation slices after mutation is allowed.

Do not add project-scoped `.codex/agents/*.toml` in v1. Role-specific prompts are enough until a repeated task proves custom TOML agents are worth the maintenance cost.

Keep immediate blocking work local. Wait for subagents only when their result is needed for the next critical-path decision.

## CPLayout Constraints

Every panel must preserve these boundaries:

- Keep the app free/no-cost and offline-first.
- Do not add Google Maps, paid Mapbox APIs, Esri paid services, paid imagery, paid cloud backends, hidden API keys, or trial-only SDKs.
- Keep canonical geometry as projected/local `XY`; WGS84 is input/display unless a schema change explicitly says otherwise.
- Do not claim React Native can directly run Python GIS packages.
- Use Expo-installed native dependencies when an Expo SDK package is available.
- Keep native SQLite, ZIP sharing, native MapLibre, and raw PMTiles/MBTiles rendering behind documented device/emulator verification gates.
- Keep drawing viewport state separate from geometry mutation.

## Reasoning Defaults

Load `references/reasoning-routing.md` when a task spans architecture, storage, maps, native behavior, or release gates. Short form:

- `low`: file lookup, inventory, formatting, narrow command output.
- `medium`: ordinary TypeScript, UI, documentation, and bounded implementation.
- `high`: architecture, storage, map/provider, native gates, cross-package changes, and source-backed research.
- `xhigh`: release arbitration, severe reviewer disagreement, security/safety/native verification disputes.

## Evidence And Records

Load `references/evidence-and-records.md` when the panel needs source ledgers, known-gap tables, task logs, prompt registry entries, or current external research. For OpenAI and Codex facts, use OpenAI docs MCP tools first; fallback browsing must stay on official OpenAI domains.

## Done Criteria

The panel loop is complete when:

- verified facts, assumptions, and unknowns are explicit,
- relevant skills and sources were inventoried or cited,
- required implementation is complete when mutation is allowed,
- validation commands have run or blockers are recorded,
- durable records are updated or explicitly skipped because the task is read-only,
- unrelated user or pre-existing changes were preserved.
