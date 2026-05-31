# CPLayout Browser Mapping Continuous Improvement Loop

Loop id: `browser-mapping-2026-05-31`

Scope: browser mapping, dashboard, review, files, settings, survey, map adapters, and supporting proof tooling. Raw screenshots, traces, and logs stay under ignored `reports/continuous-improvement/`; only curated milestone evidence is checked in.

Non-goals: no paid APIs, no hidden keys, no Google Maps/paid Mapbox/Esri services, no native MapLibre or raw PMTiles/MBTiles runtime proof claim, no native SQLite production claim, and no schema change that promotes WGS84 or imagery/CV evidence into canonical project geometry. Project geometry remains projected/local `XY`.

Validation cadence:

- Every code/UI iteration: `npm run validate`, `git diff --check`, `npm audit`, plus focused tests for touched packages.
- Visible browser iterations: `npm run proof:web`, which runs `npm run export:web` and the Playwright route sweep at desktop, 768 px, and 390 px widths.
- Every 10th iteration: add `npm run validate:skills`, `npm run audit:moderate`, curated milestone evidence, and a browser proof summary.

## Ledger

| Iteration | Goal | Research Source | Changed Modules | Validation | Artifact Hashes | Commit SHA | Decision | Next Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | Add dev-only static web proof route sweep for launcher, workspace, map, survey, review, files, and settings. | Repo preflight; existing Expo `export:web`; Playwright config/test discovery; CPLayout AGENTS constraints. | `package.json`; `package-lock.json`; `.gitignore`; `playwright.config.ts`; `tools/serveStaticWeb.ts`; `tests/web/browser-workflow.spec.ts`; `apps/mobile/App.tsx`; `apps/mobile/src/components/SettingsPanel.tsx`; `apps/mobile/src/components/ExpertReviewPanel.tsx` | `npm run typecheck`; `npx playwright test --config playwright.config.ts --list`; `git diff --check`; `npm run test:web:e2e`; `npm run proof:web`; baseline `npm audit` found 0 vulnerabilities. | `package.json` 97b85e86; `playwright.config.ts` d083ddcf; `tools/serveStaticWeb.ts` 48b94732; `tests/web/browser-workflow.spec.ts` 34f76305. | `e1ddd44` | Pass after fixing a strict selector collision between status text and the workflow mode button. | Add map workbench instruction and status clarity without mutating geometry contracts. |
| 002 | Preserve optional WGS84 browser-click metadata when placing pivot or infrastructure from MapLibre, without making it canonical geometry. | Existing `browserMapClickToProjectedIntent` return shape and reducer optional `wgs84` fields. | `packages/map-adapters/src/types.ts`; `packages/map-adapters/src/BrowserMapSurface.web.tsx`; `apps/mobile/App.tsx`; loop ledger. | `npm run validate`; `npm test -w @cplayout/map-adapters`; `git diff --check`; `npm audit`. | `types.ts` 3a0b1244; `BrowserMapSurface.web.tsx` 70580471; `App.tsx` 46d2a6f0. | `9ed4e9b` | Pass; optional WGS84 remains callback metadata and reducer input only. | Add map workbench instruction and status clarity. |
| 003 | Make browser-map draft clearing and workflow-mode changes report local status without mutating committed geometry. | Current `BrowserMapSurface.web.tsx` draft state separation and AGENTS pan/zoom/draft safety constraint. | `packages/map-adapters/src/BrowserMapSurface.web.tsx`; loop ledger. | `npm run validate`; `npm test -w @cplayout/map-adapters`; `git diff --check`; `npm audit`. | `BrowserMapSurface.web.tsx` 7d6a4732; ledger 24025915. | `cd9118f` | Pass; draft clear/status changes remain local component state. | Add focused draft/cancel regression coverage. |
| 004 | Add reducer coverage proving draft cancel clears only draft state and preserves the map viewport. | Existing `reduceDrawingMapState` draft and viewport semantics. | `packages/geometry/src/mapInteraction.test.ts`; loop ledger. | `npm run validate`; `npm test -w @cplayout/geometry`; `git diff --check`; `npm audit`. | `mapInteraction.test.ts` c8916159; ledger 23495944. | `b16fc58` | Pass; clearing draft increments draft revision while preserving viewport. | Improve Review Layout no-mutation browser proof. |
| 005 | Interface checkpoint: prove Review Layout map clicks remain read-only and do not dirty the browser project. | Read-only interface review against Playwright route proof and existing Review Layout status surface. | `tests/web/browser-workflow.spec.ts`; loop ledger. | `npm run validate`; `npm run test:web:e2e`; `git diff --check`; `npm audit`. | `browser-workflow.spec.ts` d5452d79; ledger 40fa781e. | Pending until committed. | Pass; Review Layout click emits read-only status and leaves Saved state visible. | Tighten mobile HUD fit. |

## Milestones

No milestone evidence is checked in before iteration 010.
