# CPLayout Focused Development Plan

Date: 2026-06-05
Status: current plan of record

This document consolidates the active CPLayout plans, proof ledgers, stale snapshots, and current blockers into one execution plan. It is source-backed by the workspace review, the three-agent panel pass, current validation commands, and the source ledger in `docs/agent-source-ledger.md`.

## Verified Review Method

The consolidation pass used this evidence before changing records:

- Preflight: `AGENTS.md` was re-read and `git status --short` was clean.
- Subagents: two `explorer` agents and the `cplayout_kb_curator` agent reviewed plan inventory, product status, and process records.
- Local commands: `npm run verify:whole-loop` passed through row 100; `npm run verify:ml-cv-loop` passed through row 100; `npm run test:ml-companion` passed 53 tests with 2 skipped.
- Native blocker proof: earlier passes found no connected adb device/emulator, but the 2026-06-03 continuation used the connected Samsung SM-P613 over WSL USBIPD/ADB and completed a historical schema-v8 Android runtime report for SQLite save/reload/delete plus ZIP share/picker export/import. Current schema-v10 Android claims require a newly completed report.
- Google Earth proof: after an earlier blocked 2026-06-04 preflight, the strict refresh at `reports/google-earth-visual-fidelity/20260604T-render-proof-kml-strict/visual-fidelity-manifest.json` records `status: "passed"`, `proofPassed: true`, `overlayVisibleConfirmed: true`, KML integrity pass, uncontaminated targeted cleanup, and direct map-canvas evidence with non-black ratio `0.9925660141582399`, gray variance `2230.895`, and SHA-256 `990f7b789bf78e2252fb94d8ff35be05299a1d58353a45d25cf1e30ad4e84f23`.
- Codex process research: current official Codex manual sections for `AGENTS.md`, subagents, hooks, managed configuration, and `requirements.toml` were reviewed on 2026-06-02.

## Non-Negotiable Boundaries

- Keep CPLayout free/no-cost and offline-first.
- Do not add Google Maps, paid Mapbox APIs, Esri paid services, paid imagery, cloud backends, hidden API keys, or trial-only SDKs.
- Keep canonical geometry as projected/local `XY` in the project CRS. WGS84, KML/KMZ, screenshots, CV masks, and operator labels are input, display, or evidence until accepted through projected-XY validation.
- Do not claim React Native directly runs Python, GDAL, RTKLIB, PyTorch, or companion ML/GIS packages.
- Keep Google Earth Pro, KML/KMZ styling, imagery, and local CV/ML outputs advisory unless geometry is explicitly imported through Files or edited on the Map with projected-XY validation.
- Do not claim native SQLite, ZIP sharing, native MapLibre, raw PMTiles/MBTiles, live GNSS, or on-device ML production readiness until the matching device/emulator proof passes. Android native SQLite and ZIP sharing have historical schema-v8 evidence only; current schema-v10 proof, iOS, raw PMTiles/MBTiles, live GNSS, and on-device ML remain proof-gated.

## Plan Inventory

