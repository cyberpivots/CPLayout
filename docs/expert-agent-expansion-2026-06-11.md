# CPLayout Expert Agent Expansion 2026-06-11

Date: 2026-06-11

## Scope

This note records the process-governance expansion that adds three narrow read-only specialists:

- `cplayout_runtime_proof_gatekeeper`
- `cplayout_gis_geometry_guardian`
- `cplayout_qa_validation_reviewer`

No product runtime behavior, storage schema, project geometry, KML/KMZ export behavior, native MapLibre behavior, Google Earth behavior, imagery pipeline, or mobile verification claim changes in this expansion.

## Weighted Vote

Accepted: add three narrow specialists instead of one broad super-agent.

| Option | Weight | Result |
| --- | --- | --- |
| Runtime proof gatekeeper | 0.34 | Accepted; CPLayout has recurring native, Google Earth, MapLibre, SQLite/ZIP, and release-proof claim risk. |
| GIS geometry guardian | 0.28 | Accepted; projected/local `XY`, CRS, WGS84 display, KML/KMZ metadata, and tile package boundaries need a focused review lane. |
| QA validation reviewer | 0.23 | Accepted; validation, generated-file freshness, audit findings, and residual risk need an independent read-only lane. |
| Broad super-agent | 0.15 | Rejected; too likely to over-route, duplicate the coordinator, and dilute evidence gates. |

## Source Basis

- OpenAI Codex skills, AGENTS.md, subagents, hooks, models, and managed configuration docs checked 2026-06-11.
- Anthropic agent engineering references checked 2026-06-11: building effective agents, multi-agent research system, and effective context engineering.
- Evaluation and orchestration references checked 2026-06-11: SWE-bench, SWE-bench Verified, and Microsoft Magentic-One.
- Local CPLayout sources: `AGENTS.md`, `.agents/skills/cplayout-expert-agent-panels/`, `.codex/hooks/cplayout_route_data.json`, `tools/validate_cplayout_skills.py`, `tools/build_cplayout_context_map.py`, `docs/agent-prompt-registry.md`, `docs/agent-source-ledger.md`, and `docs/agent-known-gaps.md`.

## Accepted Routes

Runtime proof route accepts strong phrases such as `native proof`, `release gate`, `Android verification`, `iOS verification`, `MapLibre proof`, `SQLite ZIP proof`, `Google Earth render proof`, `non-black map-canvas proof`, `verify:android-native`, `verify:native-maplibre`, and `production-ready claim`.

GIS geometry route accepts strong phrases such as `projected XY`, `projected/local XY`, `canonical geometry`, `CRS boundary`, `WGS84 display`, `WGS84 input/display`, `coordinate transform`, `geometry mutation`, `map package attribution`, `TileJSON`, `PMTiles`, `MBTiles`, `KML/KMZ visual metadata boundary`, and `styleUrl visual-only`.

QA validation route accepts strong phrases such as `validation triage`, `validation evidence`, `acceptance gate`, `acceptance criteria`, `test gap`, `proof gate`, `audit finding`, `regression evidence`, `release evidence`, `Playwright screenshot`, `proof:web`, and `npm run validate`.

## Rejected Broad Triggers

Do not make these standalone route triggers: `agent`, `hook`, `layout`, `web`, `help`, `review`, `runtime`, `proof`, `gate`, `geometry`, `GIS`, `QA`, `validation`, `reviewer`, `test`, `check`, `coordinates`, `display`, `import`, `map`, `style`, or `layer`.

## Validation Outcomes

Required validation for this expansion:

- `npm run context-map:build`
- `npm run context-map:check`
- `npm run validate:skills`
- `git diff --check`
- `npm audit`

Known caveat from the prior panel and this expansion plan: `npm audit` may report one critical `shell-quote` advisory. Do not apply forced breaking audit repairs without explicit approval.

## Remaining Unverified Claims

- Project-local hooks remain advisory until a trusted restarted session shows live route injection.
- Managed hook enforcement remains unverified until scripts, route data, and context map are deployed under managed requirements and verified with `/hooks`.
- The new specialists do not prove native runtime behavior, Google Earth rendering, MapLibre rendering, storage persistence, ZIP sharing, CRS correctness, geometry mutation safety, or release readiness.
