# CPLayout Whole-Codebase Improvement Loop

Loop id: `whole-codebase-2026-06-01`

Scope: a 100 iteration analysis -> research -> improvement -> test -> repeat loop for the full CPLayout codebase. This ledger is the execution control surface. It does not claim that planned future rows have been executed.

## Hard Policy

- No assumptions enter a decision.
- No paid APIs, paid imagery, hidden keys, account-gated services, cloud training, telemetry upload, or bulk public tile caching.
- `networkRequired: false`
- `hiddenKeysAllowed: false`
- `canonicalGeometryMutation: false`
- No automatic canonical geometry mutation from imagery, ML, CV, KML/KMZ, Google Earth screenshots, WGS84 display coordinates, or operator labels.
- Canonical project geometry remains projected/local XY. WGS84, screenshots, masks, and KML/KMZ are display or evidence inputs until explicit operator review accepts projected XY.
- Browser proof, synthetic ML/CV proof, native proof, Google Earth proof, storage proof, and documentation proof are separate claim classes.

## Weighted Vote

Every executed row uses a weighted vote. Hard vetoes cannot be outvoted.

| Lens | Weight | Responsibility |
| --- | ---: | --- |
| Workspace and source curator | 0.18 | Dirty-tree ownership, source ledger, verifier scope, known gaps. |
| Interface and QA reviewer | 0.18 | Browser workflow, mobile fit, accessibility, Playwright evidence. |
| Storage and native gate reviewer | 0.18 | SQLite, archive, migration, web/native split, device proof boundaries. |
| Imagery and ML/CV mapper | 0.18 | Fixture quality, calibration, false positives, local-only CV/ML. |
| Center-pivot design reviewer | 0.16 | Pivot plausibility, radius, wet coverage, design safety. |
| Offline/security policy reviewer | 0.12 | No paid services, hidden keys, telemetry, or bulk cache. |

Hard vetoes: paid/keyed/cloud-only method, automatic canonical geometry mutation, model output without fixture metrics, projected XY output without project CRS calibration, native/mobile claim without device proof, or Google Earth visual-fidelity claim without visible rendered evidence and cleanup status.

## Verification

The mechanical verifier checks row continuity, guardrail phrases, decision states, and evidence requirements for rows marked `Pass`.

```sh
npm run verify:whole-loop
```

Rows marked `Planned` are roadmap rows. Rows marked `Pass` must cite validation and artifact hashes.

## Ledger

