import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readExpoAndroidPackageName, timestampForFilename, writeJsonFile } from "./androidNativeProof";
import { analyzePngPixels, createNativeMapLibreProofTilePng } from "./pngMetrics";

interface NativeMapLibreProofOptions {
  outputDirectory: string;
  packageName: string;
  adbPath?: string;
  serial?: string;
  port: number;
  devClientUrl?: string;
  launchApp: boolean;
  waitMs: number;
}

interface AdbCandidate {
  label: string;
  path: string;
}

interface AdbDevice {
  serial: string;
  state: string;
  line: string;
}

interface TileServerHandle {
  server: Server;
  stats: {
    tileJsonRequests: number;
    tileRequests: number;
  };
}

const DEFAULT_OUTPUT_DIRECTORY = "reports/native-maplibre";
const TILE_TEMPLATE = "http://127.0.0.1:8765/cplayout-native-maplibre/{z}/{x}/{y}.png";
const TILEJSON_URL = "http://127.0.0.1:8765/cplayout-native-maplibre/tilejson.json";
const TILE_ATTRIBUTION = "CPLayout local generated tile proof";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runNativeMapLibreProof(parseArgs(process.argv.slice(2), process.env))
    .then((result) => {
      process.exit(result.status === "pass" ? 0 : result.status === "blocked" ? 2 : 1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export function parseArgs(rawArgs: string[], env: NodeJS.ProcessEnv = process.env): NativeMapLibreProofOptions {
  return {
    outputDirectory: valueFor(rawArgs, "--output-dir") ?? env.CPLAYOUT_NATIVE_MAPLIBRE_REPORT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
    packageName: valueFor(rawArgs, "--package-name") ?? env.CPLAYOUT_ANDROID_PACKAGE_NAME ?? readExpoAndroidPackageName(),
    adbPath: valueFor(rawArgs, "--adb") ?? env.CPLAYOUT_ADB,
    serial: valueFor(rawArgs, "--serial") ?? env.ANDROID_SERIAL,
    port: Number(valueFor(rawArgs, "--port") ?? env.CPLAYOUT_NATIVE_MAPLIBRE_PORT ?? "8765"),
    devClientUrl: valueFor(rawArgs, "--dev-client-url") ?? env.CPLAYOUT_EXPO_DEV_CLIENT_URL,
    launchApp: !hasFlag(rawArgs, "--no-launch"),
    waitMs: Number(valueFor(rawArgs, "--wait-ms") ?? "9000"),
  };
}

export async function runNativeMapLibreProof(options: NativeMapLibreProofOptions): Promise<{ status: "pass" | "fail" | "blocked"; reportPath: string }> {
  const generatedAt = new Date().toISOString();
  mkdirSync(options.outputDirectory, { recursive: true });
  const reportPath = join(options.outputDirectory, "latest.json");
  const candidates = options.adbPath ? [{ label: "provided", path: options.adbPath }] : collectAdbCandidates();
  const selected = selectAdbDevice(candidates, options.serial);
  if (!selected) {
    const blocked = blockedReport(generatedAt, options, "blocked: no connected adb device or emulator is visible to Linux or Windows adb.", { candidates });
    writeJsonFile(reportPath, blocked);
    return { status: "blocked", reportPath };
  }

  const version = installedPackageInfo(selected.adb.path, selected.device.serial, options.packageName);
  if (!version.installed) {
    const blocked = blockedReport(
      generatedAt,
      options,
      `blocked: Android package ${options.packageName} is not installed on ${selected.device.serial}; run a native development build with EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF=1.`,
      { selected },
    );
    writeJsonFile(reportPath, blocked);
    return { status: "blocked", reportPath };
  }

  const tileServer = await startTileServer(options.port);
  try {
    runAdb(selected.adb.path, ["-s", selected.device.serial, "reverse", `tcp:${options.port}`, `tcp:${options.port}`], "text");
    for (const devServerPort of localhostPortsFromText(options.devClientUrl ?? "")) {
      if (devServerPort !== options.port) {
        runAdb(selected.adb.path, ["-s", selected.device.serial, "reverse", `tcp:${devServerPort}`, `tcp:${devServerPort}`], "text");
      }
    }
    if (options.launchApp) {
      launchPackage(selected.adb.path, selected.device.serial, options.packageName, options.devClientUrl);
      await wait(options.waitMs);
    }
    const screenshot = runAdb(selected.adb.path, ["-s", selected.device.serial, "exec-out", "screencap", "-p"], "buffer");
    const screenshotPath = join(options.outputDirectory, `native-maplibre-${timestampForFilename(generatedAt)}.png`);
    writeFileSync(screenshotPath, screenshot);
    const screenshotSha256 = sha256(screenshot);
    const metrics = analyzePngPixels(screenshot);
    const status = metrics.nonBlankPixelRatio > 0.05 && metrics.grayVariance > 20 && tileServer.stats.tileRequests > 0 ? "pass" : "fail";
    const report = {
      reportSchemaVersion: 1,
      proofTarget: "native-maplibre-render",
      generatedAt,
      status,
      target: "native_maplibre_rn",
      device: {
        adbSerial: selected.device.serial,
        model: readDeviceProp(selected.adb.path, selected.device.serial, "ro.product.model"),
        osVersion: readDeviceProp(selected.adb.path, selected.device.serial, "ro.build.version.release"),
        apiLevel: readDeviceProp(selected.adb.path, selected.device.serial, "ro.build.version.sdk"),
      },
      app: {
        packageName: options.packageName,
        versionName: version.versionName,
        versionCode: version.versionCode,
        buildType: "development-native-maplibre-proof",
        commit: currentGitCommit(),
        devClientUrl: options.devClientUrl ?? "",
        reversedDevServerPorts: localhostPortsFromText(options.devClientUrl ?? ""),
      },
      tileSource: {
        tileSourceKind: "tilejson_or_template",
        tileJsonUrl: TILEJSON_URL,
        tileUrlTemplates: [TILE_TEMPLATE],
        attribution: TILE_ATTRIBUTION,
      },
      screenshot: {
        path: basename(screenshotPath),
        sha256: screenshotSha256,
        width: metrics.width,
        height: metrics.height,
        nonBlankPixelRatio: metrics.nonBlankPixelRatio,
        grayVariance: metrics.grayVariance,
      },
      boundaries: {
        noRawPmtilesMbtilesNativeProof: true,
        canonicalGeometryMutation: false,
        networkRequired: false,
      },
      notes: status === "pass"
        ? "Native app screenshot captured after rendering the local generated tile URL template through MapLibre React Native."
        : "Screenshot was captured but did not meet nonblank/variance thresholds or the local tile server did not receive tile requests.",
      tileServer: tileServer.stats,
    };
    writeJsonFile(reportPath, report);
    return { status, reportPath };
  } finally {
    await closeServer(tileServer.server);
  }
}

function startTileServer(port: number): Promise<TileServerHandle> {
  const tile = Buffer.from(createNativeMapLibreProofTilePng());
  const stats = { tileJsonRequests: 0, tileRequests: 0 };
  const tileJson = JSON.stringify({
    tilejson: "3.0.0",
    name: "CPLayout native MapLibre local proof tile",
    version: "1.0.0",
    attribution: TILE_ATTRIBUTION,
    scheme: "xyz",
    tiles: [TILE_TEMPLATE],
    minzoom: 0,
    maxzoom: 22,
    bounds: [-180, -85, 180, 85],
  });
  const server = createServer((request, response) => {
    const url = request.url ?? "";
    if (url === "/cplayout-native-maplibre/tilejson.json") {
      stats.tileJsonRequests += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(tileJson);
      return;
    }
    if (/^\/cplayout-native-maplibre\/\d+\/\d+\/\d+\.png$/.test(url)) {
      stats.tileRequests += 1;
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(tile);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveServer({ server, stats });
    });
  });
}

function collectAdbCandidates(): AdbCandidate[] {
  const candidates: AdbCandidate[] = [];
  const linux = spawnSync("bash", ["-lc", "command -v adb"], { encoding: "utf8" });
  if (linux.status === 0 && linux.stdout.trim()) candidates.push({ label: "linux-adb", path: linux.stdout.trim() });
  const windows = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$p=Join-Path $env:LOCALAPPDATA 'Android\\Sdk\\platform-tools\\adb.exe'; if(Test-Path $p){ Write-Output $p }",
  ], { encoding: "utf8" });
  const windowsPath = windows.status === 0 ? windowsPathToWslPath(windows.stdout.trim().split(/\r?\n/)[0] ?? "") : "";
  if (windowsPath) candidates.push({ label: "windows-adb", path: windowsPath });
  return uniqueCandidates(candidates);
}

