import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createAndroidNativeVerificationReportTemplate } from "@cplayout/project-store";

export interface CommandCheck {
  name: string;
  path: string | null;
}

export interface AndroidDeviceInfo {
  serial: string;
  state: string;
  deviceLine: string;
  model: string;
  androidVersion: string;
  apiLevel: string;
}

export interface AndroidPackageInfo {
  packageName: string;
  packagePath: string;
  versionName: string;
  versionCode: string;
}

export interface AndroidToolSnapshot {
  generatedAt: string;
  packageName: string;
  commit: string;
  commands: {
    adb: CommandCheck;
    emulator: CommandCheck;
    eas: CommandCheck;
    expo: CommandCheck;
  };
  devices: AndroidDeviceInfo[];
  selectedDevice: AndroidDeviceInfo | null;
  installedPackage: AndroidPackageInfo | null;
  logExcerptPath: string | null;
  blocker: string | null;
}

export function collectAndroidToolSnapshot(options: {
  packageName: string;
  outputDirectory: string;
}): AndroidToolSnapshot {
  const generatedAt = new Date().toISOString();
  const commit = currentGitCommit();
  const commands = {
    adb: commandCheck("adb"),
    emulator: commandCheck("emulator"),
    eas: commandCheck("eas"),
    expo: commandCheck("expo"),
  };
  const windowsAdb = windowsAdbCommandCheck();

  const baseSnapshot: AndroidToolSnapshot = {
    generatedAt,
    packageName: options.packageName,
    commit,
    commands,
    devices: [],
    selectedDevice: null,
    installedPackage: null,
    logExcerptPath: null,
    blocker: null,
  };

  if (!commands.adb.path && windowsAdb.path) commands.adb = windowsAdb;
  if (!commands.adb.path) {
    return {
      ...baseSnapshot,
      blocker: "blocked: Android SDK/device unavailable (adb not found on PATH).",
    };
  }

  let devices = listAndroidDevices(commands.adb.path);
  if (devices.length === 0 && windowsAdb.path && windowsAdb.path !== commands.adb.path) {
    const windowsDevices = listAndroidDevices(windowsAdb.path);
    if (windowsDevices.length > 0) {
      commands.adb = windowsAdb;
      devices = windowsDevices;
    }
  }
  const selectedDevice = devices.find((device) => device.state === "device") ?? null;
  if (!selectedDevice) {
    return {
      ...baseSnapshot,
      devices,
      blocker: "blocked: Android SDK/device unavailable (no connected adb device or running emulator).",
    };
  }

  const adbPath = commands.adb.path;
  if (!adbPath) {
    return {
      ...baseSnapshot,
      devices,
      selectedDevice,
      blocker: "blocked: Android SDK/device unavailable (adb path was lost after device selection).",
    };
  }

  const installedPackage = readPackageInfo(adbPath, selectedDevice.serial, options.packageName);
  if (!installedPackage) {
    return {
      ...baseSnapshot,
      devices,
      selectedDevice,
      blocker: `blocked: built Android app package ${options.packageName} is not installed on ${selectedDevice.serial}; Expo Go is not valid for this proof.`,
    };
  }

  const logExcerptPath = writeLogExcerpt(adbPath, selectedDevice.serial, options.packageName, options.outputDirectory, generatedAt);
  return {
    ...baseSnapshot,
    devices,
    selectedDevice,
    installedPackage,
    logExcerptPath,
    blocker: null,
  };
}

export function reportFromSnapshot(snapshot: AndroidToolSnapshot) {
  return createAndroidNativeVerificationReportTemplate({
    generatedAt: snapshot.generatedAt,
    packageName: snapshot.packageName,
    commit: snapshot.commit,
    status: snapshot.blocker ? "blocked" : "incomplete",
    adbSerial: snapshot.selectedDevice?.serial,
    model: snapshot.selectedDevice?.model,
    androidVersion: snapshot.selectedDevice?.androidVersion,
    apiLevel: snapshot.selectedDevice?.apiLevel,
    versionName: snapshot.installedPackage?.versionName,
    versionCode: snapshot.installedPackage?.versionCode,
    buildType: snapshot.installedPackage ? "installed-native-build" : "",
    packagePath: snapshot.installedPackage?.packagePath,
    adbDeviceLine: snapshot.selectedDevice?.deviceLine,
    logExcerptPath: snapshot.logExcerptPath ?? "",
    notes: snapshot.blocker ?? "Device and installed package detected. Complete docs/android-native-verification.md and fill this report before marking native persistence verified.",
  });
}

