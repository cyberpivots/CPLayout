import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ANDROID_NATIVE_REQUIRED_ABSENT_TABLES,
  ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS,
  ANDROID_NATIVE_REQUIRED_MIGRATIONS,
  ANDROID_NATIVE_REQUIRED_SQLITE_VERSION,
  createAndroidNativeVerificationReportTemplate,
} from "@cplayout/project-store";
import {
  findCompletedAndroidNativeReport,
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
const androidReportDirectory = join(proofRoot, "android-native-verification");
mkdirSync(androidReportDirectory, { recursive: true });
const incompleteAndroidReport = createAndroidNativeVerificationReportTemplate({
  generatedAt: "2026-06-05T22:17:57.398Z",
  packageName: "local.centerpivot.layout",
  commit: "abcdef123456",
  adbSerial: "emulator-5554",
  model: "Pixel",
  androidVersion: "15",
  apiLevel: "35",
  versionName: "0.1.0",
  versionCode: "1",
  buildType: "development",
  packagePath: "package:/data/app/local.centerpivot.layout/base.apk",
  adbDeviceLine: "emulator-5554 device",
  logExcerptPath: "reports/android-native-verification/logcat.txt",
});
const completedAndroidReport = {
  ...incompleteAndroidReport,
  generatedAt: "2026-06-05T13:43:16.325Z",
  status: "pass" as const,
  sqlite: {
    schemaVersion: ANDROID_NATIVE_REQUIRED_SQLITE_VERSION,
    pragmaUserVersion: ANDROID_NATIVE_REQUIRED_SQLITE_VERSION,
    schemaMigrations: [...ANDROID_NATIVE_REQUIRED_MIGRATIONS],
    mapPackageColumns: [...ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS],
    absentTables: [...ANDROID_NATIVE_REQUIRED_ABSENT_TABLES],
    geometryRowsPopulated: true,
  },
  projectRoundTrip: {
    backendLabel: "Expo SQLite",
    runtime: "native",
    sampleProjectSaved: true,
    relaunchCompleted: true,
    listAfterRelaunch: true,
    loadedProjectId: "cplayout-android-native-schema-v10-proof",
    loadedProjectName: "CPLayout Android Native Schema v10 Proof",
    fieldBoundaryPointCount: 5,
    obstacleCount: 1,
    surveyPointCount: 1,
    settingsMatched: true,
    deleteConfirmed: true,
  },
  zipRoundTrip: {
    exportedFilename: "cplayout-android-native-proof.center-pivot.zip",
    exportedBytes: 4096,
    exportedSha256: "b".repeat(64),
    importedProjectId: "cplayout-android-native-schema-v10-proof",
    manifestJsonPresent: true,
    projectJsonPresent: true,
    manifestProjectIdMatched: true,
    manifestProjectCrsMatched: true,
    savedImportedProject: true,
  },
  osFileUi: {
    shareSheetOpened: true,
    shareSheetEvidence: "Android share sheet displayed for proof ZIP export.",
    shareSheetScreenshotPath: "reports/android-native-verification/share-sheet.png",
    shareSheetXmlPath: "reports/android-native-verification/share-sheet.xml",
    documentsPickerOpened: true,
    documentsPickerEvidence: "Android DocumentsUI picker selected the pushed proof ZIP.",
    documentsPickerScreenshotPath: "reports/android-native-verification/documents-picker.png",
    documentsPickerXmlPath: "reports/android-native-verification/documents-picker.xml",
    pushedZipPath: "/sdcard/Download/cplayout-android-native-proof.center-pivot.zip",
    selectedZipFilename: "cplayout-android-native-proof.center-pivot.zip",
    selectedZipBytes: 4096,
  },
  checklist: Object.fromEntries(
    Object.keys(incompleteAndroidReport.checklist).map((key) => [
      key,
      {
        status: "pass",
        observedAt: "2026-06-05T13:43:16.325Z",
        evidence: `${key} verified on Android development build.`,
      },
    ]),
  ),
};
writeFileSync(join(androidReportDirectory, "android-native-verification-20260605-221757398Z.json"), JSON.stringify(incompleteAndroidReport), "utf8");
writeFileSync(join(androidReportDirectory, "android-native-verification-20260605-134316325Z.json"), JSON.stringify(completedAndroidReport), "utf8");
assert.equal(
  findCompletedAndroidNativeReport(androidReportDirectory)?.path,
  join(androidReportDirectory, "android-native-verification-20260605-134316325Z.json"),
);

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
const nativeMapLibreLogcatPath = join(proofRoot, "native-maplibre-logcat.txt");
writeFileSync(nativeMapLibreLogcatPath, "MapLibre Native [INFO] [Mbgl-HttpRequest] local vector tile proof loaded\n", "utf8");
const nativeMapLibreLogcatSha256 = createHash("sha256").update("MapLibre Native [INFO] [Mbgl-HttpRequest] local vector tile proof loaded\n").digest("hex");
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
  logcat: {
    path: "native-maplibre-logcat.txt",
    sha256: nativeMapLibreLogcatSha256,
    lineCount: 1,
    mapLibreLineCount: 1,
    mapLibreErrorLines: [],
    resourceUrlErrorCount: 0,
    resourceUrlErrorLines: [],
    clearedBeforeLaunch: true,
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

const resourceUrlErrorReportPath = join(proofRoot, "native-maplibre-resource-url-error-report.json");
const resourceUrlErrorReport = JSON.parse(readFileSync(nativeMapLibreReportPath, "utf8")) as {
  logcat?: { mapLibreErrorLines?: string[]; resourceUrlErrorCount?: number; resourceUrlErrorLines?: string[] };
};
resourceUrlErrorReport.logcat = {
  ...resourceUrlErrorReport.logcat,
  mapLibreErrorLines: ["MapLibre Native [ERROR] [Mbgl-HttpRequest] [HTTP] Unable to parse resourceURL"],
  resourceUrlErrorCount: 1,
  resourceUrlErrorLines: ["MapLibre Native [ERROR] [Mbgl-HttpRequest] [HTTP] Unable to parse resourceURL"],
};
writeFileSync(resourceUrlErrorReportPath, JSON.stringify(resourceUrlErrorReport), "utf8");
const resourceUrlErrorValidation = validateNativeMapLibreReport(resourceUrlErrorReportPath);
assert.equal(resourceUrlErrorValidation.ok, false);
assert.match(resourceUrlErrorValidation.errors.join("\n"), /logcat\.resourceUrlErrorCount/);

console.log("roadmap completion automation tests passed");
