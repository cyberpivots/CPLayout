# Browser Mapping Final Proof Checklist

This checklist defines the browser-only acceptance gates for the final continuous-improvement milestone. It does not create native, Google Earth, raw PMTiles/MBTiles, or live GNSS/RTK production claims.

## Scope

- Browser mapping, dashboard, survey, review, files, settings, and web proof tooling.
- Canonical project geometry remains projected/local `XY` in the project CRS.
- WGS84, imagery, OCR/CV, KML/KMZ style data, and browser evidence remain input, display, or interchange evidence only.
- Project ZIP validation uses `packages/project-store/src/projectArchive.ts` and `packages/core/src/projectDocument.ts` behavior already exercised by the browser tests.

## Required Gates

- `git status --short` starts clean for iteration 100.
- `npm run validate` passes.
- `npm run validate:skills` passes.
- `npm run audit:moderate` passes.
- `npm audit` reports 0 vulnerabilities or documented findings.
- `git diff --check` passes.
- `npm run proof:web` passes the route sweep at desktop, 768 px, and 390 px widths.
- Playwright evidence confirms no browser console errors, no horizontal overflow, allowed network requests only, and visible CPLayout overlay/status/attribution controls.

## Browser Mapping Assertions

- Edit Geometry can create projected `XY` draft vertices and enable the expected Commit or Save Feature actions.
- Layout mode map clicks remain read-only, keep draft vertices at zero, keep Commit/Save Feature/Clear disabled, and leave the project Saved.
- Browser-local imagery settings, local package directories, custom source drafts, and walkthrough progress do not appear in exported `project.json`.
- Survey evidence remains evidence until an explicit operator action promotes it into projected project geometry.
- Settings guardrails continue to reject credentialed imagery templates and keep offline/no-key source boundaries visible.
- Any future Evidence Review surface imports companion reports into session state only, preserves Saved project state on preview/cancel, keeps evidence payloads out of project ZIP exports and browser project storage, rejects invalid CRS/calibration/hash inputs, and makes no external network requests.

## Evidence Policy

- Raw Playwright screenshots, traces, and logs remain under ignored `reports/continuous-improvement/`.
- Iteration 100 may check in a small curated evidence summary under `docs/evidence/continuous-improvement/browser-mapping-2026-05-31/iteration-100/`.
- The milestone summary must list remaining unverified claims instead of implying native, Google Earth, raw tile-package, or live RTK runtime proof.
