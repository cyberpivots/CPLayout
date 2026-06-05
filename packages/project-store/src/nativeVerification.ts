import { z } from "zod";

import { SQLITE_MIGRATIONS, SQLITE_SCHEMA_VERSION } from "./persistenceSchema";

export const ANDROID_NATIVE_REPORT_SCHEMA_VERSION = 1;
export const ANDROID_NATIVE_PROOF_TARGET = "android-native-runtime";
export const ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER = "CPLAYOUT_ANDROID_NATIVE_PROOF_REPORT";
export const ANDROID_NATIVE_REQUIRED_SQLITE_VERSION = SQLITE_SCHEMA_VERSION;
export const ANDROID_NATIVE_REQUIRED_MIGRATIONS = SQLITE_MIGRATIONS.map((migration) => migration.id);
export const ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS = [
  "tile_content_type",
  "tile_scheme",
  "tilejson_url",
  "tile_url_templates_json",
  "vector_overlay_json",
  "imagery_provenance_json",
  "checksum_sha256",
  "install_status",
] as const;
export const ANDROID_NATIVE_REQUIRED_ABSENT_TABLES = [
  "layout_evidence",
  "model_recommendations",
  "layout_decisions",
] as const;

const ReportStatusSchema = z.enum(["pass", "fail", "blocked", "incomplete"]);
const CheckStatusSchema = z.enum(["pass", "fail", "blocked", "not_run"]);

const ChecklistEvidenceSchema = z.object({
  status: CheckStatusSchema,
  observedAt: z.string(),
  evidence: z.string(),
});

export const AndroidNativeVerificationReportSchema = z.object({
  reportSchemaVersion: z.literal(ANDROID_NATIVE_REPORT_SCHEMA_VERSION),
  proofTarget: z.literal(ANDROID_NATIVE_PROOF_TARGET),
  generatedAt: z.string(),
  status: ReportStatusSchema,
  device: z.object({
    adbSerial: z.string(),
    model: z.string(),
    androidVersion: z.string(),
    apiLevel: z.string(),
  }),
  app: z.object({
    packageName: z.string(),
    versionName: z.string(),
    versionCode: z.string(),
    buildType: z.string(),
    commit: z.string(),
    packagePath: z.string(),
  }),
  sqlite: z.object({
    schemaVersion: z.number().int(),
    pragmaUserVersion: z.number().int(),
    schemaMigrations: z.array(z.number().int()),
    mapPackageColumns: z.array(z.string()),
    absentTables: z.array(z.string()),
    geometryRowsPopulated: z.boolean(),
  }),
  projectRoundTrip: z.object({
    backendLabel: z.string(),
    runtime: z.string(),
    sampleProjectSaved: z.boolean(),
    relaunchCompleted: z.boolean(),
    listAfterRelaunch: z.boolean(),
    loadedProjectId: z.string(),
    loadedProjectName: z.string(),
    fieldBoundaryPointCount: z.number().int(),
    obstacleCount: z.number().int(),
    surveyPointCount: z.number().int(),
    settingsMatched: z.boolean(),
    deleteConfirmed: z.boolean(),
  }),
  zipRoundTrip: z.object({
    exportedFilename: z.string(),
    exportedBytes: z.number().int(),
    exportedSha256: z.string(),
    importedProjectId: z.string(),
    manifestJsonPresent: z.boolean(),
    projectJsonPresent: z.boolean(),
    manifestProjectIdMatched: z.boolean(),
    manifestProjectCrsMatched: z.boolean(),
    savedImportedProject: z.boolean(),
  }),
  osFileUi: z.object({
    shareSheetOpened: z.boolean(),
    shareSheetEvidence: z.string(),
    shareSheetScreenshotPath: z.string(),
    shareSheetXmlPath: z.string(),
    documentsPickerOpened: z.boolean(),
    documentsPickerEvidence: z.string(),
    documentsPickerScreenshotPath: z.string(),
    documentsPickerXmlPath: z.string(),
    pushedZipPath: z.string(),
    selectedZipFilename: z.string(),
    selectedZipBytes: z.number().int(),
  }),
  checklist: z.object({
    cleanInstallOrUpgradePath: ChecklistEvidenceSchema,
    backendPanel: ChecklistEvidenceSchema,
    saveLoadDelete: ChecklistEvidenceSchema,
    zipExportImport: ChecklistEvidenceSchema,
    migrationEvidence: ChecklistEvidenceSchema,
  }),
  evidence: z.object({
    checklistDocument: z.string(),
    adbDeviceLine: z.string(),
    logExcerptPath: z.string(),
    notes: z.string(),
  }),
});

