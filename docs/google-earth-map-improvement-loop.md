# Google Earth Map Improvement Loop

Date: 2026-05-28
Status: Iteration 5 complete

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

## Iteration 2 Result

Status: complete on 2026-05-28.

Implemented surfaces:

- `packages/core/src/projectKml.ts` keeps `exportProjectGoogleEarthKml()` as the public API, still builds GeoJSON features first, then injects deterministic shared KML styles with `@xmldom/xmldom`.
- Shared style definitions cover field boundary, obstacle classes, pivot/water/power points, generic survey points, towers, and map-feature point/line classes.
- Placemark `<styleUrl>` values are assigned from existing CPLayout `ExtendedData` values and geometry type; no project schema, canonical `XY` geometry, archive format, persistence layer, dependency, or KMZ wrapper changed.
- `packages/core/src/projectKml.test.ts` asserts style definitions, line/polygon/icon/label values, styleUrl assignment, preserved map-feature ExtendedData, map-feature point/line styling, and no remote icon href.
- `packages/project-store/src/projectKmlArchive.test.ts` asserts styled KML remains intact inside KMZ `doc.kml`.

Validation evidence:

- `npm test -w @cplayout/core`: passed.
- `npm test -w @cplayout/project-store`: passed.
- `npm run validate`: passed all workspace typechecks and tests after the xmldom type-boundary fix.
- `git diff --check`: passed with no output.
- `npm audit`: passed, `0 vulnerabilities`.
- `npm run export:web -w @cplayout/mobile`: passed and emitted `apps/mobile/dist`.
- Local static serve: `npx serve apps/mobile/dist -l 4173` served `http://localhost:4173`.
- Playwright browser check: loaded the exported app, opened the sample project, selected Export, and captured `cplayout-styled-kml-export-controls.png`.
- Browser console caveat: the only console error was `GET /favicon.ico` returning 404 from the local static server.

Generated KML/KMZ evidence:

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `/tmp/cplayout-styled-google-earth.kml` | `6ecf50e102a6f036ebcf49e04133593d1f17b7410882be59973a5d6f33528b42` | 9,605 bytes; contains 16 shared `<Style>` definitions and 9 `<styleUrl>` assignments. |
| `/tmp/cplayout-styled-google-earth.kmz` | `aa5264db7837cc8e2c6aeb93acde5650abaca8cee878c37c66aeed4ce726adbb` | 1,813 bytes; `doc.kml` preserves styled KML. |

Artifact inspection:

- `doc.kml` contained `<Style>`, `<styleUrl>`, `Renamed Pipeline A`, and CPLayout `<ExtendedData>`.
- `doc.kml` preserved `<Data name="cplayoutFeatureType"><value>map_feature</value></Data>`.
- `doc.kml` did not contain remote HTTP/HTTPS icon hrefs.

Next recommended slice:

- Google Earth automation proof: open the styled KML/KMZ in Google Earth Pro and capture non-black visual evidence that the shared styles render as intended.
- Keep this separate from native SQLite, native sharing, native MapLibre, and raw tile-package rendering claims.

## Remaining Unverified Claims

- Android/iOS persistence, native file sharing, native MapLibre rendering, and raw PMTiles/MBTiles rendering remain unverified until the device/emulator checklist passes.
- Google Earth visual fidelity remains unverified until styled KML/KMZ is opened in Google Earth Pro and non-black screenshots prove it.

## Google Earth Imagery Analysis Skill

Status: implemented as a repo-local workflow surface in `.agents/skills/cplayout-google-earth-imagery-analysis/`.
Date added: 2026-05-29.

Use the skill for Google Earth Pro screenshot review, KML/KMZ overlay evidence, local OCR/CV companion planning, field-boundary/pivot/corner-arm/obstacle recognition review, and advisory layout-improvement recommendations.

Boundaries:

