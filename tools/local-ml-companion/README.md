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
