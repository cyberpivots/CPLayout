import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseRoadmapArgs,
  runRoadmapCompletion,
  validateGoogleEarthManifest,
  validateNativeMapLibreReport,
} from "./roadmapCompletion";

const parsed = parseRoadmapArgs(
  [
    "--fast",
    "--dry-run",
    "--output-dir",
    "reports/roadmap-completion/test",
    "--real-pivot-project-id",
    "fixture-project",
  ],
  {
    CPLAYOUT_REAL_PIVOT_FIXTURES: "fixtures/real-pivot/manifest.json",
    CPLAYOUT_REAL_PIVOT_PROJECT_CRS: "EPSG:32613",
  },
);

assert.equal(parsed.full, false);
assert.equal(parsed.dryRun, true);
assert.equal(parsed.outputDirectory, "reports/roadmap-completion/test");
assert.equal(parsed.realPivotFixturesPath, "fixtures/real-pivot/manifest.json");
assert.equal(parsed.realPivotProjectId, "fixture-project");
assert.equal(parsed.realPivotProjectCrs, "EPSG:32613");

const outputDirectory = "reports/roadmap-completion/test-dry-run";
rmSync(outputDirectory, { recursive: true, force: true });
const report = runRoadmapCompletion({
  full: false,
  dryRun: true,
  outputDirectory,
});

assert.equal(report.schemaVersion, "cplayout-roadmap-completion-v1");
assert.equal(report.status, "pass");
assert.ok(report.gates.every((gate) => gate.status === "not_run"));
assert.ok(existsSync(join(outputDirectory, "latest.json")));
assert.ok(existsSync(join(outputDirectory, "latest.md")));

const proofRoot = mkdtempSync(join(tmpdir(), "cplayout-roadmap-proof-"));
const googleEarthManifestPath = join(proofRoot, "visual-fidelity-manifest.json");
writeFileSync(googleEarthManifestPath, JSON.stringify({
  schemaVersion: "cplayout-google-earth-visual-fidelity-proof-v1",
  status: "passed",
  proofPassed: true,
  outputDir: proofRoot,
  googleEarth: {
    cleanup: {
      status: "force_closed",
      contaminated: false,
      postflightProcessRemaining: false,
    },
  },
  thresholds: {
    minimumNonBlackRatio: 0.08,
    minimumGrayVariance: 80,
  },
  artifacts: {
    kml: "fixture.kml",
    kmz: "fixture.kmz",
    kmlIntegrity: { passed: true },
  },
  captures: [{
    filename: "google-earth-visual-fidelity-map-canvas.png",
    label: "Google Earth Pro map-canvas crop",
    width: 120,
    height: 80,
    sha256: "a".repeat(64),
    analysis: {
      nonBlackRatio: 0.95,
      grayVariance: 120,
      mostlyBlack: false,
      nearUniform: false,
    },
  }],
  manualReview: {
    overlayVisibleConfirmed: true,
  },
}), "utf8");
assert.equal(validateGoogleEarthManifest(googleEarthManifestPath).ok, true);

const screenshotPath = join(proofRoot, "native-maplibre.png");
writeFileSync(screenshotPath, "native maplibre screenshot fixture", "utf8");
const screenshotSha256 = createHash("sha256").update("native maplibre screenshot fixture").digest("hex");
const nativeMapLibreReportPath = join(proofRoot, "native-maplibre-report.json");
writeFileSync(nativeMapLibreReportPath, JSON.stringify({
  reportSchemaVersion: 1,
  proofTarget: "native-maplibre-render",
  generatedAt: "2026-06-02T00:00:00.000Z",
  status: "pass",
  target: "native_maplibre_rn",
  device: {
    adbSerial: "emulator-5554",
    model: "Pixel",
    osVersion: "15",
    apiLevel: "35",
  },
  app: {
    packageName: "local.centerpivot.layout",
    versionName: "1.0",
    versionCode: "1",
    buildType: "development",
    commit: "abcdef123456",
  },
  tileSource: {
    tileSourceKind: "tilejson_or_template",
    tileContentType: "vector",
    sourceComponent: "VectorSource",
    tileJsonUrl: "http://127.0.0.1:8765/field/tilejson.json",
    tileUrlTemplates: ["http://127.0.0.1:8765/field/{z}/{x}/{y}.pbf"],
    sourceLayers: {
      roads: "roads",
      roadLabels: "road_labels",
      borders: "borders",
      places: "places",
    },
    attribution: "Local fixture",
  },
  screenshot: {
    path: "native-maplibre.png",
    sha256: screenshotSha256,
    width: 320,
    height: 240,
    nonBlankPixelRatio: 0.8,
    grayVariance: 100,
  },
  boundaries: {
    noRawPmtilesMbtilesNativeProof: true,
    canonicalGeometryMutation: false,
    networkRequired: false,
  },
  tileServer: {
    tileJsonRequests: 1,
    tileRequests: 4,
  },
}), "utf8");
assert.equal(validateNativeMapLibreReport(nativeMapLibreReportPath).ok, true);

const missingTileServerReportPath = join(proofRoot, "native-maplibre-missing-tile-server-report.json");
const missingTileServerReport = JSON.parse(readFileSync(nativeMapLibreReportPath, "utf8")) as { tileServer?: unknown };
delete missingTileServerReport.tileServer;
writeFileSync(missingTileServerReportPath, JSON.stringify(missingTileServerReport), "utf8");
const missingTileServerValidation = validateNativeMapLibreReport(missingTileServerReportPath);
assert.equal(missingTileServerValidation.ok, false);
assert.match(missingTileServerValidation.errors.join("\n"), /tileServer\.tileRequests/);

console.log("roadmap completion automation tests passed");
