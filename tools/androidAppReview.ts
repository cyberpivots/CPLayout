import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

import { captureMapLibreLogEvidence, clearAndroidLogcat, type MapLibreLogEvidence } from "./androidMapLibreLogEvidence";
import { collectAndroidToolSnapshot, readExpoAndroidPackageName, timestampForFilename, writeJsonFile } from "./androidNativeProof";
import { analyzePngPixels, type PngPixelMetrics } from "./pngMetrics";

type ReviewStatus = "pass" | "fail" | "blocked";
type ScenarioStatus = "pass" | "fail" | "blocked" | "skipped";
type Severity = "critical" | "high" | "medium" | "low";
type ScenarioId =
  | "map-workspace"
  | "map-drawers-open"
  | "map-drawers-closed"
  | "files-route"
  | "settings-route"
  | "help-route"
  | "native-maplibre-proof";

interface AndroidAppReviewOptions {
  outputDirectory: string;
  packageName: string;
  serial?: string;
  devClientUrl?: string;
  launchApp: boolean;
  waitMs: number;
  scenarios: ScenarioId[];
}

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface UiNode {
  attrs: Record<string, string>;
  rawBounds: Bounds;
  bounds: Bounds;
  rawBoundsReversed: boolean;
  text: string;
  resourceId: string;
  contentDesc: string;
  className: string;
  packageName: string;
  clickable: boolean;
  enabled: boolean;
  selected: boolean;
  width: number;
  height: number;
}

interface NodeMatcher {
  attr: "resource-id" | "text" | "content-desc" | "class";
  value: string;
  mode: "contains" | "equals" | "regex";
}

interface RequiredNode {
  label: string;
  anyOf: NodeMatcher[];
  severity: "critical" | "high";
}

interface ScenarioSpec {
  id: ScenarioId;
  label: string;
  route?: "map" | "files" | "settings" | "help";
  requiredNodes: RequiredNode[];
  requiresNativeMapLibreEnv?: boolean;
}

interface Finding {
  id: string;
  severity: Severity;
  scenarioId?: ScenarioId;
  summary: string;
  evidence: string[];
  recommendation: string;
  affectedRegion?: string;
  bounds?: Bounds;
  confidence: number;
}

interface ScenarioResult {
  id: ScenarioId;
  label: string;
  status: ScenarioStatus;
  navigationPath: string[];
  screenshot: EvidenceFile & PngPixelMetrics;
  uiXml: EvidenceFile & {
    nodeCount: number;
    clickableNodeCount: number;
    expectedNodeMatches: Record<string, boolean>;
    smallestTouchTargetPx: number | null;
    androidNavigationBarBounds: Bounds[];
    androidStatusBarBounds: Bounds[];
  };
  ocr: EvidenceFile & {
    available: boolean;
    textLength: number;
    lineCount: number;
    duplicatedVisibleLines: string[];
    notes: string;
  };
  cv: EvidenceFile & CvMetrics;
  logcat: MapLibreLogEvidence & {
    clearedBeforeLaunch?: boolean;
  };
  findings: Finding[];
}

interface EvidenceFile {
  path: string;
  sha256: string;
}

interface CvMetrics {
  available: boolean;
  method: string;
  edgeDensity: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  meanGray: number;
  stdGray: number;
  notes: string;
}

interface PanelDecision {
  reviewers: Array<{
    reviewer: string;
    weight: number;
    score: number;
    vote: "pass" | "fail" | "blocked";
    rationale: string;
  }>;
  hardVetoes: Array<{
    id: string;
    triggered: boolean;
    evidence: string[];
    boundary: string;
  }>;
  weightedScore: number;
  finalRecommendation: ReviewStatus;
  notes: string;
}

interface AndroidAppReviewReport {
  reportSchemaVersion: 1;
  reviewTarget: "android-app-review";
  generatedAt: string;
  status: ReviewStatus;
  device: {
    adbSerial: string;
    model: string;
    osVersion: string;
    apiLevel: string;
    densityDpi: number | null;
    pxPerDp: number | null;
  };
  app: {
    packageName: string;
    versionName: string;
    versionCode: string;
    buildType: string;
    commit: string;
    devClientUrl: string;
  };
  toolchain: {
    adbPath: string;
    tesseractPath: string | null;
    tesseractVersion: string;
    pythonOpenCvAvailable: boolean;
    pythonOpenCvVersion: string;
  };
  options: {
    launchApp: boolean;
    waitMs: number;
    scenarios: ScenarioId[];
  };
  boundaries: {
    offlineNoCost: true;
    noPaidKeyedServices: true;
    canonicalGeometryMutation: false;
    ocrCvAdvisoryOnly: true;
    androidNativeSqliteZipProofClaimed: false;
    rawPmtilesMbtilesNativeProofClaimed: false;
  };
  scenarioResults: ScenarioResult[];
  findings: Finding[];
  panelDecision: PanelDecision;
  notes: string;
}

const DEFAULT_OUTPUT_DIRECTORY = "reports/android-app-review";
const DEFAULT_SCENARIOS: ScenarioId[] = [
  "map-workspace",
  "map-drawers-open",
  "map-drawers-closed",
  "files-route",
  "settings-route",
  "help-route",
];

