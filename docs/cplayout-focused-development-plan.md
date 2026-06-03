# CPLayout Focused Development Plan

Date: 2026-06-02
Status: current plan of record

This document consolidates the active CPLayout plans, proof ledgers, stale snapshots, and current blockers into one execution plan. It is source-backed by the workspace review, the three-agent panel pass, current validation commands, and the source ledger in `docs/agent-source-ledger.md`.

## Verified Review Method

The consolidation pass used this evidence before changing records:

- Preflight: `AGENTS.md` was re-read and `git status --short` was clean.
- Subagents: two `explorer` agents and the `cplayout_kb_curator` agent reviewed plan inventory, product status, and process records.
- Local commands: `npm run verify:whole-loop` passed through row 100; `npm run verify:ml-cv-loop` passed through row 100; `npm run test:ml-companion` passed 53 tests with 2 skipped.
- Native blocker proof: `npm run check:android-tools` found no connected adb device or running emulator, so native Android runtime proof remains blocked.
- Google Earth proof: `reports/google-earth-visual-fidelity/20260530T134720Z/visual-fidelity-manifest.json` records `status: "passed"`, `proofPassed: true`, cleanup requested with force-close status, and a non-black map-canvas analysis. The matching map-canvas PNG was visually inspected in this pass.
- Codex process research: current official Codex manual sections for `AGENTS.md`, subagents, hooks, managed configuration, and `requirements.toml` were reviewed on 2026-06-02.

## Non-Negotiable Boundaries

- Keep CPLayout free/no-cost and offline-first.
- Do not add Google Maps, paid Mapbox APIs, Esri paid services, paid imagery, cloud backends, hidden API keys, or trial-only SDKs.
- Keep canonical geometry as projected/local `XY` in the project CRS. WGS84, KML/KMZ, screenshots, CV masks, and operator labels are input, display, or evidence until accepted through projected-XY validation.
- Do not claim React Native directly runs Python, GDAL, RTKLIB, PyTorch, or companion ML/GIS packages.
- Keep Google Earth Pro, KML/KMZ styling, imagery, and local CV/ML outputs advisory unless geometry is imported and applied through existing Review Apply XY gates.
- Do not claim native SQLite, ZIP sharing, native MapLibre, raw PMTiles/MBTiles, live GNSS, or on-device ML production readiness until device/emulator proof passes.

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
| `docs/local-ml-data-improvement-plan.md` | Current companion-first ML/data plan. | Use for advisory evidence, local companion, and Review Apply XY boundaries. |
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
| Review Apply XY | Browser/local proof exists for explicit operator-gated projected-XY application. | Do not add automatic apply paths from imagery, CV, ML, KML, or operator labels. |
| Project archive and web persistence | Browser/local paths are proven; local storage remains web MVP. Adjacent evidence, recommendation, and decision ZIP round-trip plus archive safety limits are implemented and covered by project-store tests and focused browser proof. | Native ZIP sharing and native adjacent review-data persistence remain device-gated; large performance stress remains a separate scale gate. |
| Native SQLite and ZIP sharing | Compile/config surface exists, but runtime proof is blocked. | Run `docs/android-native-verification.md` with a device/emulator or equivalent iOS proof. |
| Browser MapLibre/PMTiles | Browser protocol/source evidence exists. | Native raw PMTiles/MBTiles rendering needs an adapter and device proof. |
| Google Earth/KML/KMZ | KML/KMZ export and at least one local Google Earth visual-fidelity proof passed. | This does not prove app/native/mobile runtime behavior or change canonical XY. |
| Local ML companion | Advisory local services and tests pass. | Real-world projected-XY pivot locating needs operator truth labels, project CRS calibration, and rejection audits. |
| On-device ML | Deferred. | Expo development-build device proof for model load, inference, latency, memory, power, network isolation, and parity. |
| Agent/subagent process | Repo-local hooks, skills, and custom agents are configured; subagents were used in this consolidation pass. | Fresh-session hook injection and managed endpoint enforcement remain unverified. |

