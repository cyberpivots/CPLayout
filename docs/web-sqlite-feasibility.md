# Web SQLite Browser Catalog Gate

The browser app keeps Expo SQLite web as a proof-gated path for the customer/project/field/design catalog and project snapshots. This is not the active browser store because Expo documents web support as alpha and dependent on WASM plus COOP/COEP headers, and local browser proof showed that partial SQLite web operation can split catalog state from localStorage fallback state.

## Current Decision

- Expo web resolves `packages/project-store/src/projectRepository.web.ts`, which uses browser localStorage and reports the SQLite web blocker in storage status notes.
- Node/local tests keep `packages/project-store/src/projectRepository.ts` as the localStorage compatibility path and migration source.
- Native persistence stays in `packages/project-store/src/projectRepository.native.ts` and Expo SQLite.
- Do not claim production web SQLite until `evaluateWebSqliteGate` can be satisfied and a Playwright run proves save, open, and reload with the deployed headers.
- Current local browser proof can serve COOP/COEP headers, but Expo SQLite web CRUD remains unstable enough that the browser runtime stays on localStorage with a visible blocker note.

## Required Proof

1. Keep Metro WASM support checked in for Expo SQLite web.
2. Serve the web build with:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: credentialless` or `Cross-Origin-Embedder-Policy: require-corp`
3. Run a Playwright proof that creates/saves a project, opens it, reloads the page, and opens it again through Expo SQLite web.
4. Report any failed header, WASM, or reload proof as a blocker instead of claiming production-ready web SQLite.

## Primary Source

Expo documents SQLite web support as alpha and says web use requires Metro WASM support plus COOP/COEP headers: https://docs.expo.dev/versions/latest/sdk/sqlite/