const SCENARIO_SPECS: Record<ScenarioId, ScenarioSpec> = {
  "map-workspace": {
    id: "map-workspace",
    label: "Normal map workspace",
    route: "map",
    requiredNodes: [
      required("workspace shell", "critical", [
        { attr: "resource-id", value: "workspace-screen", mode: "contains" },
        { attr: "resource-id", value: "workspace-shell", mode: "contains" },
      ]),
      required("workspace top toolbar", "high", [{ attr: "resource-id", value: "workspace-top-toolbar", mode: "contains" }]),
      required("workspace bottom status bar", "high", [{ attr: "resource-id", value: "workspace-bottom-status-bar", mode: "contains" }]),
      required("map route", "critical", [{ attr: "resource-id", value: "map-view", mode: "contains" }]),
      required("map bottom HUD drawer", "high", [
        { attr: "resource-id", value: "map-bottom-hud", mode: "contains" },
        { attr: "resource-id", value: "map-bottom-hud-toggle", mode: "contains" },
      ]),
      required("map surface", "critical", [
        { attr: "resource-id", value: "native-map-workbench", mode: "contains" },
        { attr: "resource-id", value: "native-map-workbench-map", mode: "contains" },
        { attr: "resource-id", value: "layout-map-drawing-surface", mode: "contains" },
        { attr: "content-desc", value: "Layout map drawing surface", mode: "contains" },
      ]),
    ],
  },
  "map-drawers-open": {
    id: "map-drawers-open",
    label: "Map workspace with drawers open",
    route: "map",
    requiredNodes: [
      required("map route", "critical", [{ attr: "resource-id", value: "map-view", mode: "contains" }]),
      required("workspace top toolbar", "high", [{ attr: "resource-id", value: "workspace-top-toolbar", mode: "contains" }]),
      required("workspace bottom status bar", "high", [{ attr: "resource-id", value: "workspace-bottom-status-bar", mode: "contains" }]),
      required("map bottom HUD drawer", "high", [
        { attr: "resource-id", value: "map-bottom-hud", mode: "contains" },
        { attr: "resource-id", value: "map-bottom-hud-toggle", mode: "contains" },
      ]),
      required("project drawer handle", "high", [{ attr: "resource-id", value: "left-drawer-handle", mode: "contains" }]),
      required("inspector drawer", "high", [{ attr: "resource-id", value: "inspector-drawer", mode: "contains" }]),
    ],
  },
  "map-drawers-closed": {
    id: "map-drawers-closed",
    label: "Map workspace with drawers closed",
    route: "map",
    requiredNodes: [
      required("map route", "critical", [{ attr: "resource-id", value: "map-view", mode: "contains" }]),
      required("workspace top toolbar", "high", [{ attr: "resource-id", value: "workspace-top-toolbar", mode: "contains" }]),
      required("workspace bottom status bar", "high", [{ attr: "resource-id", value: "workspace-bottom-status-bar", mode: "contains" }]),
      required("map bottom HUD drawer", "high", [
        { attr: "resource-id", value: "map-bottom-hud", mode: "contains" },
        { attr: "resource-id", value: "map-bottom-hud-toggle", mode: "contains" },
      ]),
      required("project drawer handle", "high", [{ attr: "resource-id", value: "left-drawer-handle", mode: "contains" }]),
      required("inspector drawer handle", "high", [{ attr: "resource-id", value: "right-drawer-handle", mode: "contains" }]),
    ],
  },
  "files-route": {
    id: "files-route",
    label: "Files route and ZIP controls",
    route: "files",
    requiredNodes: [
      required("files route", "critical", [
        { attr: "resource-id", value: "files-view", mode: "contains" },
        { attr: "text", value: "Files and GIS Exchange", mode: "equals" },
      ]),
      required("export ZIP action", "high", [
        { attr: "resource-id", value: "files-action-export-zip", mode: "contains" },
        { attr: "content-desc", value: "Export project ZIP", mode: "equals" },
        { attr: "text", value: "Export ZIP", mode: "equals" },
      ]),
      required("import ZIP action", "high", [
        { attr: "resource-id", value: "files-action-import-zip", mode: "contains" },
        { attr: "content-desc", value: "Import project ZIP", mode: "equals" },
        { attr: "text", value: "Import ZIP", mode: "equals" },
      ]),
    ],
  },
  "settings-route": {
    id: "settings-route",
    label: "Settings route",
    route: "settings",
    requiredNodes: [
      required("settings route", "critical", [
        { attr: "resource-id", value: "settings-view", mode: "contains" },
        { attr: "text", value: "Settings", mode: "equals" },
      ]),
      required("units and coordinates panel", "high", [{ attr: "text", value: "Units and Coordinates", mode: "equals" }]),
      required("map view settings", "high", [{ attr: "text", value: "Map View", mode: "equals" }]),
    ],
  },
  "help-route": {
    id: "help-route",
    label: "Help route",
    route: "help",
    requiredNodes: [
      required("help route", "critical", [
        { attr: "resource-id", value: "help-view", mode: "contains" },
        { attr: "text", value: "Help and Training", mode: "equals" },
      ]),
      required("Google Earth companion module", "high", [
        { attr: "resource-id", value: "help-module-google-earth", mode: "contains" },
        { attr: "text", value: "Google Earth Companion", mode: "equals" },
      ]),
      required("Android storage module", "high", [
        { attr: "resource-id", value: "help-module-android-storage", mode: "contains" },
        { attr: "text", value: "Android Storage", mode: "equals" },
      ]),
    ],
  },
  "native-maplibre-proof": {
    id: "native-maplibre-proof",
    label: "Native MapLibre proof route",
    route: "map",
    requiresNativeMapLibreEnv: true,
    requiredNodes: [
      required("native MapLibre proof panel", "critical", [{ attr: "resource-id", value: "native-maplibre-proof-panel", mode: "contains" }]),
      required("native MapLibre proof map", "critical", [{ attr: "resource-id", value: "native-maplibre-proof-map", mode: "contains" }]),
    ],
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAndroidAppReview(parseArgs(process.argv.slice(2), process.env))
    .then((result) => {
      console.log(`Android app review report written: ${result.reportPath}`);
      process.exit(result.status === "pass" ? 0 : result.status === "blocked" ? 2 : 1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export function parseArgs(rawArgs: string[], env: NodeJS.ProcessEnv = process.env): AndroidAppReviewOptions {
  const scenarios = scenarioList(valueFor(rawArgs, "--scenarios") ?? env.CPLAYOUT_ANDROID_APP_REVIEW_SCENARIOS);
  const includeMapLibreProof = env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF === "1"
    && !scenarios.includes("native-maplibre-proof");
  return {
    outputDirectory: valueFor(rawArgs, "--output-dir") ?? env.CPLAYOUT_ANDROID_APP_REVIEW_REPORT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
    packageName: valueFor(rawArgs, "--package-name") ?? env.CPLAYOUT_ANDROID_PACKAGE_NAME ?? readExpoAndroidPackageName(),
    serial: valueFor(rawArgs, "--serial") ?? env.ANDROID_SERIAL,
    devClientUrl: valueFor(rawArgs, "--dev-client-url") ?? env.CPLAYOUT_EXPO_DEV_CLIENT_URL,
    launchApp: !hasFlag(rawArgs, "--no-launch"),
    waitMs: Number(valueFor(rawArgs, "--wait-ms") ?? "15000"),
    scenarios: includeMapLibreProof ? [...scenarios, "native-maplibre-proof"] : scenarios,
  };
}

export async function runAndroidAppReview(options: AndroidAppReviewOptions): Promise<{ status: ReviewStatus; reportPath: string }> {
  const generatedAt = new Date().toISOString();
  const timestamp = timestampForFilename(generatedAt);
  mkdirSync(options.outputDirectory, { recursive: true });

  const reportPath = join(options.outputDirectory, `android-app-review-${timestamp}.json`);
  const latestPath = join(options.outputDirectory, "latest.json");
  const snapshot = collectAndroidToolSnapshot({
    packageName: options.packageName,
    outputDirectory: options.outputDirectory,
    serial: options.serial,
  });
  const toolchain = collectReviewToolchain();
  const adbPath = snapshot.commands.adb.path;
  const serial = snapshot.selectedDevice?.serial;

  if (snapshot.blocker || !adbPath || !serial || !snapshot.selectedDevice || !snapshot.installedPackage) {
    const blockedFinding = makeFinding({
      id: "android-review-blocked-adb-or-package",
      severity: "critical",
      summary: snapshot.blocker ?? "Android app review blocked before capture.",
      evidence: [snapshot.logExcerptPath ? basename(snapshot.logExcerptPath) : "adb/package snapshot"],
      recommendation: "Run npm run check:android-tools and install a native development build before running review:android-app.",
      confidence: 0.95,
    });
    const report = buildReport({
      generatedAt,
      status: "blocked",
      snapshot,
      toolchain,
      density: { densityDpi: null, pxPerDp: null },
      options,
      scenarioResults: [],
      findings: [blockedFinding],
      notes: "Blocked before Android UI evidence capture.",
    });
    writeReport(reportPath, latestPath, report);
    return { status: "blocked", reportPath };
  }

  const density = readDisplayDensity(adbPath, serial);
  reverseDevClientPorts(adbPath, serial, options.devClientUrl ?? "");
  const logcatCleared = clearAndroidLogcat(adbPath, serial);
  if (options.launchApp) {
    launchPackage(adbPath, serial, options.packageName, options.devClientUrl ?? "");
    await wait(options.waitMs);
  }

  const scenarioResults: ScenarioResult[] = [];
  for (const scenarioId of options.scenarios) {
    const spec = SCENARIO_SPECS[scenarioId];
    const result = await runScenario({
      adbPath,
      density,
      generatedAt,
      logcatCleared: scenarioResults.length === 0 ? logcatCleared : undefined,
      options,
      scenario: spec,
      serial,
      toolchain,
    });
    scenarioResults.push(result);
  }

  const findings = scenarioResults.flatMap((result) => result.findings);
  const panelDecision = buildPanelDecision({
    findings,
    scenarioResults,
    ocrCvAvailable: Boolean(toolchain.tesseractPath) || toolchain.pythonOpenCvAvailable,
  });
  const status = panelDecision.finalRecommendation;
  const report = buildReport({
    generatedAt,
    status,
    snapshot,
    toolchain,
    density,
    options,
    scenarioResults,
    findings,
    notes: status === "pass"
      ? "Android app review evidence passed hard thresholds. OCR/CV evidence remains advisory."
      : "Android app review produced failing or blocked findings. See scenarioResults and panelDecision.",
  });
  writeReport(reportPath, latestPath, report);
  return { status, reportPath };
}

async function runScenario(input: {
  adbPath: string;
  density: { densityDpi: number | null; pxPerDp: number | null };
  generatedAt: string;
  logcatCleared?: boolean;
  options: AndroidAppReviewOptions;
  scenario: ScenarioSpec;
  serial: string;
  toolchain: ReturnType<typeof collectReviewToolchain>;
}): Promise<ScenarioResult> {
  const navigationPath: string[] = [];
  const timestamp = timestampForFilename(input.generatedAt);
  const prefix = `android-app-review-${input.scenario.id}`;

  if (input.scenario.requiresNativeMapLibreEnv && process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF !== "1") {
    return skippedScenario(input.scenario, input.generatedAt, "EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1 was not supplied.");
  }

  try {
    if (input.scenario.route) {
      await navigateToRoute(input.adbPath, input.serial, input.scenario.route, navigationPath);
    }
    if (input.scenario.id === "map-drawers-open") {
      await setMapDrawerState(input.adbPath, input.serial, "left", true, navigationPath);
      await setMapDrawerState(input.adbPath, input.serial, "right", true, navigationPath);
    }
    if (input.scenario.id === "map-drawers-closed") {
      await setMapDrawerState(input.adbPath, input.serial, "left", false, navigationPath);
      await setMapDrawerState(input.adbPath, input.serial, "right", false, navigationPath);
    }
  } catch (error) {
    navigationPath.push(`navigation-error:${error instanceof Error ? error.message : String(error)}`);
  }

  const screenshot = captureScreenshot(input.adbPath, input.serial);
  const screenshotPath = join(input.options.outputDirectory, `${prefix}-${timestamp}.png`);
  writeFileSync(screenshotPath, screenshot);
  const screenshotMetrics = analyzePngPixels(screenshot);
  const screenshotEvidence = {
    path: basename(screenshotPath),
    sha256: sha256(screenshot),
    ...screenshotMetrics,
  };

  const xml = dumpUiXml(input.adbPath, input.serial);
  const xmlPath = join(input.options.outputDirectory, `${prefix}-${timestamp}.xml`);
  writeFileSync(xmlPath, xml, "utf8");
  const nodes = parseUiNodes(xml);
  const xmlAnalysis = analyzeUiXml(nodes, input.scenario, screenshotMetrics, input.density);

  const ocr = runOcr(input.toolchain.tesseractPath, screenshotPath, input.options.outputDirectory, `${prefix}-${timestamp}`);
  const cv = runCvAnalysis(screenshotPath, input.options.outputDirectory, `${prefix}-${timestamp}`);
  const logcat = captureMapLibreLogEvidence({
    adbPath: input.adbPath,
    generatedAt: input.generatedAt,
    outputDirectory: input.options.outputDirectory,
    prefix,
    serial: input.serial,
    tailLines: 2400,
  });
  const findings = evaluateScenarioEvidence({
    cv,
    logcat,
    nodes,
    ocr,
    scenario: input.scenario,
    screenshot: screenshotMetrics,
    ui: xmlAnalysis,
  });
  const status = scenarioStatus(findings);
  return {
    id: input.scenario.id,
    label: input.scenario.label,
    status,
    navigationPath,
    screenshot: screenshotEvidence,
    uiXml: {
      path: basename(xmlPath),
      sha256: sha256(xml),
      nodeCount: nodes.length,
      clickableNodeCount: nodes.filter((node) => node.clickable).length,
      expectedNodeMatches: xmlAnalysis.expectedNodeMatches,
      smallestTouchTargetPx: xmlAnalysis.smallestTouchTargetPx,
      androidNavigationBarBounds: xmlAnalysis.navigationBarBounds,
      androidStatusBarBounds: xmlAnalysis.statusBarBounds,
    },
    ocr,
    cv,
    logcat: {
      ...logcat,
      clearedBeforeLaunch: input.logcatCleared,
    },
    findings,
  };
}

function skippedScenario(scenario: ScenarioSpec, generatedAt: string, reason: string): ScenarioResult {
  const emptyPng = {
    path: "",
    sha256: "",
    width: 0,
    height: 0,
    sampleCount: 0,
    nonBlankPixelRatio: 0,
    grayMean: 0,
    grayVariance: 0,
    minGray: 0,
    maxGray: 0,
  };
  const finding = makeFinding({
    id: `android-review-${scenario.id}-skipped`,
    severity: "low",
    scenarioId: scenario.id,
    summary: `${scenario.label} skipped.`,
    evidence: [reason],
    recommendation: "Run a proof build/dev-client with the required environment flag when reviewing this scenario.",
    confidence: 0.95,
  });
  return {
    id: scenario.id,
    label: scenario.label,
    status: "skipped",
    navigationPath: [`skipped:${reason}`],
    screenshot: emptyPng,
    uiXml: {
      path: "",
      sha256: "",
      nodeCount: 0,
      clickableNodeCount: 0,
      expectedNodeMatches: {},
      smallestTouchTargetPx: null,
      androidNavigationBarBounds: [],
      androidStatusBarBounds: [],
    },
    ocr: {
      path: "",
      sha256: "",
      available: false,
      textLength: 0,
      lineCount: 0,
      duplicatedVisibleLines: [],
      notes: reason,
    },
    cv: {
      path: "",
      sha256: "",
      ...unavailableCv(reason),
    },
    logcat: {
      path: "",
      sha256: "",
      lineCount: 0,
      mapLibreLineCount: 0,
      mapLibreErrorLines: [],
      resourceUrlErrorCount: 0,
      resourceUrlErrorLines: [],
    },
    findings: [finding],
  };
}

function buildReport(input: {
  generatedAt: string;
  status: ReviewStatus;
  snapshot: ReturnType<typeof collectAndroidToolSnapshot>;
  toolchain: ReturnType<typeof collectReviewToolchain>;
  density: { densityDpi: number | null; pxPerDp: number | null };
  options: AndroidAppReviewOptions;
  scenarioResults: ScenarioResult[];
  findings: Finding[];
  notes: string;
}): AndroidAppReviewReport {
  const report: AndroidAppReviewReport = {
    reportSchemaVersion: 1,
    reviewTarget: "android-app-review",
    generatedAt: input.generatedAt,
    status: input.status,
    device: {
      adbSerial: input.snapshot.selectedDevice?.serial ?? "",
      model: input.snapshot.selectedDevice?.model ?? "",
      osVersion: input.snapshot.selectedDevice?.androidVersion ?? "",
      apiLevel: input.snapshot.selectedDevice?.apiLevel ?? "",
      densityDpi: input.density.densityDpi,
      pxPerDp: input.density.pxPerDp,
    },
    app: {
      packageName: input.options.packageName,
      versionName: input.snapshot.installedPackage?.versionName ?? "",
      versionCode: input.snapshot.installedPackage?.versionCode ?? "",
      buildType: "development-android-app-review",
      commit: input.snapshot.commit,
      devClientUrl: input.options.devClientUrl ?? "",
    },
    toolchain: input.toolchain,
    options: {
      launchApp: input.options.launchApp,
      waitMs: input.options.waitMs,
      scenarios: input.options.scenarios,
    },
    boundaries: {
      offlineNoCost: true,
      noPaidKeyedServices: true,
      canonicalGeometryMutation: false,
      ocrCvAdvisoryOnly: true,
      androidNativeSqliteZipProofClaimed: false,
      rawPmtilesMbtilesNativeProofClaimed: false,
    },
    scenarioResults: input.scenarioResults,
    findings: input.findings,
    panelDecision: buildPanelDecision({
      findings: input.findings,
      scenarioResults: input.scenarioResults,
      ocrCvAvailable: Boolean(input.toolchain.tesseractPath) || input.toolchain.pythonOpenCvAvailable,
    }),
    notes: input.notes,
  };
  const errors = validateAndroidAppReviewReport(report);
  if (errors.length > 0) {
    throw new Error(`Android app review report schema invalid: ${errors.join("; ")}`);
  }
  return report;
}

function writeReport(reportPath: string, latestPath: string, report: AndroidAppReviewReport): void {
  writeJsonFile(reportPath, report);
  writeJsonFile(latestPath, report);
}

export function validateAndroidAppReviewReport(report: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(report)) return ["report must be an object"];
  if (report.reportSchemaVersion !== 1) errors.push("reportSchemaVersion must be 1");
  if (report.reviewTarget !== "android-app-review") errors.push("reviewTarget must be android-app-review");
  if (!["pass", "fail", "blocked"].includes(String(report.status))) errors.push("status must be pass, fail, or blocked");
  if (!Array.isArray(report.scenarioResults)) errors.push("scenarioResults must be an array");
  if (!Array.isArray(report.findings)) errors.push("findings must be an array");
  if (!isRecord(report.panelDecision)) errors.push("panelDecision must be an object");
  if (!isRecord(report.boundaries)) errors.push("boundaries must be an object");
  if (isRecord(report.boundaries)) {
    if (report.boundaries.canonicalGeometryMutation !== false) errors.push("canonicalGeometryMutation must be false");
    if (report.boundaries.ocrCvAdvisoryOnly !== true) errors.push("ocrCvAdvisoryOnly must be true");
    if (report.boundaries.androidNativeSqliteZipProofClaimed !== false) errors.push("androidNativeSqliteZipProofClaimed must be false");
  }
  if (Array.isArray(report.scenarioResults)) {
    for (const [index, result] of report.scenarioResults.entries()) {
      if (!isRecord(result)) {
        errors.push(`scenarioResults[${index}] must be an object`);
        continue;
      }
      if (!["pass", "fail", "blocked", "skipped"].includes(String(result.status))) {
        errors.push(`scenarioResults[${index}].status is invalid`);
      }
      if (!isRecord(result.screenshot)) errors.push(`scenarioResults[${index}].screenshot must be an object`);
      if (!isRecord(result.uiXml)) errors.push(`scenarioResults[${index}].uiXml must be an object`);
      if (!isRecord(result.ocr)) errors.push(`scenarioResults[${index}].ocr must be an object`);
      if (!isRecord(result.cv)) errors.push(`scenarioResults[${index}].cv must be an object`);
      if (!isRecord(result.logcat)) errors.push(`scenarioResults[${index}].logcat must be an object`);
    }
  }
  if (Array.isArray(report.findings)) {
    for (const [index, finding] of report.findings.entries()) {
      if (!isRecord(finding)) {
        errors.push(`findings[${index}] must be an object`);
        continue;
      }
      if (!["critical", "high", "medium", "low"].includes(String(finding.severity))) errors.push(`findings[${index}].severity is invalid`);
      if (!Array.isArray(finding.evidence)) errors.push(`findings[${index}].evidence must be an array`);
      if (typeof finding.recommendation !== "string" || finding.recommendation.length === 0) errors.push(`findings[${index}].recommendation is required`);
    }
  }
  return errors;
}

function analyzeUiXml(
  nodes: UiNode[],
  scenario: ScenarioSpec,
  screenshot: PngPixelMetrics,
  density: { densityDpi: number | null; pxPerDp: number | null },
): {
  expectedNodeMatches: Record<string, boolean>;
  missingRequired: RequiredNode[];
  smallTouchTargets: UiNode[];
  overlappingSystemControls: UiNode[];
  overlappingClickablePairs: Array<[UiNode, UiNode]>;
  clippedNodes: UiNode[];
  duplicateLabels: string[];
  smallestTouchTargetPx: number | null;
  navigationBarBounds: Bounds[];
  statusBarBounds: Bounds[];
} {
  const expectedNodeMatches: Record<string, boolean> = {};
  const missingRequired: RequiredNode[] = [];
  for (const requiredNode of scenario.requiredNodes) {
    const matched = nodes.some((node) => requiredNode.anyOf.some((matcher) => nodeMatches(node, matcher)));
    expectedNodeMatches[requiredNode.label] = matched;
    if (!matched) missingRequired.push(requiredNode);
  }
  const minTouchPx = 48 * (density.pxPerDp ?? 1);
  const allClickableNodes = appClickableNodes(nodes);
  const clickableNodes = visibleAppClickableNodes(nodes, screenshot);
  const smallTouchTargets = clickableNodes.filter((node) => Math.min(node.width, node.height) > 0 && Math.min(node.width, node.height) < minTouchPx);
  const systemBars = systemBarBounds(nodes, screenshot);
  const overlappingSystemControls = clickableNodes.filter((node) => systemBars.some((bar) => intersectionArea(node.bounds, bar) > 0));
  const overlappingClickablePairs = overlappingPairs(clickableNodes);
  const clippedNodes = allClickableNodes.filter((node) => node.rawBoundsReversed || isClipped(node.bounds, screenshot));
  const labels = clickableNodes
    .map((node) => node.contentDesc || node.text)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const duplicateLabels = [...new Set(labels.filter((label, index) => labels.indexOf(label) !== index))].slice(0, 12);
  const smallestTouchTargetPx = clickableNodes.length > 0
    ? Math.min(...clickableNodes.map((node) => Math.min(node.width, node.height)).filter((value) => value > 0))
    : null;
  return {
    expectedNodeMatches,
    missingRequired,
    smallTouchTargets,
    overlappingSystemControls,
    overlappingClickablePairs,
    clippedNodes,
    duplicateLabels,
    smallestTouchTargetPx,
    navigationBarBounds: systemBars.filter((bar) => bar.y1 > screenshot.height / 2),
    statusBarBounds: systemBars.filter((bar) => bar.y2 <= screenshot.height / 2),
  };
}

export function evaluateScenarioEvidence(input: {
  cv: CvMetrics;
  logcat: MapLibreLogEvidence;
  nodes: UiNode[];
  ocr: ScenarioResult["ocr"];
  scenario: ScenarioSpec;
  screenshot: PngPixelMetrics;
  ui: ReturnType<typeof analyzeUiXml>;
}): Finding[] {
  const findings: Finding[] = [];
  if (input.screenshot.nonBlankPixelRatio <= 0.05 || input.screenshot.grayVariance <= 20) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-blank-screenshot`,
      severity: "critical",
      scenarioId: input.scenario.id,
      summary: "Screenshot is blank or near-uniform.",
      evidence: [
        `nonBlankPixelRatio=${input.screenshot.nonBlankPixelRatio.toFixed(4)}`,
        `grayVariance=${input.screenshot.grayVariance.toFixed(2)}`,
      ],
      recommendation: "Verify the app rendered before capture, rerun with a longer --wait-ms, and inspect the screenshot artifact.",
      confidence: 0.98,
    }));
  }
  for (const missing of input.ui.missingRequired) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-missing-${slug(missing.label)}`,
      severity: missing.severity,
      scenarioId: input.scenario.id,
      summary: `Expected UI node missing: ${missing.label}.`,
      evidence: missing.anyOf.map((matcher) => `${matcher.attr} ${matcher.mode} ${matcher.value}`),
      recommendation: "Check route navigation, React Native testID/accessibility labels, and whether the app was launched with the intended proof environment.",
      confidence: 0.9,
    }));
  }
  if (input.logcat.resourceUrlErrorCount > 0) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-maplibre-resource-url-error`,
      severity: "critical",
      scenarioId: input.scenario.id,
      summary: "MapLibre resource URL errors appeared in logcat.",
      evidence: input.logcat.resourceUrlErrorLines.slice(0, 5),
      recommendation: "Fix MapLibre TileJSON/template/local URI handling before accepting Android map runtime evidence.",
      confidence: 0.95,
    }));
  }
  for (const node of input.ui.overlappingSystemControls.slice(0, 8)) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-system-bar-overlap-${slug(node.resourceId || node.contentDesc || node.text || node.className)}`,
      severity: "high",
      scenarioId: input.scenario.id,
      summary: "Clickable control overlaps Android system bar bounds.",
      evidence: [nodeLabel(node)],
      recommendation: "Move the control above Android status/navigation safe areas or increase the route bottom gutter.",
      affectedRegion: "android-system-bar",
      bounds: node.bounds,
      confidence: 0.86,
    }));
  }
  for (const node of input.ui.smallTouchTargets.slice(0, 10)) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-small-touch-target-${slug(node.resourceId || node.contentDesc || node.text || node.className)}`,
      severity: "medium",
      scenarioId: input.scenario.id,
      summary: "Touchable control is below the 48dp-equivalent target floor.",
      evidence: [`${nodeLabel(node)} ${node.width}x${node.height}px`],
      recommendation: "Increase the hit area or padding for repeated tablet operation.",
      affectedRegion: "touch-target",
      bounds: node.bounds,
      confidence: 0.75,
    }));
  }
  for (const node of input.ui.clippedNodes.slice(0, 8)) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-clipped-clickable-${slug(node.resourceId || node.contentDesc || node.text || node.className)}`,
      severity: "medium",
      scenarioId: input.scenario.id,
      summary: "Clickable node is clipped outside the screenshot bounds.",
      evidence: [nodeLabel(node)],
      recommendation: "Confirm scroll clipping is intentional or keep the control fully visible in the route viewport.",
      affectedRegion: "viewport-edge",
      bounds: node.bounds,
      confidence: 0.74,
    }));
  }
  for (const [a, b] of input.ui.overlappingClickablePairs.slice(0, 6)) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-clickable-overlap-${slug(nodeLabel(a))}-${slug(nodeLabel(b))}`,
      severity: "medium",
      scenarioId: input.scenario.id,
      summary: "Clickable controls overlap each other.",
      evidence: [nodeLabel(a), nodeLabel(b)],
      recommendation: "Separate overlapping hit targets so UIAutomator and users can address each action predictably.",
      affectedRegion: "clickable-overlap",
      bounds: unionBounds(a.bounds, b.bounds),
      confidence: 0.72,
    }));
  }
  if (input.cv.available && input.cv.edgeDensity > 0.22) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-edge-density-high`,
      severity: "low",
      scenarioId: input.scenario.id,
      summary: "Screenshot has high CV edge density.",
      evidence: [`edgeDensity=${input.cv.edgeDensity.toFixed(4)}`],
      recommendation: "Review visual density and label clutter in the screenshot; keep CV as advisory evidence only.",
      confidence: 0.62,
    }));
  }
  if (input.ocr.available && input.ocr.textLength === 0 && input.nodes.some((node) => node.text.trim().length > 0)) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-ocr-empty-with-visible-text`,
      severity: "low",
      scenarioId: input.scenario.id,
      summary: "OCR returned no text even though UIAutomator found visible labels.",
      evidence: ["OCR textLength=0", "UIAutomator text nodes present"],
      recommendation: "Use UIAutomator as the source of truth; inspect the screenshot if text clipping is suspected.",
      confidence: 0.7,
    }));
  }
  if (input.ui.duplicateLabels.length > 0) {
    findings.push(makeFinding({
      id: `android-review-${input.scenario.id}-duplicate-labels`,
      severity: "low",
      scenarioId: input.scenario.id,
      summary: "Duplicate clickable labels were detected.",
      evidence: input.ui.duplicateLabels,
      recommendation: "Confirm duplicate labels are expected, or make accessibility labels more specific.",
      confidence: 0.58,
    }));
  }
  return dedupeFindings(findings);
}

function buildPanelDecision(input: {
  findings: Finding[];
  scenarioResults: ScenarioResult[];
  ocrCvAvailable: boolean;
}): PanelDecision {
  const hardVetoes = hardVetoesFor(input.findings, input.scenarioResults);
  const hardVetoTriggered = hardVetoes.some((veto) => veto.triggered);
  const blocked = input.scenarioResults.some((result) => result.status === "blocked");
  const critical = input.findings.filter((finding) => finding.severity === "critical").length;
  const high = input.findings.filter((finding) => finding.severity === "high").length;
  const medium = input.findings.filter((finding) => finding.severity === "medium").length;
  const low = input.findings.filter((finding) => finding.severity === "low").length;
  const reviewers = [
    reviewer("interface reviewer", 0.24, scoreFromFindings({ critical, high, medium, low }, { critical: 0.32, high: 0.18, medium: 0.003, low: 0.001 }), blocked, hardVetoTriggered, "Layout density, touch targets, drawers, HUDs, and text-fit evidence."),
    reviewer("native/runtime reviewer", 0.22, scoreFromFindings({ critical, high, medium, low }, { critical: 0.32, high: 0.16, medium: 0.002, low: 0.001 }), blocked, hardVetoTriggered, "ADB, dev-client launch, UIAutomator XML, screenshots, and logcat evidence."),
    reviewer("gis/map reviewer", 0.18, gisScore(input.findings), blocked, hardVetoTriggered, "MapLibre route, resource URL errors, attribution boundaries, and paid/keyed source vetoes."),
    reviewer("database/archive reviewer", 0.18, 1, blocked, hardVetoTriggered, "SQLite/ZIP claims remain behind the current schema-v11 native report gate."),
    reviewer("kb curator", 0.18, input.ocrCvAvailable ? 0.95 : 0.82, blocked, hardVetoTriggered, "Report durability, source-ledger boundaries, and OCR/CV advisory status."),
  ];
  const weightedScore = reviewers.reduce((sum, item) => sum + item.weight * item.score, 0);
  const finalRecommendation: ReviewStatus = blocked
    ? "blocked"
    : hardVetoTriggered || critical > 0 || high > 0 || weightedScore < 0.72
      ? "fail"
      : "pass";
  return {
    reviewers,
    hardVetoes,
    weightedScore,
    finalRecommendation,
    notes: "Hard vetoes override weighted reviewer scores. OCR/CV evidence is advisory and paired with screenshot/XML evidence.",
  };
}

function hardVetoesFor(findings: Finding[], scenarioResults: ScenarioResult[]): PanelDecision["hardVetoes"] {
  const combinedText = JSON.stringify({ findings, scenarioResults });
  const paidKeyedEvidence = combinedText.match(/api[_-]?key|access[_-]?token|mapbox\.com|googleapis\.com|AIza[0-9A-Za-z_-]+/gi) ?? [];
  const mapLibreResourceErrors = findings.filter((finding) => finding.id.includes("maplibre-resource-url-error"));
  return [
    {
      id: "paid-keyed-api",
      triggered: paidKeyedEvidence.length > 0,
      evidence: [...new Set(paidKeyedEvidence)].slice(0, 8),
      boundary: "No Google Maps, paid Mapbox APIs, Esri paid services, hidden keys, paid imagery, or paid cloud backends.",
    },
    {
      id: "automatic-canonical-xy-mutation",
      triggered: false,
      evidence: [],
      boundary: "Screenshots, OCR, CV, and UIAutomator evidence are review artifacts only and never mutate projected/local XY geometry.",
    },
    {
      id: "native-production-claim-without-schema10-proof",
      triggered: false,
      evidence: [],
      boundary: "Native SQLite and ZIP sharing production claims require a separately completed current-schema Android native verification report.",
    },
    {
      id: "raw-pmtiles-mbtiles-native-proof-claim",
      triggered: false,
      evidence: [],
      boundary: "TileJSON/template evidence does not prove raw PMTiles/MBTiles native archive rendering.",
    },
    {
      id: "maplibre-resource-url-error",
      triggered: mapLibreResourceErrors.length > 0,
      evidence: mapLibreResourceErrors.flatMap((finding) => finding.evidence).slice(0, 8),
      boundary: "MapLibre resource URL errors fail Android map runtime review until fixed.",
    },
  ];
}

function reviewer(
  reviewerName: string,
  weight: number,
  score: number,
  blocked: boolean,
  hardVetoTriggered: boolean,
  rationale: string,
): PanelDecision["reviewers"][number] {
  const vote = blocked ? "blocked" : hardVetoTriggered || score < 0.72 ? "fail" : "pass";
  return {
    reviewer: reviewerName,
    weight,
    score: Number(score.toFixed(3)),
    vote,
    rationale,
  };
}

function gisScore(findings: Finding[]): number {
  const mapLibreCritical = findings.some((finding) => finding.id.includes("maplibre-resource-url-error"));
  if (mapLibreCritical) return 0.2;
  return scoreFromFindings({
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  }, { critical: 0.22, high: 0.12, medium: 0.002, low: 0.001 });
}

function scoreFromFindings(
  counts: { critical: number; high: number; medium: number; low: number },
  weights: { critical: number; high: number; medium: number; low: number },
): number {
  return Math.max(0, 1 - counts.critical * weights.critical - counts.high * weights.high - counts.medium * weights.medium - counts.low * weights.low);
}

function scenarioStatus(findings: Finding[]): ScenarioStatus {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) return "fail";
  return "pass";
}

function collectReviewToolchain(): {
  adbPath: string;
  tesseractPath: string | null;
  tesseractVersion: string;
  pythonOpenCvAvailable: boolean;
  pythonOpenCvVersion: string;
} {
  const adbPath = commandPath("adb") ?? "";
  const tesseractPath = commandPath("tesseract");
  const tesseractVersion = tesseractPath ? firstLine(spawnSync(tesseractPath, ["--version"], { encoding: "utf8" }).stdout) : "";
  const cv = spawnSync("python3", ["-c", "import cv2; print(cv2.__version__)"], { encoding: "utf8" });
  return {
    adbPath,
    tesseractPath,
    tesseractVersion,
    pythonOpenCvAvailable: cv.status === 0,
    pythonOpenCvVersion: cv.status === 0 ? cv.stdout.trim() : "",
  };
}

function runOcr(tesseractPath: string | null, screenshotPath: string, outputDirectory: string, prefix: string): ScenarioResult["ocr"] {
  if (!tesseractPath) {
    return {
      path: "",
      sha256: "",
      available: false,
      textLength: 0,
      lineCount: 0,
      duplicatedVisibleLines: [],
      notes: "tesseract was not found on PATH.",
    };
  }
  const result = spawnSync(tesseractPath, [screenshotPath, "-", "--psm", "6"], {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
  const text = result.status === 0 ? result.stdout : "";
  const notes = result.status === 0 ? "" : String(result.stderr ?? "tesseract failed");
  const outputPath = join(outputDirectory, `${prefix}-ocr.txt`);
  writeFileSync(outputPath, text, "utf8");
  const lines = ocrLines(text);
  const duplicateLines = [...new Set(lines.filter((line, index) => lines.indexOf(line) !== index))].slice(0, 12);
  return {
    path: basename(outputPath),
    sha256: sha256(text),
    available: result.status === 0,
    textLength: text.trim().length,
    lineCount: lines.length,
    duplicatedVisibleLines: duplicateLines,
    notes,
  };
}

function runCvAnalysis(screenshotPath: string, outputDirectory: string, prefix: string): EvidenceFile & CvMetrics {
  const script = [
    "import json, sys",
    "import cv2 as cv",
    "import numpy as np",
    "img = cv.imread(sys.argv[1], cv.IMREAD_GRAYSCALE)",
    "assert img is not None",
    "edges = cv.Canny(img, 80, 160)",
    "edge_density = float(np.count_nonzero(edges) / edges.size)",
    "dark = float(np.count_nonzero(img < 24) / img.size)",
    "bright = float(np.count_nonzero(img > 232) / img.size)",
    "print(json.dumps({'available': True, 'method': 'opencv-canny-threshold-summary', 'edgeDensity': edge_density, 'darkPixelRatio': dark, 'brightPixelRatio': bright, 'meanGray': float(np.mean(img)), 'stdGray': float(np.std(img)), 'notes': 'OpenCV Canny/threshold summary; advisory only.'}))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script, screenshotPath], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const metrics = result.status === 0 ? parseCvMetrics(result.stdout) : unavailableCv(String(result.stderr ?? "OpenCV analysis failed."));
  const outputPath = join(outputDirectory, `${prefix}-cv.json`);
  const json = `${JSON.stringify(metrics, null, 2)}\n`;
  writeFileSync(outputPath, json, "utf8");
  return {
    path: basename(outputPath),
    sha256: sha256(json),
    ...metrics,
  };
}

function parseCvMetrics(raw: string): CvMetrics {
  try {
    const value = JSON.parse(raw) as CvMetrics;
    return {
      available: Boolean(value.available),
      method: String(value.method ?? "opencv-canny-threshold-summary"),
      edgeDensity: numberOrZero(value.edgeDensity),
      darkPixelRatio: numberOrZero(value.darkPixelRatio),
      brightPixelRatio: numberOrZero(value.brightPixelRatio),
      meanGray: numberOrZero(value.meanGray),
      stdGray: numberOrZero(value.stdGray),
      notes: String(value.notes ?? ""),
    };
  } catch {
    return unavailableCv("OpenCV analysis did not return parseable JSON.");
  }
}

function unavailableCv(notes: string): CvMetrics {
  return {
    available: false,
    method: "unavailable",
    edgeDensity: 0,
    darkPixelRatio: 0,
    brightPixelRatio: 0,
    meanGray: 0,
    stdGray: 0,
    notes,
  };
}

async function navigateToRoute(
  adbPath: string,
  serial: string,
  route: NonNullable<ScenarioSpec["route"]>,
  navigationPath: string[],
): Promise<void> {
  const targetResourceId = route === "map" ? "map-view" : `${route}-view`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const xml = dumpUiXml(adbPath, serial);
    if (xml.includes(targetResourceId)) {
      navigationPath.push(`route:${route}:already-visible`);
      return;
    }
    const directTapped = tapNodeFromXml(adbPath, serial, xml, [{ attr: "resource-id", value: `workspace-nav-${route}`, mode: "contains" }]);
    if (directTapped) {
      navigationPath.push(`tap:workspace-nav-${route}`);
      await wait(1000);
      continue;
    }

    if (tapRouteCommandItem(adbPath, serial, xml, route)) {
      navigationPath.push(`tap:command-route-${route}`);
      await wait(1000);
      continue;
    }

    const commandTapped = tapNodeFromXml(adbPath, serial, xml, routeCommandMenuMatchers(route));
    if (commandTapped) {
      navigationPath.push(`tap:${routeCommandMenuId(route)}`);
      await wait(500);
      const menuXml = dumpUiXml(adbPath, serial);
      if (tapRouteCommandItem(adbPath, serial, menuXml, route)) {
        navigationPath.push(`tap:command-route-${route}`);
      } else {
        navigationPath.push(`miss:command-route-${route}`);
      }
      await wait(1000);
      continue;
    }

    if (attempt === 0) navigationPath.push(`route:${route}:waiting-for-target`);
    await wait(1000);
  }
}

function tapRouteCommandItem(
  adbPath: string,
  serial: string,
  xml: string,
  route: NonNullable<ScenarioSpec["route"]>,
): boolean {
  return tapNodeFromXml(adbPath, serial, xml, [{ attr: "resource-id", value: routeCommandItemId(route), mode: "contains" }]);
}

function routeCommandMenuMatchers(route: NonNullable<ScenarioSpec["route"]>): NodeMatcher[] {
  return [{ attr: "resource-id", value: routeCommandMenuId(route), mode: "contains" }];
}

function routeCommandMenuId(route: NonNullable<ScenarioSpec["route"]>): string {
  if (route === "settings") return "command-menu-settings";
  if (route === "help") return "command-menu-help";
  return "command-menu-view";
}

function routeCommandItemId(route: NonNullable<ScenarioSpec["route"]>): string {
  if (route === "settings") return "command-settings-open";
  if (route === "help") return "command-help-open";
  return `command-view-${route}`;
}

async function setMapDrawerState(
  adbPath: string,
  serial: string,
  side: "left" | "right",
  open: boolean,
  navigationPath: string[],
): Promise<void> {
  const handleId = side === "left" ? "left-drawer-handle" : "right-drawer-handle";
  const openText = side === "left" ? "Open project drawer" : "Open map inspector";
  const closeText = side === "left" ? "Collapse project drawer" : "Collapse Inspector";
  const alternateCloseText = side === "left" ? "Collapse Project Drawer" : "Collapse map inspector";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const xml = dumpUiXml(adbPath, serial);
    const node = findNode(xml, [{ attr: "resource-id", value: handleId, mode: "contains" }]);
    if (!node) return;
    const desc = node.contentDesc || node.text;
    if (open && !/open/i.test(desc)) {
      navigationPath.push(`${side}-drawer:already-open`);
      return;
    }
    if (!open && !/collapse/i.test(desc)) {
      navigationPath.push(`${side}-drawer:already-closed`);
      return;
    }
    tapNodeFromXml(adbPath, serial, xml, [
      { attr: "resource-id", value: handleId, mode: "contains" },
      { attr: "content-desc", value: open ? openText : closeText, mode: "equals" },
      { attr: "content-desc", value: alternateCloseText, mode: "equals" },
    ]);
    navigationPath.push(`${side}-drawer:${open ? "open" : "close"}`);
    await wait(900);
  }
}

function tapNodeFromXml(adbPath: string, serial: string, xml: string, matchers: NodeMatcher[]): boolean {
  const node = findNode(xml, matchers);
  if (!node) return false;
  const x = Math.round((node.bounds.x1 + node.bounds.x2) / 2);
  const y = Math.round((node.bounds.y1 + node.bounds.y2) / 2);
  runAdb(adbPath, ["-s", serial, "shell", "input", "tap", String(x), String(y)], "text", false);
  return true;
}

function findNode(xml: string, matchers: NodeMatcher[]): UiNode | null {
  return parseUiNodes(xml).find((node) => matchers.some((matcher) => nodeMatches(node, matcher))) ?? null;
}

export function parseUiNodes(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  for (const tagMatch of xml.matchAll(/<node\b[^>]*>/g)) {
    const attrs = parseXmlAttrs(tagMatch[0]);
    const bounds = parseBounds(attrs.bounds);
    if (!bounds) continue;
    const normalized = normalizeBounds(bounds);
    nodes.push({
      attrs,
      rawBounds: bounds,
      bounds: normalized,
      rawBoundsReversed: bounds.x2 < bounds.x1 || bounds.y2 < bounds.y1,
      text: decodeXml(attrs.text ?? ""),
      resourceId: decodeXml(attrs["resource-id"] ?? ""),
      contentDesc: decodeXml(attrs["content-desc"] ?? ""),
      className: decodeXml(attrs.class ?? ""),
      packageName: decodeXml(attrs.package ?? ""),
      clickable: attrs.clickable === "true",
      enabled: attrs.enabled !== "false",
      selected: attrs.selected === "true",
      width: Math.max(0, normalized.x2 - normalized.x1),
      height: Math.max(0, normalized.y2 - normalized.y1),
    });
  }
  return nodes;
}

function parseXmlAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function parseBounds(value: string | undefined): Bounds | null {
  const match = value?.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (!match) return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function nodeMatches(node: UiNode, matcher: NodeMatcher): boolean {
  const value = matcher.attr === "resource-id"
    ? node.resourceId
    : matcher.attr === "content-desc"
      ? node.contentDesc
      : matcher.attr === "class"
        ? node.className
        : node.text;
  if (matcher.mode === "equals") return value === matcher.value;
  if (matcher.mode === "regex") return new RegExp(matcher.value, "i").test(value);
  return value.includes(matcher.value);
}

function visibleAppClickableNodes(nodes: UiNode[], screenshot: PngPixelMetrics): UiNode[] {
  return appClickableNodes(nodes).filter((node) =>
    !node.rawBoundsReversed
    && !isClipped(node.bounds, screenshot)
    && node.bounds.x2 > 0
    && node.bounds.y2 > 0
    && node.bounds.x1 < screenshot.width
    && node.bounds.y1 < screenshot.height
  );
}

function appClickableNodes(nodes: UiNode[]): UiNode[] {
  return nodes.filter((node) =>
    node.clickable
    && node.enabled
    && node.packageName !== "android"
    && !node.resourceId.includes("navigationBarBackground")
    && !node.resourceId.includes("statusBarBackground")
    && node.width > 0
    && node.height > 0
  );
}

function systemBarBounds(nodes: UiNode[], screenshot: PngPixelMetrics): Bounds[] {
  const bars = nodes
    .filter((node) => /navigationBarBackground|statusBarBackground/i.test(node.resourceId))
    .map((node) => node.bounds);
  if (bars.length > 0) return bars;
  return [{ x1: 0, y1: Math.max(0, screenshot.height - 1), x2: screenshot.width, y2: screenshot.height }];
}

function overlappingPairs(nodes: UiNode[]): Array<[UiNode, UiNode]> {
  const pairs: Array<[UiNode, UiNode]> = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const overlap = intersectionArea(a.bounds, b.bounds);
      if (overlap <= 0) continue;
      const smaller = Math.min(area(a.bounds), area(b.bounds));
      if (smaller > 0 && overlap / smaller > 0.45) pairs.push([a, b]);
    }
  }
  return pairs;
}

function isClipped(bounds: Bounds, screenshot: PngPixelMetrics): boolean {
  return bounds.x1 < 0 || bounds.y1 < 0 || bounds.x2 > screenshot.width || bounds.y2 > screenshot.height;
}

function required(label: string, severity: "critical" | "high", anyOf: NodeMatcher[]): RequiredNode {
  return { label, severity, anyOf };
}

function makeFinding(input: {
  id: string;
  severity: Severity;
  scenarioId?: ScenarioId;
  summary: string;
  evidence: string[];
  recommendation: string;
  affectedRegion?: string;
  bounds?: Bounds;
  confidence: number;
}): Finding {
  return input;
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.id}:${JSON.stringify(finding.bounds ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readDisplayDensity(adbPath: string, serial: string): { densityDpi: number | null; pxPerDp: number | null } {
  const output = runAdb(adbPath, ["-s", serial, "shell", "wm", "density"], "text", false);
  const match = typeof output === "string" ? output.match(/(?:Physical|Override) density:\s*(\d+)/i) : null;
  const densityDpi = match ? Number(match[1]) : null;
  return {
    densityDpi,
    pxPerDp: densityDpi ? densityDpi / 160 : null,
  };
}

function reverseDevClientPorts(adbPath: string, serial: string, devClientUrl: string): void {
  for (const port of localhostPortsFromText(devClientUrl)) {
    runAdb(adbPath, ["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`], "text", false);
  }
}

