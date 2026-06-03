# Local ML And Data Improvement Plan

Date: 2026-05-28

## Decision

ML is a companion workflow first. CPLayout should collect local evidence, export reviewable datasets, and rank recommendations deterministically before any on-device model runtime is added. Model output is advisory and must never mutate field boundaries, obstacles, or pivot geometry without explicit operator acceptance.

## Data Contracts

- `LayoutEvidenceRecord`: project-adjacent evidence from imagery, survey, imports, notes, model output, or layout scoring.
- `ImageryProvenance`: source, attribution, license, access time, offline-copy policy, and `keyedService: false`.
- `ModelRecommendation`: proposed project-CRS `XY` geometry plus confidence, score, warnings, and evidence links.
- `LayoutDecisionRecord`: operator/import/test decision history for accepted, rejected, or deferred recommendations.

Archive exports:

- `exports/layout-evidence.jsonl`
- `exports/layout-decisions.jsonl`
- `exports/model-recommendations.geojson`

SQLite support:

- `layout_evidence`
- `model_recommendations`
- `layout_decisions`

## Collection Plan

1. Capture operator notes, imagery provenance, survey/import facts, scoring output, and model outputs as evidence records.
2. Keep display WGS84 optional and secondary; proposed geometry that can affect layout must be validated project-CRS `XY`.
3. Export JSONL for repeatable local datasets. Keep local file paths out of project data unless explicitly user-owned export metadata.
4. Use deterministic scoring to build a baseline before training: coverage percent, outside-field acres, obstacle conflicts, machine radius constraints, warnings, and confidence.
5. Treat model recommendations as review queue entries. Accepted recommendations must become explicit reducer actions with validation and undo, not implicit model writes.

## Companion Tooling

| Tool | Candidate role | Primary source |
| --- | --- | --- |
| DVC | Version local datasets and model artifacts outside the React Native runtime. | DVC data/model versioning docs: https://doc.dvc.org/example-scenarios/versioning-data-and-models |
| MLflow | Track local experiments, parameters, metrics, and artifacts. | MLflow tracking docs: https://www.mlflow.org/docs/latest/ml/tracking |
| scikit-learn | Baseline ranking/classification and cross-validation for tabular layout features. | Cross-validation docs: https://scikit-learn.org/stable/modules/cross_validation.html |
| OpenCV Python | Local companion review of existing Google Earth proof screenshots: circle, contour, edge, and overlay visibility checks. Outputs stay advisory and image-space only. | OpenCV Hough circle detection docs: https://docs.opencv.org/4.x/d3/de5/tutorial_js_houghcircles.html |
| Raster Vision | Imagery model experiments over raster/vector labels in offline Python tooling. | Raster Vision docs: https://docs.rastervision.io/ |
| TorchGeo | PyTorch geospatial datasets, samplers, transforms, and trainers for research. | TorchGeo docs: https://torchgeo.org/ |
| eo-learn | Earth-observation workflow experiments. | eo-learn docs: https://eo-learn.readthedocs.io/ |
| ONNX Runtime React Native | Deferred device-runtime lane only after Expo dev-build and Android/iOS proof. | ONNX Runtime RN docs: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html |

## Browser Candidate Generation

- The Review tab can generate local deterministic pivot-center candidates from the current projected `XY` project with `gridDivisions: 13`, `maxAlternatives: 8`, and visual-center seeding enabled.
- Generated recommendations are saved to adjacent browser review data with `reviewStatus: "unreviewed"`, score breakdown metadata, feasibility signals, and warnings. They are not applied automatically.
- Preview overlays are advisory only. Apply requires an explicit before/after metrics confirmation and then uses the existing `apply_model_recommendation` reducer validation path.

## Vision Fixture Evaluation

- `cplayout-ml evaluate-vision-fixtures --manifest <path> --output-dir <path>` reads local operator-approved proof-packet manifests and writes `vision-evaluation-summary.json`, `vision-evaluation-cases.jsonl`, and annotated PNGs.
- Fixture entries reference local full-window screenshot, map-canvas crop, optional KML/KMZ, visual-fidelity manifest, project reference, and expected labels such as boundary/overlay/black-canvas presence.
- Metrics are precision/recall/IoU-style evidence for advisory boundary and overlay detections. They are local experiment evidence only and do not create survey-grade geometry or mutate canonical project data.

## Pivot Center Locator Extension

Automatic center-pivot locating must start as local companion evidence, not native runtime behavior and not automatic project mutation.