- Google Earth Pro screenshots and imagery observations are local companion evidence only.
- Visible attribution must remain present when Google Earth content is captured or reviewed.
- Screenshot-derived CV/OCR detections are planning-grade observations, not survey-grade facts.
- Derived observations must remain advisory evidence or recommendations until an operator redraws, imports, or accepts geometry through CPLayout projected `XY` workflows.
- Do not use Google Earth as an imagery cache, bulk-processing source, substitute mapping dataset, app runtime, or proof of native/mobile CPLayout behavior.

Primary-source checks for this workflow:

- Google Earth coordinate search: <https://support.google.com/earth/answer/148081>
- Google Earth Pro data import: <https://support.google.com/earth/answer/176685>
- Google Earth Save Image: <https://support.google.com/earth/answer/148146>
- Google Geo Guidelines and required attribution: <https://about.google/brand-resource-center/products-and-services/geo-guidelines/>
- Google Earth additional terms: <https://maps.google.com/help/terms_maps-earth/>
- Google KML Reference: <https://developers.google.com/kml/documentation/kmlreference>
- Google KML shared-style tutorial: <https://developers.google.com/kml/documentation/kml_tut>
- Google KMZ archive guidance: <https://developers.google.com/kml/documentation/kmzarchives>
- OGC KML standard page: <https://www.ogc.org/standards/kml/>
- Google Earth display repair guidance: <https://support.google.com/earth/answer/6246289>
- OpenCV local CV documentation: <https://opencv.org/about/> and <https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html>
- Tesseract CLI documentation: <https://github.com/tesseract-ocr/tesseract/wiki/Command-Line-Usage>

## Iteration 3 Scope

Selected slice: Google Earth visual-fidelity proof automation.

Implementation scope:

- Add `tools/capture_google_earth_visual_fidelity.ps1` as a separate proof script from the import-wizard screenshot script.
- Generate a fresh styled CPLayout proof fixture from current TypeScript code, including KML and KMZ outputs under the local ignored `reports/google-earth-visual-fidelity/` directory.
- Add proof-fixture `LookAt` metadata only in the generated artifact so Google Earth has a focused desktop view without changing `PivotProject`, canonical projected `XY`, schemas, persistence, or archive semantics.
- Capture Google Earth Pro full-window, Places/sidebar, and map-canvas images when a Windows GUI session is available.
- Analyze the map-canvas crop for mostly black or near-uniform output and write a JSON manifest with crop boxes, dimensions, SHA-256 hashes, process info, KML integrity checks, thresholds, and timestamp.

Proof gates:

- KML integrity must show shared `<Style>` definitions, `<styleUrl>` assignments, CPLayout `<ExtendedData>`, `cplayoutFeatureType`, `Renamed Pipeline A`, fixture-only `<LookAt>`, and no remote icon hrefs.
- The map-canvas crop must pass non-black and grayscale-variance thresholds.
- Final success still requires human visual confirmation that the map-canvas screenshot visibly includes CPLayout styled geometry. The script records this only when run with `-ConfirmOverlayVisible`; `-RequireProofPass` turns that condition into a hard failure gate.

Local artifact policy:

- `reports/google-earth-visual-fidelity/` is ignored so generated KML/KMZ, screenshots, generator temp file, and manifest stay local unless explicitly force-added.
- Durable repo changes are limited to the proof script, this record, and `.gitignore`.

Troubleshooting matrix:

