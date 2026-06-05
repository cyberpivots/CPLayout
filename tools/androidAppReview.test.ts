import { strict as assert } from "node:assert";

import {
  evaluateScenarioEvidence,
  parseUiNodes,
  validateAndroidAppReviewReport,
  type UiNode,
} from "./androidAppReview";

const screenshot = {
  width: 1000,
  height: 600,
  sampleCount: 600000,
  nonBlankPixelRatio: 1,
  grayMean: 120,
  grayVariance: 2000,
  minGray: 10,
  maxGray: 240,
};

const logcat = {
  path: "logcat.txt",
  sha256: "0".repeat(64),
  lineCount: 10,
  mapLibreLineCount: 0,
  mapLibreErrorLines: [],
  resourceUrlErrorCount: 0,
  resourceUrlErrorLines: [],
};

const ocr = {
  path: "ocr.txt",
  sha256: "0".repeat(64),
  available: true,
  textLength: 20,
  lineCount: 2,
  duplicatedVisibleLines: [],
  notes: "",
};

const cv = {
  path: "cv.json",
  sha256: "0".repeat(64),
  available: true,
  method: "opencv-canny-threshold-summary",
  edgeDensity: 0.04,
  darkPixelRatio: 0.1,
  brightPixelRatio: 0.1,
  meanGray: 120,
  stdGray: 35,
  notes: "",
};

const mapScenario = {
  id: "map-workspace" as const,
  label: "Normal map workspace",
  route: "map" as const,
  requiredNodes: [
    { label: "workspace shell", severity: "critical" as const, anyOf: [{ attr: "resource-id" as const, value: "workspace-screen", mode: "contains" as const }] },
    { label: "map route", severity: "critical" as const, anyOf: [{ attr: "resource-id" as const, value: "map-view", mode: "contains" as const }] },
  ],
};

const xml = `<?xml version='1.0' encoding='UTF-8'?><hierarchy>
  <node text="" resource-id="workspace-screen" class="android.view.ViewGroup" package="local.centerpivot.layout" content-desc="" clickable="false" enabled="true" bounds="[0,0][1000,600]" />
  <node text="" resource-id="map-view" class="android.view.ViewGroup" package="local.centerpivot.layout" content-desc="" clickable="false" enabled="true" bounds="[0,60][1000,540]" />
  <node text="" resource-id="small-action" class="android.widget.Button" package="local.centerpivot.layout" content-desc="Small Action" clickable="true" enabled="true" bounds="[100,100][130,130]" />
  <node text="" resource-id="android:id/navigationBarBackground" class="android.view.View" package="android" content-desc="" clickable="false" enabled="true" bounds="[0,540][1000,600]" />
</hierarchy>`;

const nodes = parseUiNodes(xml);
assert.equal(nodes.length, 4);
assert.equal(nodes[2].resourceId, "small-action");
assert.equal(nodes[2].width, 30);

const ui = {
  expectedNodeMatches: { "workspace shell": true, "map route": true },
  missingRequired: [],
  smallTouchTargets: [nodes[2] as UiNode],
  overlappingSystemControls: [],
  overlappingClickablePairs: [],
  clippedNodes: [],
  duplicateLabels: [],
  smallestTouchTargetPx: 30,
  navigationBarBounds: [nodes[3].bounds],
  statusBarBounds: [],
};

const touchFindings = evaluateScenarioEvidence({ cv, logcat, nodes, ocr, scenario: mapScenario, screenshot, ui });
assert.equal(touchFindings.some((finding) => finding.id.includes("small-touch-target") && finding.severity === "medium"), true);
assert.equal(touchFindings.some((finding) => finding.severity === "critical" || finding.severity === "high"), false);

const missingFindings = evaluateScenarioEvidence({
  cv,
  logcat,
  nodes,
  ocr,
  scenario: mapScenario,
  screenshot,
  ui: {
    ...ui,
    expectedNodeMatches: { "workspace shell": false, "map route": true },
    missingRequired: [mapScenario.requiredNodes[0]],
  },
});
assert.equal(missingFindings.some((finding) => finding.severity === "critical"), true);

const invalidReportErrors = validateAndroidAppReviewReport({
  reportSchemaVersion: 1,
  reviewTarget: "android-app-review",
  status: "pass",
  boundaries: { canonicalGeometryMutation: true, ocrCvAdvisoryOnly: true, androidNativeSqliteZipProofClaimed: false },
  scenarioResults: [],
  findings: [],
  panelDecision: {},
});
assert.equal(invalidReportErrors.some((error) => error.includes("canonicalGeometryMutation")), true);
