# CPLayout Agent Source Ledger

This ledger records sources used to define the agent, hook, and skill surfaces. Use primary or official sources for claims that affect architecture, platform behavior, database behavior, Google Earth/KML evidence, or real-world irrigation design.

| Source | Verified use | Boundary |
| --- | --- | --- |
| OpenAI Codex subagents docs: `https://developers.openai.com/codex/subagents` | Project-scoped custom agents live under `.codex/agents/`; standalone custom agents require `name`, `description`, and `developer_instructions`; `sandbox_mode` and `model_reasoning_effort` are supported config keys. | Custom agent format may evolve; parse locally and keep agents narrow. |
| OpenAI Codex hooks docs: `https://developers.openai.com/codex/hooks#userpromptsubmit` | `UserPromptSubmit` hooks receive a prompt and can add `hookSpecificOutput.additionalContext`. | The CPLayout hook is advisory and non-blocking. |
| OpenAI Codex config reference: `https://developers.openai.com/codex/config-reference#configtoml` | Project `.codex/config.toml` can define `[features].hooks`, `[agents]`, and `agents.<name>.config_file`; project config loads only for trusted projects. | User-level provider/auth/telemetry keys belong outside project config. |
| Skill creator validator: `/home/cyber/.codex/skills/.system/skill-creator/scripts/quick_validate.py` | Validates `SKILL.md` frontmatter names, descriptions, and allowed fields. | Local tool availability is machine-specific. |
| Google KML Reference: `https://developers.google.com/kml/documentation/kmlreference` | KML is a geographic display format with shared styles; style metadata is presentation evidence for CPLayout, not canonical projected `XY` geometry. | Google Earth rendering still requires visual proof. |
| OpenCV Hough Circle Transform: `https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html` | Baseline local companion detector for circular crop-ring and overlay-circle candidates; `HoughCircles` finds circles in grayscale images and exposes tunable radius/threshold parameters. | Image-space circle evidence is not projected `XY` truth without calibration, fixture metrics, and review. |
| OpenCV Canny Edge Detection: `https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html` | Baseline edge cue for crop rings, radial/tower tracks, roads, fencelines, and structures in local screenshots. | Edge response requires threshold sweeps and false-positive audits before it can support a recommendation. |
| scikit-learn cross-validation: `https://scikit-learn.org/stable/modules/cross_validation.html` | Source for train/validation/test hygiene and avoiding evaluation on training examples in local ML experiments. | Small agricultural fixture sets still need project/field-level split isolation and leakage checks. |
| MLflow Tracking: `https://mlflow.org/docs/latest/ml/tracking/` | Local experiment record candidate for parameters, metrics, and artifacts under ignored local outputs. | No remote MLflow server, upload, telemetry, or account requirement by default. |
| DVC add command: `https://doc.dvc.org/command-reference/add` | Source for lightweight dataset/model pointer metadata via `.dvc` files instead of committing large imagery. | Remote DVC storage is not assumed and must not be required for the local-first loop. |
| ONNX Runtime React Native: `https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html` | Candidate future React Native inference runtime if a development build/device checklist is satisfied. | Not installed or production-approved for CPLayout pivot locating. |
| ONNX Runtime mobile deployment: `https://onnxruntime.ai/docs/tutorials/mobile/` | Source for mobile inference deployment concepts and proof targets. | Device performance, memory, power, network isolation, and parity remain unverified. |
| Expo development builds: `https://docs.expo.dev/develop/development-builds/introduction/` | Expo documents that native-library behavior requires a development build rather than assuming Expo Go can run new native code. | Native ML claims require Android/iOS evidence, not docs alone. |
| Expo SQLite docs: `https://docs.expo.dev/versions/latest/sdk/sqlite/` | Expo SQLite provides SQLite access across supported platforms; web setup requires WASM support and COOP/COEP headers, and web support is alpha. | CPLayout web SQLite remains research-gated until deployment headers and browser behavior are verified. |
| SQLite about/docs: `https://www.sqlite.org/about.html` and `https://www.sqlite.org/docs.html` | SQLite is embedded, serverless, public domain, transactional, and single-file oriented, aligning with offline-first local project storage. | Runtime behavior must still be validated on target platforms. |
| USDA NRCS NEH Part 623 Chapter 11 Sprinkler Irrigation: `https://www.wcc.nrcs.usda.gov/ftpref/wntsc/waterMgt/irrigation/NEH15/ch11.pdf` | Seed primary engineering reference for center-pivot design research and terminology. | Do not treat this ledger as engineering certification or complete design coverage. |

## Continuous Improvement Loop Records

| Record | Verified use | Boundary |
| --- | --- | --- |
| `SRC-WHOLE-LOOP-VERIFY`: `tools/verify_whole_codebase_improvement_loop.ts` | Verifies the whole-codebase 100-row ledger for row continuity, guardrail phrases, valid decision states, weighted vote cells, and evidence requirements for rows marked `Pass`. | It does not prove planned future rows executed; it only enforces structure and passed-row evidence fields. |
| `SRC-WHOLE-LOOP-LEDGER`: `docs/whole-codebase-improvement-loop-2026-06-01.md` | Coordinates the 10-batch whole-codebase loop across UI, storage, maps, overlays, ML/CV, native gates, evidence, and final validation. | Rows marked `Planned` are roadmap rows, not completed implementation. |
| `SRC-LOOP-CLAIM-CLASSES` | Separates browser proof, storage proof, synthetic ML/CV proof, real-world fixture proof, native/device proof, Google Earth proof, and documentation proof. | Success in one claim class must not be reported as success in another. |
| `SRC-CHECKPOINT-POLICY` | Current dirty-tree work must be investigated, validated, committed, and remote-checkpointed before new high-risk loop batches proceed. | Checkpointing preserves pre-existing work; it is not a production readiness claim. |

## Update Rules

- Add sources when a specialist makes a package, platform, database, imagery, or engineering claim.
- Record the claim, source URL or local path, date checked, and what remains unverified.
- Keep real-world design assumptions separate from confirmed project facts.
- Do not use operator labels, imagery evidence, or KML/KMZ styling as automatic geometry mutation authority.