| Plan or record | Current status | How to use it now |
| --- | --- | --- |
| `docs/cplayout-focused-development-plan.md` | Current plan of record. | Start here for priorities, blockers, proof status, and cleanup policy. |
| `docs/cplayout-decision-complete-improvement-plan.md` | Current architecture support plan. | Use for projected-XY, offline imagery, native map, ML lane, and governance boundaries. |
| `docs/center-pivot-package-surface-inventory.md` | Current package/status inventory. | Use to avoid crossing package ownership boundaries. |
| `docs/production-field-mapping-notes.md` | Current product snapshot. | Use as field-mapping context, not as runtime proof. |
| `docs/continuous-improvement-loop.md` | Completed browser-only 100-row proof ledger. | Preserve as browser proof evidence; do not cite as native, Google Earth, or ML/CV proof. |
| `docs/browser-mapping-final-proof-checklist.md` | Completed browser acceptance checklist. | Use as the browser regression gate and non-claim boundary. |
| `docs/evidence/continuous-improvement/browser-mapping-2026-05-31/iteration-100/README.md` | Completed browser milestone evidence. | Cites 213 browser checks and curated hashes; raw reports stay ignored. |
| `docs/whole-codebase-improvement-loop-2026-06-01.md` | Current risk inventory and loop control record. | Use blocked rows as next implementation slices; do not cite rows 011-100 as 90 separate material improvements. |
| `docs/ml-cv-pivot-locating-improvement-loop.md` | Current ML/CV roadmap. | Use for pivot locating governance, fixture gates, and weighted vote payloads. |
| `docs/local-ml-data-improvement-plan.md` | Current companion-first ML/data plan. | Use for standalone companion evidence, local reports, and non-mutation boundaries. |
| `docs/android-native-verification.md` | Current native runtime checklist. | Use before native SQLite, sharing, MapLibre, live GNSS, or on-device ML claims. |
| `docs/web-sqlite-feasibility.md` | Current web SQLite gate. | Keep browser MVP on local storage until WASM and COOP/COEP proof passes. |
| `docs/native-map-tile-adapter-design.md` | Current native tile design note. | Treat native raw PMTiles/MBTiles rendering as blocked pending adapter and device proof. |
| `docs/google-earth-map-improvement-loop.md` | Current Google Earth/KML evidence ledger, with updated status note. | Use for KML/KMZ and local Google Earth proof history only. |
| `docs/agent-prompt-registry.md`, `docs/agent-known-gaps.md`, `docs/agent-source-ledger.md` | Current process records. | Update when skills, hooks, subagents, or verified external facts change. |
| `docs/codex-managed-hook-deployment.md` | Current managed-hook deployment guide. | Use for endpoint deployment; local hooks remain advisory without managed proof. |
| `docs/blocker-removal-roadmap.md` | Historical completed-pass snapshot. | Keep for audit history; current blockers live in this plan and current checklists. |
| `docs/expert-agent-panels-research.md` | Historical v1 research note. | Keep for initial design history; current agent files and prompt registry supersede stale v1 claims. |
| `center_pivot_react_native_development_handoff/` | Archived development handoff. | Use as source/reference material only, not as the current execution plan. |

## Current Truthful Status

| Lane | Status | Remaining gate |
| --- | --- | --- |
| Core projected-XY geometry | Locally verified through current validation and browser proof ledgers. | Keep every new geometry write behind reducer validation and project CRS checks. |
| Browser mapping/UI | Browser-proven through the completed 100-row ledger and final proof checklist. | Re-run `npm run proof:web` for visible browser changes. |
| Command surface and sample menu | The workspace header now uses compact File/Reports/Tools/View/Connections/Settings/Help menus plus icon commands, while curated sample fixtures cover needs-review baseline, improved full-circle, partial sweep, end-gun shutoff, and advisory corner-arm examples. | Browser proof must pass for visible UI behavior; sample fixtures are advisory regression data, not engineering certification or broad real-world model-quality proof. |
| Google Earth-inspired Help/onboarding | UI-only companion workflow added for Help route modules, Places/Layers organization, KML/KMZ import wizard guidance, and adjacent evidence summaries. | Browser proof must pass for the visible app change; this does not prove Google Earth rendering, Android/iOS runtime UI, imagery rights, or KML/KMZ contract changes. |
| Expert Review product route/contracts | Retired from app UI, reducer actions, project archives, repository APIs, and SQLite final schema. Legacy ZIP review files are ignored on import and never exported. | Agent-only expert analysis may continue in chat/workspace records, but it must not become app routes, project schemas, archive payloads, or automatic geometry mutation. |
| Project archive and web persistence | Browser/local paths are proven; local storage remains web MVP. Project ZIP exports canonical project/GIS/survey/metrics/map-package metadata only. Android ZIP sharing/picker export-import has historical schema-v8 device evidence. | Current Android schema-v10 ZIP regression proof, iOS ZIP sharing, and large performance stress remain separate gates. |
| Native SQLite and ZIP sharing | Historical Android runtime proof passed on Samsung SM-P613 with Expo SQLite schema v8, save/relaunch/list/load/delete, native share-sheet ZIP export, Android picker ZIP import, and migration evidence. | Complete the current schema-v10 report in `docs/android-native-verification.md`; run equivalent iOS proof before iOS claims. |
| Browser MapLibre/PMTiles | Browser protocol/source evidence exists. | Native raw PMTiles/MBTiles rendering needs an adapter and device proof. |
| Google Earth/KML/KMZ | KML/KMZ export is locally validated, and the 2026-06-04 strict Google Earth visual-fidelity proof passed with direct non-black/non-uniform map-canvas evidence and clean targeted cleanup. | This does not prove app/native/mobile runtime behavior or change canonical XY; pass the strict manifest path explicitly to roadmap automation when needed. |
| Local ML companion | Advisory local services and tests pass. | Real-world projected-XY pivot locating needs operator truth labels, project CRS calibration, and rejection audits. |
| On-device ML | Deferred. | Expo development-build device proof for model load, inference, latency, memory, power, network isolation, and parity. |
| Agent/subagent process | Repo-local `UserPromptSubmit`, `SubagentStart`, and `PreToolUse` hooks remain configured. The `Stop` continuation hook is disabled and the compatibility script is a silent no-op so missing accounting cannot trigger repeated continuation prompts. | Fresh-session hook injection and managed endpoint enforcement remain unverified. Coordinator summaries must still record `Subagent decision:` or `Accepted fallback:`. |

