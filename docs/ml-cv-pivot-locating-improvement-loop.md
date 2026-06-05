# ML/CV Pivot Locating Research Improvement Loop

Loop id: `ml-cv-pivot-locating-2026-06-01`

Scope: a 100 iteration analysis -> research -> improvement -> test -> repeat loop for local machine-learning and computer-vision support of automatic center pivot locating. The loop is implemented as a verifiable research ledger and decision process. It does not claim that all 100 iterations have already been executed.

## Hard Policy

- No assumptions enter a decision. Every row must separate verified facts, hypotheses, unknowns, and blocked inputs.
- No paid APIs, paid imagery, hidden keys, account-gated services, cloud training, telemetry upload, or bulk public tile caching.
- `networkRequired: false`
- `hiddenKeysAllowed: false`
- `canonicalGeometryMutation: false`
- No automatic canonical geometry mutation from imagery, ML, CV, KML/KMZ, Google Earth screenshots, or operator labels.
- Canonical project geometry remains projected/local `XY`. WGS84, screenshots, masks, and KML/KMZ are display or evidence inputs until an explicit operator review path accepts projected `XY`.
- React Native must not run Python, GDAL, PyTorch, SAM2, DVC, or MLflow directly. Those remain local companion or preprocessing tools.
- Native/on-device ML remains unverified until an Expo development build proves model load, inference, memory, latency, power, network isolation, and parity on Android and iOS.

## Verified Local Facts

| Fact | Evidence |
| --- | --- |
| A complete 100-row browser mapping loop already exists. | `docs/continuous-improvement-loop.md`; `tools/verify_continuous_improvement_ledger.ts` |
| Local ML is already companion-first and advisory. | `docs/local-ml-data-improvement-plan.md`; `tools/local-ml-companion/README.md` |
| Existing local CV uses OpenCV for pivot crop rings, overlay circles, Hough lines, field-boundary cues, and annotated evidence. | `tools/local-ml-companion/src/cplayout_ml/cli.py` |
| Existing ML loop metadata records local fixture hashes, deterministic splits, DVC metadata, MLflow outputs, no network requirement, and no canonical geometry mutation. | `tools/local-ml-companion/src/cplayout_ml/ml_loop.py`; `tools/local-ml-companion/tests/test_ml_loop.py` |
| CPLayout review/recommendation contracts are retired from the product surface. | App Review routes, reducer recommendation actions, project-store review APIs, archive exports, and SQLite final tables are removed; legacy review archive files are ignored on import. |
| Pivot center alternatives exist as deterministic geometry analysis helpers. | `packages/geometry/src/pivotCenterOptimizer.ts`; `packages/geometry/src/pivotCenterOptimizer.test.ts` |

## Source-Backed Research Basis

| Source | Use in this loop | Boundary |
| --- | --- | --- |
| OpenCV Hough Circle Transform: https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html | Baseline circle/radius/center proposal for visible crop rings and overlay circles. | Image-space evidence only unless calibrated to project `XY`. |
| OpenCV Canny Edge Detection: https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html | Edge cue generation for crop rings, roads, fencelines, structures, and boundary candidates. | Edge response is not truth without operator/fixture validation. |
| scikit-learn cross-validation: https://scikit-learn.org/stable/modules/cross_validation.html | Train/validation/test and k-fold evaluation pattern for small labeled datasets. | Do not evaluate on training examples and claim field reliability. |
| MLflow Tracking: https://mlflow.org/docs/latest/ml/tracking/ | Local run, parameter, metric, and artifact logging under ignored `mlruns/`. | No remote tracking server or upload by default. |
| DVC add: https://doc.dvc.org/command-reference/add | Local dataset/model pointer metadata without committing large imagery. | No remote DVC storage unless separately configured by the operator. |
| ONNX Runtime React Native: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html | Future on-device inference candidate. | Not installed or production-approved. |
| ONNX Runtime mobile guidance: https://onnxruntime.ai/docs/tutorials/mobile/ | Required latency, memory, model-size, and power proof before mobile claims. | Device proof remains required. |
| Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/ | Native ML runtime testing requires a development build, not Expo Go. | No runtime claim without Android/iOS evidence. |

## Weighted Vote Process

