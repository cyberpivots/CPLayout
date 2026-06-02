# Whole-Codebase Improvement Loop Evidence - Iterations 002-010

Loop id: `whole-codebase-2026-06-01`

Scope: batch 1 continuation after checkpoint commit `0e8173f136fe5ea50a6fafd8066a43e527a8fc3f`. This evidence executes rows 002-010 as the baseline, ownership, source-refresh, known-gap, taxonomy, and milestone gate. It does not claim product runtime behavior beyond the validation commands listed here.

## Row Evidence

| Iteration | Result | Evidence |
| --- | --- | --- |
| 002 | Pass | Dirty tree ownership classified the pre-checkpoint work into catalog/UI, project-store/SQLite/archive, reference overlays/PMTiles browser, ML/CV companion evidence, and agent/source records. The current worktree started clean at `0e8173f`. |
| 003 | Pass | Validation baseline was inherited from the checkpoint and rechecked for this batch with loop verification, diff whitespace, skills validation, audit, and TypeScript/unit validation. |
| 004 | Pass | The mixed tree was committed as one safety checkpoint because the prior changes were broad and interdependent. Commit: `0e8173f136fe5ea50a6fafd8066a43e527a8fc3f`. |
| 005 | Pass | The checkpoint branch `codex/cplayout-agent-specialists` tracked `origin/codex/cplayout-agent-specialists` at `0e8173f`. |
| 006 | Pass | The whole-loop verifier distinguishes planned rows from passed rows and requires passed-row validation plus SHA evidence. |
| 007 | Pass | Source refresh rechecked Codex subagents, Expo SQLite, MapLibre React Native sources, PMTiles MapLibre protocol, and OpenCV Hough/Canny docs from official/primary sources. |
| 008 | Pass | Known gaps remained open for planned rows, native/device runtime behavior, Google Earth render proof, real-world ML/CV fixtures, and raw PMTiles/MBTiles native rendering. |
| 009 | Pass | Evidence taxonomy remained split by claim class: browser proof, storage proof, synthetic ML/CV proof, real-world fixture proof, native/device proof, Google Earth proof, and documentation proof. |
| 010 | Pass | Batch 1 milestone curated this evidence and the source/gap records, then reran validation gates. |

## Source Refresh

- OpenAI Codex subagents docs: custom agents are project-scoped or personal TOML files, built-in agent types exist, and subagents consume additional model/tool work.
- Expo SQLite docs: web support is alpha, requires WASM support plus COOP/COEP headers, `execAsync` does not escape parameters, and prepared/bound APIs remain the safe path for dynamic values.
- MapLibre React Native docs: raster and vector sources consume TileJSON URLs or tile URL templates; this remains distinct from direct raw PMTiles/MBTiles native archive rendering.
- Protomaps PMTiles MapLibre docs: the browser integration uses MapLibre GL `addProtocol`, and React apps should register the protocol once in the application lifecycle.
- OpenCV Hough/Canny docs: Hough circle detection and Canny edge detection remain image-space detector primitives, not projected XY truth without calibration and review.

## Boundaries

- `networkRequired: false`
- `hiddenKeysAllowed: false`
- `canonicalGeometryMutation: false`
- No paid APIs, hidden tokens, cloud service dependency, or bulk public tile caching was added.
- No automatic canonical geometry mutation was added.
- Google Earth/KML/KMZ styling remains visual interchange metadata only; no Google Earth render proof was attempted in this batch.
- Native SQLite, ZIP sharing, native MapLibre, raw PMTiles/MBTiles rendering, live GNSS, on-device ML, and real-world projected-XY ML/CV locating remain unverified.

## Validation

| Command | Result |
| --- | --- |
| `git diff --check` | Passed. |
| `npm run validate:skills` | Passed. |
| `npm audit` | Passed; 0 vulnerabilities. |
| `npm run validate` | Passed. |

`npm run verify:whole-loop` and `sha256sum -c` are run after this evidence summary and the batch hash file are complete.
