# ML Boundary Assist On-Device Spike Checklist

Date: 2026-05-31

## Decision

Do not install `onnxruntime-react-native` yet. The current supported ML loop is
the local Python companion with DVC metadata and local MLflow tracking. A mobile
runtime dependency may be proposed only after an Expo development build proves a
small CPLayout boundary model on Android and iOS.

## Source-Backed Basis

- PyTorch local CUDA remains companion-side: the official local install selector
  separates Python builds by OS, package manager, and compute platform, including
  CUDA and CPU choices. Source: https://pytorch.org/get-started/locally/
- ONNX Runtime has a React Native package and import path, making it the future
  candidate runtime rather than Python/GDAL/SAM2 in React Native. Source:
  https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html
- ONNX Runtime mobile guidance requires model-size, latency, memory, and power
  measurement on target devices before treating mobile inference as proven.
  Source: https://onnxruntime.ai/docs/tutorials/mobile/
- Expo Go is not sufficient for new native ML libraries; Expo native library
  changes require a development build. Source:
  https://docs.expo.dev/develop/development-builds/introduction/
- DVC `add` creates metadata pointer files for data/model artifacts, which fits
  local versioning without committing large datasets. Source:
  https://doc.dvc.org/command-reference/add
- MLflow tracking can log params, metrics, artifacts, datasets, and checkpoints
  to a local tracking directory. Source: https://mlflow.org/docs/latest/ml/tracking/
- scikit-learn cross-validation remains the baseline split/evaluation reference
  for small labeled datasets. Source:
  https://scikit-learn.org/stable/modules/cross_validation.html
- SAM2 remains local Python research because the official repository provides
  Python inference/training code and checkpoint workflows. Source:
  https://github.com/facebookresearch/sam2

## Required Proof Before Any Runtime Dependency Lands

1. Create an Expo development build for Android and iOS with a throwaway branch
   that adds `onnxruntime-react-native`.
2. Load the same exported ONNX boundary model from bundled local assets on both
   platforms.
3. Run a CPU baseline first, then XNNPACK when available.
4. Measure cold model load, warm inference latency, memory growth, binary-size
   impact, battery/power behavior, and thermal behavior.
5. Compare output parity against the local companion on the same fixed fixtures.
6. Confirm no network access, hidden keys, telemetry, paid imagery, or hosted ML
   services are required.
7. Keep output as standalone companion report data unless a future projected-XY
   Map/Files edit-import workflow is explicitly designed and validated.
8. Prove Android and iOS export/import round trips still preserve projected
   project-CRS `XY` geometry.

## Non-Goals

- No on-device training.
- No React Native Python, GDAL, PyTorch, SAM2, DVC, or MLflow runtime.
- No NNAPI, CoreML, or mobile GPU/NPU production claim until CPU/XNNPACK proof
  exists and a device-specific acceleration comparison passes.
- No automatic canonical geometry mutation outside the existing audited review
  and reducer validation paths.

## Remaining Unverified Claims

- CPLayout has not installed or run `onnxruntime-react-native`.
- No Expo development build has loaded a CPLayout boundary model.
- No Android/iOS model latency, memory, binary-size, power, or parity proof
  exists.
- No native acceleration provider is validated for CPLayout boundary inference.