Every iteration uses a weighted vote. The coordinator records the vote, but does not invent missing facts. A vote cannot override a hard veto.

| Specialist lens | Weight | Voting responsibility |
| --- | ---: | --- |
| Imagery/CV mapper | 0.24 | Image evidence quality, false positive controls, fixture coverage, calibration status. |
| Center pivot designer | 0.20 | Pivot center/radius plausibility, machine constraints, wet coverage, obstacles, review usefulness. |
| Architecture/storage gate | 0.18 | Project schema safety, archive boundaries, local-only storage, native/web runtime gates. |
| Interface/QA reviewer | 0.16 | Operator review clarity, no accidental apply path, Playwright and mobile usability evidence. |
| KB/source curator | 0.12 | Source ledger accuracy, known gaps, reproducibility records, no stale claims. |
| Security/offline policy | 0.10 | No paid services, no hidden keys, no telemetry, no bulk cache, no account requirement. |

Hard vetoes:

- Any paid/keyed/cloud-only method.
- Any automatic canonical geometry mutation.
- Any model output lacking fixture metrics or rejection audit data.
- Any projected-XY output lacking project CRS and calibration evidence.
- Any native/mobile ML claim lacking device or emulator proof.
- Any Google Earth visual-fidelity claim lacking visible rendered evidence and cleanup status.

Tie breakers:

1. Prefer deterministic local OpenCV evidence over trained model output until model metrics beat the baseline.
2. Prefer companion/offline tooling over native runtime until device proof exists.
3. Prefer projected-XY review queue entries over direct reducer mutations.
4. Prefer smaller, testable slices with clear fixtures over broad architecture changes.

## Vote Payload Schema

Every executed row must record a machine-readable vote payload next to its evidence. These fields are required before a row can move out of `Planned`:

- `iteration`
- `hypothesis`
- `fixture_manifest_sha256`
- `artifact_hashes`
- `method`
- `thresholds`
- `truth_labels`
- `pivot_center_error_px`
- `pivot_center_error_m`
- `center_offset_ratio`
- `radius_mismatch_ratio`
- `radial_alignment_score`
- `tower_cue_score`
- `false_positive_class`
- `calibration_status`
- `recommendation_id`
- `canonicalGeometryMutation`
- `networkRequired`
- `votes`
- `vetoes`
- `decision`
- `validation`
- `commit_sha`
- `next_target`

The required values for this loop are `canonicalGeometryMutation: false` and `networkRequired: false`. Any payload that omits those values is blocked.

## Integration Target

The first production slice is a local companion pivot candidate exporter, not an in-app native ML runtime:

1. Extend `tools/local-ml-companion` with first-class pivot-center commands. `detect-pivot-candidates` emits standalone companion evidence reports; `evaluate-pivot-fixtures` remains a future real-fixture evaluation command.
2. Emit report entries for source provenance, screenshot/crop hashes, thresholds, calibration status, rejection reasons, and non-black visual evidence when Google Earth proof packets are used.
3. Include projected `XY` candidates only when projected calibration is valid. Candidate data must carry `canonicalGeometryMutation: false` and remain outside CPLayout project schemas.
4. Keep radius, image-space center, detector confidence, and Hough/Canny/radial/tower cues in metrics and metadata until a new project-CRS edit/import path is explicitly designed and tested.
5. Do not add Browser Review UI grouping, recommendation preview, decision records, Apply XY, adjacent archive exports, or app-importable model recommendation flows.
6. Add the operator-approved real fixture manifest path through `build-evidence-packet --real-pivot-fixtures`; calibrated truth may emit projected-XY candidate data in companion reports, while uncalibrated or metadata-only fixtures stay hard-blocked.

## Current Blockers

