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
  --project-id open-real-pivot-proof \
  --project-crs EPSG:32613 \
  --created-at 2026-05-29T00:00:00.000Z
```

Outputs are `visual-layout-review.json` and `visual-layout-review-annotated.png`. The JSON includes `LayoutEvidenceRecord`, `ModelRecommendation`, and deferred `LayoutDecisionRecord` payloads with `reviewStatus: "unreviewed"` and `canonicalGeometryMutation: false`. CV metrics are image-space only; they may warn about center/radius/overlay alignment, but any accepted geometry must still go through CPLayout projected-XY import, editor, validation, and operator review flows.