## Weighted-Vote Priority Order

The panel weighting favors source-backed blockers that reduce false product claims and unlock later work. The next development order is:

1. Documentation and source consolidation: keep this plan, prompt registry, source ledger, and known gaps aligned after every major pass.
2. Native runtime verification: refresh Android SQLite/ZIP proof for schema v10, run equivalent iOS proof when available, and keep native MapLibre/network-isolation gates tied to their own device reports.
3. Real-world ML/CV fixture execution: broaden from the curated public Adams County proof fixture to additional operator-qualified field fixtures with provenance, calibration, rejection classes, and companion output hashes.
4. Native raw tile adapter proof: decide local protocol, extracted tiles, local server, or conversion path; then prove on device before claiming native raw PMTiles/MBTiles.
5. Browser/UI polish: continue accessibility, drawing, Files/GIS exchange, dashboard, settings, and Help refinements only after the data/archive/native/fixture blockers above stay visible.

Completed 2026-06-02 follow-up:

- Archive ZIP safety: project ZIP import/export hardens project id/CRS mismatches, unsupported/missing entries, compressed size, file-count, entry-size, and total uncompressed-size gates while preserving canonical geometry boundaries.
- Real-world ML/CV fixture manifest path: `build-evidence-packet --real-pivot-fixtures` accepts local operator-approved fixture manifests, hashes local artifacts, rejects hash mismatches and hidden-key provenance, emits standalone candidate reports only for calibrated truth, and keeps uncalibrated fixtures metadata-only with hard failures.
- Earlier native verification blocker: `npm run check:android-tools` found local adb/emulator/EAS/Expo tooling but no connected adb device or running emulator, so `npm run verify:android-native` was not eligible for a production runtime claim until the later SM-P613 USBIPD/ADB run completed.
- Roadmap completion automation: `npm run verify:roadmap` now runs the local proof suite, browser proof, native/device detection, Google Earth visual-fidelity manifest validation, real-pivot fixture detection, typed native MapLibre report validation, and retired-review-contract checks in one coordinator pass. The runner writes ignored reports under `reports/roadmap-completion/` and records unavailable external evidence as `blocked` instead of requiring step-by-step operator decisions.

Completed 2026-06-03 follow-up:

