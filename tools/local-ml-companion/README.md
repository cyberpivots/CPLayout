# CPLayout Local ML Companion

This tool is a WSL-local file bridge for advisory layout recommendations. It reads a CPLayout project JSON or project ZIP, writes `ModelRecommendation` JSON plus projected-XY GeoJSON, and leaves browser/native runtime code free of Python, GDAL, or ML dependencies.

## Environment

Use Python 3.12 with `uv`:

```sh
cd tools/local-ml-companion
uv venv --python 3.12
uv pip install --index-url https://download.pytorch.org/whl/cu130 torch torchvision torchaudio
uv pip install -e .
```

The CUDA-backed probe must pass before output is treated as GPU-backed:

```sh
uv run cplayout-ml probe-gpu
```

The first recommender is deterministic and advisory. It is not a production-trained agronomy model.

The imagery field-boundary detector is offline-only. OpenCV is the required scoring/refinement layer. SAM2 is optional and is used only inside this local Python companion when the operator has already installed SAM2 and supplied local files; the CLI does not download checkpoints or make cloud calls.

```sh
uv run cplayout-ml probe-boundary-detector \
  --sam2-config "$CPLAYOUT_SAM2_CONFIG" \
  --sam2-checkpoint "$CPLAYOUT_SAM2_CHECKPOINT"
```

`CPLAYOUT_SAM2_CONFIG` and `CPLAYOUT_SAM2_CHECKPOINT` may be used instead of flags. If SAM2 is missing or unconfigured, `probe-boundary-detector` reports it as unavailable and the review can still run the OpenCV scoring path.

## File Bridge

```sh
uv run cplayout-ml recommend-layout \
  --input ../../sample-burgundy-quarter-section.center-pivot.zip \
  --output-dir ./out \
  --created-at 2026-05-28T00:00:00.000Z
```

If `--created-at` is omitted, the CLI uses a fixed fixture timestamp so repeated runs with the same input produce byte-stable recommendation files. Pass an explicit ISO timestamp when preparing a field-review package.

Import `out/model-recommendations.json` or `out/model-recommendations.geojson` into the browser Review tab. Accept/Reject/Defer decisions are review records only and do not mutate canonical project geometry.

## Design-Only Google Earth Vision Review

The `design-vision-review` command consumes an existing Google Earth Pro proof packet and writes a local advisory report. It requires explicit paths for the KML, KMZ, full-window screenshot, map-canvas crop, and visual-fidelity manifest, then records SHA-256 hashes for every artifact. The full-window screenshot is required because map-canvas crops alone do not preserve attribution evidence.

```sh
uv run cplayout-ml design-vision-review \
  --kml ../../reports/google-earth-visual-fidelity/iteration-7-browser-study/generated-proof-clean/cplayout-google-earth-visual-fidelity.kml \
  --kmz ../../reports/google-earth-visual-fidelity/iteration-7-browser-study/generated-proof-clean/cplayout-google-earth-visual-fidelity.kmz \
  --full-window ../../reports/google-earth-visual-fidelity/iteration-7-browser-study/generated-proof-clean/google-earth-visual-fidelity-full-window.png \
  --map-canvas ../../reports/google-earth-visual-fidelity/iteration-7-browser-study/generated-proof-clean/google-earth-visual-fidelity-map-canvas.png \
  --manifest ../../reports/google-earth-visual-fidelity/iteration-7-browser-study/generated-proof-clean/visual-fidelity-manifest.json \
  --output-dir ../../reports/google-earth-visual-fidelity/design-vision-review \
  --project-id public-adams-county-center-pivot-proof \
  --project-crs EPSG:32613 \
  --project-reference ../../exports/public-adams-county-center-pivot-proof-project.json \
  --created-at 2026-05-29T00:00:00.000Z
```