- A curated public Adams County real-pivot fixture now exists at `fixtures/real-pivot/manifest.json` and proves the calibrated projected-XY manifest path. Additional operator-qualified fixtures are still required before claiming broad real-world automatic pivot locating quality.
- `detect-pivot-candidates` exists for local image-space evidence, but it intentionally omits `proposedGeometry.pivotCenter` until project-CRS calibration is supplied and validated.
- `build-evidence-packet --real-pivot-fixtures` emits `proposedGeometry.pivotCenter` only for operator-approved fixtures with valid projected-XY `TRUE_PIVOT_CENTER.projectedPoint`, matching project id/CRS, and verified local artifact hashes.
- Existing CV can detect image-space pivot crop rings and overlay circles, but that is not enough to claim automatic projected-XY pivot locating.
- MapLibre web advisory preview needs a visible candidate overlay before center-locating review can rely on that surface.
- A strict pivot-locating path must not reuse any boundary-assist import shortcut that auto-applies accepted recommendations.
- Native/on-device ML remains deferred until Expo development-build device proof covers model load, inference, latency, memory, power, network isolation, and parity.

## Iteration Ledger

| Iteration | Focus | Research Gate | Improvement | Test Gate | Weighted Vote Status | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Governance bootstrap | Verify local docs, contracts, constraints, and sources. | Add this loop and mechanical verifier. | `npm run verify:ml-cv-loop` | Weighted vote planned | Planned |
| 002 | Companion report schema | Verify report fields cover model decisions without app review contracts. | Define vote payload shape in docs before code. | Companion schema review | Weighted vote planned | Planned |
| 003 | Fixture inventory | Locate available proof packets and local screenshots. | Build fixture manifest template for pivot locating. | Manifest parse check | Weighted vote planned | Planned |
| 004 | Provenance gate | Verify every image source has attribution and no key. | Add fixture provenance checklist. | Hidden-key rejection test | Weighted vote planned | Planned |
| 005 | No-assumption gate | Define unknown/blocker fields for each fixture. | Require blocked status when labels/calibration are absent. | Fixture validation test | Weighted vote planned | Planned |
| 006 | Pivot target definition | Verify what counts as pivot center, crop ring, and overlay ring. | Document target labels and ambiguity classes. | Label fixture review | Weighted vote planned | Planned |
| 007 | Existing CV baseline | Inspect `detect_pivot_crop_ring` and `detect_overlay_circle`. | Expose their metrics in pivot-locating reports. | Local companion unit test | Weighted vote planned | Planned |
| 008 | Circle detector source review | Recheck OpenCV Hough circle guidance. | Add parameter sweep plan for center/radius. | Synthetic image test | Weighted vote planned | Planned |
| 009 | Edge detector source review | Recheck OpenCV Canny guidance. | Add edge preprocessing variants for pivot rings. | Synthetic edge test | Weighted vote planned | Planned |
| 010 | Milestone 1 | Curate governance, sources, and fixture-gate evidence. | Write milestone summary. | Verifier plus audit | Weighted vote planned | Planned |
| 011 | Synthetic pivot fixture | Create local generated image with known center/radius. | Add deterministic Hough-circle fixture. | Python unit test | Weighted vote planned | Planned |
| 012 | Noise robustness | Add blur/noise variants to synthetic fixture. | Score center/radius error under noise. | Python unit test | Weighted vote planned | Planned |
| 013 | Partial circle robustness | Add clipped/partial circle fixture. | Report lower confidence and rejection reason. | Python unit test | Weighted vote planned | Planned |
| 014 | Multi-circle ambiguity | Add multiple circular features fixture. | Rank by agricultural pivot cues, not largest circle only. | Python unit test | Weighted vote planned | Planned |
| 015 | Overlay-vs-crop distinction | Verify CPLayout overlay circle cannot be confused with real crop ring. | Separate `pivotCropRing` and `overlayCircle` outputs. | Existing report regression | Weighted vote planned | Planned |
| 016 | Center confidence | Define confidence from vote support, edge strength, radius stability, and ambiguity. | Add confidence breakdown. | JSON schema test | Weighted vote planned | Planned |
| 017 | Radius confidence | Define radius confidence and expected machine radius sanity checks. | Add radius mismatch warnings. | Python unit test | Weighted vote planned | Planned |
| 018 | Attribution proof gate | Verify full-window evidence remains attached when using Google Earth proof packets. | Fail evidence status without attribution screenshot. | Companion test | Weighted vote planned | Planned |
| 019 | Black-canvas gate | Reuse visual proof memory: black canvas cannot produce accepted CV evidence. | Add black-canvas rejection class. | Fixture test | Weighted vote planned | Planned |
| 020 | Milestone 2 | Review deterministic circle baseline metrics. | Curate synthetic and proof-packet evidence. | Python tests plus verifier | Weighted vote planned | Planned |
| 021 | Project calibration review | Verify affine calibration path from KML/project reference/overlay circle. | Add pivot center image-to-XY calibration audit. | Companion test | Weighted vote planned | Planned |
| 022 | CRS gate | Verify projected CRS rejection for EPSG:4326. | Add pivot recommendation CRS validation. | Core schema test | Weighted vote planned | Planned |
| 023 | Projected pivot candidate | Convert accepted image-space center to advisory projected `XY` when calibrated. | Emit companion report candidate geometry with `canonicalGeometryMutation: false`. | Companion report test | Weighted vote planned | Planned |
| 024 | Evidence linkage | Link pivot recommendation to image artifacts and metrics. | Add evidence IDs and artifact hashes. | JSON output test | Weighted vote planned | Planned |
| 025 | Operator truth labels | Verify `TRUE_PIVOT_CENTER` KML point parsing. | Compare CV center to operator truth. | KML fixture test | Weighted vote planned | Planned |
| 026 | Center error metric | Define pixel and projected-meter center error. | Add center error thresholds. | Metric unit test | Weighted vote planned | Planned |
| 027 | Radius error metric | Define radius pixel and projected-meter error. | Add radius error thresholds. | Metric unit test | Weighted vote planned | Planned |
| 028 | False positive taxonomy | Define road circle, UI ring, pond, field boundary, and overlay false positives. | Add rejection reason enum in report docs. | Fixture test | Weighted vote planned | Planned |
| 029 | Model recommendation warnings | Verify warnings prevent automatic apply. | Add hard-failure metadata for low confidence. | Core reducer test | Weighted vote planned | Planned |
| 030 | Milestone 3 | Review calibrated pivot center recommendation path. | Curate projected-XY advisory evidence. | Core plus companion tests | Weighted vote planned | Planned |
| 031 | Deterministic optimizer fusion | Verify current `optimizePivotCenter` output. | Compare CV-located pivot to deterministic design candidates. | Geometry test | Weighted vote planned | Planned |
| 032 | Machine radius sanity | Verify machine span-derived radius against CV ring radius. | Add mismatch warning. | Geometry or companion test | Weighted vote planned | Planned |
| 033 | Wet coverage sanity | Run candidate through layout evaluation. | Add coverage/outside-field metrics to recommendation. | Geometry test | Weighted vote planned | Planned |
| 034 | Obstacle sanity | Check detected pivot candidate against obstacle conflicts. | Add hard failure for obstacle conflict. | Geometry test | Weighted vote planned | Planned |
| 035 | Water/power context | Verify candidate distance from known water/power sources. | Add review-only context metric. | Geometry test | Weighted vote planned | Planned |
| 036 | Field-boundary dependency | Block projected candidate if field boundary is missing. | Add blocker status, not assumption. | Core test | Weighted vote planned | Planned |
| 037 | Candidate ranking | Define ranking across CV, deterministic optimizer, and current pivot. | Add weighted score formula. | Unit test | Weighted vote planned | Planned |
| 038 | Candidate diversity | Avoid returning near-duplicate pivot centers. | Add dedupe threshold. | Unit test | Weighted vote planned | Planned |
| 039 | Recommendation export | Verify GeoJSON point export for candidate. | Add properties for confidence and review status. | Companion test | Weighted vote planned | Planned |
| 040 | Milestone 4 | Review fused CV/design scoring. | Curate candidate ranking evidence. | Validate plus companion tests | Weighted vote planned | Planned |
| 041 | Fixture dataset split | Verify project-level train/validation/test split. | Extend dataset metadata for pivot locating. | `test_ml_loop.py` | Weighted vote planned | Planned |
| 042 | Baseline experiment | Run OpenCV pivot locator over fixture manifest. | Add pivot metrics to experiment report. | Companion test | Weighted vote planned | Planned |
| 043 | Cross-validation plan | Verify scikit-learn guidance for split hygiene. | Add leakage guard by project/field ID. | Dataset test | Weighted vote planned | Planned |
| 044 | Local MLflow logging | Verify local-only tracking URI. | Log pivot metrics and artifacts locally. | Fake MLflow test | Weighted vote planned | Planned |
| 045 | DVC metadata review | Verify pointer files and no remote requirement. | Record dataset pointer status. | DVC metadata test | Weighted vote planned | Planned |
| 046 | Threshold sweep | Sweep Hough/Canny thresholds. | Add best-threshold report with no hidden assumptions. | Companion test | Weighted vote planned | Planned |
| 047 | Ablation report | Compare circle-only, edge-only, fused detector. | Add ablation rows. | Report test | Weighted vote planned | Planned |
| 048 | Failure case replay | Replay rejected fixtures and preserve reasons. | Add regression fixture list. | Companion test | Weighted vote planned | Planned |
| 049 | Human label agreement | Compare multiple operator labels if available. | Add disagreement as blocker, not truth. | Fixture test | Weighted vote planned | Planned |
| 050 | Milestone 5 | Review deterministic experiment quality. | Curate metrics and rejection evidence. | Companion tests plus audit | Weighted vote planned | Planned |
| 051 | SAM2 proposal gate | Verify local config/checkpoint only. | Keep SAM2 as optional proposal source. | Probe test | Weighted vote planned | Planned |
| 052 | SAM2 no-download gate | Confirm CLI never downloads checkpoints. | Add report field for local checkpoint hashes. | Companion test | Weighted vote planned | Planned |
| 053 | Segment proposal scoring | Score segment masks against circle/edge evidence. | Reject masks without pivot plausibility. | Fixture test | Weighted vote planned | Planned |
| 054 | Trained model slot | Define trained-model interface without implementing dependency. | Mark not-run unless local artifact supplied. | Report test | Weighted vote planned | Planned |
| 055 | Model artifact provenance | Require model hash, dataset hash, and config hash. | Add artifact audit fields. | Companion test | Weighted vote planned | Planned |
| 056 | Inference parity | Compare trained slot to deterministic baseline when artifact exists. | Add parity table. | Optional fixture test | Weighted vote planned | Planned |
| 057 | Latency metric | Record local CPU/GPU timing for each variant. | Add timing metrics. | Companion test | Weighted vote planned | Planned |
| 058 | GPU evidence | Gate GPU-backed claim on `probe-gpu`. | Add CUDA preflight linkage. | Probe test | Weighted vote planned | Planned |
| 059 | Baseline superiority rule | Require trained model to beat deterministic baseline before UI preference. | Add vote veto. | Report verifier | Weighted vote planned | Planned |
| 060 | Milestone 6 | Review optional ML proposal lane. | Curate model-slot and local-only evidence. | Companion tests | Weighted vote planned | Planned |
| 061 | Companion report handoff | Verify model output remains standalone workspace evidence. | Add pivot-locator report sample. | Companion report test | Weighted vote planned | Planned |
| 062 | Candidate inspection UI | Keep candidate point/radius inspection in companion dashboards only. | Add report/dashboard copy. | Companion dashboard test | Weighted vote planned | Planned |
| 063 | Mutation boundary | Require no app-importable apply path from CV cards. | Block direct mutation from companion output. | Report verifier | Weighted vote planned | Planned |
| 064 | Operator disposition notes | Verify accept/reject/defer-style notes remain companion report metadata only. | Add report metadata test. | Companion test | Weighted vote planned | Planned |
| 065 | Export boundary | Ensure companion evidence/recommendations do not enter project ZIP exports. | Add archive exclusion test. | Project archive test | Weighted vote planned | Planned |
| 066 | Mobile layout | Verify 390 px review queue usability. | Add mobile screenshot gate. | Playwright test | Weighted vote planned | Planned |
| 067 | Accessibility | Add candidate action names and states. | ARIA state proof. | Playwright test | Weighted vote planned | Planned |
| 068 | Network guardrail | Block any ML/CV UI external calls. | Add request interception proof. | Playwright test | Weighted vote planned | Planned |
| 069 | Operator override | Allow operator notes without accepting geometry. | Add note evidence flow. | UI/core test | Weighted vote planned | Planned |
| 070 | Milestone 7 | Review UI import and operator decision safety. | Curate browser evidence. | `npm run proof:web` | Weighted vote planned | Planned |
| 071 | Archive exclusion | Verify pivot locator evidence is excluded from project ZIP round trip unless Phase 4 converts accepted projected `XY` drafts into canonical entities. | Add archive exclusion fixture. | Project archive test | Weighted vote planned | Planned |
| 072 | SQLite web boundary | Keep browser MVP in local storage. | Document no web SQLite assumption. | Project-store test | Weighted vote planned | Planned |
| 073 | Native persistence gate | Keep native SQLite claim unverified unless device test runs. | Add native verification note. | Existing verifier | Weighted vote planned | Planned |
| 074 | File bridge hardening | Validate companion JSON before import. | Add strict parser. | Core test | Weighted vote planned | Planned |
| 075 | Hash verification | Verify referenced artifacts before import. | Add missing-hash rejection. | Project-store test | Weighted vote planned | Planned |
| 076 | Redaction check | Ensure local paths stay out of exported project unless operator-owned. | Add archive assertion. | Archive test | Weighted vote planned | Planned |
| 077 | Report reproducibility | Record commit, dirty status, dependency versions, and fixture hash. | Add reproducibility block. | Companion test | Weighted vote planned | Planned |
| 078 | Decision replay | Rebuild accepted/rejected/deferred state from decisions. | Add replay test. | Core test | Weighted vote planned | Planned |
| 079 | Audit command | Add one command for ML/CV loop validation. | Extend verifier if needed. | Script test | Weighted vote planned | Planned |
| 080 | Milestone 8 | Review storage/export/reproducibility. | Curate evidence and unresolved gates. | Validate plus audit | Weighted vote planned | Planned |
| 081 | On-device feasibility review | Recheck ONNX Runtime React Native docs. | Keep dependency deferred. | Docs verifier | Weighted vote planned | Planned |
| 082 | Expo development build gate | Recheck Expo native-library requirement. | Add dev-build checklist. | Docs verifier | Weighted vote planned | Planned |
| 083 | CPU baseline plan | Define mobile CPU/XNNPACK baseline. | Add measurement fields. | Checklist review | Weighted vote planned | Planned |
| 084 | Android proof plan | Define Android model-load/inference proof. | Add device checklist. | Native verifier | Weighted vote planned | Planned |
| 085 | iOS proof plan | Define iOS model-load/inference proof. | Add device checklist. | Native verifier | Weighted vote planned | Planned |
| 086 | Network isolation proof | Define native network-deny proof for model runtime. | Add acceptance gate. | Device checklist | Weighted vote planned | Planned |
| 087 | Binary-size budget | Define bundle/model-size reporting. | Add measurement gate. | Device checklist | Weighted vote planned | Planned |
| 088 | Memory/power budget | Define memory, power, thermal reporting. | Add measurement gate. | Device checklist | Weighted vote planned | Planned |
| 089 | Parity gate | Compare mobile output to companion fixture output. | Add parity threshold. | Device checklist | Weighted vote planned | Planned |
| 090 | Milestone 9 | Review native feasibility without implementation. | Curate on-device blockers. | Docs verifier | Weighted vote planned | Planned |
| 091 | Full-loop dry run | Run fixture to recommendation to review queue. | Record all blockers. | End-to-end local proof | Weighted vote planned | Planned |
| 092 | Failure-mode review | Force missing labels/calibration/artifacts. | Verify blocked decisions. | E2E failure tests | Weighted vote planned | Planned |
| 093 | Security review | Inspect all URLs, keys, telemetry, and caches. | Add security summary. | Audit plus request gate | Weighted vote planned | Planned |
| 094 | UX review | Verify operator can understand confidence and warnings. | Add copy/UI refinements. | Playwright screenshot | Weighted vote planned | Planned |
| 095 | Design review | Verify candidate usefulness for pivot design. | Add design-score summary. | Geometry test | Weighted vote planned | Planned |
| 096 | KB review | Update sources, gaps, and prompt registry. | Record unresolved claims. | Skills/doc validation | Weighted vote planned | Planned |
| 097 | Regression sweep | Run full TS, companion, and browser checks if UI changed. | Fix regressions. | Validation suite | Weighted vote planned | Planned |
| 098 | Milestone evidence | Curate iteration 091-097 outputs and hashes. | Add milestone evidence. | Hash verification | Weighted vote planned | Planned |
| 099 | Final loop verifier | Verify 100-row continuity and guardrails. | Harden verifier for this loop. | `npm run verify:ml-cv-loop` | Weighted vote planned | Planned |
| 100 | Final synthesis | Weighted panel votes on next production slice. | Publish decision-complete next implementation target. | Validate, audit, verifier | Weighted vote planned | Planned |