- Retired review contracts: the Review route, ExpertReviewPanel, reducer recommendation action, project-store review APIs, adjacent review archive files, and SQLite review tables are removed. Legacy review archive filenames are import-ignore compatibility entries only.
- Real-pivot fixture automation: `npm run real-pivot-fixture:generate` creates `fixtures/real-pivot/manifest.json` from the public Adams County project reference when present, or from `realCenterPivotProofProject` when the optional reference JSON is absent, plus local strict Google Earth proof artifacts and hashes for companion analysis without canonical geometry mutation.
- Native MapLibre proof harness: `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1` enables a native MapLibre proof panel backed by a localhost tile URL template, and `npm run verify:native-maplibre` starts a local generated tile server, runs `adb reverse`, captures an Android screenshot, computes PNG pixel metrics, and writes `reports/native-maplibre/latest.json`. The earlier Android generated TileJSON/template report is historical/mutable. A 2026-06-04 vector probe failed because the local proof tile server received zero requests. The app route now gives `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1` precedence over the default Android aerial workbench, so the next gate is a fresh passing device report with tile requests greater than zero. Raw PMTiles/MBTiles remain unproved.
- Earlier Android device access result: Windows ADB, WSL ADB, `usbipd`, PnP, mDNS, and local TCP ADB probes initially found no live Samsung tablet. That blocker was superseded when the tablet reappeared over USBIPD/ADB after the cable replacement and reattachment.
- Android native runtime proof: after USB cable replacement and WSL USBIPD/ADB reattachment, Samsung SM-P613 (`R52W20BK7XH`, Android 14/API 34) completed `npm run verify:android-native -- --report reports/android-native-verification/android-native-verification-20260603T034817Z.json`. Evidence covers Expo SQLite schema v8, migrations 1-8, 3 geometries, 14 geometry vertices, 2 survey points, save/relaunch/list/load/delete, native share-sheet ZIP export, Android DocumentsUI ZIP import, and manifest/project id/CRS agreement. This is historical evidence only after the schema-v10 gate.
- Google Earth-inspired tooling/help update: the app route set now includes Help training modules for Start, Map Tools, Google Earth Companion, Imagery, Layout Validation, Android Storage, and Export. The update reuses local walkthrough progress, presents Places/Layers grouping and Files import-preview selection, and keeps KML/KMZ styles, labels, LookAt, imagery, screenshots, and companion output outside canonical projected `XY`.

Completed 2026-06-04 follow-up:

- Workspace command surface: top text-button clusters were replaced with compact menus and icon commands. The left rail remains primary route navigation, the bottom HUD remains the contextual drawing surface, and File/Reports/Tools/View/Connections/Settings/Help menu actions route to existing local/offline workflows.
- Curated sample fixtures: core fixtures now export the needs-review baseline plus improved full-circle, partial sweep near road/structure, end-gun shutoff arc, and advisory corner-arm examples with geometry/scoring tests and no mutation from scenario scoring.
- Companion evidence wording: local ML/CV companion packets and pivot-candidate reports explicitly remain standalone evidence with `canonicalGeometryMutation: false`, `evidenceOnly: true`, `appImportable: false`, and `writesProjectDatabase: false`.
- Generated visual-proof artifacts: raw `reports/visual-proof/` outputs are ignored; durable proof claims still need curated summaries and hashes under `docs/evidence/...`.

Completed 2026-06-05 continuation:

- Stop continuation loop fix: `.codex/hooks.json` no longer registers `Stop`; `.codex/hooks/cplayout_stop_multi_agent.py` is a compatibility no-op; validation now fails if `Stop` is reintroduced in project-local hook config.
- Native MapLibre proof route fix: `packages/map-adapters/src/MapSurface.native.tsx` now renders the proof panel before the default Android aerial workbench when `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1`, addressing the zero-request failure cause observed in `reports/native-maplibre/latest.json`.
- Current proof handoff: Google Earth strict proof is current through the 2026-06-04 manifest above, and the real-pivot fixture manifest now points at that strict packet. Android schema-v10 SQLite/ZIP proof and native MapLibre vector rendering still need fresh passing device reports before product-readiness claims.
- Roadmap gate confirmation: the earlier `npm run verify:roadmap:fast -- --google-earth-manifest reports/google-earth-visual-fidelity/20260604T-render-proof-kml-strict/visual-fidelity-manifest.json --android-report reports/android-native-verification/android-native-verification-20260604-220241794Z.json --native-maplibre-report reports/native-maplibre/latest.json` passed local validation, skill, ML loop, whole-loop, audit, retired-review-contract, and Google Earth visual-fidelity gates. The real-pivot fixture blocker from the missing historical `20260530T134720Z` artifact has since been resolved by regenerating `fixtures/real-pivot/manifest.json` from `reports/google-earth-visual-fidelity/20260604T-render-proof-kml-strict`; Android native runtime still needs a completed schema-v10 report, and native MapLibre still needs a report with `tileServer.tileRequests > 0`.

