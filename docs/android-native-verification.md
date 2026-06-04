# Android Native Runtime Verification

Use this checklist before reporting native SQLite, native ZIP sharing, or native file picking as production-verified. Android is the first target because the project already exports an Android bundle with Expo SQLite, FileSystem, and Sharing configured.

## Required Setup

- Build a native app or development client. Expo Go is not sufficient for validating config-plugin native modules.
- From the repo root, use `npm run android` for the local Android development-build path; it delegates to `expo run:android` in `apps/mobile`.
- Record device/emulator model, Android version, app build type, package version, and date.
- Start from a clean install when validating migrations from scratch; repeat once with an existing install when validating upgrade migrations.

## Repo Harness

- `npm run check:android-tools` detects `adb`, connected devices/emulators, whether `local.centerpivot.layout` is installed, and basic package/log evidence.
- `npm run verify:android-native` writes a timestamped JSON report under `reports/android-native-verification/` and fails until a built app plus completed checklist evidence are available.
- `npm run verify:android-native -- --report <report.json>` validates a completed report. Incomplete reports fail and must not be used to claim native runtime verification.
- `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1 npm run android` builds a development app with the native MapLibre tile-template proof panel enabled; after install, `npm run verify:native-maplibre` starts the local proof tile server, runs `adb reverse`, captures a device screenshot, computes pixel metrics, and writes `reports/native-maplibre/latest.json`.
- For Expo development-client runs, start Metro with the same proof environment and pass the dev-client URL to the proof runner with `--dev-client-url` or `CPLAYOUT_EXPO_DEV_CLIENT_URL`. Redirect Metro logs during automation so ANSI progress output does not flood WSL sessions.
- Use `docs/android-native-verification-report-template.json` as the checked-in report shape. Runtime reports are intentionally ignored by Git unless a specific report is promoted intentionally.

Current Android proof note, 2026-06-03: Samsung SM-P613 (`R52W20BK7XH`, Android 14/API 34) passed `npm run verify:android-native -- --report reports/android-native-verification/android-native-verification-20260603T034817Z.json` for Expo SQLite save/relaunch/list/load/delete, native share-sheet ZIP export, Android DocumentsUI ZIP import, and schema migration evidence through schema v8. This is Android proof only; schema v9 imagery provenance, imported local aerial raster packages, iOS, Android vector MapLibre after the new `VectorSource` harness, and raw PMTiles/MBTiles native rendering still require their own reports.

## SQLite Project Store

1. Open the app and navigate to `Files`.
2. Confirm the backend panel reports `Expo SQLite`, runtime `native`, and schema version `v9`.
3. Save the sample project.
4. Close and relaunch the app.
5. Refresh the project list and open the saved project.
6. Confirm project name, CRS, unit system, field boundary point count, obstacle count, survey point count, and settings match the saved project.
7. Delete the saved project, refresh, and confirm it is removed from the active list.

## ZIP Export And Import

1. Save the current project locally.
2. Export a ZIP package through the native share sheet.
3. Record the exported filename, byte size, and SHA-256 hash if available.
4. Import the same ZIP package through the app picker.
5. Confirm the imported project opens and is saved back to SQLite.
6. Confirm `manifest.json` and `project.json` are present and that `manifest.projectId` and `manifest.projectCrs` match `project.json`.

## Migration Evidence

- `schema_migrations` contains ids `1` through `10`.
- `PRAGMA user_version` returns `10`.
- `map_packages` has the tile metadata columns from migrations `3`, `8`, and `9`: `tile_content_type`, `tile_scheme`, `tilejson_url`, `tile_url_templates_json`, `vector_overlay_json`, `imagery_provenance_json`, `checksum_sha256`, and `install_status`.
- The v10 migration has removed retired review tables: `layout_evidence`, `model_recommendations`, and `layout_decisions` are absent after migration.
- Geometry rows and vertices are populated after save.

