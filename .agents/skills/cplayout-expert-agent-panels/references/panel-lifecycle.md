# Panel Lifecycle

Use this lifecycle when a CPLayout task requests expert panels, multi-agent review, specialist implementation, or a continuous improvement loop.

## 1. Preflight

- Read `AGENTS.md` and task-specific docs named by the user.
- Read `.agents/skills/cplayout-workspace-preflight/SKILL.md`.
- Run `git status --short` and note pre-existing changes.
- Confirm whether the task is read-only, documentation-only, implementation, architecture, native/runtime, release, or deployment affecting.
- Select validation before editing: skill validation and `git diff --check` for skill/doc work; `npm run validate` after TypeScript or UI changes; `npm audit` when reporting repository success.

## 2. Skill Inventory

Inventory skills when the user asks for all skills, the task concerns skills, or routing is ambiguous.

Use this classification:

| Skill | Classification | Reason |
| --- | --- | --- |
| `cplayout-workspace-preflight` | Relevant | Required before CPLayout repository changes. |
| `cplayout-planning-review` | Relevant for planning/review | Keeps plans bounded, source-backed, and validation-oriented. |
| `openai-docs` | Conditional | Use for current OpenAI or Codex facts. |
| `skill-creator` | Conditional | Use when creating or updating skills. |
| Other system/plugin/domain skills | Conditional or irrelevant | Use only if the panel task enters their domain. |

Read the `SKILL.md` for every relevant skill. Read conditional skills only when the active task enters their scope.

## 3. Knowledge Gap Table

Create a compact gap table before broad research:

| Gap | Why it matters | Source to check | Status |
| --- | --- | --- | --- |
| Unknown fact or contract | Risk or blocked decision | Local file, command, official doc, or primary source | Open, verified, or unresolved |

Close local gaps before external research. Do not convert a gap into a fact without evidence.

## 4. Research

Use external research only when facts are missing, current, external, or high risk. Prefer official or primary sources.

For OpenAI and Codex facts:

- Use OpenAI docs MCP tools before web search.
- Record the URL, access date, verified use, and limits.
- Do not invent availability, runtime behavior, model behavior, or configuration semantics.

## 5. Panel Pass

A panel pass should return:

- workspace map,
- source-backed findings,
- role-specific risks,
- recommended action,
- validation gates,
- knowledge-record updates or explicitly skipped record updates for read-only work.

Use subagents only when the user explicitly authorized expert panels, delegation, parallel agent work, specialist teams, or multi-agent work and the runtime exposes the tools.

## 6. Action Selection

Choose the smallest action that advances the user's goal and respects CPLayout constraints.

Keep these boundaries:

- no paid map/cloud/key dependencies,
- no direct Python/GDAL/RTKLIB runtime claims inside React Native,
- no production claim for native SQLite, ZIP sharing, native MapLibre, or raw PMTiles/MBTiles rendering without device/emulator evidence,
- no mutation of unrelated dirty files.

## 7. Validation

Run the narrowest checks that prove the change:

- Skill work: `python3 /home/cyber/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cplayout-expert-agent-panels`
- Docs/skill whitespace: `git diff --check`
- TypeScript or UI changes: `npm run validate`
- Visible UI changes: web export/dev-server check plus Playwright screenshot when available
- Repository success report: `npm audit`, with findings reported and no forced fix without approval

If a command cannot run, record the blocker and residual risk.

## 8. Records

For non-trivial tasks, update durable records when mutation is allowed:

- task log,
- source ledger or research note,
- source index,
- known gaps,
- prompt registry,
- docs index,
- handoff only when another role must continue.

For read-only tasks, list the record updates that would be needed.

## 9. Repeat Loop

Repeat the panel cycle only when validation or reviewer findings reveal a real blocker. Stop when the accepted change is implemented, validation is complete or blocked with evidence, and remaining gaps are explicit.