function selectAdbDevice(candidates: AdbCandidate[], requestedSerial?: string): { adb: AdbCandidate; device: AdbDevice } | null {
  for (const adb of candidates) {
    runAdb(adb.path, ["start-server"], "text", false);
    const devices = listDevices(adb.path);
    const device = devices.find((candidate) => candidate.state === "device" && (!requestedSerial || candidate.serial === requestedSerial));
    if (device) return { adb, device };
  }
  return null;
}

function listDevices(adbPath: string): AdbDevice[] {
  const result = runAdb(adbPath, ["devices"], "text", false);
  if (typeof result !== "string") return [];
  return result
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [serial, state = "unknown"] = line.split(/\s+/);
      return { serial, state, line };
    });
}

function installedPackageInfo(adbPath: string, serial: string, packageName: string): { installed: boolean; versionName: string; versionCode: string } {
  const path = runAdb(adbPath, ["-s", serial, "shell", "pm", "path", packageName], "text", false);
  if (typeof path !== "string" || path.trim().length === 0) return { installed: false, versionName: "", versionCode: "" };
  const dump = runAdb(adbPath, ["-s", serial, "shell", "dumpsys", "package", packageName], "text", false);
  const text = typeof dump === "string" ? dump : "";
  return {
    installed: true,
    versionName: text.match(/versionName=([^\s]+)/)?.[1] ?? "",
    versionCode: text.match(/versionCode=(\d+)/)?.[1] ?? "",
  };
}

