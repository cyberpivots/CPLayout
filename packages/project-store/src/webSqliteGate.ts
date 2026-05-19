export interface WebSqliteGateEvidence {
  metroWasmConfigured: boolean;
  coopHeader: string | null;
  coepHeader: string | null;
  playwrightSaveOpenReloadPassed: boolean;
  expoSqliteWebStatus: "alpha" | "stable";
}

export interface WebSqliteGateDecision {
  selectedBackend: "local_storage" | "expo_sqlite_web";
  canUseExpoSqliteWeb: boolean;
  blockers: string[];
}

export function evaluateWebSqliteGate(evidence: WebSqliteGateEvidence): WebSqliteGateDecision {
  const blockers: string[] = [];

  if (evidence.expoSqliteWebStatus === "alpha") {
    blockers.push("Expo SQLite web is still treated as alpha in this project.");
  }
  if (!evidence.metroWasmConfigured) {
    blockers.push("Metro WASM support has not been configured and checked in.");
  }
  if (!isCoopHeaderAccepted(evidence.coopHeader)) {
    blockers.push("Cross-Origin-Opener-Policy must be same-origin.");
  }
  if (!isCoepHeaderAccepted(evidence.coepHeader)) {
    blockers.push("Cross-Origin-Embedder-Policy must be credentialless or require-corp.");
  }
  if (!evidence.playwrightSaveOpenReloadPassed) {
    blockers.push("Playwright has not proven save, open, and reload through Expo SQLite web under those headers.");
  }

  return {
    selectedBackend: blockers.length === 0 ? "expo_sqlite_web" : "local_storage",
    canUseExpoSqliteWeb: blockers.length === 0,
    blockers,
  };
}

function isCoopHeaderAccepted(value: string | null): boolean {
  return value?.toLowerCase() === "same-origin";
}

function isCoepHeaderAccepted(value: string | null): boolean {
  const normalized = value?.toLowerCase();
  return normalized === "credentialless" || normalized === "require-corp";
}