function launchPackage(adbPath: string, serial: string, packageName: string, devClientUrl: string): void {
  if (devClientUrl) {
    const launched = runAdb(adbPath, ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", devClientUrl, packageName], "text", false);
    if (typeof launched === "string" && !/Error|Exception|not exist|does not exist/i.test(launched)) return;
  }
  const activity = runAdb(adbPath, ["-s", serial, "shell", "am", "start", "-n", `${packageName}/.MainActivity`], "text", false);
  if (typeof activity === "string" && /Error|Exception|not exist|does not exist/i.test(activity)) {
    runAdb(adbPath, ["-s", serial, "shell", "monkey", "-p", packageName, "1"], "text", false);
  }
}

function dumpUiXml(adbPath: string, serial: string): string {
  const remotePath = "/sdcard/window-cplayout-app-review.xml";
  runAdb(adbPath, ["-s", serial, "shell", "uiautomator", "dump", remotePath], "text", false);
  const xml = runAdb(adbPath, ["-s", serial, "exec-out", "cat", remotePath], "text", false);
  runAdb(adbPath, ["-s", serial, "shell", "rm", "-f", remotePath], "text", false);
  return typeof xml === "string" ? xml : "";
}

function captureScreenshot(adbPath: string, serial: string): Buffer {
  return runAdb(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], "buffer", true);
}

