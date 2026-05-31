# CPLayout Agent Prompt Registry

This registry records the repo-local specialist prompt surfaces and the session-level skill inventory that informed them. Verify the active Codex skill list in each future session before relying on this snapshot.

## Repo-Local Skills

| Skill | Purpose | Primary owner |
| --- | --- | --- |
| `$cplayout-workspace-preflight` | CPLayout preflight, dirty-tree inspection, validation gate selection | Coordinator |
| `$cplayout-planning-review` | Decision-complete, source-backed plans and reviews | Coordinator, curator |
| `$cplayout-expert-agent-panels` | Specialist panels, source-backed synthesis, records, validation triage | Coordinator, curator |
| `$cplayout-google-earth-imagery-analysis` | Google Earth Pro imagery, KML/KMZ evidence, local OCR/CV planning | Imagery mapper |
| `$cplayout-imagery-mapping-agent` | Imagery-assisted boundary and pivot-layout evidence workflows | Imagery mapper |
| `$cplayout-interface-development-agent` | Expo UI/UX, interface workflows, visible verification | Interface developer |
| `$cplayout-center-pivot-design-agent` | Center pivot, lateral move, and corner-arm advisory design review | Pivot designer |
| `$cplayout-database-agent` | SQLite, project-store, archive, migration, CRUD review | Database specialist |

## Custom Codex Agents

| Agent | Default mode | Use when | Config |
| --- | --- | --- | --- |
| `cplayout_imagery_mapper` | Read-only | Imagery, KML/KMZ, CV, operator boundary, Google Earth visual evidence | `.codex/agents/cplayout_imagery_mapper.toml` |
| `cplayout_interface_developer` | Read-only | Interface, Expo, screen, component, web/native UI verification | `.codex/agents/cplayout_interface_developer.toml` |
| `cplayout_center_pivot_designer` | Read-only | Pivot, lateral move, linear move, corner arm, design scoring | `.codex/agents/cplayout_center_pivot_designer.toml` |
| `cplayout_database_specialist` | Read-only | SQLite, project-store, schema, archive, migration, CRUD | `.codex/agents/cplayout_database_specialist.toml` |
| `cplayout_kb_curator` | Read-only | Source ledgers, prompt registry, known gaps, durable guidance | `.codex/agents/cplayout_kb_curator.toml` |

## Prompt Triage

Prompt triage is implemented as an advisory `UserPromptSubmit` hook in `.codex/hooks.json`, backed by `.codex/hooks/cplayout_prompt_triage.py`. It injects routing context only; it does not block work, enforce policy, or prove runtime behavior.

Detailed routing lives in `.agents/skills/cplayout-expert-agent-panels/references/prompt-triage.md`.

## Session-Level Skill Snapshot

Observed direct-use skills during the 2026-05-31 implementation session:

- System skills: `$imagegen`, `$openai-docs`, `$plugin-creator`, `$skill-creator`, `$skill-installer`.
- CPLayout skills: the repo-local skills listed above.
- Plugin skills: Canva presentation/social/translation skills and GitHub PR/CI/publish skills.
- Other local skills: DaVinci Resolve automation, editing, audio, color, Fusion, project factory, production review, and world-regeneration skills.

This section is a snapshot, not a durable guarantee. The active runtime skill list remains the source of truth for future sessions.
