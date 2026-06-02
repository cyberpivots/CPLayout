# Blocker Removal Roadmap

Current status note, 2026-06-02: this is a historical completed-pass snapshot. Use `docs/cplayout-focused-development-plan.md`, `docs/android-native-verification.md`, `docs/web-sqlite-feasibility.md`, and current loop ledgers for active blocker ordering.

## Completed In This Pass

- Local Git is initialized with generated artifacts ignored, so future work can use `git status` and `git diff`.
- Project-local Codex defaults request `gpt-5.5` with xhigh default and plan-mode reasoning.
- Map package metadata now distinguishes archive type, tile content type, tile scheme, TileJSON URL, tile URL templates, checksum, install status, bounds, attribution, and license.
- SQLite schema version `3` adds tile source metadata and package lookup indexes while preserving the project snapshot restore path.
- Project ZIP archives validate manifest shape and project id/CRS consistency on import.
- The project files UI reports backend/runtime/schema information instead of implying unverified native runtime success.
- The SVG layout map supports tap-to-draft vertices in drawing/edit modes while panning and zooming remain viewport-only state.
- Android native proof now has repo-local scripts for tool/device/package detection and completion-gated JSON report validation.
- Web SQLite remains behind a documented gate and domain test that keeps localStorage selected unless WASM, COOP/COEP, and Playwright persistence proof all pass.
- MapLibre is installed/configured for native and web adapter work, while native runtime verification remains blocked on a development build and device/emulator evidence.

## Still Deferred

- Native MapLibre runtime behavior and native PMTiles/MBTiles rendering remain deferred. MapLibre React Native accepts TileJSON URLs or tile URL templates, so raw archive files still require a local protocol adapter, local HTTP tile server, extracted tile directory, or conversion path plus device verification.
- Web SQLite remains deferred until Expo SQLite web is proven with Metro WASM support and COOP/COEP headers in the actual deployment environment.
- Native SQLite and native ZIP sharing are compile-ready but not production-verified until `docs/android-native-verification.md` passes on a real Android device or emulator.
- `npm run check:android-tools`, `npm run verify:android-native`, and `npm run verify:release` intentionally fail when Android SDK/device/app evidence is unavailable.
- Draft map vertices are not yet committed into `PivotProject.fieldBoundary` or obstacle entities. Full geometry editing still needs commit/cancel, undo, validation, and project mutation tests.

## Primary Sources Checked

- OpenAI Codex AGENTS.md and config guidance: https://developers.openai.com/codex/guides/agents-md, https://developers.openai.com/codex/config-reference, https://developers.openai.com/codex/learn/best-practices
- Expo SQLite, FileSystem, Sharing, and web guidance: https://docs.expo.dev/versions/latest/sdk/sqlite/, https://docs.expo.dev/versions/latest/sdk/filesystem/, https://docs.expo.dev/versions/latest/sdk/sharing/, https://docs.expo.dev/workflow/web/
- React Native platform and gesture guidance: https://reactnative.dev/docs/platform-specific-code, https://reactnative.dev/docs/panresponder
- MapLibre React Native source API and Expo setup: https://maplibre.org/maplibre-react-native/docs/components/sources/raster-source/, https://maplibre.org/maplibre-react-native/docs/components/sources/vector-source/, https://maplibre.org/maplibre-react-native/docs/setup/expo/
- PMTiles and MBTiles format guidance: https://docs.protomaps.com/pmtiles/maplibre, https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md, https://github.com/mapbox/mbtiles-spec
