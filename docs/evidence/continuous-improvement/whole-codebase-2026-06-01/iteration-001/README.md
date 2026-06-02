# Whole-Codebase Improvement Loop Evidence - Iteration 001

Loop id: `whole-codebase-2026-06-01`

Scope: baseline implementation of the whole-codebase 100-iteration control loop. This evidence summary covers the ledger/verifier framework only. It does not claim that future planned rows have executed.

## Local Facts

- `AGENTS.md` was re-read before edits.
- The worktree was already dirty across UI, project-store, map-adapters, core, docs, tests, and local ML/CV tooling.
- Two stale static web server processes were found on ports `19006` and `19007`; kill signals were sent, but the processes remained in uninterruptible sleep at the time of investigation.
- The prior interrupted patch did not create `docs/whole-codebase-improvement-loop-2026-06-01.md`; only `tools/verify_whole_codebase_improvement_loop.ts` had applied.

## Implemented

- Added the whole-codebase loop ledger: `docs/whole-codebase-improvement-loop-2026-06-01.md`.
- Added the mechanical verifier: `tools/verify_whole_codebase_improvement_loop.ts`.
- Added `npm run verify:whole-loop`.
- Updated prompt registry, source ledger, and known gaps to record the loop route, verifier scope, and proof boundaries.

## Boundaries

- `networkRequired: false`
- `hiddenKeysAllowed: false`
- `canonicalGeometryMutation: false`
- No paid APIs, hidden tokens, cloud service dependency, or bulk public tile caching was added.
- No automatic canonical geometry mutation was added.
- Native, Google Earth, real-world ML/CV, and raw PMTiles/MBTiles runtime behavior remain unverified.

## Validation

| Command | Result |
| --- | --- |
| `npm run verify:whole-loop` | Passed; 100 whole-codebase rows verified. |
| `git diff --check` | Passed. |
| `npm run verify:ml-cv-loop` | Passed; 100 ML/CV loop rows verified. |
| `npm run validate:skills` | Passed. |
| `npm run test:ml-companion` | Passed; 38 tests, including a 100-iteration synthetic pivot-locator run. |
| `npm run validate` | Passed. |
| `npm audit` | Passed; 0 vulnerabilities. |
| `npm run audit:moderate` | Passed; 0 vulnerabilities. |
| `npm run proof:web` | Passed; web export completed and 228 Playwright tests passed. |

## Current Claim

Iteration 001 passed as a framework and baseline checkpoint. It proves the whole-codebase loop ledger/verifier exists and the current mixed tree passed the listed validation gates. It does not prove execution of future planned rows.
