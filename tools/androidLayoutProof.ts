import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

import { captureMapLibreLogEvidence, clearAndroidLogcat } from "./androidMapLibreLogEvidence";
import { collectAndroidToolSnapshot, readExpoAndroidPackageName, timestampForFilename, writeJsonFile } from "./androidNativeProof";
import { analyzePngPixels } from "./pngMetrics";

interface AndroidLayoutProofOptions {
  outputDirectory: string;
  packageName: string;
  serial?: string;
  devClientUrl?: string;
  launchApp: boolean;
  waitMs: number;
}

const DEFAULT_OUTPUT_DIRECTORY = "reports/android-layout";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAndroidLayoutProof(parseArgs(process.argv.slice(2), process.env))
    .then((result) => {
      process.exit(result.status === "pass" ? 0 : result.status === "blocked" ? 2 : 1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export function parseArgs(rawArgs: string[], env: NodeJS.ProcessEnv = process.env): AndroidLayoutProofOptions {
  return {
    outputDirectory: valueFor(rawArgs, "--output-dir") ?? env.CPLAYOUT_ANDROID_LAYOUT_REPORT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
    packageName: valueFor(rawArgs, "--package-name") ?? env.CPLAYOUT_ANDROID_PACKAGE_NAME ?? readExpoAndroidPackageName(),
    serial: valueFor(rawArgs, "--serial") ?? env.ANDROID_SERIAL,
    devClientUrl: valueFor(rawArgs, "--dev-client-url") ?? env.CPLAYOUT_EXPO_DEV_CLIENT_URL,
    launchApp: !hasFlag(rawArgs, "--no-launch"),
    waitMs: Number(valueFor(rawArgs, "--wait-ms") ?? "15000"),
  };
}

export async function runAndroidLayoutProof(options: AndroidLayoutProofOptions): Promise<{ status: "pass" | "fail" | "blocked"; reportPath: string }> {
  const generatedAt = new Date().toISOString();
  mkdirSync(options.outputDirectory, { recursive: true });
  const reportPath = join(options.outputDirectory, "latest.json");
  const snapshot = collectAndroidToolSnapshot({
    packageName: options.packageName,
    outputDirectory: options.outputDirectory,
    serial: options.serial,
  });
  const adbPath = snapshot.commands.adb.path;
  const serial = snapshot.selectedDevice?.serial;
  if (snapshot.blocker || !adbPath || !serial || !snapshot.installedPackage || !snapshot.selectedDevice) {
    writeJsonFile(reportPath, {
      reportSchemaVersion: 1,
      proofTarget: "android-normal-layout",
      generatedAt,
      status: "blocked",
      target: "android_expo_dev_client",
      app: { packageName: options.packageName, commit: snapshot.commit, devClientUrl: options.devClientUrl ?? "" },
      device: snapshot.selectedDevice,
      screenshot: { path: "", sha256: "", width: 0, height: 0, nonBlankPixelRatio: 0, grayVariance: 0 },
      uiXml: { path: "", sha256: "", containsWorkspaceScreen: false, containsMapView: false, containsNativeMapLibreProofPanel: false },
      logcat: { path: "", sha256: "", lineCount: 0, mapLibreLineCount: 0, mapLibreErrorLines: [], resourceUrlErrorCount: 0, resourceUrlErrorLines: [] },
      notes: snapshot.blocker ?? "blocked: adb device, selected package, or installed app metadata was unavailable.",
    });
    return { status: "blocked", reportPath };
  }

  reverseDevClientPorts(adbPath, serial, options.devClientUrl ?? "");
  const logcatCleared = clearAndroidLogcat(adbPath, serial);
  if (options.launchApp) {
    launchPackage(adbPath, serial, options.packageName, options.devClientUrl ?? "");
    await wait(options.waitMs);
  }

  const screenshot = runAdb(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], "buffer");
  const screenshotPath = join(options.outputDirectory, `android-layout-${timestampForFilename(generatedAt)}.png`);
  writeFileSync(screenshotPath, screenshot);
  const metrics = analyzePngPixels(screenshot);

  const xml = dumpUiXml(adbPath, serial);
  const xmlPath = join(options.outputDirectory, `android-layout-${timestampForFilename(generatedAt)}.xml`);
  writeFileSync(xmlPath, xml, "utf8");

  const logcat = captureMapLibreLogEvidence({
    adbPath,
    generatedAt,
    outputDirectory: options.outputDirectory,
    prefix: "android-layout",
    serial,
  });
  const containsWorkspaceScreen = xml.includes("workspace-screen") || xml.includes("workspace-shell");
  const containsMapView = xml.includes("map-view") || xml.includes("native-map-workbench") || xml.includes("svg-map-surface");
  const containsNativeMapLibreProofPanel = xml.includes("native-maplibre-proof-panel") || xml.includes("native-maplibre-proof-map");
  const screenshotOk = metrics.nonBlankPixelRatio > 0.05 && metrics.grayVariance > 20;
  const status = screenshotOk
    && containsWorkspaceScreen
    && containsMapView
    && !containsNativeMapLibreProofPanel
    && logcat.resourceUrlErrorCount === 0
    ? "pass"
    : "fail";
  writeJsonFile(reportPath, {
    reportSchemaVersion: 1,
    proofTarget: "android-normal-layout",
    generatedAt,
    status,
    target: "android_expo_dev_client",
    app: {
      packageName: options.packageName,
      versionName: snapshot.installedPackage.versionName,
      versionCode: snapshot.installedPackage.versionCode,
      buildType: "development-normal-layout",
      commit: snapshot.commit,
      devClientUrl: options.devClientUrl ?? "",
    },
    device: {
      adbSerial: snapshot.selectedDevice.serial,
      model: snapshot.selectedDevice.model,
      osVersion: snapshot.selectedDevice.androidVersion,
      apiLevel: snapshot.selectedDevice.apiLevel,
    },
    screenshot: {
      path: basename(screenshotPath),
      sha256: sha256(screenshot),
      width: metrics.width,
      height: metrics.height,
      nonBlankPixelRatio: metrics.nonBlankPixelRatio,
      grayVariance: metrics.grayVariance,
    },
    uiXml: {
      path: basename(xmlPath),
      sha256: sha256(xml),
      containsWorkspaceScreen,
      containsMapView,
      containsNativeMapLibreProofPanel,
    },
    logcat: {
      ...logcat,
      clearedBeforeLaunch: logcatCleared,
    },
    notes: status === "pass"
      ? "Normal Android map workspace captured without the native MapLibre proof panel or resourceURL parse errors."
      : "Normal Android map workspace failed layout evidence, proof-panel absence, screenshot, or MapLibre resourceURL log checks.",
  });
  return { status, reportPath };
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
  const remotePath = "/sdcard/window-cplayout-layout-proof.xml";
  runAdb(adbPath, ["-s", serial, "shell", "uiautomator", "dump", remotePath], "text", false);
  const xml = runAdb(adbPath, ["-s", serial, "exec-out", "cat", remotePath], "text", false);
  runAdb(adbPath, ["-s", serial, "shell", "rm", "-f", remotePath], "text", false);
  return typeof xml === "string" ? xml : "";
}

function runAdb(adbPath: string, args: string[], output: "text", throwOnFailure?: boolean): string;
function runAdb(adbPath: string, args: string[], output: "buffer", throwOnFailure?: boolean): Buffer;
function runAdb(adbPath: string, args: string[], output: "text" | "buffer" = "text", throwOnFailure = true): string | Buffer {
  const result = spawnSync(adbPath, args, {
    encoding: output === "text" ? "utf8" : undefined,
    maxBuffer: 24 * 1024 * 1024,
  });
  if (throwOnFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`adb ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}: ${stderr}`);
  }
  return output === "text" ? String(result.stdout ?? "") : Buffer.from(result.stdout as Buffer);
}

function localhostPortsFromText(value: string): number[] {
  const ports = new Set<number>();
  for (const text of [value, decodeUrlComponent(value)]) {
    const matches = text.matchAll(/(?:127\.0\.0\.1|localhost):(\d{2,5})/g);
    for (const match of matches) {
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
