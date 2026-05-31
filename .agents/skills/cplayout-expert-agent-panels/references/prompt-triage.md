# CPLayout Prompt Triage

Use this reference when a prompt asks for specialist routing, agent panels, source-backed research, or workspace-wide process improvement.

## Default Routing

| Prompt signal | Primary skill | Specialist agent | Secondary coordination |
| --- | --- | --- | --- |
| Google Earth, KML/KMZ, visual proof, imagery, OCR/CV, field boundary | `$cplayout-imagery-mapping-agent` | `cplayout_imagery_mapper` | Pivot design, database, UI as needed |
| Interface, screen, component, map surface, Expo, Playwright evidence | `$cplayout-interface-development-agent` | `cplayout_interface_developer` | Database and pivot design as needed |
| Center pivot, lateral or linear move, corner arm, irrigation scoring | `$cplayout-center-pivot-design-agent` | `cplayout_center_pivot_designer` | Imagery and database as needed |
| SQLite, project-store, archive, schema, CRUD, migration | `$cplayout-database-agent` | `cplayout_database_specialist` | Interface and pivot design as needed |
| Skills, agents, hooks, source ledger, known gaps, prompt registry | `$cplayout-expert-agent-panels` | `cplayout_kb_curator` | Planning review as needed |

## Decision Rules

- Start non-trivial work with `AGENTS.md` and `git status --short`.
- Prefer local repo evidence before memory and external research.
- Use current official or primary sources for package, platform, Codex, Google Earth, database, and engineering claims.
- Keep hooks advisory. They add routing context but do not enforce policy or prove behavior.
- Keep custom agents read-only unless the coordinator assigns a bounded mutation scope to a worker.
- Keep projected/local `XY` canonical geometry separate from WGS84 display/input, KML/KMZ styling, imagery evidence, and operator labels.

## Validation

- For skill and agent surface changes, run `npm run validate:skills`, TOML/JSON parsing, hook sample execution, `git diff --check`, and `npm audit`.
- For TypeScript or UI changes, also run `npm run validate`.
- For visible UI changes, run a web/dev-server check and capture Playwright evidence when available.