Outputs are `visual-layout-review.json`, `visual-layout-review-recommendations.geojson`, and `visual-layout-review-annotated.png`. The JSON includes `LayoutEvidenceRecord`, `ModelRecommendation`, and deferred `LayoutDecisionRecord` payloads with `reviewStatus: "unreviewed"` and `canonicalGeometryMutation: false`. When `--project-reference` points to an accepted CPLayout project JSON or ZIP, projected-XY pivot and obstacle context can be copied from that reference into the recommendation for explicit browser review/apply. Field-boundary recommendations are included only when `--infer-field-boundary` finds and calibrates an imagery field outline. Without calibration, the recommendation remains metadata-only for boundary geometry and may include KML `LookAt` WGS84 display context. CV metrics are image-space only; they may warn about center/radius/overlay/boundary alignment, but any accepted geometry must still go through CPLayout projected-XY import, editor, validation, and operator review flows.

Pass `--infer-field-boundary` when the review must look for a road, fenceline, treeline, or field-separation outline in the Google Earth map-canvas screenshot. This detector rejects circular crop or pivot coverage rings as field boundaries. It exports a projected-XY boundary recommendation only when a visible CPLayout overlay circle and a project reference provide calibration evidence; otherwise the detected polygon stays image-space advisory evidence.

Pass `--operator-boundary-kml <path>` when Google Earth Pro contains a human-drawn Polygon Placemark for comparison. Use `--operator-boundary-kml -` to pipe pasted KML on stdin, or `--operator-boundary-kml-text "$KML"` when a caller already has raw KML text. The default placemark name is `USER DRAWN FIELD BOUNDARY`; override it with `--operator-boundary-name`. The command accepts `.kml`, `.kmz`, stdin, or raw text, extracts exactly one matching Polygon, rejects missing, line-only, unclosed, or duplicate matches with warnings, and writes it as operator evidence in `detections.truthBoundary`, `detections.operatorFieldBoundary`, and `detections.truthLabels.targetFieldBoundary`. Operator labels are scoring and learning feedback; they are not written to `detections.cvCandidateBoundary` or `detections.imageryFieldBoundary` as CV predictions and do not create `modelRecommendations[].proposedGeometry.fieldBoundary`.

The detector must not synthesize a box around the pivot ring. If imagery-derived road, fenceline, treeline, or field-separation evidence is not strong enough, `detections.imageryFieldBoundary` is either `null` or marked `rejected: true`, and `modelRecommendations[].proposedGeometry.fieldBoundary` is omitted. Accepted detections include `source`, `imagePolygon`, optional `projectedPolygon`, `confidence`, `edgeAlignment`, `rectilinearity`, `circularity`, `containment`, `rejectionReasons`, and a `candidateMasks` audit summary.

When an operator label can be pixel-aligned through the proof KML, project reference, and overlay-circle calibration, `visual-layout-review.json` also includes `operatorComparison` metrics for imagery candidates: `iou`, `boundaryMeanDistancePixels`, `boundaryMaxDistancePixels`, `falsePositiveAreaRatio`, and `falseNegativeAreaRatio`. CV candidates fail hard when they are 4-point axis-aligned extent rectangles, clipped by the screenshot edge, exceed `0.08` false-positive area ratio, exceed `80 px` mean boundary distance, or miss the irregular south/southeast operator-boundary features. High IoU alone is never sufficient for CV acceptance. `learningRecommendations[]` records detector/ranking issues such as weak candidate generation, low overlap, or unusable operator-label calibration.

Projected boundary output remains advisory local companion evidence. Operator acceptance still has to go through the CPLayout projected-XY import/editor/validation workflows before any canonical geometry changes.

## Boundary Improvement Loop

Use `improve-boundary-detector` when a proof packet has imagery plus an optional operator-drawn boundary label and weak detector output must not be accepted. The command always runs at least five detector iterations, including baseline Canny/Hough, low-threshold fenceline search, high-contrast road/structure search, surface color variation, and operator-ranked surface-edge feedback.

