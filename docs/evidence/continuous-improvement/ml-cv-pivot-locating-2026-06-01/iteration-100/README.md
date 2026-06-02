# ML/CV Pivot Locating Loop Evidence - Iteration 100

Run id: `20260601T-run`

Scope: executed the local ML/CV pivot-locating loop for 100 iterations using a deterministic synthetic pivot fixture with known image-space center/radius truth. This is a local companion proof of the iteration machinery and image-space center detector behavior. It is not a real-world, survey-grade, projected-XY, or native/mobile proof.

## Commands

```sh
PYTHONPATH=tools/local-ml-companion/src python3 -m cplayout_ml.cli run-pivot-locator-loop --synthetic-fixture --output-dir reports/ml-cv-pivot-locating/20260601T-run --iterations 100 --created-at 2026-06-01T00:00:00.000Z
PYTHONPATH=tools/local-ml-companion/src python3 -m unittest tools/local-ml-companion/tests/test_boundary_detector.py -v
```

## Results

| Metric | Result |
| --- | --- |
| Schema | `cplayout-pivot-locator-loop-v1` |
| Iterations executed | 100 |
| Detector | local OpenCV Hough Circle Transform |
| Fixture kind | `synthetic_generated` |
| Detected iterations | 100 |
| Synthetic center-location passes | 100 |
| Best center error | `0.381 px` |
| Best center offset ratio | `0.0022` |
| Best radius mismatch ratio | `0.2345` |
| Best weighted vote score | `0.68` |
| `canonicalGeometryMutation` | `false` |
| `networkRequired` | `false` |
| `hiddenKeysAllowed` | `false` |
| Real-world accepted | `false` |

The run located the synthetic pivot center consistently, but Hough selected an inner crop ring for radius in the best-scored candidate. The loop therefore proves center-location behavior on the synthetic fixture, while preserving radius mismatch as evidence for later tuning rather than hiding it.

## Blockers

- No operator-approved real-world pivot fixture manifest was supplied for this command.
- No project-CRS calibration was supplied, so the run cannot claim projected-XY automatic pivot locating.
- Output remains local companion evidence and must not mutate canonical project geometry.
- Native/on-device ML remains unverified.

## Artifacts

Raw run artifacts are under ignored `reports/ml-cv-pivot-locating/20260601T-run/`:

- `pivot-locator-loop.json`
- `pivot-locator-iterations.jsonl`
- `pivot-locator-annotated.png`
- `pivot-locator-synthetic-fixture.png`

Checked hashes are recorded in `SHA256SUMS.txt`.