| Step | Action | Success criterion | Stop condition |
| --- | --- | --- | --- |
| Baseline | Run `powershell -ExecutionPolicy Bypass -File tools/capture_google_earth_visual_fidelity.ps1 -ConfirmOverlayVisible -RequireProofPass` after confirming Google Earth Pro is available. | Manifest status is `passed`; canvas crop is non-black/non-uniform; visible CPLayout styled geometry is confirmed. | If the canvas is black or uniform, do not claim fidelity. |
| Cache repair | Use Google Earth Pro Help > Launch Repair Tool > Clear disk cache, then rerun the script. | Same as baseline. | If still black, continue to Safe Mode. |
| Safe Mode | Use the Repair Tool to turn on Safe Mode, then rerun the script. | Same as baseline. | If still black, continue to atmosphere check. |
| Atmosphere off | In Google Earth, deselect View > Atmosphere, then rerun the script. | Same as baseline. | If still black, continue to graphics-mode check. |
| Graphics mode | On Windows, use the Repair Tool to switch between OpenGL and DirectX and rerun after each mode. | Either mode produces a passing manifest and visible overlays. | If all modes fail, record a Google Earth Pro or graphics-session blocker rather than a CPLayout KML defect. |

Source-backed notes:

- Google documents KML as an open standard used by Google Earth and lists `Placemark`, `Style`, shared-style ids, `ExtendedData`, color, and `LookAt` view elements in the KML reference: <https://developers.google.com/kml/documentation/kmlreference>.
- Google's KML tutorial covers shared styles via `Style` and `styleUrl`: <https://developers.google.com/kml/documentation/kml_tut>.
- OGC maintains the KML standard page: <https://www.ogc.org/standards/kml/>.
- Google's Earth repair guidance lists cache clearing, Safe Mode, turning off atmosphere, and Windows OpenGL/DirectX switching for display problems: <https://support.google.com/earth/answer/6246289>.

## Iteration 3 Result

Status: complete on 2026-05-28 for desktop Google Earth Pro visual-fidelity proof only.

Implemented surfaces:

- `tools/capture_google_earth_visual_fidelity.ps1` generates a styled proof KML/KMZ from the current repo, opens Google Earth Pro, captures full-window/sidebar/map-canvas screenshots, analyzes map-canvas pixels, and writes `visual-fidelity-manifest.json`.
- The script includes a Windows-to-WSL fixture-generation fallback because the current checkout's `node_modules/.bin/tsx` is WSL-shaped and Windows npm cannot execute it directly.
- `.gitignore` ignores `reports/google-earth-visual-fidelity/` so generated proof artifacts remain local unless intentionally force-added.

Proof run:

- Command: `cmd.exe /c "cd /d H:\cplayout && powershell -ExecutionPolicy Bypass -File tools\capture_google_earth_visual_fidelity.ps1 -StartupSeconds 5 -RenderSeconds 8 -ConfirmOverlayVisible -RequireProofPass"`.
- Manifest path: `reports/google-earth-visual-fidelity/visual-fidelity-manifest.json` (ignored local artifact).
- Manifest status: `passed`; `proofPassed: true`.
- Google Earth Pro process: `googleearth.exe`, path `C:\Program Files\Google\Google Earth Pro\client\googleearth.exe`.
- Human-visible review: map-canvas screenshot visibly includes CPLayout styled geometry over Google Earth imagery, including the field boundary, styled red/blue/yellow linework, and point/circle overlays.

Generated proof artifact hashes:

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `reports/google-earth-visual-fidelity/cplayout-google-earth-visual-fidelity.kml` | `9a471569edb7fe8c36c411f083c5bfdf842260fa62049e24d9db73a8c496c8d2` | Contains 16 shared `<Style>` definitions, 11 `<styleUrl>` assignments, CPLayout `<ExtendedData>`, `cplayoutFeatureType`, `Renamed Pipeline A`, fixture-only `<LookAt>`, and no remote icon hrefs. |
| `reports/google-earth-visual-fidelity/cplayout-google-earth-visual-fidelity.kmz` | `26fe5b79aaa84e595f9e7c8a966a0d22efe2dd9107fdb9e0465214457dc2321f` | Google Earth opened this KMZ for the passed proof run. |
| `reports/google-earth-visual-fidelity/google-earth-visual-fidelity-map-canvas.png` | `88fa17c7388b380808ca6383b1f3daa20e4936a553408b5165ca1cdc8d42f3ed` | 2118 x 1400 map-canvas crop; non-black ratio `0.996421010488259`, gray variance `2830.452`, `mostlyBlack: false`, `nearUniform: false`. |
| `reports/google-earth-visual-fidelity/google-earth-visual-fidelity-places-sidebar.png` | `b18a72f0874f14f0138a8adb40a1feae5bd7c8c4b09a7e34c021fe3f924e977c` | 430 x 1568 sidebar crop for Places/sidebar context. |

