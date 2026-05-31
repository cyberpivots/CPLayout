# Iteration 010 Browser Mapping Milestone

Loop id: `browser-mapping-2026-05-31`

Scope covered:

- Static Expo web export through `npm run export:web`.
- Playwright browser route screenshots and checks through launcher, dashboard, map, survey, review, files, and settings at desktop, 768 px, and 390 px widths.
- Network allowlist check for local app assets, `data:`/`blob:`, and the configured USGS Imagery Only reference source.
- Review Layout no-mutation proof: map clicks in Review Layout report read-only status and leave the project state shown as saved.
- Draft-state proof: Edit Geometry boundary clicks create draft vertices; switching back to Pan clears local draft state without committing projected `XY` geometry.
- HUD proof: status and attribution HUD bounding boxes do not overlap at the target Playwright widths.

Validation commands for this milestone:

- `npm run validate`
- `npm run validate:skills`
- `npm run audit:moderate`
- `npm run proof:web`
- `git diff --check`
- `npm audit`

Unverified claims:

- Android/iOS persistence, native SQLite runtime, native MapLibre runtime, raw PMTiles/MBTiles rendering, and device file sharing are not production-verified by this browser milestone.
- Google Earth rendering is not claimed. KML/KMZ styling remains visual interchange metadata only.
- USGS/browser imagery and any screenshot evidence remain reference evidence only; canonical project geometry stays projected/local `XY`.

Raw artifacts:

- Bulky Playwright screenshots and HTML reports remain ignored under `reports/continuous-improvement/`.
- `SHA256SUMS.txt` records selected local artifact hashes from the milestone run without checking those raw files into git.
