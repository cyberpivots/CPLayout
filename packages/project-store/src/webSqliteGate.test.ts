import assert from "node:assert/strict";

import { evaluateWebSqliteGate } from "./webSqliteGate";

const defaultDecision = evaluateWebSqliteGate({
  metroWasmConfigured: false,
  coopHeader: null,
  coepHeader: null,
  playwrightSaveOpenReloadPassed: false,
  expoSqliteWebStatus: "alpha",
});

assert.equal(defaultDecision.selectedBackend, "local_storage");
assert.equal(defaultDecision.canUseExpoSqliteWeb, false);
assert.ok(defaultDecision.blockers.some((blocker) => blocker.includes("WASM")));
assert.ok(defaultDecision.blockers.some((blocker) => blocker.includes("Playwright")));

const missingProofDecision = evaluateWebSqliteGate({
  metroWasmConfigured: true,
  coopHeader: "same-origin",
  coepHeader: "credentialless",
  playwrightSaveOpenReloadPassed: false,
  expoSqliteWebStatus: "stable",
});

assert.equal(missingProofDecision.selectedBackend, "local_storage");
assert.match(missingProofDecision.blockers.join("\n"), /Playwright/);

const readyDecision = evaluateWebSqliteGate({
  metroWasmConfigured: true,
  coopHeader: "same-origin",
  coepHeader: "require-corp",
  playwrightSaveOpenReloadPassed: true,
  expoSqliteWebStatus: "stable",
});

assert.equal(readyDecision.selectedBackend, "expo_sqlite_web");
assert.equal(readyDecision.canUseExpoSqliteWeb, true);
assert.deepEqual(readyDecision.blockers, []);

console.log("web SQLite gate tests passed");