Validation evidence:

- `npm test -w @cplayout/core`: passed.
- `npm test -w @cplayout/project-store`: passed.
- `pwsh -NoProfile -ExecutionPolicy Bypass -File tools/capture_google_earth_visual_fidelity.ps1 -GenerateOnly`: passed.
- `cmd.exe /c "cd /d H:\cplayout && powershell -ExecutionPolicy Bypass -File tools\capture_google_earth_visual_fidelity.ps1 -StartupSeconds 5 -RenderSeconds 8 -ConfirmOverlayVisible -RequireProofPass"`: passed.
- `git diff --check`: passed.
- `npm run validate`: passed.
- `npm audit`: passed, `0 vulnerabilities`.

Remaining unverified claims:

- This proof is limited to desktop Google Earth Pro in the current Windows GUI session.
- It does not prove Android/iOS persistence, native sharing, native MapLibre, raw PMTiles/MBTiles rendering, or CPLayout mobile runtime behavior.

## Iteration 4 Scope

Selected slice: Saveable geometry editing proof.

Implementation scope:

- Hoist browser project repository state into `apps/mobile/App.tsx` so the workspace has a persistent top-bar Save action and a shared local-project list/status surface.
- Keep `ProjectFilesPanel` as the deeper file-management and GIS exchange surface, but have it receive repository state plus save/open/delete/refresh handlers from `App.tsx`.
- Keep canonical geometry as projected/local `XY`; do not change `PivotProject`, project archive format, KML/KMZ output schema, SQLite/native behavior, MapLibre, raw tile rendering, or project CRS policy.
- Add focused browser repository proof that edited field boundary, obstacle, and utility map-feature geometry survives save, reload, ZIP archive round-trip, and KML export inclusion.

## Iteration 4 Result

Status: complete on 2026-05-28 for the web MVP localStorage save/reopen/export proof.

Implemented surfaces:

- `apps/mobile/App.tsx` owns the shared `useProjectRepository()` instance, top-bar Save action, saved revision tracking, saved-project open flow, and stale map-feature selection clearing after project load.
- `apps/mobile/src/components/ProjectStartPanel.tsx` and `apps/mobile/src/components/ProjectFilesPanel.tsx` consume the shared repository state instead of creating separate repository hook instances.
- `packages/project-store/src/projectRepository.test.ts` proves edited boundary, obstacle, and utility line map-feature geometry survives `saveProjectAsync()` then `loadProjectAsync()`, ZIP archive round-trip, and KML export content checks.

Validation evidence:

- `npm test -w @cplayout/project-store`: passed, including `project repository saveable geometry tests passed`.
- `npm run typecheck -w @cplayout/mobile`: passed.
- `npm run validate`: passed all workspace typechecks and tests.
- `git diff --check`: passed with no output.
- `npm audit`: passed, `0 vulnerabilities`.
- `npm run export:web -w @cplayout/mobile`: passed and emitted `apps/mobile/dist`.
- Local static serve: `npx serve apps/mobile/dist -l 4173` served `http://localhost:4173`.
- Playwright browser check: loaded the exported app, opened the sample project, changed the end-gun setting to create dirty state, confirmed top-bar `Save *`, saved locally, confirmed the status returned to `Saved`, opened Export, and confirmed one saved browser-local project in the Project Files list.
- Playwright screenshot: `cplayout-saveable-geometry-editing-proof.png`.
- Browser console caveat: the only console error was `GET /favicon.ico` returning 404 from the local static server.

