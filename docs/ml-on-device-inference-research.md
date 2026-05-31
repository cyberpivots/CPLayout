# CPLayout ML On-Device Inference Research

Date: 2026-05-31

## Decision

CPLayout should keep the next ML lane research-only and prioritize on-device
inference feasibility, not on-device training. The near-term implementation path
remains the existing WSL/local Python companion for heavy computer vision,
dataset preparation, and experiment tracking. A future mobile lane can evaluate
ONNX Runtime React Native in an Expo development build, but it must not be
reported as production-ready until Android and iOS device runs prove model load,
latency, memory, power, and output parity against the local companion.

This document does not add React Native dependencies, project schemas, model
training code, cloud services, telemetry, API keys, paid imagery, or automatic
geometry writes.

## Local Facts Verified

| Fact | Worktree evidence |
| --- | --- |
| ML is already companion-first and advisory. | `docs/local-ml-data-improvement-plan.md` says model output must not mutate field boundaries, obstacles, or pivot geometry without explicit operator acceptance. |
| The local companion is Python-only and outside the React Native runtime. | `tools/local-ml-companion/README.md` describes a WSL-local file bridge that writes `ModelRecommendation` JSON and projected-XY GeoJSON while keeping browser/native runtime code free of Python, GDAL, or ML dependencies. |
| Current local CV dependencies are OpenCV and scikit-learn. | `tools/local-ml-companion/pyproject.toml` depends on `opencv-python-headless>=4.10`, `pandas>=2.2`, and `scikit-learn>=1.5`. |
| GPU probing already belongs to the local companion. | `tools/local-ml-companion/src/cplayout_ml/cli.py` exposes `probe-gpu`, checks `torch.cuda.is_available()`, and records CUDA device metadata when available. |
| SAM2 is optional and local-only. | `tools/local-ml-companion/README.md` and `cli.py` require local SAM2 config/checkpoint paths and state that the companion does not download checkpoints or call a network service. |
| Boundary improvement output is advisory evidence. | `tools/local-ml-companion/README.md` documents `boundary-improvement-loop.json`, candidate rejection reasons, operator IoU, and `canonicalGeometryMutation: false`. |
| Accepted geometry still routes through projected-XY validation. | `packages/core/src/layoutEvidence.ts` requires projected `projectCrs` for `ModelRecommendation`, and `packages/core/src/projectReducer.ts` applies `apply_model_recommendation` only after project ID, CRS, hard-failure, ring, and pivot-inside-field checks pass. |

## Source-Backed Platform Claims

