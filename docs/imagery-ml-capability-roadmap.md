# CPLayout Imagery And ML Capability Roadmap

Date: 2026-06-05
Status: active multi-year executive roadmap

This roadmap sets the long-range direction for imagery-assisted mapping, local CV, local ML experiments, offline aerial packages, and eventual native inference. It does not add a production app import path by itself. The current implementation remains companion-first and proof-gated.

## Complexity And Routing

- Complexity band: `xhigh`
- Selected reasoning effort: `xhigh`
- Subagent decision: required
- Specialist lenses: imagery/CV mapper, database/storage specialist, interface developer
- Validation gates for this record: `npm run validate:skills`, `npm run validate:design-guides`, `git diff --check`, `npm audit`; run `npm run validate` and `npm run proof:web` when TypeScript or visible UI changes are made.

## Direction

Prioritize Imagery/ML capability over the next several years, but keep every claim behind a matching proof class. Imagery, CV, ML, KML/KMZ, and Google Earth evidence may advise decisions. Canonical geometry changes must remain projected/local `XY`, operator-confirmed, reducer-validated, undoable, and never automatic.

The current baseline already includes local companion evidence flags, the `cplayout-real-pivot-fixtures-v1` manifest gate, a curated single real-pivot fixture path, retired app recommendation contracts, schema-v10 removal of retired review tables, current Android schema-v10 SQLite/ZIP proof, current Android vector TileJSON/template MapLibre proof, and an in-app Awareness / Design Review surface for advisory map evidence such as machine zones, planning boundaries, measurement lines, wells, wire paths, existing pivot evidence, multi-zone scenario counts, modeled union acres, and conservative envelope-risk warnings. This roadmap organizes the next capability layers without weakening those boundaries.

## Phase Roadmap

| Phase | Timeframe | Scope | Acceptance |
| --- | --- | --- | --- |
| 0. Stabilize the current baseline | Now to 2 weeks | Validate and checkpoint current placement/corner-arm, docs, fixture, and validation-tool work before starting new imagery/ML features. Keep this roadmap, the focused plan, known gaps, source ledger, and completed local design-guide summaries synchronized. | `npm run validate`; `npm run proof:web`; `npm run validate:skills`; `npm run validate:design-guides`; `git diff --check`; `npm audit`. |
| 1. Evidence and fixture foundation | Months 1-3 | Define companion-only `cplayout-imagery-evidence-v2`; expand operator-qualified fixture manifests; add validators for calibration, hash, hidden/keyed service, blank visual evidence, attribution, and projected truth failures. | Companion validator dry-runs; rejection tests for missing calibration, hash mismatch, hidden/keyed services, blank or black imagery, missing attribution, and missing projected truth. |
| 2. Deterministic CV and advisory scoring | Months 3-6 | Improve local OpenCV Hough-circle, Canny/radial, tower-track, and parameter-sweep evidence over synthetic plus operator-labeled fixtures. Fuse image-space detections with TypeScript advisory scoring only in companion reports. | `npm run test:ml-companion`; `npm run verify:ml-cv-loop`; synthetic fixture tests; calibrated fixture tests; ambiguity and false-positive rejection tests. |
| 3. App evidence review surface | Months 6-9 | Add a session-only Evidence Review surface for imported companion reports, thumbnails, provenance, calibration, candidate center/radius, score breakdowns, warnings, and advisory badges. Preview must not dirty or save the project. | Playwright tests prove import, warnings, no project dirty state on preview, no evidence payload in ZIP export, and no external network requests. |
| 4. Operator-confirmed projected-XY draft import | Months 9-12 | Add an explicit Create Draft From Evidence workflow only for calibrated projected-XY evidence. Convert through existing reducer/editor paths such as `place_pivot`, validated field vertices, `commit_obstacle_draft`, and map features. | Tests cover accepted draft mutation, cancel/no-op, invalid CRS rejection, invalid calibration rejection, undo/redo, archive round trip, and no mutation from preview. |
| 5. Real-world dataset and model evaluation | Year 2, first half | Build a broader operator-qualified fixture set across field shapes, crop states, imagery sources, partial pivots, false circles, roads, structures, ponds, and corner-arm cases. Compare deterministic CV/scoring against optional trained local models. | Fixture split hygiene, threshold sweeps, false-positive taxonomy reports, artifact hashes, and no cloud, telemetry, keyed-service, or paid dependency. |
| 6. On-device ML feasibility gate | Year 2, second half | Research ONNX Runtime React Native as the first native inference candidate, behind Expo development-build proof only after the local model is small, deterministic, offline, and better than deterministic baselines. | Android and iOS development-build reports for model load, offline inference, latency, memory, battery/thermal notes, network isolation, parity with companion output, and rollback behavior. |
| 7. Offline imagery and native map proof | Years 2-3 | Improve NAIP/offline imagery packages with provenance, attribution, license, bounds, checksums, TileJSON/templates, import UX, and visible local package state. Prove local raster rendering through MapLibre RN on real devices. | Native MapLibre report with tile requests greater than zero, Android aerial package proof, later iOS proof, visible attribution, and unchanged projected geometry. |
| 8. Production hardening and field trials | Year 3 | Turn proof lanes into release gates: field-trial checklist, retention policy, operator signoff records, performance budgets, failure-mode reporting, dataset/model governance, reproducibility, and license audits. | Release checklist passes, audit is clean, browser proof passes, native reports are current for claimed platforms, and non-claims remain documented. |

## Evidence Packet Target