Remaining unverified claims:

- This proof is limited to the web MVP browser `localStorage` repository and browser ZIP/KML export generation.
- Android/iOS persistence, native SQLite runtime behavior, native sharing, native MapLibre rendering, and raw PMTiles/MBTiles rendering remain unverified until the device/emulator checklist passes.

## Iteration 5 Scope

Selected slice: Editor Proof.

Implementation scope:

- Preserve the existing `MapSurfaceProps` callback boundary for boundary draft commits, obstacle draft commits, map-feature saves, vertex moves/deletes, undo, redo, save, reopen, ZIP round-trip, and KML export inclusion.
- Add only browser-proof support needed by the visible workflow: stable map/vertex labels, a map test id, edit-mode selected-vertex status, and compact edit-mode controls for selecting the first boundary vertex and nudging it east.
- Keep viewport state as map-local UI state; pan, reset, zoom, and Add Center controls do not mutate project geometry until a draft commit, map-feature save, or vertex edit callback is invoked.
- Do not change project schemas, canonical projected `XY` geometry, project archive format, KML/KMZ schema, SQLite/native behavior, MapLibre, raw tile rendering, or dependency architecture.

## Iteration 5 Result

Status: complete on 2026-05-28 for browser editor workflow proof only.

Implemented surfaces:

- `packages/map-adapters/src/SvgMapSurface.tsx` exposes stable browser proof targets and edit-mode vertex controls while still routing geometry mutation through the existing `MapSurfaceProps` callbacks.
- `packages/project-store/src/projectRepository.test.ts` now builds the save/reopen/export proof project through real reducer actions before asserting browser localStorage persistence, ZIP archive round-trip, and KML inclusion.

Automated coverage:

- Reducer action path covers boundary draft commit, obstacle draft commit, utility line map-feature save, boundary vertex move/delete, obstacle vertex move/delete, undo, and redo.
- Repository/archive/export path covers browser localStorage save/reopen, CPLayout ZIP round-trip, archived `exports/google-earth.kml`, and KML content for the edited obstacle and utility feature.

Browser proof:

- Local static serve: `npx serve apps/mobile/dist -l 4173` served `http://localhost:4173`.
- Playwright opened the sample project, used Draw plus Add Center/pan controls to commit a replacement boundary, used Obstacle plus Add Center/pan controls to commit a new obstacle, saved a `Power line` utility map feature, renamed it `Iteration 5 utility line`, used Edit controls to select/nudge/delete a boundary vertex, confirmed dirty state, used Undo/Redo, saved, reopened from the local project list, confirmed edited geometry remained visible, and exported ZIP/KML.
- Reopened browser-local project proof: `savedProjectCount: 1`, `fieldBoundaryVertices: 3`, `obstacleCount: 3`, `mapFeatureNames: ["Iteration 5 utility line"]`.
- Playwright screenshot: `/tmp/cplayout-iteration-5-browser-editor-proof.png`.
- Browser console caveat: the only console error was `GET /favicon.ico` returning 404 from the local static server.

Generated browser proof artifacts:

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `/tmp/cplayout-iteration-5-browser-editor-proof.png` | `a37207be31497310738bbb9fc2c134a8fe4582b0df75661991638f85f074c53e` | Export surface after reopening the saved edited project; status shows KML download and 14 Google Earth features. |
| `/tmp/cplayout-iteration-5-browser-editor-proof.zip` | `2afe0e3cc7e1c9fc2a83a6b844cfd68dc9e0fbe953572cd83c5f55fb6175723c` | 9,412 bytes; archive contains `project.json`, `exports/scenario.geojson`, `exports/google-earth.kml`, survey/metrics/map-package CSVs, and manifest. |
| `/tmp/cplayout-iteration-5-browser-editor-proof.kml` | `1726778006ee321713dca543c41e778cfadb76cc44284674055be47c5eba622c` | 12,594 bytes; contains `Field boundary`, `Exclusion 3`, `Iteration 5 utility line`, `styleUrl`, and map-feature ExtendedData. |

