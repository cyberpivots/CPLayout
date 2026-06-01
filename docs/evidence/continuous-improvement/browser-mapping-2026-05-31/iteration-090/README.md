# Browser Mapping Loop Evidence - Iteration 090

Loop id: `browser-mapping-2026-05-31`

Milestone scope: iterations 081-089 finished the Survey/RTK browser workflow batch and started responsive/accessibility/network hardening. The scope includes Survey CSV handoff to the Survey view, explicit survey point promotion/delete/export behavior, `rtk_float` draft-input classification, point-specific Survey row action names, workspace rail selected-state and overflow proof, rejected credentialed imagery request blocking, and credential-query allowlist hardening.

Validation run for this milestone:

- `npm run validate` passed.
- `npm run validate:skills` passed.
- `npm run audit:moderate` passed with 0 vulnerabilities.
- `npm audit` passed with 0 vulnerabilities.
- `git diff --check` passed.
- `npm run proof:web` passed with 192 Playwright checks across `desktop`, `tablet-768`, and `mobile-390`.

Curated proof notes:

- Imported projected Survey CSV evidence appears in Survey metrics and rows while preserving the Unsaved edits boundary.
- Survey point promotion remains explicit: imported water-source evidence does not move canonical infrastructure until `Set Water`, after which exported `project.json` contains projected `waterSource`.
- Survey point deletion removes only the selected evidence row and exported `project.json` no longer includes the deleted survey id.
- `rtk_float` evidence increments draft inputs and does not increment RTK-fixed evidence.
- Survey row actions expose point-specific accessible names so repeated promotion/delete controls remain unambiguous.
- Workspace rail buttons expose selected state and the compact rail stays inside the viewport during route switching.
- Rejected credentialed imagery never reaches map requests, and the proof allowlist blocks token/API-key query strings even on otherwise allowed imagery hosts.

Claims not made:

- No Android/iOS runtime behavior is claimed.
- No native MapLibre, raw PMTiles/MBTiles rendering, native SQLite production readiness, Google Earth rendering, OCR/CV promotion, or KML/KMZ runtime proof is claimed.
- Settings and network proof cover browser-local guardrails and Playwright allowlist behavior only; they do not prove external imagery service availability or native tile-package rendering.
- Survey/RTK proof covers browser import, UI gating, and explicit operator actions only; it does not claim live GNSS receiver, RTK correction, or device integration behavior.
- Imagery and survey evidence remain reference/input evidence; canonical project geometry remains projected/local `XY`.