export function readExpoAndroidPackageName(appJsonPath = "apps/mobile/app.json"): string {
  const raw = JSON.parse(readFileSync(appJsonPath, "utf8")) as {
    expo?: { android?: { package?: string } };
  };
  const packageName = raw.expo?.android?.package;
  if (!packageName) throw new Error("app.json must define expo.android.package for Android verification.");
  return packageName;
}

export function writeJsonFile(path: string, value: unknown): void {
  const directory = dirname(path);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function timestampForFilename(value: string): string {
  return value.replaceAll(":", "").replaceAll(".", "").replaceAll("-", "").replace("T", "-").replace("Z", "Z");
}

function commandCheck(name: string): CommandCheck {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  const path = result.status === 0 ? result.stdout.trim() : "";
  return { name, path: path.length > 0 ? path : null };
}

function windowsAdbCommandCheck(): CommandCheck {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$p=Join-Path $env:LOCALAPPDATA 'Android\\Sdk\\platform-tools\\adb.exe'; if(Test-Path $p){ Write-Output $p }",
  ], { encoding: "utf8" });
  const windowsPath = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] ?? "" : "";
  const path = windowsPathToWslPath(windowsPath);
  return { name: "adb", path: path.length > 0 ? path : null };
}

function currentGitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function listAndroidDevices(adbPath: string): AndroidDeviceInfo[] {
  spawnSync(adbPath, ["start-server"], { encoding: "utf8" });
  const result = spawnSync(adbPath, ["devices"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((deviceLine) => {
      const [serial, state = "unknown"] = deviceLine.split(/\s+/);
      return {
        serial,
        state,
        deviceLine,
        model: readDeviceProp(adbPath, serial, "ro.product.model"),
        androidVersion: readDeviceProp(adbPath, serial, "ro.build.version.release"),
        apiLevel: readDeviceProp(adbPath, serial, "ro.build.version.sdk"),
      };
    });
}

function windowsPathToWslPath(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Za-z]):\\(.+)$/);
  if (!match) return trimmed && existsSync(trimmed) ? trimmed : "";
  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/");
  const path = `/mnt/${drive}/${rest}`;
  return existsSync(path) ? path : "";
}

function readDeviceProp(adbPath: string, serial: string, propName: string): string {
  const result = spawnSync(adbPath, ["-s", serial, "shell", "getprop", propName], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readPackageInfo(adbPath: string, serial: string, packageName: string): AndroidPackageInfo | null {
  const pathResult = spawnSync(adbPath, ["-s", serial, "shell", "pm", "path", packageName], { encoding: "utf8" });
  if (pathResult.status !== 0 || pathResult.stdout.trim().length === 0) return null;

  const dumpResult = spawnSync(adbPath, ["-s", serial, "shell", "dumpsys", "package", packageName], { encoding: "utf8" });
  const dump = dumpResult.status === 0 ? dumpResult.stdout : "";
  return {
    packageName,
    packagePath: pathResult.stdout.trim().split(/\r?\n/)[0],
    versionName: matchFirst(dump, /versionName=([^\s]+)/) ?? "",
    versionCode: matchFirst(dump, /versionCode=(\d+)/) ?? "",
  };
}

function writeLogExcerpt(
  adbPath: string,
  serial: string,
  packageName: string,
  outputDirectory: string,
  generatedAt: string,
): string {
  const result = spawnSync(adbPath, ["-s", serial, "logcat", "-d", "-t", "400"], { encoding: "utf8" });
  const lines = result.status === 0
    ? result.stdout.split(/\r?\n/).filter((line) => line.includes(packageName) || /sqlite|expo|center.?pivot/i.test(line))
    : [];
  const logPath = join(outputDirectory, `android-logcat-${timestampForFilename(generatedAt)}.txt`);
  const directory = dirname(logPath);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
  return logPath;
}

function matchFirst(input: string, pattern: RegExp): string | null {
  return input.match(pattern)?.[1] ?? null;
}