export type AndroidNativeVerificationReport = z.infer<typeof AndroidNativeVerificationReportSchema>;
export type AndroidNativeVerificationReportStatus = z.infer<typeof ReportStatusSchema>;

export function createAndroidNativeVerificationReportTemplate(input: {
  generatedAt: string;
  packageName: string;
  commit: string;
  status?: AndroidNativeVerificationReportStatus;
  adbSerial?: string;
  model?: string;
  androidVersion?: string;
  apiLevel?: string;
  versionName?: string;
  versionCode?: string;
  buildType?: string;
  packagePath?: string;
  adbDeviceLine?: string;
  logExcerptPath?: string;
  notes?: string;
}): AndroidNativeVerificationReport {
  return {
    reportSchemaVersion: ANDROID_NATIVE_REPORT_SCHEMA_VERSION,
    proofTarget: ANDROID_NATIVE_PROOF_TARGET,
    generatedAt: input.generatedAt,
    status: input.status ?? "incomplete",
    device: {
      adbSerial: input.adbSerial ?? "",
      model: input.model ?? "",
      androidVersion: input.androidVersion ?? "",
      apiLevel: input.apiLevel ?? "",
    },
    app: {
      packageName: input.packageName,
      versionName: input.versionName ?? "",
      versionCode: input.versionCode ?? "",
      buildType: input.buildType ?? "",
      commit: input.commit,
      packagePath: input.packagePath ?? "",
    },
    sqlite: {
      schemaVersion: ANDROID_NATIVE_REQUIRED_SQLITE_VERSION,
      pragmaUserVersion: 0,
      schemaMigrations: [],
      mapPackageColumns: [],
      absentTables: [],
      geometryRowsPopulated: false,
    },
    projectRoundTrip: {
      backendLabel: "",
      runtime: "",
      sampleProjectSaved: false,
      relaunchCompleted: false,
      listAfterRelaunch: false,
      loadedProjectId: "",
      loadedProjectName: "",
      fieldBoundaryPointCount: 0,
      obstacleCount: 0,
      surveyPointCount: 0,
      settingsMatched: false,
      deleteConfirmed: false,
    },
    zipRoundTrip: {
      exportedFilename: "",
      exportedBytes: 0,
      exportedSha256: "",
      importedProjectId: "",
      manifestJsonPresent: false,
      projectJsonPresent: false,
      manifestProjectIdMatched: false,
      manifestProjectCrsMatched: false,
      savedImportedProject: false,
    },
    osFileUi: {
      shareSheetOpened: false,
      shareSheetEvidence: "",
      shareSheetScreenshotPath: "",
      shareSheetXmlPath: "",
      documentsPickerOpened: false,
      documentsPickerEvidence: "",
      documentsPickerScreenshotPath: "",
      documentsPickerXmlPath: "",
      pushedZipPath: "",
      selectedZipFilename: "",
      selectedZipBytes: 0,
    },
    checklist: {
      cleanInstallOrUpgradePath: emptyChecklistEvidence(),
      backendPanel: emptyChecklistEvidence(),
      saveLoadDelete: emptyChecklistEvidence(),
      zipExportImport: emptyChecklistEvidence(),
      migrationEvidence: emptyChecklistEvidence(),
    },
    evidence: {
      checklistDocument: "docs/android-native-verification.md",
      adbDeviceLine: input.adbDeviceLine ?? "",
      logExcerptPath: input.logExcerptPath ?? "",
      notes: input.notes ?? "",
    },
  };
}

export function parseAndroidNativeVerificationReport(input: unknown): AndroidNativeVerificationReport {
  return AndroidNativeVerificationReportSchema.parse(input);
}

export function parseCompleteAndroidNativeVerificationReport(input: unknown): AndroidNativeVerificationReport {
  const report = parseAndroidNativeVerificationReport(input);
  const errors = androidNativeVerificationCompletionErrors(report);
  if (errors.length > 0) {
    throw new Error(`Android native verification evidence is incomplete: ${errors.join("; ")}`);
  }
  return report;
}