```sh
uv run cplayout-ml improve-boundary-detector \
  --map-canvas ../../reports/google-earth-visual-fidelity/adams-operator-boundary-proof-20260529T-local/google-earth-visual-fidelity-map-canvas.png \
  --full-window ../../reports/google-earth-visual-fidelity/adams-operator-boundary-proof-20260529T-local/google-earth-visual-fidelity-full-window.png \
  --kml ../../reports/google-earth-visual-fidelity/adams-operator-boundary-proof-20260529T-local/cplayout-google-earth-visual-fidelity.kml \
  --project-reference ../../reports/google-earth-visual-fidelity/public-adams-county-center-pivot-proof-project.json \
  --operator-boundary-kml ../../reports/google-earth-visual-fidelity/operator-user-drawn-field-boundary.kml \
  --output-dir ../../reports/google-earth-visual-fidelity/boundary-improvement-loop/manual-run \
  --min-iterations 5
```

Outputs are `boundary-improvement-loop.json`, `boundary-improvement-iterations.jsonl`, and `boundary-improvement-annotated.png`. The JSON records every iteration, candidate counts, rejection reasons, operator IoU when labels are available, `detections.truthBoundary` for operator-truth reconstruction, and `detections.cvCandidateBoundary` for advisory detector output. `acceptance.accepted` describes CV candidate acceptance; operator truth remains separate and still does not mutate projected `XY` project geometry.

When CUDA PyTorch is installed and `uv run cplayout-ml probe-gpu` passes, the command runs a CUDA tensor preflight over the map image and records the device and tensor statistics. OpenCV scoring remains CPU-bound unless the local OpenCV build itself exposes CUDA.

## Vision Fixture Evaluation

Use `evaluate-vision-fixtures` for repeatable local regression checks over operator-approved proof packets:

```sh
uv run cplayout-ml evaluate-vision-fixtures \
  --manifest ../../reports/google-earth-visual-fidelity/fixtures/vision-fixtures.json \
  --output-dir ../../reports/google-earth-visual-fidelity/fixture-evaluation
```

The manifest contains `fixtures[]` entries with local paths for `fullWindowScreenshot`, `mapCanvasCrop`, optional `kml`, optional `kmz`, optional `visualFidelityManifest`, optional `projectReference`, and expected booleans such as `expected.boundaryPresent`, `expected.overlayPresent`, and `expected.blackCanvas`. Outputs are `vision-evaluation-summary.json`, `vision-evaluation-cases.jsonl`, and per-case annotated PNGs. The evaluation reports precision, recall, IoU-style boundary detection metrics, overlay detection metrics, false-positive categories, and semantic advisory cues such as pivot ring, overlay, service/access lines, radial/corner-arm cues, and advisory boundaries.

This command is offline/local only. It does not download SAM2 checkpoints, call a network service, cache Google imagery, or write canonical `PivotProject` geometry.

For a complete local Google Earth proof packet and companion CV run, use the top-level orchestration script:

```powershell
powershell -ExecutionPolicy Bypass -File ../../tools/run_google_earth_design_loop.ps1 `
  -ProjectId public-adams-county-center-pivot-proof `
  -ProjectCrs EPSG:32613 `
  -ProjectReferencePath ../../exports/public-adams-county-center-pivot-proof-project.json `
  -InferFieldBoundary `
  -ConfirmOverlayVisible `
  -RequireProofPass
```

The script writes a timestamped ignored folder under `reports/google-earth-visual-fidelity/`, cleans up the targeted Google Earth Pro session by default, and records `design-loop-summary.json` beside the visual-fidelity manifest and CV review outputs. Strict cleanup is part of the proof gate: if cleanup is blocked or the targeted Google Earth Pro process remains, the run records `contaminatedGoogleEarthWorkspace: true` and fails even when the screenshots pass visual proof. Pass `-LeaveGoogleEarthOpen` only when an operator needs manual review; the summary then records `googleEarthLeftOpen: true` and cleanup is intentionally skipped rather than treated as contamination.