| Claim | Source |
| --- | --- |
| PyTorch local GPU use should stay in the companion lane because PyTorch's local install flow explicitly selects Linux/Python/CUDA or CPU builds and verifies CUDA through `torch.cuda.is_available()`. | [PyTorch local install guidance](https://pytorch.org/get-started/locally/) |
| ONNX Runtime React Native is the preferred future mobile runtime candidate because the official docs publish `onnxruntime-react-native` installation and import guidance. | [ONNX Runtime React Native docs](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html) |
| ONNX mobile apps must use models that fit device disk and memory; mobile performance must be measured for binary size, model size, latency, and power. | [ONNX Runtime mobile development flow](https://onnxruntime.ai/docs/tutorials/mobile/) |
| CPU/XNNPACK should be the first mobile benchmark before NNAPI/CoreML because ONNX Runtime says CPU is the default, Android/iOS support XNNPACK, and NNAPI/CoreML performance is device and model specific. | [ONNX Runtime mobile accelerators](https://onnxruntime.ai/docs/tutorials/mobile/) and [execution providers](https://onnxruntime.ai/docs/execution-providers/) |
| Expo Go is not enough for native ML runtime proof because it contains a fixed set of native libraries; adding native libraries requires a development build. | [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) |
| SAM2 can support local proposal generation and later fine-tuning research, but it remains a Python/PyTorch companion tool because the official repo requires Python/PyTorch installation, local checkpoints, and training/fine-tuning code. | [SAM2 official repository](https://github.com/facebookresearch/sam2) |
| MLflow can track local experiment parameters, metrics, artifacts, datasets, and checkpoints without a configured remote service because default tracking logs to a local `mlruns` directory. | [MLflow tracking docs](https://mlflow.org/docs/latest/ml/tracking/) |
| DVC-style data pointers fit local dataset/version loops because `dvc add` tracks files or directories through lightweight `.dvc` files while keeping large datasets outside Git. | [DVC add docs](https://doc.dvc.org/command-reference/add) |
| scikit-learn cross-validation should remain the baseline evaluation pattern for small operator-labeled datasets because it warns against testing on training data and documents train/test, validation, and k-fold workflows. | [scikit-learn cross-validation docs](https://scikit-learn.org/stable/modules/cross_validation.html) |
| TorchGeo and Raster Vision are research candidates for offline geospatial training/evaluation, not React Native runtime dependencies. | [TorchGeo docs](https://docs.torchgeo.org/en/stable/index.html) and [Raster Vision docs](https://docs.rastervision.io/) |

## Decision 1: GPU Utilization

Keep training, SAM2-assisted proposals, and heavy OpenCV analysis in
`tools/local-ml-companion`. The companion can use PyTorch CUDA when
`uv run cplayout-ml probe-gpu` passes, but OpenCV scoring remains CPU-bound
unless the local OpenCV build itself exposes CUDA.

Recommended next steps:

1. Keep `probe-gpu` as the gate before a report can mark outputs as GPU-backed.
2. Record device name, CUDA runtime, tensor preflight status, and wall-clock
   timings in local reports.
3. Add repeatable timing around boundary candidate generation, SAM2 proposal
   import, OpenCV filtering, and final recommendation export.
4. Treat mobile GPU/NPU use as unverified until an Expo development build runs
   the same exported ONNX model on real Android/iOS devices.

Non-goals:

- No CUDA, PyTorch, SAM2, TorchGeo, Raster Vision, DVC, or MLflow inside the
  React Native runtime.
- No cloud GPU service, hosted training job, telemetry, or automatic upload.
- No production claim for mobile acceleration until a device benchmark exists.

## Decision 2: Algorithm Refinement

Improve the current boundary detector before trusting any model-family
replacement. The current safest path is operator-labeled fixture evaluation,
threshold sweeps, SAM2-assisted local proposals, and explicit rejection classes.

Refinement loop:

1. Build or expand an operator-approved fixture manifest for
   `evaluate-vision-fixtures`.
2. For each fixture, record local paths, hashes, project CRS, expected labels,
   operator boundary labels when available, and whether calibration is strong
   enough for projected-XY output.
3. Sweep OpenCV thresholds for Canny edges, contour area, Hough lines/circles,
   morphology, color/surface variation, circularity, screenshot-edge clipping,
   and overlay containment.
4. Use SAM2 only as a proposal generator when locally installed and configured.
   SAM2 masks must still pass OpenCV/geometric rejection before entering a
   `ModelRecommendation`.
5. Reject false positives with named categories:
   `pivot_ring_box`, `coverage_circle`, `screenshot_edge_clip`,
   `road_or_driveway`, `building_or_tree_cluster`, `watermark_or_ui`,
   `low_edge_alignment`, `operator_label_mismatch`, and
   `project_crs_calibration_missing`.
6. Publish metrics per fixture: precision, recall, IoU, false-positive area
   ratio, false-negative area ratio, boundary mean/max distance in pixels,
   calibration status, and candidate rejection counts.

Acceptance bar:

- A detector output may become advisory evidence only when it passes local
  fixture thresholds and emits rejection audit data.
- A detector output may propose projected-XY geometry only when project CRS,
  calibration, and operator review requirements are satisfied.
- A detector output must not directly mutate canonical `PivotProject` geometry.

## Decision 3: Model Training Improvement

Use a local-only dataset and experiment loop. The target is reproducible
comparison evidence, not a production training pipeline.

Recommended local structure:

| Area | Research direction |
| --- | --- |
| Dataset pointers | Track large screenshots, crops, labels, masks, exported reports, and model artifacts with DVC-style `.dvc` pointer files outside Git. Keep source imagery licensing and offline-copy policy beside each fixture. |
| Experiment tracking | Use an MLflow local tracking directory for params, metrics, artifacts, model checkpoints, and dataset references. Do not configure remote tracking by default. |
| Splits | Keep project/field-level train, validation, and test splits so near-duplicate screenshots from the same field do not leak across splits. |
| Metrics | For boundary tasks, record IoU, precision/recall, false-positive area ratio, false-negative area ratio, boundary distance, calibration availability, inference latency, and export validity. |
| Baselines | Compare deterministic OpenCV rules, OpenCV plus SAM2 proposals, and any trained segmentation model against the same fixture manifest. |
| Geospatial research | Evaluate TorchGeo or Raster Vision only in offline Python research if local raster/vector labels become substantial enough to justify them. |

Minimum reproducibility metadata:

- CPLayout commit and dirty-tree note.
- Fixture manifest hash and dataset pointer revision.
- Model code revision, model artifact hash, and training config.
- Train/validation/test split IDs.
- CPU/GPU device metadata and dependency versions.
- Metrics summary plus per-case JSONL results.
- Export validation result for generated `LayoutEvidenceRecord`,
  `ModelRecommendation`, and optional `LayoutDecisionRecord` payloads.

## On-Device Inference Feasibility Matrix

| Candidate | Fit for CPLayout | Required proof before implementation | Current decision |
| --- | --- | --- | --- |
| ONNX Runtime React Native | Best future candidate because it is official, supports React Native, and aligns with an inference-only mobile target. | Expo development build, Android and iOS install, model asset load, inference run, CPU/XNNPACK baseline, parity check against companion output, memory/latency/power measurement, and project export/import validation. | Research candidate only. Do not add dependency yet. |
| Expo Go | Useful for JS/UI work, not enough for native ML runtime validation. | None; Expo docs say native libraries outside Expo Go require a development build. | Not a valid ML proof target. |
| Android NNAPI | Possible acceleration path through ONNX Runtime execution providers. | Compare against CPU/XNNPACK on target devices; check partitioning, unsupported ops, latency, memory, power, and output parity. | Deferred until CPU/XNNPACK baseline fails to meet requirements. |
| iOS CoreML | Possible acceleration path through ONNX Runtime execution providers. | Compare against CPU/XNNPACK on target devices; check unsupported ops, latency, memory, power, and output parity. | Deferred until CPU/XNNPACK baseline fails to meet requirements. |
| On-device training | Poor fit for the next lane; CPLayout needs reviewable inference and evidence import first. | Separate product requirement, privacy review, native storage budget, thermal/power testing, and rollback strategy. | Out of scope. |
| React Native Python/GDAL/SAM2 | Conflicts with the repository boundary that Python/GDAL/SAM2 belong in offline preprocessing or companion tools. | No planned proof. | Do not pursue. |

## Public Interface And Data Flow

No public interfaces should change for this research lane.

Future implementation should keep this flow:

1. Local companion or future mobile inference writes advisory output.
2. Output is imported through the existing review/evidence path as
   `LayoutEvidenceRecord`, `ModelRecommendation`, and optional
   `LayoutDecisionRecord`.
3. Proposed geometry remains project-CRS `XY` plus optional display WGS84.
4. Operator review accepts, rejects, or defers the recommendation.
5. Accepted geometry changes go through reducer actions and validation, including
   `apply_model_recommendation`, undo, and hard-failure checks.

This preserves canonical projected/local `XY` geometry and keeps KML/KMZ,
imagery, model masks, and display WGS84 as evidence or interchange layers.

## Validation Plan

Documentation/static checks:

```sh
git diff --check
npm run validate:skills
```

Project checks, because this document references current ML contracts:

```sh
npm run validate
python3 -m unittest discover -s tools/local-ml-companion/tests
```

Optional local ML proof checks when the environment is already configured:

```sh
cd tools/local-ml-companion && uv run cplayout-ml probe-gpu
cd tools/local-ml-companion && uv run cplayout-ml probe-boundary-detector
```

Package security check:

```sh
npm audit
```

Android/iOS on-device proof is explicitly not required for this research
document. On-device inference remains unverified until an Expo development build
measures model load, latency, memory, power, and output parity on target devices.

## Remaining Unverified Claims

- ONNX Runtime React Native has not been installed in CPLayout.
- No Expo development build has loaded or run a CPLayout boundary model.
- No Android NNAPI, iOS CoreML, or XNNPACK benchmark exists for a CPLayout model.
- No mobile model memory, power, thermal, or binary-size budget has been set.
- No trained boundary segmentation model has exceeded the deterministic OpenCV
  fixture baseline.
- Local DVC metadata/config and companion MLflow dependencies are initialized,
  but no remote DVC store, hosted tracking server, or production training run is
  configured.
- TorchGeo and Raster Vision are candidate research tools only; neither is a
  repository dependency or validated CPLayout training pipeline.
