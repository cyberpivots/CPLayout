import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { writeFileSync } from "node:fs";

import { timestampForFilename } from "./androidNativeProof";

export interface MapLibreLogEvidence {
  path: string;
  sha256: string;
  lineCount: number;
  mapLibreLineCount: number;
  mapLibreErrorLines: string[];
  resourceUrlErrorCount: number;
  resourceUrlErrorLines: string[];
}

const MAPLIBRE_RELATED_LINE_PATTERN = /MapLibre Native|Mbgl-HttpRequest|maplibre|resource\s*URL|resourceURL|ReactNativeJS/i;
const MAPLIBRE_ERROR_LINE_PATTERN = /MapLibre Native \[ERROR\]|Mbgl-HttpRequest.*error|Unable to parse resource\s*URL|resourceURL/i;
const MAPLIBRE_RESOURCE_URL_ERROR_PATTERN = /Unable to parse resource\s*URL|resourceURL/i;

export function clearAndroidLogcat(adbPath: string, serial: string): boolean {
  const result = spawnSync(adbPath, ["-s", serial, "logcat", "-c"], { encoding: "utf8" });
  return result.status === 0;
}

export function captureMapLibreLogEvidence(options: {
  adbPath: string;
  generatedAt: string;
  outputDirectory: string;
  prefix: string;
  serial: string;
  tailLines?: number;
}): MapLibreLogEvidence {
  const tailLines = options.tailLines ?? 2000;
  const result = spawnSync(options.adbPath, ["-s", options.serial, "logcat", "-d", "-t", String(tailLines)], {
    encoding: "utf8",
    maxBuffer: 24 * 1024 * 1024,
  });
  const rawLines = result.status === 0 ? result.stdout.split(/\r?\n/) : [];
  const mapLibreLines = rawLines.filter((line) => MAPLIBRE_RELATED_LINE_PATTERN.test(line));
  const mapLibreErrorLines = mapLibreLines.filter((line) => MAPLIBRE_ERROR_LINE_PATTERN.test(line));
  const resourceUrlErrorLines = mapLibreLines.filter((line) => MAPLIBRE_RESOURCE_URL_ERROR_PATTERN.test(line));
  const logText = `${mapLibreLines.join("\n")}\n`;
  const logPath = join(options.outputDirectory, `${options.prefix}-logcat-${timestampForFilename(options.generatedAt)}.txt`);
  writeFileSync(logPath, logText, "utf8");
  return {
    path: basename(logPath),
    sha256: sha256(logText),
    lineCount: rawLines.length,
    mapLibreLineCount: mapLibreLines.length,
    mapLibreErrorLines: mapLibreErrorLines.slice(0, 20),
    resourceUrlErrorCount: resourceUrlErrorLines.length,
    resourceUrlErrorLines: resourceUrlErrorLines.slice(0, 20),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