## Weighted-Vote Priority Order

The panel weighting favors source-backed blockers that reduce false product claims and unlock later work. The next development order is:

1. Documentation and source consolidation: keep this plan, prompt registry, source ledger, and known gaps aligned after every major pass.
2. Native runtime verification: run Android/iOS device or emulator proof for native SQLite, ZIP sharing, native MapLibre gates, network isolation, and report completion.
3. Real-world ML/CV fixture execution: supply operator-approved pivot truth labels, source/provenance, calibration, hard-failure reasons, and companion output hashes through the local fixture manifest path.
4. Native raw tile adapter proof: decide local protocol, extracted tiles, local server, or conversion path; then prove on device before claiming native raw PMTiles/MBTiles.
5. Browser/UI polish: continue accessibility and review workflow refinements only after the data/archive/native/fixture blockers above stay visible.

Completed 2026-06-02 follow-up:

- Archive adjacent review data and ZIP safety: `importProjectArchiveZipWithAdjacentData` now returns project, adjacent review data, and manifest while `importProjectArchiveZip` remains the compatibility wrapper. Project-store tests cover adjacent-data round-trip, project id/CRS mismatches, unsupported/missing entries, compressed size, file-count, entry-size, total uncompressed-size, and `canonicalGeometryMutation: false` gates. Focused Playwright proof verifies browser ZIP export/import restores adjacent review records without applying geometry.
- Real-world ML/CV fixture manifest path: `build-evidence-packet --real-pivot-fixtures` accepts local operator-approved fixture manifests, hashes local artifacts, rejects hash mismatches and hidden-key provenance, emits projected-XY pivot recommendations only for calibrated truth, and keeps uncalibrated fixtures metadata-only with hard failures.
- Native verification blocker: `npm run check:android-tools` found local adb/emulator/EAS/Expo tooling but no connected adb device or running emulator, so `npm run verify:android-native` was not eligible for a production runtime claim.
- Roadmap completion automation: `npm run verify:roadmap` now runs the local proof suite, browser proof, native/device detection, Google Earth visual-fidelity manifest validation, real-pivot fixture detection, typed native MapLibre report validation, and native adjacent-review-data persistence classification in one coordinator pass. The runner writes ignored reports under `reports/roadmap-completion/` and records unavailable external evidence as `blocked` instead of requiring step-by-step operator decisions.

Hard vetoes remain: paid/keyed/cloud-only methods, automatic canonical geometry mutation, model output without fixture metrics, projected-XY output without CRS calibration, native/mobile claims without device proof, and Google Earth visual-fidelity claims without visible rendered evidence plus cleanup status.

## Cleanup Policy

- Do not delete evidence ledgers, screenshots summaries, or historical handoff records.
- Mark superseded and completed plans clearly instead of reusing them as current execution truth.
- Keep ignored raw reports under `reports/`; check in only curated summaries and hashes.
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
| Native runtime claims | `npm run check:android-tools`; `npm run verify:android-native`; device/emulator report evidence |
| Full roadmap completion pass | `npm run verify:roadmap`; provide resource reports through `CPLAYOUT_ANDROID_NATIVE_REPORT`, `CPLAYOUT_GOOGLE_EARTH_MANIFEST`, `CPLAYOUT_REAL_PIVOT_FIXTURES`, or `CPLAYOUT_NATIVE_MAPLIBRE_REPORT` when those external proofs exist |

## Current Non-Claims

- No native Android/iOS runtime behavior was proven in this consolidation pass.
- No web SQLite deployment proof exists.
- No native raw PMTiles/MBTiles archive rendering proof exists.
- No operator-supplied real-world projected-XY automatic pivot locating proof exists; the manifest path and calibrated/uncalibrated gates exist, but no real fixture has been supplied and proved.
- No managed Codex endpoint enforcement proof exists; repo-local hooks remain advisory unless managed deployment is verified.
