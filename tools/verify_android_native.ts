import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sampleProject, type PivotProject } from "@cplayout/core";
import { evaluateLayout, exportScenarioGeoJson } from "@cplayout/geometry";
import {
  ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER,
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  parseCompleteAndroidNativeVerificationReport,
} from "@cplayout/project-store";
import {
  collectAndroidToolSnapshot,
  readExpoAndroidPackageName,
  reportFromSnapshot,
  timestampForFilename,
  writeJsonFile,
} from "./androidNativeProof";

const args = process.argv.slice(2);
const reportArgIndex = args.indexOf("--report");
const collectMode = args.includes("--collect");
const outputDirectory = valueFor(args, "--output-dir") ?? "reports/android-native-verification";

if (reportArgIndex >= 0) {
  const reportPath = args[reportArgIndex + 1];
  if (!reportPath) {
    console.error("Usage: npm run verify:android-native -- --report <report.json>");
    process.exit(1);
  }
  try {
    parseCompleteAndroidNativeVerificationReport(JSON.parse(readFileSync(reportPath, "utf8")));
    console.log(`Android native verification report complete: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`blocked: Android native checklist evidence incomplete in ${reportPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (collectMode) {
  collectAndroidNativeProof(args)
    .then(({ reportPath, status }) => {
      console.log(`Android native collect report written: ${reportPath}`);
      process.exit(status === "pass" ? 0 : 1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
} else {
  const packageName = readExpoAndroidPackageName();
  const snapshot = collectAndroidToolSnapshot({ packageName, outputDirectory, serial: valueFor(args, "--serial") });
  const report = reportFromSnapshot(snapshot);
  const reportPath = join(
    outputDirectory,
    `android-native-verification-${timestampForFilename(snapshot.generatedAt)}.json`,
  );
  writeJsonFile(reportPath, report);

  if (snapshot.blocker) {
    console.error(snapshot.blocker);
    console.error(`Native verification report written: ${reportPath}`);
    process.exit(1);
  }

  console.error("blocked: Android native checklist evidence incomplete; run docs/android-native-verification.md on the detected built app and validate the completed report with:");
  console.error(`npm run verify:android-native -- --report ${reportPath}`);
  console.error(`Native verification report written: ${reportPath}`);
  process.exit(1);
}

async function collectAndroidNativeProof(rawArgs: string[]): Promise<{ reportPath: string; status: string }> {
  const packageName = valueFor(rawArgs, "--package-name") ?? process.env.CPLAYOUT_ANDROID_PACKAGE_NAME ?? readExpoAndroidPackageName();
  const waitMs = Number(valueFor(rawArgs, "--wait-ms") ?? "30000");
  const devClientUrl = valueFor(rawArgs, "--dev-client-url") ?? process.env.CPLAYOUT_EXPO_DEV_CLIENT_URL ?? "";
  const serial = valueFor(rawArgs, "--serial") ?? process.env.ANDROID_SERIAL;
  mkdirSync(outputDirectory, { recursive: true });

  const snapshot = collectAndroidToolSnapshot({ packageName, outputDirectory, serial });
  const baseReport = reportFromSnapshot(snapshot);
  const reportPath = join(
    outputDirectory,
    `android-native-verification-${timestampForFilename(snapshot.generatedAt)}.json`,
  );

  if (snapshot.blocker || !snapshot.selectedDevice || !snapshot.commands.adb.path) {
    writeJsonFile(reportPath, baseReport);
    return { reportPath, status: baseReport.status };
  }

  const adbPath = snapshot.commands.adb.path;
  const adbSerial = snapshot.selectedDevice.serial;
  runAdb(adbPath, ["-s", adbSerial, "logcat", "-c"], "text", false);
  reverseDevClientPorts(adbPath, adbSerial, devClientUrl);
  launchPackage(adbPath, adbSerial, packageName, devClientUrl);
  const inAppProof = await waitForInAppProof(adbPath, adbSerial, waitMs);
  const osFileUiNotes: string[] = [];
  let osFileUi = failedOsFileUiEvidence({
    reason: "OS file UI automation did not run.",
    outputDirectory,
    generatedAt: snapshot.generatedAt,
  });
  try {
    osFileUi = await collectOsFileUiEvidence({
      adbPath,
      serial: adbSerial,
      packageName,
      outputDirectory,
      generatedAt: snapshot.generatedAt,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    osFileUiNotes.push(`OS file UI automation error: ${reason}`);
    osFileUi = captureFailedOsFileUiEvidence({
      adbPath,
      serial: adbSerial,
      outputDirectory,
      generatedAt: snapshot.generatedAt,
      reason,
    });
  }
  const logExcerptPath = writeCollectLogExcerpt(adbPath, adbSerial, outputDirectory, snapshot.generatedAt);

  const report = {
    ...baseReport,
    generatedAt: inAppProof?.generatedAt ?? baseReport.generatedAt,
    status: inAppProof?.status === "pass" && osFileUi.shareSheetOpened && osFileUi.documentsPickerOpened ? "pass" : "fail",
    sqlite: inAppProof?.sqlite ?? baseReport.sqlite,
    projectRoundTrip: inAppProof?.projectRoundTrip ?? baseReport.projectRoundTrip,
    zipRoundTrip: inAppProof?.zipRoundTrip ?? baseReport.zipRoundTrip,
    osFileUi,
    checklist: inAppProof?.checklist
      ? {
        ...inAppProof.checklist,
        zipExportImport: {
          ...inAppProof.checklist.zipExportImport,
          evidence: `${inAppProof.checklist.zipExportImport.evidence} Android share sheet and DocumentsUI picker evidence captured by adb/UIAutomator.`,
        },
      }
      : baseReport.checklist,
    evidence: {
      ...baseReport.evidence,
      logExcerptPath,
      notes: [
        inAppProof ? "In-app native SQLite/archive proof marker was collected from logcat." : "In-app native SQLite/archive proof marker was not found in logcat.",
        osFileUi.shareSheetOpened ? "OS share-sheet evidence captured." : "OS share-sheet evidence missing.",
        osFileUi.documentsPickerOpened ? "DocumentsUI picker evidence captured." : "DocumentsUI picker evidence missing.",
        typeof inAppProof?.error === "string" ? `In-app proof error: ${inAppProof.error}` : "",
        ...osFileUiNotes,
      ].filter(Boolean).join(" "),
    },
  };

  try {
    parseCompleteAndroidNativeVerificationReport(report);
  } catch (error) {
    report.status = "fail";
    report.evidence.notes = `${report.evidence.notes} Completion parser: ${error instanceof Error ? error.message : String(error)}`;
  }

  writeJsonFile(reportPath, report);
  return { reportPath, status: report.status };
}

interface InAppProofPayload {
  generatedAt?: string;
  status?: string;
  error?: string;
  sqlite?: unknown;
  projectRoundTrip?: unknown;
  zipRoundTrip?: unknown;
  checklist?: {
    cleanInstallOrUpgradePath: unknown;
    backendPanel: unknown;
    saveLoadDelete: unknown;
    zipExportImport: { evidence?: string };
    migrationEvidence: unknown;
  };
}

function captureFailedOsFileUiEvidence(options: {
  adbPath: string;
  serial: string;
  outputDirectory: string;
  generatedAt: string;
  reason: string;
}) {
  const timestamp = timestampForFilename(options.generatedAt);
  const failureXmlPath = join(options.outputDirectory, `android-os-file-ui-failure-${timestamp}.xml`);
  const failureScreenshotPath = join(options.outputDirectory, `android-os-file-ui-failure-${timestamp}.png`);
  writeFileSync(failureXmlPath, dumpUiXml(options.adbPath, options.serial), "utf8");
  captureScreenshot(options.adbPath, options.serial, failureScreenshotPath);
  return failedOsFileUiEvidence({
    reason: options.reason,
    outputDirectory: options.outputDirectory,
    generatedAt: options.generatedAt,
    xmlPath: failureXmlPath,
    screenshotPath: failureScreenshotPath,
  });
}

function failedOsFileUiEvidence(options: {
  reason: string;
  outputDirectory: string;
  generatedAt: string;
  xmlPath?: string;
  screenshotPath?: string;
}) {
  const timestamp = timestampForFilename(options.generatedAt);
  const xmlPath = options.xmlPath ?? join(options.outputDirectory, `android-os-file-ui-not-run-${timestamp}.xml`);
  const screenshotPath = options.screenshotPath ?? join(options.outputDirectory, `android-os-file-ui-not-run-${timestamp}.png`);
  const filename = "cplayout-android-native-proof-import.center-pivot.zip";
  return {
    shareSheetOpened: false,
    shareSheetEvidence: `Android resolver/share sheet proof was not completed. ${options.reason}`,
    shareSheetScreenshotPath: screenshotPath,
    shareSheetXmlPath: xmlPath,
    documentsPickerOpened: false,
    documentsPickerEvidence: `Android DocumentsUI picker proof was not completed. ${options.reason}`,
    documentsPickerScreenshotPath: screenshotPath,
    documentsPickerXmlPath: xmlPath,
    pushedZipPath: `/sdcard/Download/${filename}`,
    selectedZipFilename: filename,
    selectedZipBytes: 0,
  };
}

interface UiNode {
  attrs: Record<string, string>;
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

async function collectOsFileUiEvidence(options: {
  adbPath: string;
  serial: string;
  packageName: string;
  outputDirectory: string;
  generatedAt: string;
}) {
  const zip = createPickerProofZip(options.outputDirectory);
  const pushedZipPath = `/sdcard/Download/${zip.filename}`;
  runAdb(options.adbPath, ["-s", options.serial, "push", zip.localPath, pushedZipPath], "text");

  await navigateToFiles(options.adbPath, options.serial);
  await tapFirstUiNode(options.adbPath, options.serial, [
    { attr: "resource-id", value: "files-action-export-zip", mode: "contains" },
    { attr: "content-desc", value: "Export project ZIP", mode: "equals" },
    { attr: "text", value: "Export ZIP", mode: "equals" },
  ]);
  const shareXml = await waitForUiXml(options.adbPath, options.serial, (xml) => isShareSheetXml(xml, options.packageName), 8000);
  const shareXmlPath = join(options.outputDirectory, `android-share-sheet-${timestampForFilename(options.generatedAt)}.xml`);
  const shareScreenshotPath = join(options.outputDirectory, `android-share-sheet-${timestampForFilename(options.generatedAt)}.png`);
  writeFileSync(shareXmlPath, shareXml, "utf8");
  captureScreenshot(options.adbPath, options.serial, shareScreenshotPath);
  const shareSheetOpened = isShareSheetXml(shareXml, options.packageName);
  runAdb(options.adbPath, ["-s", options.serial, "shell", "input", "keyevent", "KEYCODE_BACK"], "text", false);
  await wait(900);

  await navigateToFiles(options.adbPath, options.serial);
  await tapFirstUiNode(options.adbPath, options.serial, [
    { attr: "resource-id", value: "files-action-import-zip", mode: "contains" },
    { attr: "content-desc", value: "Import project ZIP", mode: "equals" },
    { attr: "text", value: "Import ZIP", mode: "equals" },
  ]);
  let pickerXml = await waitForUiXml(options.adbPath, options.serial, isDocumentsPickerXml, 10000);
  let tappedZip = tapNodeFromXml(options.adbPath, options.serial, pickerXml, [
    { attr: "text", value: zip.filename, mode: "equals" },
    { attr: "text", value: basename(zip.filename, ".zip"), mode: "contains" },
    { attr: "content-desc", value: zip.filename, mode: "contains" },
  ]);
  if (!tappedZip) {
    tapNodeFromXml(options.adbPath, options.serial, pickerXml, [
      { attr: "text", value: "Downloads", mode: "equals" },
      { attr: "content-desc", value: "Downloads", mode: "contains" },
    ]);
    await wait(1200);
    pickerXml = dumpUiXml(options.adbPath, options.serial);
    tappedZip = tapNodeFromXml(options.adbPath, options.serial, pickerXml, [
      { attr: "text", value: zip.filename, mode: "equals" },
      { attr: "text", value: basename(zip.filename, ".zip"), mode: "contains" },
      { attr: "content-desc", value: zip.filename, mode: "contains" },
    ]);
  }
  const pickerXmlPath = join(options.outputDirectory, `android-documents-picker-${timestampForFilename(options.generatedAt)}.xml`);
  const pickerScreenshotPath = join(options.outputDirectory, `android-documents-picker-${timestampForFilename(options.generatedAt)}.png`);
  writeFileSync(pickerXmlPath, pickerXml, "utf8");
  captureScreenshot(options.adbPath, options.serial, pickerScreenshotPath);

  return {
    shareSheetOpened,
    shareSheetEvidence: shareSheetOpened
      ? "Android resolver/share sheet opened after tapping the CPLayout Export project ZIP action."
      : "Android resolver/share sheet was not detected after tapping Export project ZIP.",
    shareSheetScreenshotPath: shareScreenshotPath,
    shareSheetXmlPath: shareXmlPath,
    documentsPickerOpened: isDocumentsPickerXml(pickerXml) && tappedZip,
    documentsPickerEvidence: tappedZip
      ? `Android DocumentsUI picker opened and selected ${zip.filename} from device Download storage.`
      : "Android DocumentsUI picker did not expose the pushed ZIP file for selection.",
    documentsPickerScreenshotPath: pickerScreenshotPath,
    documentsPickerXmlPath: pickerXmlPath,
    pushedZipPath,
    selectedZipFilename: tappedZip ? zip.filename : "",
    selectedZipBytes: tappedZip ? zip.bytes : 0,
  };
}

async function navigateToFiles(adbPath: string, serial: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const xml = dumpUiXml(adbPath, serial);
    if (xml.includes("files-view") || xml.includes("Project Files")) return;
    if (tapNodeFromXml(adbPath, serial, xml, [
      { attr: "resource-id", value: "workspace-nav-files", mode: "contains" },
      { attr: "content-desc", value: "Files", mode: "equals" },
      { attr: "text", value: "Files", mode: "equals" },
    ])) {
      await wait(1000);
      continue;
    }
    if (tapNodeFromXml(adbPath, serial, xml, [
      { attr: "resource-id", value: "command-menu-view", mode: "contains" },
      { attr: "content-desc", value: "View menu", mode: "equals" },
    ])) {
      await wait(500);
      const menuXml = dumpUiXml(adbPath, serial);
      tapNodeFromXml(adbPath, serial, menuXml, [
        { attr: "resource-id", value: "command-view-files", mode: "contains" },
        { attr: "content-desc", value: "Files", mode: "equals" },
        { attr: "text", value: "Files", mode: "equals" },
      ]);
      await wait(1000);
    }
  }
  const xml = dumpUiXml(adbPath, serial);
  if (!xml.includes("Project Files") && !xml.includes("files-view")) {
    throw new Error("Could not navigate to the CPLayout Files view through UIAutomator.");
  }
}

async function tapFirstUiNode(adbPath: string, serial: string, matchers: NodeMatcher[]): Promise<void> {
  const xml = await waitForUiXml(adbPath, serial, (candidate) => Boolean(findNode(candidate, matchers)), 8000);
  if (!tapNodeFromXml(adbPath, serial, xml, matchers)) {
    throw new Error(`Could not tap UI node for ${matchers.map((matcher) => matcher.value).join(" / ")}.`);
  }
  await wait(1200);
}

function tapNodeFromXml(adbPath: string, serial: string, xml: string, matchers: NodeMatcher[]): boolean {
  const node = findNode(xml, matchers);
  if (!node) return false;
  const x = Math.round((node.bounds.x1 + node.bounds.x2) / 2);
  const y = Math.round((node.bounds.y1 + node.bounds.y2) / 2);
  runAdb(adbPath, ["-s", serial, "shell", "input", "tap", String(x), String(y)], "text", false);
  return true;
}

async function waitForUiXml(
  adbPath: string,
  serial: string,
  predicate: (xml: string) => boolean,
  waitMs: number,
): Promise<string> {
  const deadline = Date.now() + waitMs;
  let lastXml = "";
  while (Date.now() < deadline) {
    lastXml = dumpUiXml(adbPath, serial);
    if (predicate(lastXml)) return lastXml;
    await wait(500);
  }
  return lastXml;
}

function dumpUiXml(adbPath: string, serial: string): string {
  const remotePath = "/sdcard/window-cplayout-proof.xml";
  runAdb(adbPath, ["-s", serial, "shell", "uiautomator", "dump", remotePath], "text", false);
  const xml = runAdb(adbPath, ["-s", serial, "exec-out", "cat", remotePath], "text", false);
  runAdb(adbPath, ["-s", serial, "shell", "rm", "-f", remotePath], "text", false);
  return typeof xml === "string" ? xml : "";
}

type NodeMatcher = { attr: string; value: string; mode: "contains" | "equals" };

function findNode(xml: string, matchers: NodeMatcher[]): UiNode | null {
  for (const tagMatch of xml.matchAll(/<node\b[^>]*>/g)) {
    const attrs = parseXmlAttrs(tagMatch[0]);
    const bounds = parseBounds(attrs.bounds);
    if (!bounds) continue;
    const matched = matchers.some((matcher) => {
      const value = decodeXml(attrs[matcher.attr] ?? "");
      return matcher.mode === "equals" ? value === matcher.value : value.includes(matcher.value);
    });
    if (matched) return { attrs, bounds };
  }
  return null;
}

function parseXmlAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function parseBounds(value: string | undefined): UiNode["bounds"] | null {
  const match = value?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function isShareSheetXml(xml: string, packageName: string): boolean {
  if (xml.length === 0) return false;
  if (/Resolver|Chooser|Share|Nearby|Quick Share|Bluetooth|Messages|Gmail|Drive|Save to|Copy to/i.test(xml)) return true;
  return xml.includes('package="android"') && !xml.includes(`package="${packageName}"`);
}

function isDocumentsPickerXml(xml: string): boolean {
  return /com\.google\.android\.documentsui|DocumentsUI|Recent|Downloads|Open from|\.zip/i.test(xml);
}

async function waitForInAppProof(adbPath: string, serial: string, waitMs: number): Promise<InAppProofPayload | null> {
  const deadline = Date.now() + waitMs;
  let payload: InAppProofPayload | null = null;
  while (Date.now() < deadline) {
    const logcat = runAdb(adbPath, ["-s", serial, "logcat", "-d"], "text", false);
    payload = parseInAppProofPayload(String(logcat));
    if (payload) return payload;
    await wait(1000);
  }
  return payload;
}

function parseInAppProofPayload(logcat: string): InAppProofPayload | null {
  const lines = logcat.split(/\r?\n/).filter((line) => line.includes(ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER));
  const line = lines.at(-1);
  if (!line) return null;
  const jsonStart = line.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(line.slice(jsonStart)) as InAppProofPayload;
  } catch {
    return null;
  }
}

function createPickerProofZip(outputDir: string): { filename: string; localPath: string; bytes: number } {
  const project: PivotProject = {
    ...sampleProject,
    id: "cplayout-android-documents-picker-proof",
    name: "CPLayout Android Documents Picker Proof",
  };
  const result = evaluateLayout(project);
  const zip = exportProjectArchiveZip(buildProjectArchiveBundle(project, result, exportScenarioGeoJson(project, result)));
  const filename = "cplayout-android-native-proof-import.center-pivot.zip";
  const localPath = join(outputDir, filename);
  writeFileSync(localPath, zip);
  return { filename, localPath, bytes: zip.byteLength };
}

function captureScreenshot(adbPath: string, serial: string, outputPath: string): void {
  const png = runAdb(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], "buffer", false);
  writeFileSync(outputPath, png);
}

function writeCollectLogExcerpt(adbPath: string, serial: string, outputDir: string, generatedAt: string): string {
  const log = runAdb(adbPath, ["-s", serial, "logcat", "-d", "-t", "1000"], "text", false);
  const path = join(outputDir, `android-native-proof-logcat-${timestampForFilename(generatedAt)}.txt`);
  writeFileSync(path, String(log), "utf8");
  return path;
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

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function runAdb(adbPath: string, adbArgs: string[], output: "text", throwOnFailure?: boolean): string;
function runAdb(adbPath: string, adbArgs: string[], output: "buffer", throwOnFailure?: boolean): Buffer;
function runAdb(adbPath: string, adbArgs: string[], output: "text" | "buffer" = "text", throwOnFailure = true): string | Buffer {
  const result = spawnSync(adbPath, adbArgs, {
    encoding: output === "text" ? "utf8" : undefined,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (throwOnFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`adb ${adbArgs.join(" ")} failed with exit code ${result.status ?? "unknown"}: ${stderr}`);
  }
  return output === "text" ? String(result.stdout ?? "") : Buffer.from(result.stdout as Buffer);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
