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

Prompt triage is implemented as an advisory `UserPromptSubmit` hook in `.codex/hooks.json`, backed by `.codex/hooks/cplayout_prompt_triage.py` and `.codex/hooks/cplayout_route_data.json`. It injects routing context only; it does not enforce policy or prove runtime behavior.

The route data uses token/phrase-aware weighted positive and negative keywords. A route score is the sum of matched positive weights minus matched negative weights. Routes are emitted only when their score is at least `minScore`, then sorted by score descending, route priority ascending, and route id. Hook output is capped by `maxRoutes`, currently `3`, so broad prompts do not flood the context window with every specialist.

Every route declares `agent`, `complexityBand`, `reasoningEffort`, `spawnPolicy`, `routingReason`, and `validationExpectations`. The hook emits a coordinator contract with matched specialists, required preflight, subagent decision (`required`, `optional`, or `not useful`), complexity band, reasoning effort, optimized re-prompt, and validation expectations. Route data intentionally has no global default complexity or reasoning effort; when no route or clear complexity signal matches, the hook emits `complexity analysis required before mutation`.

Broad terms such as `agent`, `hook`, `layout`, and `web` are intentionally low weight. They should not route by themselves; they only help rank a route when stronger task-specific terms are also present.

## Persistent Subagent Authorization

The CPLayout owner has persistently requested and authorized bounded subagent use for non-trivial CPLayout planning, review, implementation, validation, and knowledge-curation work. Future coordinators should state `Subagent decision: required/optional/not useful` in their summary, spawn bounded read-only or worker subagents when runtime tools are available and scopes are independent, and record `Accepted fallback:` when subagent tools are unavailable or would not add independent evidence. This authorization does not remove the coordinator's duty to keep the main agent on the critical path, avoid overlapping write scopes, and verify all facts directly.

ML/CV pivot-locating prompts route through the imagery mapper, center pivot designer, and KB curator when they include terms such as `pivot center detection`, `automatic pivot locating`, `TRUE_PIVOT_CENTER`, `Hough circle`, `radial alignment`, `machine learning`, `100 iteration`, or `weighted vote`. This keeps automatic center-pivot locating work tied to imagery evidence, design plausibility, source records, and the no-automatic-geometry-mutation boundary.

Offline aerial imagery package prompts route through the imagery mapper, interface developer, database specialist, and KB curator when they include terms such as `NAIP`, `USGS TNM`, `ImageryOnly`, `free aerial imagery`, `offline aerial package`, `RasterSource`, `TileJSON`, `GDAL`, `map package import`, or `cplayout-map-package-v1`. This keeps source policy, UI controls, project-store archive/schema work, and native proof checklists aligned. React Native runtime GDAL/Python claims, public live tile caching, raw PMTiles/MBTiles production claims, and paid/keyed imagery remain out of scope unless a separate source-backed adapter/proof task changes that boundary.

Google Earth-inspired companion workflow and onboarding prompts route through the imagery mapper, KB curator, and interface developer when they include terms such as `Google Earth-inspired`, `Google Earth companion`, `companion evidence`, `map imagery organization`, `import wizard`, `Places/Layers`, `help route`, `training panel`, or `onboarding help prompts`. These prompts are UI/process updates only unless a separate task requests KML/KMZ importer/exporter contract changes. They must preserve the distinction between Places as reviewed import candidates, Layers as visual context, and projected/local `XY` as canonical project geometry.

Command-surface, UI parity, curated sample fixture, generated report, and companion evidence wording prompts route through the interface developer, imagery mapper, and KB curator when they include terms such as `command surface`, `menu bar`, `toolbar parity`, `sample designs`, `curated fixtures`, `visual-proof reports`, `generated reports`, `companion packet`, `appImportable`, or `evidenceOnly`. UI parity means the app exposes the same operator boundaries and local/offline decision rules; it does not mean every local companion CLI report gets an app apply/import path.

Managed-hook and process-enforcement prompts route through `cplayout_kb_curator` when they include terms such as `requirements.toml`, `managed hook`, `hook enforcement`, `process enforcement`, `prompt triage`, `route classification`, `coordinator contract`, or `reasoning band`. These prompts are configured as `xhigh` because they affect Codex policy surfaces and multi-agent coordination.

Whole-codebase 100-iteration improvement prompts currently route through `cplayout_kb_curator` keywords such as `100 iteration`, `weighted vote`, and `research improvement loop`; there is no separate executable route id named `whole-codebase-100-loop` in `.codex/hooks/cplayout_route_data.json`. Expected artifacts remain `docs/whole-codebase-improvement-loop-2026-06-01.md` plus milestone evidence summaries under `docs/evidence/continuous-improvement/`.

Detailed routing guidance lives in `.agents/skills/cplayout-expert-agent-panels/references/prompt-triage.md`; executable route data lives in `.codex/hooks/cplayout_route_data.json`.

## Tool And Subagent Hooks

`.codex/hooks.json` also registers:

- `SubagentStart` through `.codex/hooks/cplayout_subagent_start.py`, which injects CPLayout boundaries into spawned subagents: read `AGENTS.md`, preserve projected/local `XY`, avoid paid APIs and hidden keys, keep KML/KMZ styling visual-only, and require evidence before runtime proof claims.
- `PreToolUse` through `.codex/hooks/cplayout_pre_tool_use.py`, which narrowly denies clearly destructive commands such as `git reset --hard`, `git clean -fd`, force push, and `npm audit fix --force`. Other CPLayout-sensitive patterns receive advisory context rather than a block.

The local hook set now also includes `Stop` through `.codex/hooks/cplayout_stop_multi_agent.py`. It uses the documented Stop continuation output (`decision: "block"` with a reason) when an explicit multi-agent prompt or matched CPLayout specialist prompt ends without `Subagent decision:` or `Accepted fallback:`. The script ignores repeat Stop continuations when `stop_hook_active` is true.

These hooks make missing decisions visible and can request one more turn where the runtime honors Stop continuation. They are not proof that subagents spawned, that process policy was fully enforced, or that a managed endpoint loaded the scripts.

## Managed Hook Deployment

Project-local `.codex/hooks.json` is advisory because it depends on project trust, local hook feature settings, and hook review. Non-bypass deployment is documented in `docs/codex-managed-hook-deployment.md` with a parseable example in `docs/examples/cplayout-managed-requirements.toml`.

The managed example pins `[features].hooks = true`, sets `allow_managed_hooks_only = true`, defines absolute managed hook directories, anchors the `PreToolUse` matcher, and registers `UserPromptSubmit`, `SubagentStart`, `PreToolUse`, and `Stop` hooks. It still requires endpoint script deployment, Codex restart, and live `/hooks` verification before any enforcement claim.

## Session-Level Skill Snapshot

Observed direct-use skills during the 2026-05-31 implementation session:

- System skills: `$imagegen`, `$openai-docs`, `$plugin-creator`, `$skill-creator`, `$skill-installer`.
- CPLayout skills: the repo-local skills listed above.
- Plugin skills: Canva presentation/social/translation skills and GitHub PR/CI/publish skills.
- Other local skills: DaVinci Resolve automation, editing, audio, color, Fusion, project factory, production review, and world-regeneration skills.

This section is a snapshot, not a durable guarantee. The active runtime skill list remains the source of truth for future sessions.