function runAdb(adbPath: string, args: string[], output: "text", throwOnFailure?: boolean): string;
function runAdb(adbPath: string, args: string[], output: "buffer", throwOnFailure?: boolean): Buffer;
function runAdb(adbPath: string, args: string[], output: "text" | "buffer" = "text", throwOnFailure = true): string | Buffer {
  const result = spawnSync(adbPath, args, {
    encoding: output === "text" ? "utf8" : undefined,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (throwOnFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`adb ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}: ${stderr}`);
  }
  return output === "text" ? String(result.stdout ?? "") : Buffer.from(result.stdout as Buffer);
}

function scenarioList(value: string | undefined): ScenarioId[] {
  if (!value || value.trim().length === 0) return [...DEFAULT_SCENARIOS];
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  const invalid = parsed.filter((item) => !(item in SCENARIO_SPECS));
  if (invalid.length > 0) throw new Error(`Unknown Android app review scenario(s): ${invalid.join(", ")}`);
  return parsed as ScenarioId[];
}

function localhostPortsFromText(value: string): number[] {
  const ports = new Set<number>();
  for (const text of [value, decodeUrlComponent(value)]) {
    for (const match of text.matchAll(/(?:127\.0\.0\.1|localhost):(\d{2,5})/g)) {
      const port = Number(match[1]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port);
    }
  }
  return [...ports];
}

function commandPath(name: string): string | null {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  const path = result.status === 0 ? result.stdout.trim() : "";
  return path.length > 0 ? path : null;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() ?? "";
}

function ocrLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 1);
}

function nodeLabel(node: UiNode): string {
  return [
    node.resourceId ? `resource-id=${node.resourceId}` : "",
    node.contentDesc ? `content-desc=${node.contentDesc}` : "",
    node.text ? `text=${node.text}` : "",
    `${node.width}x${node.height}`,
  ].filter(Boolean).join(" ");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeBounds(bounds: Bounds): Bounds {
  return {
    x1: Math.min(bounds.x1, bounds.x2),
    y1: Math.min(bounds.y1, bounds.y2),
    x2: Math.max(bounds.x1, bounds.x2),
    y2: Math.max(bounds.y1, bounds.y2),
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

function intersectionArea(a: Bounds, b: Bounds): number {
  const xOverlap = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const yOverlap = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return xOverlap * yOverlap;
}

function area(bounds: Bounds): number {
  return Math.max(0, bounds.x2 - bounds.x1) * Math.max(0, bounds.y2 - bounds.y1);
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "node";
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function hasFlag(rawArgs: string[], name: string): boolean {
  return rawArgs.includes(name);
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