## Current Execution State

The first executable 100-iteration run has been completed for a deterministic synthetic pivot-center fixture:

- Run id: `20260601T-run`
- Evidence summary: `docs/evidence/continuous-improvement/ml-cv-pivot-locating-2026-06-01/iteration-100/README.md`
- Raw artifacts: `reports/ml-cv-pivot-locating/20260601T-run/`
- Result: 100/100 local OpenCV Hough iterations detected the synthetic pivot center within the center-location gate; best center error was `0.381 px`.
- Boundaries: real-world/projected-XY automatic pivot locating remains blocked because no operator-approved real-world pivot fixture manifest or project-CRS calibration was supplied. The run did not mutate canonical geometry and did not use network access, hidden keys, paid APIs, cloud training, or hosted imagery.

2026-06-02 follow-up:

- `build-evidence-packet --real-pivot-fixtures` now accepts `cplayout-real-pivot-fixtures-v1` manifests, hashes local artifacts, rejects hash mismatches, requires no-key provenance, and preserves `canonicalGeometryMutation: false`.
- Companion tests now cover calibrated fixture output with `proposedGeometry.pivotCenter`, uncalibrated fixture output that remains metadata-only with hard failures, and artifact hash mismatch rejection.
- The prior browser archive proof for adjacent review evidence, decisions, and recommendation GeoJSON is historical. Current Project ZIP exports exclude those retired review contract files; companion evidence remains standalone report output.
- No operator-supplied real-world fixture was added in this follow-up; real-world/projected-XY automatic pivot locating remains unproved until a fixture set is supplied and validated.