Validation evidence:

- `npm test -w @cplayout/project-store`: passed, including the reducer-driven browser editor workflow proof.
- `npm run typecheck -w @cplayout/map-adapters`: passed.
- `npm run typecheck -w @cplayout/mobile`: passed.
- `npm run export:web -w @cplayout/mobile`: passed and emitted `apps/mobile/dist`.
- `npm run validate`: passed all workspace typechecks and tests.
- `git diff --check`: passed with no output.
- `npm audit`: passed, `0 vulnerabilities`.

Remaining unverified claims:

- This proof is limited to the web MVP browser `localStorage` repository and browser ZIP/KML export generation.
- Android/iOS persistence, native SQLite runtime behavior, native sharing, native MapLibre rendering, and raw PMTiles/MBTiles rendering remain unverified until the device/emulator checklist passes.
- Native raw PMTiles/MBTiles archive rendering remains unverified; raw tile packages still need a local protocol, conversion, or tile-serving adapter plus device verification.

## Iteration 6 Scope

Selected slice: Real Center-Pivot Google Earth Proof.

Failure being corrected:

- Iteration 5 proved editor callbacks, save/reopen, ZIP round-trip, and KML inclusion, but its visible Google Earth geometry was not a credible center-pivot layout.
- The Iteration 5 proof used arbitrary proof-helper triangles/rectangles and did not export actual modeled wet coverage, end-gun coverage, or a radial machine layout surface.

Implementation scope:

- Add a public real-pivot proof project anchored to the Wikimedia Commons Adams County, Colorado center-pivot reference coordinate, with the Google Earth-calibrated proof center at approximately `39.902125, -104.070061`.
- Keep canonical geometry in projected/local `XY` under `EPSG:32613`; WGS84 remains source/display/export metadata only.
- Export layout-result geometry to Google Earth KML: base wet circle, end-gun coverage, allowed irrigated coverage, outside-field coverage when present, field boundary, obstacles, utilities, pivot/source points, and towers.
- Add proof sanity checks so a real-pivot proof can reject triangle/rectangle-only geometry, missing coverage, non-radial tower points, missing obstacles, or a field boundary that does not contain the modeled wet radius.
- Do not change project schemas, archive semantics, paid-service posture, SQLite/native behavior, MapLibre/native claims, or raw PMTiles/MBTiles rendering claims.

Public source:

- Wikimedia Commons: `File:Center pivot irrigation in Colorado.JPG`, camera/location coordinate `39.899125, -104.070061`, author Jeffrey Beall, CC BY 4.0, URL `https://commons.wikimedia.org/wiki/File:Center_pivot_irrigation_in_Colorado.JPG`.

## Iteration 6 Result

Status: complete on 2026-05-29 for browser-exported real center-pivot Google Earth proof.

Implemented surfaces:

- `packages/core/src/sampleProject.ts` now exports `realCenterPivotProofProject` and `publicCenterPivotProofSource`.
- `packages/core/src/projectKml.ts` exports layout-result coverage placemarks with deterministic Google Earth styles and skips those `layout_result` placemarks on re-import so coverage polygons are not mistaken for obstacles.
- `packages/geometry/src/layoutProof.ts` validates center-pivot proof geometry: circular boundary density, pivot containment, wet-radius containment, modeled coverage presence, radial tower points, and named obstacle areas.
- `apps/mobile/src/components/ProjectStartPanel.tsx` exposes `Open Real Pivot Proof` so browser proof starts from the public real-pivot fixture.

Automated coverage:

- `packages/geometry/src/layoutProof.test.ts` proves the public proof passes and triangle/shifted-boundary cases fail.
- `packages/core/src/projectKml.test.ts` proves KML includes layout coverage styles/data and skips layout-result placemarks during import review.
- `packages/project-store/src/projectRepository.test.ts` proves the real proof survives browser localStorage save/reopen and KML export content checks.
- `packages/project-store/src/projectArchive.test.ts` proves ZIP round-trip keeps the real proof project and archived `exports/google-earth.kml` includes layout coverage, towers, and obstacle content.