Hard vetoes remain: paid/keyed/cloud-only methods, automatic canonical geometry mutation, model output without fixture metrics, projected-XY output without CRS calibration, native/mobile claims without the specific device proof for that platform/feature, and Google Earth visual-fidelity claims without visible rendered evidence plus cleanup status.

## Cleanup Policy

- Do not delete evidence ledgers, screenshots summaries, or historical handoff records.
- Mark superseded and completed plans clearly instead of reusing them as current execution truth.
- Keep ignored raw reports under `reports/`; check in only curated summaries and hashes.
- Treat ignored `reports/visual-proof/` screenshots and XML as local proof artifacts, not durable records. Revalidate or curate summaries before citing them as current evidence.
- Treat hook and subagent documents as process aids. They do not replace direct preflight, validation, or source-backed status checks.

## Validation Matrix

| Change type | Required commands or proof |
| --- | --- |
| Hook, skill, agent, or process-record changes | `python3 -m py_compile .codex/hooks/*.py`; `npm run validate:skills`; `git diff --check`; `npm audit` |
| TypeScript or UI changes | `npm run validate`; `git diff --check`; `npm audit` |
| Visible browser changes | `npm run proof:web` plus Playwright screenshot/evidence when available |
| Whole-codebase loop edits | `npm run verify:whole-loop`; `git diff --check`; `npm audit` |
| ML/CV loop edits | `npm run verify:ml-cv-loop`; companion tests when companion code changes |
| Local companion changes | `npm run test:ml-companion`; companion CLI dry-runs relevant to the changed command |
| Native runtime claims | `npm run check:android-tools`; `npm run verify:android-native -- --report <completed-report.json>`; device/emulator report evidence |
| Native MapLibre render claims | Build with `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1`; `npm run verify:native-maplibre`; validate `reports/native-maplibre/latest.json` through `npm run verify:roadmap` |
| Curated real-pivot fixture regeneration | `npm run real-pivot-fixture:generate`; `npm run test:ml-companion`; `npm run verify:roadmap:fast` |
| Full roadmap completion pass | `npm run verify:roadmap`; provide resource reports through `CPLAYOUT_ANDROID_NATIVE_REPORT`, `CPLAYOUT_GOOGLE_EARTH_MANIFEST`, `CPLAYOUT_REAL_PIVOT_FIXTURES`, or `CPLAYOUT_NATIVE_MAPLIBRE_REPORT` when those external proofs exist |

## Current Non-Claims

- Android native SQLite and ZIP share/picker runtime behavior has historical Samsung SM-P613 schema-v8 evidence from the completed 2026-06-03 Android report. Current schema-v10 Android runtime behavior and iOS runtime behavior were not proven in this pass.
- No web SQLite deployment proof exists.
- Native MapLibre vector TileJSON/template rendering still needs a fresh passing device report after the proof-route fix; no native raw PMTiles/MBTiles archive rendering proof exists.
- No general automatic projected-XY pivot locating proof exists beyond the curated public Adams County fixture generated from existing repository evidence; additional operator-qualified fixtures are still required before making broad model-quality claims.
- No managed Codex endpoint enforcement proof exists; repo-local hooks remain advisory unless managed deployment is verified.
