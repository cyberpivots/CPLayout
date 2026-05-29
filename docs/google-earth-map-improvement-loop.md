# Google Earth Map Improvement Loop

Date: 2026-05-28
Status: Iteration 1 complete; Iteration 2 selected

## Scope

- Iteration 1 is Map Editing First: browser-created `mapFeatures` can be selected on the SVG map, renamed, deleted, undone, redone, and exported through KML/KMZ.
- KML/KMZ remains WGS84 interchange only. Project geometry remains projected/local `XY`.
- Google Earth Pro is a companion validation surface for exported artifacts, not CPLayout app runtime behavior.
- Publish method for this loop is direct `main` push after `origin/main...HEAD` is confirmed even and all release checks pass. No force push.

## Panel Roles

| Role | Ownership |
| --- | --- |
| Product/UX | Verify selection, naming, deletion, and export affordances are usable in the Layout workflow. |
| GIS/KML | Verify projected `XY` remains canonical, WGS84 is only interchange/display, and KML/KMZ content matches current project state. |
| QA/Automation | Verify reducer undo/redo, document validation, KML export, browser export, screenshots, and audit results. |
| Safety/Gates | Enforce offline/no-cost behavior, no hidden API keys, no paid map/cloud dependency, and no native runtime claims without device/emulator proof. |

## Voting And Vetoes

- Product/UX, GIS/KML, and QA/Automation each get one weighted vote for the next iteration.
- Safety/Gates can veto any action that violates offline/no-cost requirements, projected `XY` canonical geometry, native-proof boundaries, paid/cloud/API-key constraints, or validation status.
- Broken `npm run validate`, broken `git diff --check`, or unresolved audit findings block a success claim until the issue is fixed or explicitly accepted as residual risk.

## Evidence Packet

Each iteration records:

- Dirty-tree preflight and pre-existing changes.
- Change summary with files/modules touched.
- Validation commands and outcomes.
- Browser export/dev-server evidence and Playwright screenshots for visible UI changes.
- KML/KMZ artifact path, SHA-256, feature-count note, and whether exported map features match the current project state.
- Google Earth Pro capture manifest when the Windows GUI session is usable: source path, screenshot filenames, dimensions, SHA-256, capture time, and whether the map canvas is non-black and unambiguous.
- Panel vote, vetoes if any, and the next-step decision.

## Iteration 1 Result

Chosen slice: Map Editing First.

Implemented surfaces:

- `packages/core/src/projectKml.ts` imports/export KML/KMZ-compatible map features while preserving CPLayout `ExtendedData`.
- `apps/mobile/App.tsx`, `apps/mobile/src/components/ProjectFilesPanel.tsx`, and `apps/mobile/src/components/GoogleEarthImportWizard.tsx` expose the browser workflow for import/export, selection, rename, delete, undo, and redo.
- `apps/mobile/src/assets/google-earth-wizard/` stores local Google Earth Pro instructional captures; no remote images are required.
- `packages/project-store/src/projectArchive.ts` includes the Google Earth KML export in CPLayout project archives.

Pre-publish validation on 2026-05-28:

- `git fetch origin main`: passed.
- `git rev-list --left-right --count origin/main...HEAD`: `0 0`.
- `git diff --check`: passed with no output.
- `npm run validate`: passed all workspace typechecks and tests.
- `npm audit`: passed, `0 vulnerabilities`.
- `npm run export:web -w @cplayout/mobile`: passed and emitted `apps/mobile/dist`.

Iteration 1 artifact hashes:

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `apps/mobile/src/assets/google-earth-wizard/google-earth-pro-main-window.png` | `3e29989cd42a0b536148b5ed159266ec79cf65d910833da96c4555c97c2307b4` | Real Google Earth Pro main window capture; map canvas was black in this GUI session. |
| `apps/mobile/src/assets/google-earth-wizard/google-earth-pro-add-menu.png` | `40bd6080d1aeae36237780e46bf807b541efd7c9bbbeb8d540a9e81c62179386` | Real Google Earth Pro Add menu capture showing Placemark, Path, and Polygon entries. |
| `apps/mobile/src/assets/google-earth-wizard/manifest.json` | `2d12a53e85ac0ad88061c10f34f1a7bebf5d074f02c15575c3a154849a686dc4` | Capture metadata for the checked-in wizard screenshots. |

Browser and Google Earth notes:

- The web export gate passed; a local serve plus Playwright screenshot remains the browser-visible confidence gate before final release reporting.
- Google Earth Pro artifact capture is documented in `docs/google-earth-import-wizard-research.md`.
- The Google Earth Pro map canvas was black in this session, so visual map fidelity is not claimed.

Panel decision:

- Product/UX: accept Iteration 1 and continue to clearer interchange output.
- GIS/KML: accept because projected `XY` remains canonical and WGS84 remains import/export interchange.
- QA/Automation: accept after clean validation, audit, and web export.
- Safety/Gates: no veto; native and Google Earth visual-fidelity claims remain explicitly unverified.

## Iteration 2 Candidates

1. KML visual styling: add explicit KML `Style`, `LineStyle`, `PolyStyle`, `IconStyle`, and clearer labels.
2. Google Earth automation proof: export KML/KMZ, open in Google Earth Pro, and capture non-black evidence.
3. Browser drawing depth: continue saveable geometry editing, commit flows, and undo validation for additional feature classes.

Current decision: choose KML visual styling next.

## Iteration 2 Scope

- Add deterministic shared KML styles for exported field boundary, obstacles, pivot/water/power points, survey points, towers, and map-feature classes.
- Keep `exportProjectGoogleEarthKml()` as the public export API.
- Keep `createGoogleEarthKmz()` unchanged so KMZ remains a ZIP wrapper around `doc.kml`.
- Do not change project schemas, canonical projected `XY` geometry, SQLite/web persistence, CPLayout project archive format, or runtime dependencies.
- Do not use remote icon URLs, paid services, hidden API keys, or network-dependent styling.

Iteration 2 validation targets:

- `npm test -w @cplayout/core`
- `npm test -w @cplayout/project-store`
- `npm run validate`
- `git diff --check`
- `npm audit`
- Generate KML/KMZ evidence and verify `doc.kml` contains shared `<Style>` definitions, `<styleUrl>` assignments, the edited map-feature name, and CPLayout `ExtendedData`.
- Local static serve plus Playwright screenshot of the export controls when available.

## Remaining Unverified Claims

- Android/iOS persistence, native file sharing, native MapLibre rendering, and raw PMTiles/MBTiles rendering remain unverified until the device/emulator checklist passes.
- Google Earth visual fidelity remains unverified until styled KML and non-black Google Earth screenshots prove it.