2026-06-03 follow-up:

- `npm run real-pivot-fixture:generate` now creates `fixtures/real-pivot/manifest.json` from the public Adams County project reference and Google Earth visual-fidelity proof artifacts, including artifact SHA-256 hashes, no-key provenance, rejection classes, and `TRUE_PIVOT_CENTER.projectedPoint`.
- `PYTHONPATH=tools/local-ml-companion/src python3 -m cplayout_ml.cli build-evidence-packet --project-id public-adams-county-center-pivot-proof --project-crs EPSG:32613 --real-pivot-fixtures fixtures/real-pivot/manifest.json --output-dir reports/real-pivot-fixtures/manual-proof --created-at 2026-06-03T00:00:00.000Z` now emits a standalone companion candidate report with projected-XY pivot-center evidence, no hard failures, and `canonicalGeometryMutation: false`.
- `npm run verify:roadmap:fast` also proved the real-pivot fixture gate in the integrated runner. The remaining blocker is model breadth: one curated fixture is not enough to claim generalized automatic pivot locating across fields, imagery conditions, pivots, and rejection classes.

The ledger rows remain the implementation roadmap for replacing synthetic proof with real proof packets, projected-XY calibration, review import, UI proof, archive proof, and device-gated native ML validation. A row can move from `Planned` to `Pass`, `Blocked`, or `Fail` only after its research gate, improvement, test gate, and weighted vote record exist.

## Validation

Required after changing this loop:

```sh
npm run verify:ml-cv-loop
git diff --check
npm audit
```

Required after TypeScript or UI changes in a later iteration:

```sh
npm run validate
npm run export:web
npm run test:web:e2e
```

Required after local companion changes in a later iteration:

```sh
PYTHONPATH=tools/local-ml-companion/src python3 -m unittest discover -s tools/local-ml-companion/tests
PYTHONPATH=tools/local-ml-companion/src python3 -m cplayout_ml.cli run-pivot-locator-loop --synthetic-fixture --output-dir reports/ml-cv-pivot-locating/20260601T-run --iterations 100 --created-at 2026-06-01T00:00:00.000Z
cd tools/local-ml-companion && uv run cplayout-ml probe-boundary-detector
```

Optional only when the local environment is already configured:

```sh
cd tools/local-ml-companion && uv run cplayout-ml probe-gpu
```
