# Android Native Runtime Verification

Use this checklist before reporting native SQLite, native ZIP sharing, or native file picking as production-verified. Android is the first target because the project already exports an Android bundle with Expo SQLite, FileSystem, and Sharing configured.

## Required Setup

- Build a native app or development client. Expo Go is not sufficient for validating config-plugin native modules.
- Record device/emulator model, Android version, app build type, package version, and date.
- Start from a clean install when validating migrations from scratch; repeat once with an existing install when validating upgrade migrations.

## SQLite Project Store

1. Open the app and navigate to `Export`.
2. Confirm the backend panel reports `Expo SQLite`, runtime `native`, and schema version `v3`.
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

- `schema_migrations` contains ids `1`, `2`, and `3`.
- `PRAGMA user_version` returns `3`.
- `map_packages` has the v3 tile metadata columns: `tile_content_type`, `tile_scheme`, `tilejson_url`, `tile_url_templates_json`, `checksum_sha256`, and `install_status`.
- Geometry rows and vertices are populated after save.

## Pass Criteria

Native persistence is verified only when save, relaunch, list, load, delete, export, and import all pass on device/emulator. If any step is not run, report it as unverified rather than complete.