function launchPackage(adbPath: string, serial: string, packageName: string, devClientUrl?: string): void {
  if (devClientUrl) {
    const urlLaunch = runAdb(adbPath, ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", devClientUrl, packageName], "text", false);
    if (typeof urlLaunch === "string" && !/Error|Exception|not exist|does not exist/i.test(urlLaunch)) return;
  }
  const activity = runAdb(adbPath, ["-s", serial, "shell", "am", "start", "-n", `${packageName}/.MainActivity`], "text", false);
  if (typeof activity === "string" && /Error|Exception|not exist|does not exist/i.test(activity)) {
    runAdb(adbPath, ["-s", serial, "shell", "monkey", "-p", packageName, "1"], "text", false);
  }
}

function readDeviceProp(adbPath: string, serial: string, propName: string): string {
  const value = runAdb(adbPath, ["-s", serial, "shell", "getprop", propName], "text", false);
  return typeof value === "string" ? value.trim() : "";
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

function blockedReport(generatedAt: string, options: NativeMapLibreProofOptions, reason: string, details: unknown): object {
  return {
    reportSchemaVersion: 1,
    proofTarget: "native-maplibre-render",
    generatedAt,
    status: "blocked",
    target: "native_maplibre_rn",
    device: { adbSerial: "", model: "", osVersion: "", apiLevel: "" },
    app: { packageName: options.packageName, versionName: "", versionCode: "", buildType: "", commit: currentGitCommit() },
    tileSource: {
      tileSourceKind: "tilejson_or_template",
      tileJsonUrl: TILEJSON_URL,
      tileUrlTemplates: [TILE_TEMPLATE],
      attribution: TILE_ATTRIBUTION,
    },
    screenshot: { path: "", sha256: "", width: 0, height: 0, nonBlankPixelRatio: 0, grayVariance: 0 },
    boundaries: {
      noRawPmtilesMbtilesNativeProof: true,
      canonicalGeometryMutation: false,
      networkRequired: false,
    },
    notes: reason,
    details,
  };
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

function uniqueCandidates(candidates: AdbCandidate[]): AdbCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false;
    seen.add(candidate.path);
    return true;
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function currentGitCommit(): string {
  const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function hasFlag(rawArgs: string[], name: string): boolean {
  return rawArgs.includes(name);
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
