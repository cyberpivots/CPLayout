# Web SQLite Feasibility Gate

Web remains on the browser localStorage repository until Expo SQLite web is proven in this repo's deployed web environment. This is a feature gate, not a storage migration plan.

## Current Decision

- Web MVP persistence stays in `packages/project-store/src/projectRepository.ts`.
- Native persistence stays in `packages/project-store/src/projectRepository.native.ts` and Expo SQLite.
- Do not switch web to Expo SQLite until `evaluateWebSqliteGate` can be satisfied and a Playwright run proves save, open, and reload with the deployed headers.

## Required Proof

1. Check in Metro WASM support for Expo SQLite web.
2. Serve the web build with:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: credentialless` or `Cross-Origin-Embedder-Policy: require-corp`
3. Run a Playwright proof that creates/saves a project, opens it, reloads the page, and opens it again through Expo SQLite web.
4. Keep browser localStorage as the selected backend until all conditions pass.

## Primary Source

Expo documents SQLite web support as alpha and says web use requires Metro WASM support plus COOP/COEP headers: https://docs.expo.dev/versions/latest/sdk/sqlite/
