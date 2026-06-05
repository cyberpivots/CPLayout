import assert from "node:assert/strict";

import {
  ANDROID_NATIVE_REQUIRED_ABSENT_TABLES,
  ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS,
  ANDROID_NATIVE_REQUIRED_MIGRATIONS,
  ANDROID_NATIVE_REQUIRED_SQLITE_VERSION,
  createAndroidNativeVerificationReportTemplate,
  parseCompleteAndroidNativeVerificationReport,
} from "./nativeVerification";
import { SQLITE_MIGRATIONS, SQLITE_SCHEMA_VERSION } from "./persistenceSchema";

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

assert.equal(ANDROID_NATIVE_REQUIRED_SQLITE_VERSION, SQLITE_SCHEMA_VERSION);
assert.deepEqual(
  ANDROID_NATIVE_REQUIRED_MIGRATIONS,
  SQLITE_MIGRATIONS.map((migration) => migration.id),
);
assert.equal(baseReport.sqlite.schemaVersion, SQLITE_SCHEMA_VERSION);

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport(baseReport),
  /status must be pass|checklist/,
);

const completed = {
  ...baseReport,
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
  osFileUi: {
    shareSheetOpened: true,
    shareSheetEvidence: "Android resolver/share sheet displayed for project ZIP export.",
    shareSheetScreenshotPath: "reports/android-native-verification/share-sheet.png",
    shareSheetXmlPath: "reports/android-native-verification/share-sheet.xml",
    documentsPickerOpened: true,
    documentsPickerEvidence: "Android DocumentsUI picker displayed and selected the pushed project ZIP.",
    documentsPickerScreenshotPath: "reports/android-native-verification/documents-picker.png",
    documentsPickerXmlPath: "reports/android-native-verification/documents-picker.xml",
    pushedZipPath: "/sdcard/Download/cplayout-android-native-proof.zip",
    selectedZipFilename: "cplayout-android-native-proof.zip",
    selectedZipBytes: 2048,
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

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport({
    ...completed,
    sqlite: {
      ...completed.sqlite,
      mapPackageColumns: ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS.filter((column) => column !== "imagery_provenance_json"),
    },
  }),
  /imagery_provenance_json/,
);

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport({
    ...completed,
    sqlite: {
      ...completed.sqlite,
      absentTables: ANDROID_NATIVE_REQUIRED_ABSENT_TABLES.filter((tableName) => tableName !== "layout_evidence"),
    },
  }),
  /layout_evidence/,
);

assert.throws(
  () => parseCompleteAndroidNativeVerificationReport({
    ...completed,
    osFileUi: {
      ...completed.osFileUi,
      documentsPickerOpened: false,
    },
  }),
  /documentsPickerOpened/,
);

console.log("native verification tests passed");
