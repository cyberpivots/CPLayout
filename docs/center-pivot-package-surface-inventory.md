# Center Pivot Package Surface Inventory

Date: 2026-05-28

## Decision

Keep center-pivot layout work inside the current workspace split. Pure domain and geometry code stays in packages first; UI wires tested package behavior second; native and map-runtime claims stay gated until the specific device proof exists.

## Package Surfaces

| Surface | Current role | Refactor guidance |
| --- | --- | --- |
| `packages/core/` | Project document schemas, project reducer, settings, coordinate transforms, and map package manifests. | Keep canonical project geometry in project-CRS `XY`. Keep WGS84 as input/display metadata. Do not expose app-importable expert-review or model-recommendation contracts. |
| `packages/geometry/` | Pure layout geometry, map interaction math, online imagery tile planning, deterministic scoring. | Keep scoring side-effect-free. Use `evaluateLayout` metrics for coverage, outside-field acres, obstacles, machine constraints, and confidence ranking. |
| `packages/gnss/` | GNSS parsing and quality helpers. | Use for field collection gates; do not mix RTK/GNSS proof with imagery-only recommendations. |
| `packages/map-adapters/` | SVG map surface, overlay conversion, MapLibre preview boundary. | Keep rendering read-only unless an explicit editor mutation path is implemented through core reducer actions. |
| `packages/project-store/` | Web MVP local storage, native SQLite plans/adapters, ZIP/KML/archive export surfaces. | Keep project archives round-tripping through `projectArchive.ts` and `projectDocument.ts`. Export canonical project/GIS/survey/metrics/map-package files only; retired review entries are ignored on import and not persisted. |
| `apps/mobile/` | Expo React Native app, panels, settings UI, export/import controls. | Wire package APIs after tests pass. Use Expo packages for native dependencies when needed. |
| `docs/` | Verification gates, architecture notes, source ledgers, planning records. | Keep source-backed package/platform claims here, with unverified native claims explicitly blocked. |
| `.agents/skills/` | Repo-local reusable workflow surfaces. | Use for agent workflow guidance only, not product runtime code. |

## Data Flow

1. Operator input, imports, GNSS, imagery inspection, and companion reports produce candidate facts.
2. `@cplayout/core` validates project documents and canonical projected-XY geometry changes.
3. `@cplayout/geometry` computes deterministic layout metrics and ranks alternatives without mutating projects.
4. `@cplayout/project-store` stores canonical projects, snapshots, exports, and map package metadata; retired review tables are dropped in the final migrated schema.
5. `@cplayout/mobile` presents Dashboard, Map, Survey, Files/GIS exchange, Settings, and Help workflows. Geometry mutations dispatch explicit core reducer actions.

## Current Verification Boundaries

- Web MVP persistence uses browser local storage until Expo SQLite web WASM and COOP/COEP hosting are configured.
- Native SQLite and ZIP sharing may typecheck and compile without proving device behavior.
- Android native MapLibre has historical generated TileJSON/tile-template evidence only. The 2026-06-04 vector proof failed with zero local tile requests; the proof route now takes precedence over the default Android aerial workbench, but a fresh device report with tile requests greater than zero is still required. Raw PMTiles/MBTiles rendering and iOS native rendering remain advanced lanes until local adapter work and platform verification pass.
- Full saveable geometry editing is incomplete until draft vertices can be committed to project field/obstacle entities with undo and validation.

## Acceptance Checks

- `npm run validate`
- `git diff --check`
- `npm audit`
- Web export and Playwright screenshot for visible UI changes.
- `npm run check:android-tools` plus `docs/android-native-verification.md` only when native claims are in scope.
