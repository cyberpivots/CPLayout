# CPLayout Decision-Complete Improvement Plan

## Summary

CPLayout should keep canonical layout geometry in projected/local `XY` coordinates while making decimal degrees the default user-facing WGS84 entry/display mode. Offline imagery should remain free/no-cost and locally packaged, with MapLibre limited to TileJSON or tile URL templates until raw PMTiles/MBTiles adapters are device-proven. Expert review should be visible in the GUI as bounded role outputs, not as an unbounded agent swarm. ML belongs in offline preprocessing or companion tooling unless a native on-device inference path is proven on Android/iOS.

## Key Implementation Changes

- Coordinate defaults: set `defaultAppSettings().coordinateDisplayFormat` to `decimal_degrees`. Keep `projected_local` selectable for expert/project CRS workflows, and keep all layout calculations in projected `XY`.
- Coordinate flow: continue using `parseCoordinateInput`, `projectLonLatToXy`, and `projectXyToLonLat` for WGS84 input/display and CRS projection. Do not change the project document schema to store WGS84 geometry as canonical.
- Imagery: use `MapPackageManifest` metadata for package type, content type, TileJSON URL, tile URL templates, bounds, attribution, license, checksum, and install status. Do not add paid imagery services or hidden-key providers.
- Native maps: treat `@maplibre/maplibre-react-native` as a native/development-build lane only. TileJSON URLs and tile URL templates can map to MapLibre sources; raw PMTiles/MBTiles still need a local protocol, generated TileJSON/templates, extracted tile directories, or a local tile server before native rendering.
- Expert panel: expose a GUI Review tab backed by pure TypeScript findings for Product/UX, GIS/Mapping, Architecture/Storage, ML Feasibility, and QA/Safety.
- Agent process: keep the main agent on the implementation path. Under the CPLayout owner's standing authorization, use bounded subagents for non-trivial matched source checks, test triage, implementation slices, or final review when those tasks can run without duplicating the main exploration; otherwise record `Accepted fallback:`.
- Model/reasoning policy: use low reasoning for file lookup, formatting, and narrow docs checks; medium for ordinary TypeScript/UI planning; high for architecture, map/provider, storage, data migration, and multi-package changes; xhigh only for high-risk cross-platform/native/ML decisions or final expert-panel arbitration. Track task class, tool count, test failures, and reviewer disagreement before escalating.

## Public Interfaces / Data Flow

1. User enters or views WGS84 coordinates in decimal degrees by default.
2. `packages/core/src/coordinates.ts` validates WGS84 and projects into the project CRS.
3. `PivotProject` continues to store field geometry, obstacles, pivot center, infrastructure points, and layout results as `XY`.
4. Project settings export the selected coordinate display format, but local-only package directories stay outside project export data.
5. Map package metadata round-trips through project documents, ZIP archives, and SQLite tables; binary imagery packages are referenced by manifest metadata and are not treated as canonical geometry.
6. Review findings are computed from typed project/settings/layout data and shown in the mobile Review tab.

## Expert Panel Process

- Product/UX verifies decimal-degree default, visible coordinate mode, and offline-first workflows.
- GIS/Mapping verifies projected CRS, WGS84 bounds/display separation, map package attribution/license metadata, and raw archive adapter boundaries.
- Architecture/Storage verifies native/web repository split, SQLite migration boundaries, ZIP round-trip, local-only settings, and no cloud backend.
- ML Feasibility verifies that ML is offline-first, avoids direct Python execution in React Native, and requires a proven native model runtime before app embedding.
- QA/Safety verifies warnings, obstacle conflicts, outside-field coverage, validation artifacts, audit findings, and native-device verification status.

Each role outputs a status, evidence, and an acceptance gate. Disagreement or blocked status escalates the final decision pass to xhigh reasoning.

## Governance Workflow

Durable operating rules live in `AGENTS.md`, while `.codex/config.toml` stays a low-cost default and `.agents/skills/` contains reusable workflow prompts for CPLayout preflight and planning review. Future decision-complete plans should use those surfaces before touching product code or package architecture.

## ML Research Lane

- Phase 1: companion/preprocessing only. Use Python/GDAL/ML outside the React Native runtime to produce GeoJSON, CSV, PMTiles/MBTiles, model-derived annotations, or scenario recommendations that CPLayout imports and validates.
- Phase 2: app-assisted inference proof. Evaluate native on-device inference only after identifying a small model, fixed input/output tensors, offline test data, bundle-size impact, and Android/iOS development-build requirements.
- Phase 3: production gate. Add an ML runtime only after device verification proves offline inference, deterministic failure handling, no hidden cloud calls, and no loss of projected-XY canonical geometry.

The practical native candidate to research first is ONNX Runtime for React Native because the official docs publish a React Native package path. It is not approved for app integration until Expo development-build and device tests pass.

## Test and Acceptance Plan

- Run `npm run validate` after TypeScript or UI changes.
- Run `npm audit` and report findings; do not run breaking `npm audit fix --force` without approval.
- For visible UI changes, run `npm run export:web` or a web dev-server check and capture a Playwright screenshot when available.
- Android/iOS persistence or native MapLibre claims require the checklist in `docs/android-native-verification.md`; do not call native behavior production-verified without an `adb` device/emulator run or equivalent iOS device proof.
- Coordinate acceptance: new defaults are decimal degrees; WGS84 parsing/display round-trips through projected XY; existing project settings can still select another display format.
- Imagery acceptance: offline package metadata validates attribution/license/checksum/bounds; native raw PMTiles/MBTiles rendering remains blocked until a real adapter is implemented and device-verified.

## Assumptions and Non-Goals

- Assumption: Expo SDK 55 and React Native 0.83 are the current repo targets because `apps/mobile/package.json` pins that stack.
- Assumption: the current web MVP remains browser-local persistence until Expo SQLite web WASM plus COOP/COEP headers are proven in deployment.
- Non-goal: no Google Maps, paid Mapbox/Esri services, paid imagery, cloud backend, hidden key, or trial SDK.
- Non-goal: no direct Python/GDAL/RTKLIB/ML execution inside React Native.
- Non-goal: no production claim for native SQLite, ZIP sharing, native MapLibre, PMTiles/MBTiles raw archive rendering, or on-device ML until device verification passes.

## Primary Sources Checked

Status note, 2026-06-02: use `docs/agent-source-ledger.md` for current Codex process sources. Refresh package and platform sources again before changing architecture or dependency claims.

- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo SDK 55 / React Native target table: https://docs.expo.dev/versions/latest/
- Expo web export: https://docs.expo.dev/workflow/web/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- MapLibre React Native Expo setup: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- MapLibre RasterSource: https://maplibre.org/maplibre-react-native/docs/components/sources/raster-source/
- MapLibre VectorSource: https://maplibre.org/maplibre-react-native/docs/components/sources/vector-source/
- PMTiles MapLibre GL integration: https://docs.protomaps.com/pmtiles/maplibre
- PMTiles v3 spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
- MBTiles spec: https://github.com/mapbox/mbtiles-spec
- OpenStreetMap tile policy: https://operations.osmfoundation.org/policies/tiles/
- Proj4js: https://proj4js.org/
- React Native device verification: https://reactnative.dev/docs/running-on-device
- ONNX Runtime React Native: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html
