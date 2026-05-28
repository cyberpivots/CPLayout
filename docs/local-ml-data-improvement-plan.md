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
| Raster Vision | Imagery model experiments over raster/vector labels in offline Python tooling. | Raster Vision docs: https://docs.rastervision.io/ |
| TorchGeo | PyTorch geospatial datasets, samplers, transforms, and trainers for research. | TorchGeo docs: https://torchgeo.org/ |
| eo-learn | Earth-observation workflow experiments. | eo-learn docs: https://eo-learn.readthedocs.io/ |
| ONNX Runtime React Native | Deferred device-runtime lane only after Expo dev-build and Android/iOS proof. | ONNX Runtime RN docs: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html |

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