| Iteration | Batch | Focus | Research Gate | Improvement | Validation | Artifact Hashes | Vote | Decision | Next Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | 1 | Baseline ledger | AGENTS, status, loop docs, source docs. | Add ledger, verifier, script, records, evidence summary. | `npm run verify:whole-loop`; `git diff --check`; `npm run verify:ml-cv-loop`; `npm run validate:skills`; `npm run test:ml-companion`; `npm run validate`; `npm audit`; `npm run audit:moderate`; `npm run proof:web`. | `docs/evidence/continuous-improvement/whole-codebase-2026-06-01/iteration-001/SHA256SUMS.txt`. | weighted vote accepted framework; no hard vetoes. | Pass. | Dirty-tree ownership and checkpoint commit. |
| 002 | 1 | Dirty tree | Classify tracked and untracked files by lane. | Produce checkpoint grouping and risk notes. | Pending. | Pending. | weighted vote planned. | Planned | Mixed-tree validation. |
| 003 | 1 | Validation baseline | Check TS, tests, skills, audit, loop verifiers. | Fix only blocking defects in current work. | Pending. | Pending. | weighted vote planned. | Planned | Checkpoint commit. |
| 004 | 1 | Checkpoint commit | Review staging scope and preserve prior work. | Commit coherent groups or one safety checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Remote checkpoint. |
| 005 | 1 | Remote checkpoint | Confirm branch tracking and remote state. | Record branch update evidence. | Pending. | Pending. | weighted vote planned. | Planned | Core invariant batch. |
| 006 | 1 | Verifier strictness | Distinguish planned rows from executed evidence. | Harden evidence requirements. | Pending. | Pending. | weighted vote planned. | Planned | Source refresh. |
| 007 | 1 | Source refresh | Recheck Codex, Expo, MapLibre, PMTiles, OpenCV. | Update source boundaries. | Pending. | Pending. | weighted vote planned. | Planned | Known-gap cleanup. |
| 008 | 1 | Known gaps | Compare gaps to current evidence. | Keep native, raw tile, real ML, Google Earth gaps open. | Pending. | Pending. | weighted vote planned. | Planned | Evidence taxonomy. |
| 009 | 1 | Evidence taxonomy | Split browser, native, storage, ML, GE, docs claims. | Add claim-class records. | Pending. | Pending. | weighted vote planned. | Planned | Batch 1 milestone. |
| 010 | 1 | Batch 1 milestone | Review rows 001-009 evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Core batch. |
| 011 | 2 | XY invariant map | Review project document, reducer, geometry, archive. | Document projected/local XY invariants. | Pending. | Pending. | weighted vote planned. | Planned | Reducer gates. |
| 012 | 2 | Reducer gates | Verify geometry writes use reducers. | Add tests for new mutation paths. | Pending. | Pending. | weighted vote planned. | Planned | WGS84 boundary. |
| 013 | 2 | WGS84 boundary | Audit display/input coordinate flows. | Keep WGS84 noncanonical unless converted. | Pending. | Pending. | weighted vote planned. | Planned | KML style boundary. |
| 014 | 2 | KML style boundary | Review KML exporters and import metadata. | Prove styles do not alter projected XY. | Pending. | Pending. | weighted vote planned. | Planned | Recommendation boundary. |
| 015 | 2 | Recommendation boundary | Review evidence and recommendation contracts. | Harden unreviewed recommendation gates. | Pending. | Pending. | weighted vote planned. | Planned | Schema drift. |
| 016 | 2 | Schema drift | Compare schema docs, tests, and fixtures. | Fix stale references only. | Pending. | Pending. | weighted vote planned. | Planned | Large geometry. |
| 017 | 2 | Large geometry | Stress fields, obstacles, utilities. | Add regression fixture if useful. | Pending. | Pending. | weighted vote planned. | Planned | Undo audit. |
| 018 | 2 | Undo audit | Inspect editable UI flows for accidental writes. | Guard draft vs committed state. | Pending. | Pending. | weighted vote planned. | Planned | Core regression. |
| 019 | 2 | Core regression | Run core and geometry focused gates. | Fix scoped regressions. | Pending. | Pending. | weighted vote planned. | Planned | Batch 2 milestone. |
| 020 | 2 | Batch 2 milestone | Review invariant evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Storage batch. |
| 021 | 3 | SQLite transactions | Recheck Expo SQLite transaction behavior. | Decide exclusive transaction need. | Pending. | Pending. | weighted vote planned. | Planned | Migration proof. |
| 022 | 3 | Migration proof | Review user_version, schema, rollback. | Add actual state checks where feasible. | Pending. | Pending. | weighted vote planned. | Planned | Archive import. |
| 023 | 3 | Archive import | Verify adjacent data round trip. | Add importer tests or explicit gaps. | Pending. | Pending. | weighted vote planned. | Planned | ZIP safety. |
| 024 | 3 | ZIP safety | Research max bytes, entry count, consistency. | Add archive guardrails. | Pending. | Pending. | weighted vote planned. | Planned | Web corruption. |
| 025 | 3 | Web corruption | Review local storage parse failures. | Harden backup and error behavior. | Pending. | Pending. | weighted vote planned. | Planned | Catalog ownership. |
| 026 | 3 | Catalog ownership | Verify field map and design delete semantics. | Add risky delete tests. | Pending. | Pending. | weighted vote planned. | Planned | Package URI boundary. |
| 027 | 3 | Package URI boundary | Define portable metadata vs local paths. | Add archive/settings tests. | Pending. | Pending. | weighted vote planned. | Planned | Native template. |
| 028 | 3 | Native template | Align report docs with code. | Fix docs without runtime claims. | Pending. | Pending. | weighted vote planned. | Planned | Storage scale. |
| 029 | 3 | Storage scale | Stress many projects and archives. | Add targeted scale fixture. | Pending. | Pending. | weighted vote planned. | Planned | Batch 3 milestone. |
| 030 | 3 | Batch 3 milestone | Review storage evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Map UI batch. |
| 031 | 4 | Advisory overlays | Compare SVG and Browser MapLibre preview behavior. | Add visible advisory preview if missing. | Pending. | Pending. | weighted vote planned. | Planned | Review no-mutation. |
| 032 | 4 | Review no-mutation | Verify preview, accept, reject, defer. | Add browser proof for advisory candidates. | Pending. | Pending. | weighted vote planned. | Planned | Apply XY gate. |
| 033 | 4 | Apply XY gate | Audit confirmation and reducer validation. | Add before/after projected XY proof. | Pending. | Pending. | weighted vote planned. | Planned | Mobile review. |
| 034 | 4 | Mobile review | Check 390 px review and map HUD fit. | Adjust only with screenshot evidence. | Pending. | Pending. | weighted vote planned. | Planned | Accessibility. |
| 035 | 4 | Accessibility | Review states, labels, toggles, disabled UI. | Add ARIA or RN states where needed. | Pending. | Pending. | weighted vote planned. | Planned | Dashboard guidance. |
| 036 | 4 | Dashboard guidance | Verify unsaved geometry priority. | Preserve workflow-priority tests. | Pending. | Pending. | weighted vote planned. | Planned | Files UX. |
| 037 | 4 | Files UX | Review CSV, GeoJSON, ZIP, KML boundaries. | Improve status without schema changes. | Pending. | Pending. | weighted vote planned. | Planned | Survey workflow. |
| 038 | 4 | Survey workflow | Verify promotion is explicit operator action. | Add promote/delete/export proof if needed. | Pending. | Pending. | weighted vote planned. | Planned | UI regression. |
| 039 | 4 | UI regression | Run route sweep and UI tests. | Fix visible or console regressions. | Pending. | Pending. | weighted vote planned. | Planned | Batch 4 milestone. |
| 040 | 4 | Batch 4 milestone | Review browser evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Overlay batch. |
| 041 | 5 | Overlay policy | Recheck local-only overlay and attribution policy. | Update no paid/keyed tests. | Pending. | Pending. | weighted vote planned. | Planned | PMTiles proof. |
| 042 | 5 | PMTiles proof | Verify protocol, source resolution, layer order. | Add browser/network tests. | Pending. | Pending. | weighted vote planned. | Planned | Builder fixtures. |
| 043 | 5 | Builder fixtures | Validate roads, labels, borders, places fixtures. | Harden builder. | Pending. | Pending. | weighted vote planned. | Planned | OpenMapTiles mapping. |
| 044 | 5 | OpenMapTiles mapping | Verify local user-supplied layer mapping. | Add schema mapping tests. | Pending. | Pending. | weighted vote planned. | Planned | Attribution HUD. |
| 045 | 5 | Attribution HUD | Ensure overlay attribution appears and fits. | Add browser/mobile proof. | Pending. | Pending. | weighted vote planned. | Planned | Network guard. |
| 046 | 5 | Network guard | Block credentialed or remote overlay URLs. | Add request interception tests. | Pending. | Pending. | weighted vote planned. | Planned | Native tile non-claim. |
| 047 | 5 | Native tile non-claim | Keep raw PMTiles/MBTiles behind device gate. | Update docs/tests for unavailable native paths. | Pending. | Pending. | weighted vote planned. | Planned | Overlay performance. |
| 048 | 5 | Overlay performance | Test toggles and large vector metadata. | Add focused adapter tests. | Pending. | Pending. | weighted vote planned. | Planned | Overlay UX. |
| 049 | 5 | Overlay UX | Review no-source and local-package states. | Fix disabled/accessibility states. | Pending. | Pending. | weighted vote planned. | Planned | Batch 5 milestone. |
| 050 | 5 | Batch 5 milestone | Review overlay evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | ML/CV batch. |
| 051 | 6 | Synthetic pivot baseline | Inspect or rerun synthetic loop. | Preserve center proof and radius mismatch. | Pending. | Pending. | weighted vote planned. | Planned | Real fixture manifest. |
| 052 | 6 | Fixture manifest | Define screenshot, crop, truth, hashes, calibration. | Add parser when fixture data exists. | Pending. | Pending. | weighted vote planned. | Planned | Calibration chain. |
| 053 | 6 | Calibration chain | Research image-to-project XY calibration. | Block XY recommendations without calibration. | Pending. | Pending. | weighted vote planned. | Planned | Radius cues. |
| 054 | 6 | Radius cues | Score radius, radial traces, tower cues. | Add metrics and rejection reasons. | Pending. | Pending. | weighted vote planned. | Planned | Boundary false positives. |
| 055 | 6 | Boundary false positives | Tune edge, line, surface variants. | Reject clipped or axis-aligned bad candidates. | Pending. | Pending. | weighted vote planned. | Planned | Optional SAM2. |
| 056 | 6 | Optional SAM2 | Keep SAM2 local-only and checkpoint-required. | Add no-download and hash checks. | Pending. | Pending. | weighted vote planned. | Planned | Experiment logging. |
| 057 | 6 | Experiment logging | Keep DVC and MLflow local-only. | Record dataset and run hashes. | Pending. | Pending. | weighted vote planned. | Planned | Recommendation export. |
| 058 | 6 | Recommendation export | Emit advisory outputs only when calibrated. | Add JSON/GeoJSON tests. | Pending. | Pending. | weighted vote planned. | Planned | Review import. |
| 059 | 6 | Review import | Route CV candidates to review queue. | Add sample import and preview proof. | Pending. | Pending. | weighted vote planned. | Planned | Batch 6 milestone. |
| 060 | 6 | Batch 6 milestone | Review synthetic vs real ML evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Proof packet batch. |
| 061 | 7 | Proof packet schema | Standardize evidence fields and cleanup status. | Add template with hashes and non-black metrics. | Pending. | Pending. | weighted vote planned. | Planned | Truth labels. |
| 062 | 7 | Truth labels | Define accepted labels and ambiguity classes. | Block absent labels. | Pending. | Pending. | weighted vote planned. | Planned | CRS gate. |
| 063 | 7 | CRS gate | Verify projected CRS and calibration. | Reject EPSG:4326-as-canonical misuse. | Pending. | Pending. | weighted vote planned. | Planned | Hash verification. |
| 064 | 7 | Hash verification | Verify referenced artifacts before import. | Add missing-hash rejection. | Pending. | Pending. | weighted vote planned. | Planned | Decision replay. |
| 065 | 7 | Decision replay | Rebuild accepted, rejected, deferred states. | Add replay tests. | Pending. | Pending. | weighted vote planned. | Planned | Archive adjacent data. |
| 066 | 7 | Archive adjacent data | Round-trip evidence, decisions, recommendations. | Add tests or explicit gaps. | Pending. | Pending. | weighted vote planned. | Planned | Review copy. |
| 067 | 7 | Review copy | Verify confidence, blockers, warnings, Apply XY text. | Add UI copy or test IDs. | Pending. | Pending. | weighted vote planned. | Planned | Security scan. |
| 068 | 7 | Security scan | Inspect URLs, keys, telemetry, caches, paths. | Add no-credential and path-leak guards. | Pending. | Pending. | weighted vote planned. | Planned | Blocker register. |
| 069 | 7 | Blocker register | Record unresolved real fixture and calibration blockers. | Update known gaps. | Pending. | Pending. | weighted vote planned. | Planned | Batch 7 milestone. |
| 070 | 7 | Batch 7 milestone | Review proof packet evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Catalog batch. |
| 071 | 8 | Catalog init | Review catalog to design initialization. | Add explicit safe start/import flow. | Pending. | Pending. | weighted vote planned. | Planned | Catalog archive. |
| 072 | 8 | Catalog archive | Verify catalog metadata persistence boundaries. | Add tests or non-goal docs. | Pending. | Pending. | weighted vote planned. | Planned | Delete semantics. |
| 073 | 8 | Delete semantics | Verify soft-delete and shared design behavior. | Add risky delete tests. | Pending. | Pending. | weighted vote planned. | Planned | Web recovery. |
| 074 | 8 | Web recovery | Handle malformed local storage. | Add backup/error behavior. | Pending. | Pending. | weighted vote planned. | Planned | Native report. |
| 075 | 8 | Native report | Align report template with code. | Fix docs or verifier fields. | Pending. | Pending. | weighted vote planned. | Planned | Large project scale. |
| 076 | 8 | Large project scale | Test many catalog projects and vertices. | Add stress fixture. | Pending. | Pending. | weighted vote planned. | Planned | Sharing boundary. |
| 077 | 8 | Sharing boundary | Verify sharing and filesystem claims are gated. | Update docs without runtime claims. | Pending. | Pending. | weighted vote planned. | Planned | Local package metadata. |
| 078 | 8 | Local package metadata | Split install state from portable metadata. | Add settings/archive tests. | Pending. | Pending. | weighted vote planned. | Planned | Batch 8 regression. |
| 079 | 8 | Batch 8 regression | Run storage, archive, catalog checks. | Fix scoped regressions. | Pending. | Pending. | weighted vote planned. | Planned | Batch 8 milestone. |
| 080 | 8 | Batch 8 milestone | Review catalog and persistence evidence. | Curate hashes and checkpoint. | Pending. | Pending. | weighted vote planned. | Planned | Native gate batch. |
| 081 | 9 | Native SQLite gate | Run Android tools only if available. | Record blocked state without device proof. | Pending. | Pending. | weighted vote planned. | Planned | Native MapLibre gate. |
| 082 | 9 | Native MapLibre gate | Recheck TileJSON and template limits. | Keep raw PMTiles/MBTiles unverified. | Pending. | Pending. | weighted vote planned. | Planned | Native archive sharing. |
| 083 | 9 | Native archive sharing | Verify ZIP sharing on device only. | Record compile vs runtime split. | Pending. | Pending. | weighted vote planned. | Planned | Live GNSS. |
| 084 | 9 | Live GNSS | Split browser Web Serial and native GNSS claims. | Add receiver-session evidence gate. | Pending. | Pending. | weighted vote planned. | Planned | On-device ML. |
| 085 | 9 | On-device ML | Recheck ONNX RN and Expo dev build needs. | Keep native ML deferred. | Pending. | Pending. | weighted vote planned. | Planned | Network isolation. |
| 086 | 9 | Network isolation | Define browser/native no-network proof. | Add checklist fields. | Pending. | Pending. | weighted vote planned. | Planned | Device parity. |
| 087 | 9 | Device parity | Compare device outputs only when device exists. | Record blocked state otherwise. | Pending. | Pending. | weighted vote planned. | Planned | Performance budgets. |
| 088 | 9 | Performance budgets | Define latency, memory, power, bundle budgets. | Add measurement fields. | Pending. | Pending. | weighted vote planned. | Planned | Native gaps. |
| 089 | 9 | Native gaps | Update unresolved native and device gaps. | Remove production-ready language. | Pending. | Pending. | weighted vote planned. | Planned | Batch 9 milestone. |
| 090 | 9 | Batch 9 milestone | Review native gate results. | Curate blocked claims and hashes. | Pending. | Pending. | weighted vote planned. | Planned | Final batch. |
| 091 | 10 | Full regression plan | Select final high-risk workflows. | Build focused test matrix. | Pending. | Pending. | weighted vote planned. | Planned | Full validation. |
| 092 | 10 | Full validation | Run TS, unit, browser, companion, skills, audit. | Fix failures immediately. | Pending. | Pending. | weighted vote planned. | Planned | Security sweep. |
| 093 | 10 | Security sweep | Inspect dependencies, URLs, attribution, keys. | Add guardrail tests/docs. | Pending. | Pending. | weighted vote planned. | Planned | Accessibility sweep. |
| 094 | 10 | Accessibility sweep | Verify mobile widths, ARIA, labels, no overlap. | Fix visible regressions. | Pending. | Pending. | weighted vote planned. | Planned | Performance sweep. |
| 095 | 10 | Performance sweep | Stress maps, storage, archives, ML loop. | Record limits and regressions. | Pending. | Pending. | weighted vote planned. | Planned | Documentation synthesis. |
| 096 | 10 | Documentation synthesis | Update source ledger, gaps, registry, evidence. | Remove stale claims. | Pending. | Pending. | weighted vote planned. | Planned | Final hashes. |
| 097 | 10 | Final hashes | Curate checked-in summaries and hash files. | Keep raw reports ignored. | Pending. | Pending. | weighted vote planned. | Planned | Final vote. |
| 098 | 10 | Final vote | Run weighted panel over residual risk. | Record final pass or block decisions. | Pending. | Pending. | weighted vote planned. | Planned | Final checkpoint. |
| 099 | 10 | Final checkpoint | Commit final loop results with validation summary. | Update remote branch state. | Pending. | Pending. | weighted vote planned. | Planned | Final verification. |
| 100 | 10 | Final verification | Verify rows, validation, artifacts, gaps. | Publish final evidence summary. | Pending. | Pending. | weighted vote planned. | Planned | Loop complete. |

## Current Execution State

Iteration 001 is the active implementation row for this checkpoint. Later rows remain planned until their evidence exists. This loop intentionally starts from the current dirty tree rather than assuming a clean baseline.

Current branch observed during preflight: `codex/cplayout-agent-specialists`, tracking `origin/codex/cplayout-agent-specialists`.

## Validation Commands

Required after changing this loop:

```sh
npm run verify:whole-loop
git diff --check
npm audit
```

Required before checkpointing TypeScript or UI changes:

```sh
npm run validate
npm run validate:skills
```

Required for visible browser/map changes:

```sh
npm run proof:web
```

Required for native runtime claims only when device/emulator evidence is available:

```sh
npm run check:android-tools
npm run verify:android-native
```