Browser proof:

- Local static serve: `npx serve apps/mobile/dist -l 4173` served `http://localhost:4173`.
- Playwright opened `Open Real Pivot Proof`, saved it to browser localStorage, reopened `Public Adams County Center Pivot Proof` from the local project list, opened Export, downloaded ZIP and KML, and captured the export surface.
- Browser console caveat: the only reported console error was `GET /favicon.ico` returning 404 from the local static server.

Google Earth Pro proof:

- Google Earth Pro on this Windows 11 PC opened the browser-exported KML at `H:\cplayout\reports\google-earth-visual-fidelity\iteration-6-browser-real-pivot-proof.kml`.
- Human-visible review passed: the screenshot shows the modeled center point on the visible pivot, a circular wet coverage footprint aligned to crop rings, the field/wet-radius rings, radial tower labels 1-7, a diagonal service-track no-spray obstacle, a south road setback, and water/power/source labels.
- Pixel analysis passed as non-black and non-uniform; visual inspection, not pixel analysis alone, is the acceptance evidence.

Generated proof artifacts:

| Artifact | SHA-256 | Notes |
| --- | --- | --- |
| `reports/google-earth-visual-fidelity/iteration-6-browser-real-pivot-proof.kml` | `29315ab67b3a408c444640d100863f10b7bc77faeb28d147bc0d7f89f00a81c1` | Browser-exported KML; contains base wet circle, end-gun coverage, allowed coverage, obstacles, source points, and `Tower 7`. |
| `reports/google-earth-visual-fidelity/iteration-6-browser-real-pivot-proof.zip` | `e1aa2e0ad7d0ffb065b4664092227c0387c8699705b7bb0d99bebb4d9aabcd56` | Browser-exported ZIP; archive includes `project.json`, `exports/scenario.geojson`, `exports/google-earth.kml`, survey CSV, metrics CSV, map package CSV, and manifest. |
| `reports/google-earth-visual-fidelity/iteration-6-browser-real-pivot-proof.png` | `1b3f75f783d66f67e8ad3731200184e2908e3295e8d1ac02dde83487139f4540` | Browser export surface after save/reopen and KML download; status reports 20 Google Earth features. |
| `reports/google-earth-visual-fidelity/iteration-6-real-center-pivot-google-earth-proof.png` | `0560d30264fa163d1232b7ea81a54642e3774989887fbeed0e16eabf5fa17b97` | Google Earth Pro map-canvas proof from the browser-exported KML. |
| `reports/google-earth-visual-fidelity/iteration-6-real-center-pivot-google-earth-full-window.png` | `43e114e51370b420f486236aba98eadd58c3618bd2233c995cda4e4a763950e3` | Full-window Google Earth Pro proof from the browser-exported KML. |

Validation evidence:

- `npm test -w @cplayout/core`: passed.
- `npm test -w @cplayout/geometry`: passed.
- `npm test -w @cplayout/project-store`: passed.
- `npm run typecheck -w @cplayout/mobile`: passed.
- `npm run validate`: passed all workspace typechecks and tests.
- `npm audit`: passed, `0 vulnerabilities`.
- `npm run export:web -w @cplayout/mobile`: passed and emitted `apps/mobile/dist`.
- `git diff --check`: passed with no output.

Remaining unverified claims:

- This proof is limited to the web MVP browser `localStorage` repository, browser ZIP/KML export generation, and Google Earth Pro desktop rendering of the exported KML.
- Native SQLite runtime behavior, native sharing, native MapLibre rendering, Android/iOS persistence, and raw PMTiles/MBTiles archive rendering remain unverified until the device/emulator checklist passes.