## Native MapLibre Vector Tile Template Proof

1. Build/install the native development app with `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1 npm run android`.
2. Confirm `adb devices -l` shows the target device/emulator in `device` state.
3. Start the Expo dev server with the proof environment, for example `EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1 npm run start -w @cplayout/mobile -- --dev-client --port 8082 --clear`.
4. Run `npm run verify:native-maplibre -- --dev-client-url "exp+center-pivot-layout://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082" --wait-ms 20000`.
5. Validate that `reports/native-maplibre/latest.json` has `status: "pass"`, `tileSource.tileSourceKind: "tilejson_or_template"`, `tileSource.tileContentType: "vector"`, `tileSource.sourceComponent: "VectorSource"`, source layers for roads, borders, labels, and places, a local `127.0.0.1` `.pbf` tile URL template, `tileServer.tileRequests` greater than zero, screenshot SHA-256, positive dimensions, nonblank pixel ratio, and gray variance.
6. Confirm the app screenshot shows nonblank rendered map content from the vector fixture and not only a launched app shell.
7. Do not treat this as raw PMTiles/MBTiles native rendering proof; it proves the generated vector TileJSON/template adapter path only.

## Android Free Aerial Imagery Package Proof

1. Build/install a native development client with `EXPO_PUBLIC_CPLAYOUT_NATIVE_AERIAL_REFERENCE=1`; Expo Go is not valid for this proof.
2. Confirm `adb devices -l` shows the target Samsung SM-P613 (`R52W20BK7XH`) or another recorded device/emulator in `device` state.
3. In Files, use `Import Map Package` to import a generated `cplayout-map-package-v1.zip` package that contains `manifest.json`, optional `tilejson.json`, and concrete `tiles/{z}/{x}/{y}.png` entries. The manifest URLs must be logical `app://map-packages/<id>/...` values before import.
4. Confirm the native installer extracts files under Expo FileSystem document storage, stores logical metadata in the project, and rewrites runtime source URLs to app-readable `file://` templates before MapLibre receives them.
5. Select `Auto local` or `Manual local` aerial imagery. Confirm the selected package attribution and license text are visible.
6. Capture portrait and landscape screenshots with `adb exec-out screencap -p`.
7. Record screenshot SHA-256, dimensions, nonblank pixel ratio, selected source, attribution text, device identity, Android version, app build type, and whether network was disabled for the local package run.
8. Save the project before and after pan/zoom/layer-toggle checks and confirm projected/local `XY` vertices did not change.
9. Run a separate connected-preview check for USGS TNM ImageryOnly only when network is enabled, and label it `connected-preview` rather than offline proof.
10. Do not treat this as raw PMTiles/MBTiles rendering proof; it proves generated local raster TileJSON/template packages only.

## Android Tablet Console Layout Proof

1. Run the app on the target tablet in portrait and landscape.
2. Capture app screenshots after opening a sample design on the map route.
3. Confirm the map route has no page-level scroll on tablet dimensions, left and right drawer handles remain visible, and the bottom design HUD sits above Android system navigation.
4. Record screenshot paths, device model, orientation, and whether the proof used `adb exec-out screencap`, UIAutomator bounds, or manual screenshot capture.
5. Do not report Android tablet console runtime proof until this evidence exists. Web Playwright tablet screenshots are browser proof only.

## Pass Criteria

Native persistence is verified only when save, relaunch, list, load, delete, export, and import all pass on device/emulator. If any step is not run, report it as unverified rather than complete.

## Primary Sources

- Expo SQLite web support is alpha and requires Metro WASM plus COOP/COEP headers: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo Sharing has native local-file sharing behavior that does not carry to web local file URIs: https://docs.expo.dev/versions/latest/sdk/sharing/
- Expo development builds are distinct from Expo Go and are required when native libraries/config need a built app: https://docs.expo.dev/develop/development-builds/introduction/
