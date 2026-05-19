import assert from "node:assert/strict";

import {
  ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS,
  createAndroidNativeVerificationReportTemplate,
  parseCompleteAndroidNativeVerificationReport,
} from "./nativeVerification";

const baseReport = createAndroidNativeVerificationReportTemplate({
  generatedAt: "2026-05-19T12:00:00.000Z",
  packageName: "local.centerpivot.layout",
  commit: "abc1234",
  adbSerial: "emulator-5554",
  model: "Pixel_8",
  androidVersion: "16",
  apiLevel: "36",
  versionName: "0.1.0",
  versionCode: "1",
  buildType: "debug-dev-build",
  packagePath: "package:/data/app/local.centerpivot.layout/base.apk",
  adbDeviceLine: "emulator-5554 device",
  logExcerptPath: "reports/android-native-verification/logcat.txt",
});

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport(baseReport),
  /status must be pass|checklist/,
);

const completed = {
  ...baseReport,
  status: "pass" as const,
  sqlite: {
    schemaVersion: 3,
    pragmaUserVersion: 3,
    schemaMigrations: [1, 2, 3],
    mapPackageColumns: [...ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS],
    geometryRowsPopulated: true,
  },
  projectRoundTrip: {
    backendLabel: "Expo SQLite",
    runtime: "native",
    sampleProjectSaved: true,
    relaunchCompleted: true,
    listAfterRelaunch: true,
    loadedProjectId: "sample-burgundy-quarter-section",
    loadedProjectName: "North Quarter Concept Layout",
    fieldBoundaryPointCount: 6,
    obstacleCount: 2,
    surveyPointCount: 2,
    settingsMatched: true,
    deleteConfirmed: true,
  },
  zipRoundTrip: {
    exportedFilename: "center-pivot-sample.zip",
    exportedBytes: 2048,
    exportedSha256: "a".repeat(64),
    importedProjectId: "sample-burgundy-quarter-section",
    manifestJsonPresent: true,
    projectJsonPresent: true,
    manifestProjectIdMatched: true,
    manifestProjectCrsMatched: true,
    savedImportedProject: true,
  },
  checklist: Object.fromEntries(
    Object.keys(baseReport.checklist).map((key) => [
      key,
      {
        status: "pass",
        observedAt: "2026-05-19T12:10:00.000Z",
        evidence: `${key} verified on Android emulator.`,
      },
    ]),
  ),
};

assert.equal(parseCompleteAndroidNativeVerificationReport(completed).status, "pass");

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport({
    ...completed,
    zipRoundTrip: {
      ...completed.zipRoundTrip,
      exportedSha256: "",
    },
  }),
  /exportedSha256/,
);

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport({
    ...completed,
    sqlite: {
      ...completed.sqlite,
      mapPackageColumns: ["tile_content_type"],
    },
  }),
  /tile_scheme/,
);

console.log("native verification tests passed");
