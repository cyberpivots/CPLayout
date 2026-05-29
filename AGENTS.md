# CPLayout Agent Instructions

## Repository Shape

- Root package manager shape: npm workspaces in `apps/*` and `packages/*`.
- Expo React Native app entry: `apps/mobile/App.tsx`, `apps/mobile/index.ts`.
- Shared TypeScript domain logic: `packages/core/`, `packages/geometry/`, and `packages/gnss/`.
- Reusable app UI components: `apps/mobile/src/components/`.
- Map rendering adapter boundary: `packages/map-adapters/`.
- Native/local storage adapters: `packages/project-store/`.
- Handoff and product specs: `center_pivot_react_native_development_handoff/`.

## Hard Constraints

- Keep the app free/no-cost and offline-first.
- Do not add Google Maps, paid Mapbox APIs, Esri paid services, paid imagery, paid cloud backends, hidden API keys, or trial-only SDKs.
- Do not claim React Native can directly run Python GIS packages. Python/GDAL/RTKLIB workflows belong in offline preprocessing or companion tools.
- Preserve canonical geometry as projected/local `XY` coordinates in the project CRS. WGS84 coordinate formats are input/display layers unless a schema change explicitly says otherwise.
- Treat KML/KMZ `Style`, `LineStyle`, `PolyStyle`, `IconStyle`, `LabelStyle`, and `styleUrl` as visual interchange metadata only; styling must not alter canonical projected `XY` geometry, project schemas, persistence, archive semantics, or imply Google Earth/native runtime proof.
- Verify package and platform claims from primary sources before changing architecture.

## Implementation Rules

- Start every non-trivial pass with a current-worktree preflight: re-read this file, check `git status --short`, identify pre-existing changes, and avoid reverting work you did not make.
- Prefer pure TypeScript domain logic with tests before UI wiring.
- Keep repo-local Codex defaults in `.codex/config.toml`; use `AGENTS.md` for durable engineering rules and verify loaded instructions before long-running passes.
- Use subagents only for bounded exploration, tests, or triage while the main agent continues the critical-path implementation.
- Keep native dependencies minimal and installed through Expo when an Expo SDK package is available.
- SQLite is the preferred scalable local store for projects, survey logs, vertices, map package metadata, scenarios, and exports.
- Use the platform repository split: native persistence goes through `packages/project-store/src/projectRepository.native.ts` and Expo SQLite; web MVP persistence goes through `packages/project-store/src/projectRepository.ts` until Expo SQLite web WASM/COOP/COEP deployment is configured.
- Project ZIP packages must round-trip through `packages/project-store/src/projectArchive.ts` and validate with `packages/core/src/projectDocument.ts`.
- Treat MapLibre/PMTiles/MBTiles native rendering as an advanced lane unless the task explicitly asks for native map integration. MapLibre React Native may be installed/configured, but native MapLibre runtime behavior and raw PMTiles/MBTiles archive rendering remain unverified until the Android/iOS device checklist passes. MapLibre React Native sources consume TileJSON URLs or tile URL templates; raw PMTiles/MBTiles packages need a local protocol, conversion, or tile-serving adapter first.
- Keep drawing viewport state separate from geometry mutation so pan/zoom cannot corrupt vertices.
- Store project-relevant settings in project export data; keep local machine paths as local-only settings.
- Use repo-local skills in `.agents/skills/` when they match the task; they are reusable workflow surfaces, not product runtime code.

## Reasoning Policy

- Use low reasoning for file lookup, formatting, simple command output, and narrow documentation checks.
- Use medium reasoning for ordinary TypeScript, tests, and UI changes.
- Use high reasoning for architecture, storage, native maps, migration, multi-package, and source-backed dependency decisions.
- Use xhigh reasoning only for high-risk arbitration, cross-platform/native verification disputes, or conflicting expert/reviewer findings.

## Current Blocker Boundaries

- Native SQLite and ZIP sharing may compile without proving runtime behavior. Do not report Android/iOS persistence as production-verified until a device or emulator run completes the checklist in `docs/android-native-verification.md`.
- Web SQLite remains research-gated because Expo SQLite web is alpha and requires WASM plus COOP/COEP headers. Browser local storage is the current web MVP backend.
- Tile package metadata is supported in project documents and SQLite. Native PMTiles/MBTiles rendering remains deferred until a real local tile source adapter is implemented and device-verified.
- The SVG map supports pan/zoom and draft capture state. Full saveable geometry editing is not complete until draft vertices can be committed to project field/obstacle entities with undo and validation.

## Planning Output Rules

- Decision-complete plans must state scope, files/modules, validation commands, non-goals, and claims that remain unverified.
- Plans that touch package/platform architecture must separate local facts from source-backed external claims and list the primary sources used.
- Plans that suggest subagents must define bounded ownership, expected output, and why the main agent can continue without waiting.

## Validation

- Run `npm run validate` after TypeScript or UI changes.
- For visible UI changes, run a web export/dev-server check and capture a Playwright screenshot when available.
- Run `npm audit` and report findings. Do not apply breaking `npm audit fix --force` without explicit approval.
- Before reporting success, mention any checks that could not be run locally.
