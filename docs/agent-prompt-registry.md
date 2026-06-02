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

Prompt triage is implemented as an advisory `UserPromptSubmit` hook in `.codex/hooks.json`, backed by `.codex/hooks/cplayout_prompt_triage.py` and `.codex/hooks/cplayout_route_data.json`. It injects routing context only; it does not block work, enforce policy, or prove runtime behavior.

The route data uses weighted positive and negative keywords. A route score is the sum of matched positive weights minus matched negative weights. Routes are emitted only when their score is at least `minScore`, then sorted by score descending, route priority ascending, and route id. Hook output is capped by `maxRoutes`, currently `3`, so broad prompts do not flood the context window with every specialist.

Broad terms such as `agent`, `hook`, `layout`, and `web` are intentionally low weight. They should not route by themselves; they only help rank a route when stronger task-specific terms are also present.

ML/CV pivot-locating prompts route through the imagery mapper, center pivot designer, and KB curator when they include terms such as `pivot center detection`, `automatic pivot locating`, `TRUE_PIVOT_CENTER`, `Hough circle`, `radial alignment`, `machine learning`, `100 iteration`, or `weighted vote`. This keeps automatic center-pivot locating work tied to imagery evidence, design plausibility, source records, and the no-automatic-geometry-mutation boundary.

Whole-codebase 100-iteration improvement prompts use route id `whole-codebase-100-loop`: expected artifact is `docs/whole-codebase-improvement-loop-2026-06-01.md` plus milestone evidence summaries under `docs/evidence/continuous-improvement/`. This route is `Xhigh` risk because it can span UI, storage, geometry, ML/CV, docs, validation, commits, and remote branch checkpoints.

Detailed routing guidance lives in `.agents/skills/cplayout-expert-agent-panels/references/prompt-triage.md`; executable route data lives in `.codex/hooks/cplayout_route_data.json`.

## Tool And Subagent Hooks

`.codex/hooks.json` also registers:

- `SubagentStart` through `.codex/hooks/cplayout_subagent_start.py`, which injects CPLayout boundaries into spawned subagents: read `AGENTS.md`, preserve projected/local `XY`, avoid paid APIs and hidden keys, keep KML/KMZ styling visual-only, and require evidence before runtime proof claims.
- `PreToolUse` through `.codex/hooks/cplayout_pre_tool_use.py`, which narrowly denies clearly destructive commands such as `git reset --hard`, `git clean -fd`, force push, and `npm audit fix --force`. Other CPLayout-sensitive patterns receive advisory context rather than a block.

## Session-Level Skill Snapshot

Observed direct-use skills during the 2026-05-31 implementation session:

- System skills: `$imagegen`, `$openai-docs`, `$plugin-creator`, `$skill-creator`, `$skill-installer`.
- CPLayout skills: the repo-local skills listed above.
- Plugin skills: Canva presentation/social/translation skills and GitHub PR/CI/publish skills.
- Other local skills: DaVinci Resolve automation, editing, audio, color, Fusion, project factory, production review, and world-regeneration skills.

This section is a snapshot, not a durable guarantee. The active runtime skill list remains the source of truth for future sessions.