export function androidNativeVerificationCompletionErrors(report: AndroidNativeVerificationReport): string[] {
  const errors: string[] = [];

  if (report.status !== "pass") errors.push("status must be pass");
  for (const [label, value] of Object.entries({
    generatedAt: report.generatedAt,
    adbSerial: report.device.adbSerial,
    model: report.device.model,
    androidVersion: report.device.androidVersion,
    apiLevel: report.device.apiLevel,
    packageName: report.app.packageName,
    versionName: report.app.versionName,
    versionCode: report.app.versionCode,
    buildType: report.app.buildType,
    commit: report.app.commit,
    packagePath: report.app.packagePath,
    backendLabel: report.projectRoundTrip.backendLabel,
    runtime: report.projectRoundTrip.runtime,
    loadedProjectId: report.projectRoundTrip.loadedProjectId,
    loadedProjectName: report.projectRoundTrip.loadedProjectName,
    exportedFilename: report.zipRoundTrip.exportedFilename,
    importedProjectId: report.zipRoundTrip.importedProjectId,
    shareSheetEvidence: report.osFileUi.shareSheetEvidence,
    shareSheetScreenshotPath: report.osFileUi.shareSheetScreenshotPath,
    shareSheetXmlPath: report.osFileUi.shareSheetXmlPath,
    documentsPickerEvidence: report.osFileUi.documentsPickerEvidence,
    documentsPickerScreenshotPath: report.osFileUi.documentsPickerScreenshotPath,
    documentsPickerXmlPath: report.osFileUi.documentsPickerXmlPath,
    pushedZipPath: report.osFileUi.pushedZipPath,
    selectedZipFilename: report.osFileUi.selectedZipFilename,
    checklistDocument: report.evidence.checklistDocument,
    adbDeviceLine: report.evidence.adbDeviceLine,
    logExcerptPath: report.evidence.logExcerptPath,
  })) {
    if (value.trim().length === 0) errors.push(`${label} is required`);
  }

  if (report.projectRoundTrip.runtime !== "native") errors.push("runtime must be native");
  if (!/sqlite/i.test(report.projectRoundTrip.backendLabel)) errors.push("backendLabel must identify SQLite");
  if (report.sqlite.schemaVersion !== ANDROID_NATIVE_REQUIRED_SQLITE_VERSION) {
    errors.push(`SQLite schemaVersion must be ${ANDROID_NATIVE_REQUIRED_SQLITE_VERSION}`);
  }
  if (report.sqlite.pragmaUserVersion !== ANDROID_NATIVE_REQUIRED_SQLITE_VERSION) {
    errors.push(`PRAGMA user_version must be ${ANDROID_NATIVE_REQUIRED_SQLITE_VERSION}`);
  }

  for (const migrationId of ANDROID_NATIVE_REQUIRED_MIGRATIONS) {
    if (!report.sqlite.schemaMigrations.includes(migrationId)) errors.push(`schema migration ${migrationId} is missing`);
  }
  for (const columnName of ANDROID_NATIVE_REQUIRED_MAP_PACKAGE_COLUMNS) {
    if (!report.sqlite.mapPackageColumns.includes(columnName)) errors.push(`map_packages.${columnName} evidence is missing`);
  }
  for (const tableName of ANDROID_NATIVE_REQUIRED_ABSENT_TABLES) {
    if (!report.sqlite.absentTables.includes(tableName)) errors.push(`retired table ${tableName} absence evidence is missing`);
  }
  if (!report.sqlite.geometryRowsPopulated) errors.push("geometry rows must be populated after save");

  for (const [label, value] of Object.entries(report.projectRoundTrip)) {
    if (typeof value === "boolean" && !value) errors.push(`projectRoundTrip.${label} must be true`);
  }
  if (report.projectRoundTrip.fieldBoundaryPointCount < 3) errors.push("fieldBoundaryPointCount must be at least 3");
  if (report.projectRoundTrip.obstacleCount < 0) errors.push("obstacleCount must be nonnegative");
  if (report.projectRoundTrip.surveyPointCount < 0) errors.push("surveyPointCount must be nonnegative");

  if (report.zipRoundTrip.exportedBytes <= 0) errors.push("exportedBytes must be greater than zero");
  if (!/^[a-fA-F0-9]{64}$/.test(report.zipRoundTrip.exportedSha256)) errors.push("exportedSha256 must be a SHA-256 hex digest");
  for (const [label, value] of Object.entries(report.zipRoundTrip)) {
    if (typeof value === "boolean" && !value) errors.push(`zipRoundTrip.${label} must be true`);
  }

  if (!report.osFileUi.shareSheetOpened) errors.push("osFileUi.shareSheetOpened must be true");
  if (!report.osFileUi.documentsPickerOpened) errors.push("osFileUi.documentsPickerOpened must be true");
  if (report.osFileUi.selectedZipBytes <= 0) errors.push("osFileUi.selectedZipBytes must be greater than zero");

  for (const [label, check] of Object.entries(report.checklist)) {
    if (check.status !== "pass") errors.push(`checklist.${label}.status must be pass`);
    if (check.observedAt.trim().length === 0) errors.push(`checklist.${label}.observedAt is required`);
    if (check.evidence.trim().length === 0) errors.push(`checklist.${label}.evidence is required`);
  }

  return errors;
}

function emptyChecklistEvidence(): AndroidNativeVerificationReport["checklist"]["backendPanel"] {
  return {
    status: "not_run",
    observedAt: "",
    evidence: "",
  };
}
