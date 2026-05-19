# CPLayout Agent Instructions

## Repository Shape

- Expo React Native app entry: `App.tsx`, `index.ts`.
- Shared TypeScript domain logic: `src/domain/`.
- Reusable UI components: `src/components/`.
- Native/local storage adapters: `src/storage/`.
- Handoff and product specs: `center_pivot_react_native_development_handoff/`.

## Hard Constraints

- Keep the app free/no-cost and offline-first.
- Do not add Google Maps, paid Mapbox APIs, Esri paid services, paid imagery, paid cloud backends, hidden API keys, or trial-only SDKs.
- Do not claim React Native can directly run Python GIS packages. Python/GDAL/RTKLIB workflows belong in offline preprocessing or companion tools.
- Preserve canonical geometry as projected/local `XY` coordinates in the project CRS. WGS84 coordinate formats are input/display layers unless a schema change explicitly says otherwise.
- Verify package and platform claims from primary sources before changing architecture.

## Implementation Rules

- Prefer pure TypeScript domain logic with tests before UI wiring.
- Keep native dependencies minimal and installed through Expo when an Expo SDK package is available.
- SQLite is the preferred scalable local store for projects, survey logs, vertices, map package metadata, scenarios, and exports.
- Use the platform repository split: native persistence goes through `src/storage/projectRepository.native.ts` and Expo SQLite; web MVP persistence goes through `src/storage/projectRepository.ts` until Expo SQLite web WASM/COOP/COEP deployment is configured.
- Project ZIP packages must round-trip through `src/domain/projectArchive.ts` and validate with `src/domain/projectDocument.ts`.
- Treat MapLibre/PMTiles/MBTiles native rendering as an advanced lane unless the task explicitly asks for native map integration.
- Keep drawing viewport state separate from geometry mutation so pan/zoom cannot corrupt vertices.
- Store project-relevant settings in project export data; keep local machine paths as local-only settings.

## Validation

- Run `npm run validate` after TypeScript or UI changes.
- For visible UI changes, run a web export/dev-server check and capture a Playwright screenshot when available.
- Run `npm audit` and report findings. Do not apply breaking `npm audit fix --force` without explicit approval.
- Before reporting success, mention any checks that could not be run locally.