`cplayout-imagery-evidence-v2` is the target companion report schema for Phase 1. It is local-only evidence, not a project schema.

Required packet boundaries:

- `schemaVersion: "cplayout-imagery-evidence-v2"`
- `canonicalGeometryMutation: false`
- `networkRequired: false`
- `hiddenKeysAllowed: false`
- `keyedService: false`
- `evidenceOnly: true`
- `appImportable: false`
- `writesProjectDatabase: false`

Required content groups:

- Local screenshots, map-canvas crops, offline NAIP or local raster references, and source attribution evidence.
- Artifact hashes for every local image, KML/KMZ, project reference, model file, fixture manifest, and generated report used by the decision.
- Calibration metadata with project id, project CRS, calibration method, status, residual/error metrics, and explicit rejection when projected `XY` cannot be validated.
- Operator labels such as `TRUE_PIVOT_CENTER`, optional `TARGET_FIELD_BOUNDARY`, and optional rejection/exclusion classes for roads, buildings, trees, ponds, structures, non-pivot circles, and partial pivots.
- Detector outputs, confidence breakdowns, false-positive class, threshold settings, Hough/Canny/radial/tower cues, score breakdowns, and hard failures.
- `canonicalGeometryMutation: false` and a no-apply/no-import statement repeated in report metadata and any companion GeoJSON.

Raw imagery, masks, model outputs, dashboards, and reports stay outside project ZIP exports, native SQLite project tables, browser local-storage project documents, and KML/KMZ exports. A future app review surface may hold imported report data in session state only until Phase 4 creates a separate operator-confirmed projected-XY draft workflow.

## Public Interfaces And Data Boundaries

- Companion interface: standalone local reports and optional companion GeoJSON for review, hashing, and fixture evaluation.
- App interface: current Awareness / Design Review UI summarizes committed projected-XY map/survey evidence only. Future ML/CV Evidence Review remains Phase 3, session-only, and must not create a dirty project from preview.
- Project mutation interface: Phase 4 only, after operator confirmation, projected-XY calibration, existing reducer validation, and undo support.
- Storage interface: no evidence packet is persisted to `PivotProject`, exported project archives, native SQLite project rows, or web MVP local-storage projects.
- Native ML interface: proof-report first. No ONNX or other native inference dependency enters the production app until Android and iOS development-build reports pass.
- KML/KMZ and Google Earth interface: visual interchange and local companion evidence only. Styling, screenshots, labels, and LookAt metadata do not alter canonical projected `XY`, and each Google Earth claim needs direct non-black rendered evidence plus uncontaminated cleanup status for the target artifact.

## Source Basis

Official sources checked on 2026-06-05:

- OpenCV documents `HoughCircles()` for circle detection over grayscale/blurred imagery with tunable center/radius parameters: https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html
- ONNX Runtime publishes a React Native package path through `onnxruntime-react-native`: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html
- Expo documents that native libraries outside Expo Go require a development build: https://docs.expo.dev/develop/development-builds/introduction/
- MapLibre React Native documents Expo setup and says the package cannot be used with Expo Go: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- USGS EROS documents NAIP as U.S. agricultural-season aerial imagery, distributed as georeferenced raster products such as GeoTIFF and JPEG2000: https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip

These sources support candidate methods and proof gates. They do not prove CPLayout runtime behavior, real-world model quality, native MapLibre rendering, on-device ML performance, or engineering certification by themselves; runtime claims require the dedicated CPLayout reports named in the focused plan and source ledger.

## Validation Matrix

| Change type | Required validation |
| --- | --- |
| Roadmap, source, known-gap, skill, hook, or process-record changes | `npm run validate:skills`; `npm run validate:design-guides`; `git diff --check`; `npm audit`. |
| TypeScript, reducer, schema, archive, or companion code changes | `npm run validate`; focused tests for changed packages; `git diff --check`; `npm audit`. |
| Companion CV/ML changes | `npm run test:ml-companion`; `npm run verify:ml-cv-loop`; fixture-specific CLI dry-runs. |
| Visible browser UI changes | `npm run proof:web`; Playwright screenshots and network-request checks when available. |
| Native SQLite/ZIP claims | `npm run check:android-tools`; `npm run verify:android-native -- --report <completed-report.json>` for Android; equivalent iOS proof before iOS claims. |
| Native MapLibre/offline imagery claims | `npm run verify:native-maplibre`; report must include nonblank screenshot evidence, attribution, tile requests greater than zero, and unchanged projected geometry. |
| On-device ML claims | Android and iOS Expo development-build reports proving model load, offline inference, latency, memory, power/thermal notes, network isolation, companion parity, and rollback behavior. |

## Assumptions And Non-Goals

- Assumption: web MVP persistence remains browser local storage until Expo SQLite web WASM and COOP/COEP deployment proof passes.
- Assumption: current companion tooling remains Python/local-only, while React Native stays free of Python/GDAL/RTKLIB/OpenCV runtime claims unless a separate native proof is produced.
- Non-goal: no paid imagery, Google Maps, paid Mapbox APIs, Esri paid services, paid cloud backend, hidden key, trial SDK, bulk public tile caching, hosted ML service, or telemetry upload.
- Non-goal: no automatic project geometry mutation from imagery, CV, ML, KML/KMZ, Google Earth, WGS84 labels, or operator labels.
- Non-goal: no Google Earth render claim for a new artifact without target-artifact rendered evidence and cleanup status.
- Non-goal: no engineering-certification language. CPLayout outputs remain planning/advisory unless reviewed by qualified professionals.