Required labels and fixtures:

- `TRUE_PIVOT_CENTER`: operator-approved truth point for evaluation. If it cannot be calibrated into project `XY`, the case is blocked rather than inferred.
- `TARGET_FIELD_BOUNDARY`: operator-approved field boundary when projected center scoring depends on containment, coverage, outside-field area, or obstacle conflict.
- Optional exclusion labels for roads, buildings, trees, ponds, and other likely false positives.
- Fixture provenance: local image path, full-window attribution proof when applicable, image hash, source/license notes, project id, project CRS, and calibration method.

Required candidate metrics:

- Image-space center and radius.
- Projected `XY` center only when calibration is valid.
- Pixel and projected-meter center error when truth labels exist.
- Radius mismatch against machine radius or known ring radius when available.
- Hough/Canny support, radial alignment score, tower cue score, detector thresholds, confidence breakdown, and false-positive class.
- Layout impact from deterministic geometry scoring: coverage, outside-field acres, obstacle conflicts, distance from current pivot, hard failures, and warnings.

Output contract:

- Emit a `LayoutEvidenceRecord` for every detector run, including artifact hashes, thresholds, calibration status, rejection audit, `keyedService: false`, and `reviewStatus: "unreviewed"`.
- Emit a `ModelRecommendation` only when project id and project CRS are known and projected `XY` validation passes. Put `proposedGeometry.pivotCenter` in project CRS, keep `canonicalGeometryMutation: false`, and leave the recommendation unreviewed.
- Store weighted-vote details in recommendation metadata or `scoreBreakdown`. The vote must preserve detector quality, calibration quality, layout impact, UI/review readiness, records quality, and offline/security vetoes.
- Accept, Reject, and Defer decisions record `LayoutDecisionRecord` entries. Apply XY is the only geometry-changing operation and must keep the existing reducer confirmation and validation path.

Current local fixture path:

- `cplayout-ml build-evidence-packet --real-pivot-fixtures <manifest.json> --project-id <id> --project-crs <projected-crs> --output-dir <dir>` accepts an operator-approved real pivot fixture manifest as companion evidence.
- Manifest schema version: `cplayout-real-pivot-fixtures-v1`.
- Fixture records must include local artifact paths, provenance with `keyedService: false`, project id, project CRS, operator approval, calibration status, truth labels, and optional rejection classes.
- Artifact hashes are computed from local files; supplied `artifactHashes` must match or the packet build is rejected.
- Calibrated `TRUE_PIVOT_CENTER.projectedPoint` may emit `ModelRecommendation.proposedGeometry.pivotCenter` only when the fixture is operator-approved, the calibration status is valid/project-CRS, and the fixture CRS matches the packet CRS.
- Uncalibrated or metadata-only fixtures remain review records with hard failures such as missing projected truth or invalid calibration. They do not emit projected pivot geometry and remain advisory until Review Apply XY.

Initial implementation targets:

1. Add `detect-pivot-candidates` and `evaluate-pivot-fixtures` commands to the local companion.
2. Add synthetic and proof-packet pivot fixtures with no hidden network calls.
3. Add strict import validation for `canonicalGeometryMutation: false`, projected CRS, artifact hashes, and hard-failure warnings.
4. Add Review UI grouping for CV pivot candidates and visible map preview layers before claiming operator workflow support.
5. Keep ONNX/mobile inference deferred until development-build device evidence exists.

## Analogous Repositories To Study

- Fields2Cover: coverage path planning methods for agricultural vehicles. https://fields2cover.github.io/
- OpenDroneMap/WebODM: drone orthomosaic generation concepts for offline preprocessing. https://docs.opendronemap.org/
- farmOS/farmOS-map: agricultural mapping UX and data modeling patterns. https://farmos.org/
- OpenET/openet-* and irrigation scheduling tools: evapotranspiration and scheduling method references, not runtime dependencies.

## Non-Goals

- No Python, GDAL, Raster Vision, TorchGeo, eo-learn, DVC, or MLflow inside React Native.
- No cloud telemetry, automatic upload, hidden keys, or paid hosted ML service.
- No production claim for on-device ONNX until Expo dev-build and device/emulator verification pass.
- No canonical geometry mutation from model output without explicit review, validation, and acceptance.
- No survey-grade claim from CV over Google Earth screenshots; any accepted geometry must route through projected-XY import, editor, validation, and operator decision records.
