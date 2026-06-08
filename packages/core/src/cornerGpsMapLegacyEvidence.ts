import type { CornerGpsMapSourceRef } from "./cornerGpsMapImport";
import { feetToMeters } from "./units";

export type CornerGpsMapLegacyEvidenceKind = "opt" | "csv" | "out" | "vri";
export type CornerGpsMapLegacyViolationSeverity = "info" | "warning" | "blocker";

export interface CornerGpsMapLegacyMachineDimensions {
  cornerLengthMeters?: number;
  overhangLengthMeters?: number;
  lrduBoundaryDistanceMeters?: number;
  endGunReachMeters?: number;
  spanCount?: number;
  towerCount?: number;
  rawFieldCount: number;
}

export interface CornerGpsMapLegacyPathPointSummary {
  pointCount: number;
  hasCoordinateColumns: boolean;
  coordinateColumns: string[];
  closedPath?: boolean;
}

export interface CornerGpsMapLegacyVriSummary {
  zoneCount: number;
  minRatePercent?: number;
  maxRatePercent?: number;
  averageRatePercent?: number;
  uniqueRateCount?: number;
}

export interface CornerGpsMapLegacyViolation {
  severity: CornerGpsMapLegacyViolationSeverity;
  code: string;
  message: string;
}

export interface CornerGpsMapLegacyStatusSummary {
  values: string[];
  violationCount: number;
  warningCount: number;
  blockerCount: number;
}

export interface CornerGpsMapLegacyEvidence {
  kind: CornerGpsMapLegacyEvidenceKind;
  sourceRef?: CornerGpsMapSourceRef;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  controllerReady: false;
  metadata: Record<string, string>;
  machineDimensions: CornerGpsMapLegacyMachineDimensions;
  pathPointSummary: CornerGpsMapLegacyPathPointSummary;
  vriSummary: CornerGpsMapLegacyVriSummary;
  statusSummary: CornerGpsMapLegacyStatusSummary;
  violations: CornerGpsMapLegacyViolation[];
  diagnostics: string[];
  warnings: string[];
}

export interface CornerGpsMapLegacyEvidenceParseOptions {
  sourceRef?: CornerGpsMapSourceRef;
}

type CsvTable = { header: string[]; rows: string[][] };

const COORDINATE_HEADER_PATTERN = /(^|_|\s)(x|y|lat|latitude|lon|long|longitude|easting|northing)($|_|\s)/i;
const PATH_HEADER_PATTERN = /(point|station|path|sequence|angle|tower)/i;
const RATE_HEADER_PATTERN = /(rate|depth|application|percent|pct|zone)/i;
const STATUS_HEADER_PATTERN = /(status|warning|violation|error|message|result)/i;

export function parseCornerGpsMapLegacyEvidence(
  kind: CornerGpsMapLegacyEvidenceKind,
  text: string,
  options: CornerGpsMapLegacyEvidenceParseOptions = {},
): CornerGpsMapLegacyEvidence {
  if (!text.trim()) throw new Error(`CornerGPSMap legacy ${kind.toUpperCase()} evidence file is empty.`);
  if (kind === "csv") return parseCsvEvidence(kind, text, options.sourceRef);
  if (kind === "vri") return parseVriEvidence(text, options.sourceRef);
  return parseTextEvidence(kind, text, options.sourceRef);
}

export function inferCornerGpsMapLegacyEvidenceKind(filename: string): CornerGpsMapLegacyEvidenceKind | null {
  const extension = filename.toLowerCase().replace(/^.*\./, "");
  if (extension === "opt" || extension === "csv" || extension === "out" || extension === "vri") return extension;
  return null;
}

function parseTextEvidence(
  kind: "opt" | "out",
  text: string,
  sourceRef?: CornerGpsMapSourceRef,
): CornerGpsMapLegacyEvidence {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const metadata: Record<string, string> = {};
  const rawDimensions: Record<string, string> = {};
  const violations: CornerGpsMapLegacyViolation[] = [];
  const statuses: string[] = [];
  let pathPointCount = 0;
  let hasCoordinateLikeRows = false;

  for (const line of lines) {
    const pair = keyValuePair(line);
    let statusPairHandled = false;
    if (pair) {
      const normalized = normalizeKey(pair.key);
      if (dimensionKey(normalized)) rawDimensions[normalized] = pair.value;
      else if (metadataKey(normalized)) metadata[normalized] = safeMetadataValue(pair.value);
      if (STATUS_HEADER_PATTERN.test(normalized)) {
        statuses.push(safeMetadataValue(pair.value));
        const violation = violationFromText(pair.value);
        if (violation) violations.push(violation);
        statusPairHandled = true;
      }
    }

    if (PATH_HEADER_PATTERN.test(line) && numberMatches(line).length >= 2) pathPointCount += 1;
    if (coordinateLikeLine(line)) hasCoordinateLikeRows = true;
    if (!statusPairHandled) {
      const violation = violationFromText(line);
      if (violation) violations.push(violation);
    }
  }

  return evidenceResult({
    kind,
    sourceRef,
    metadata,
    machineDimensions: dimensionsFromFields(rawDimensions),
    pathPointSummary: {
      pointCount: pathPointCount,
      hasCoordinateColumns: hasCoordinateLikeRows,
      coordinateColumns: hasCoordinateLikeRows ? ["coordinate-like rows redacted"] : [],
    },
    vriSummary: { zoneCount: 0 },
    statuses,
    violations: dedupeViolations(violations),
    diagnostics: [
      `Parsed ${lines.length} non-empty text line${lines.length === 1 ? "" : "s"}.`,
      "Raw coordinates and file paths are not included in normalized evidence.",
    ],
    warnings: [],
  });
}

function parseCsvEvidence(
  kind: "csv",
  text: string,
  sourceRef?: CornerGpsMapSourceRef,
): CornerGpsMapLegacyEvidence {
  const table = parseCsvTable(text);
  const metadata: Record<string, string> = {};
  const dimensions = dimensionsFromRows(table);
  const pathSummary = pathSummaryFromTable(table);
  const vriSummary = vriSummaryFromTable(table);
  const { statuses, violations } = statusFromTable(table);
  return evidenceResult({
    kind,
    sourceRef,
    metadata,
    machineDimensions: dimensions,
    pathPointSummary: pathSummary,
    vriSummary,
    statuses,
    violations,
    diagnostics: [
      `Parsed ${table.rows.length} CSV row${table.rows.length === 1 ? "" : "s"} with ${table.header.length} column${table.header.length === 1 ? "" : "s"}.`,
      "CSV normalized evidence keeps counts, statuses, and zone summaries only; raw coordinate rows are omitted.",
    ],
    warnings: table.header.length === 0 ? ["CSV evidence did not include a usable header row."] : [],
  });
}

function parseVriEvidence(text: string, sourceRef?: CornerGpsMapSourceRef): CornerGpsMapLegacyEvidence {
  const maybeTable = parseCsvTable(text);
  const looksTabular = maybeTable.header.length > 1 && maybeTable.rows.length > 0;
  if (looksTabular) {
    const { statuses, violations } = statusFromTable(maybeTable);
    return evidenceResult({
      kind: "vri",
      sourceRef,
      metadata: {},
      machineDimensions: dimensionsFromRows(maybeTable),
      pathPointSummary: pathSummaryFromTable(maybeTable),
      vriSummary: vriSummaryFromTable(maybeTable),
      statuses,
      violations,
      diagnostics: [
        `Parsed ${maybeTable.rows.length} tabular VRI row${maybeTable.rows.length === 1 ? "" : "s"}.`,
        "VRI parser is structural evidence only and does not certify controller-ready output.",
      ],
      warnings: ["Controller-ready VRI compatibility remains unverified."],
    });
  }

  const rates = [...text.matchAll(/(?:rate|application|percent|pct)\D+(-?\d+(?:\.\d+)?)/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const zoneCount = Math.max(
    rates.length,
    new Set([...text.matchAll(/zone\D+(\d+)/gi)].map((match) => match[1])).size,
  );
  const violations = dedupeViolations(text.split(/\r?\n/).map(violationFromText).filter((item): item is CornerGpsMapLegacyViolation => Boolean(item)));
  return evidenceResult({
    kind: "vri",
    sourceRef,
    metadata: {},
    machineDimensions: { rawFieldCount: 0 },
    pathPointSummary: { pointCount: 0, hasCoordinateColumns: coordinateLikeLine(text), coordinateColumns: coordinateLikeLine(text) ? ["coordinate-like rows redacted"] : [] },
    vriSummary: vriSummaryFromRates(zoneCount, rates),
    statuses: [],
    violations,
    diagnostics: [
      "Parsed VRI text with pattern-based zone/rate detection.",
      "VRI parser is structural evidence only and does not certify controller-ready output.",
    ],
    warnings: ["Controller-ready VRI compatibility remains unverified."],
  });
}

function evidenceResult(input: {
  kind: CornerGpsMapLegacyEvidenceKind;
  sourceRef?: CornerGpsMapSourceRef;
  metadata: Record<string, string>;
  machineDimensions: CornerGpsMapLegacyMachineDimensions;
  pathPointSummary: CornerGpsMapLegacyPathPointSummary;
  vriSummary: CornerGpsMapLegacyVriSummary;
  statuses: string[];
  violations: CornerGpsMapLegacyViolation[];
  diagnostics: string[];
  warnings: string[];
}): CornerGpsMapLegacyEvidence {
  const warnings = [...input.warnings];
  if (input.kind === "out" && input.violations.length === 0 && input.statuses.length === 0) {
    warnings.push("OUT evidence did not include recognizable status or violation fields.");
  }
  return {
    kind: input.kind,
    sourceRef: input.sourceRef,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    controllerReady: false,
    metadata: input.metadata,
    machineDimensions: input.machineDimensions,
    pathPointSummary: input.pathPointSummary,
    vriSummary: input.vriSummary,
    statusSummary: {
      values: dedupe(input.statuses).slice(0, 20),
      violationCount: input.violations.length,
      warningCount: input.violations.filter((violation) => violation.severity === "warning").length,
      blockerCount: input.violations.filter((violation) => violation.severity === "blocker").length,
    },
    violations: input.violations,
    diagnostics: input.diagnostics,
    warnings: dedupe(warnings),
  };
}

function dimensionsFromRows(table: CsvTable): CornerGpsMapLegacyMachineDimensions {
  const fields: Record<string, string> = {};
  table.header.forEach((header, index) => {
    const normalized = normalizeKey(header);
    if (!dimensionKey(normalized)) return;
    const firstValue = table.rows.map((row) => row[index] ?? "").find((value) => value.trim());
    if (firstValue) fields[normalized] = firstValue;
  });
  return dimensionsFromFields(fields);
}

function dimensionsFromFields(fields: Record<string, string>): CornerGpsMapLegacyMachineDimensions {
  return {
    cornerLengthMeters: firstMeasurement(fields, ["cornerlength", "cornerarm", "cornerarmlength"]),
    overhangLengthMeters: firstMeasurement(fields, ["overhang", "overhanglength"]),
    lrduBoundaryDistanceMeters: firstMeasurement(fields, ["lrduboundarydistance", "minlrduboundarydist", "lrdudistance", "lrduclearance"]),
    endGunReachMeters: firstMeasurement(fields, ["endgun", "endgunreach", "endgunthrow"]),
    spanCount: firstInteger(fields, ["spancount", "spans"]),
    towerCount: firstInteger(fields, ["towercount", "towers"]),
    rawFieldCount: Object.keys(fields).length,
  };
}

function pathSummaryFromTable(table: CsvTable): CornerGpsMapLegacyPathPointSummary {
  const coordinateColumns = table.header.filter((header) => COORDINATE_HEADER_PATTERN.test(header));
  const pathColumns = table.header.filter((header) => PATH_HEADER_PATTERN.test(header));
  const pointCount = coordinateColumns.length >= 2 || pathColumns.length > 0 ? table.rows.length : 0;
  return {
    pointCount,
    hasCoordinateColumns: coordinateColumns.length > 0,
    coordinateColumns: coordinateColumns.map(redactedColumnName),
    closedPath: closedPathFromTable(table, coordinateColumns),
  };
}

function vriSummaryFromTable(table: CsvTable): CornerGpsMapLegacyVriSummary {
  const rateIndex = table.header.findIndex((header) => RATE_HEADER_PATTERN.test(header) && !/zone/i.test(header));
  const zoneIndex = table.header.findIndex((header) => /zone/i.test(header));
  const rates = rateIndex >= 0
    ? table.rows.map((row) => numericValue(row[rateIndex])).filter((value): value is number => value !== null)
    : [];
  const zoneIds = zoneIndex >= 0 ? new Set(table.rows.map((row) => row[zoneIndex]).filter(Boolean)) : new Set<string>();
  return vriSummaryFromRates(zoneIds.size || rates.length, rates);
}

function vriSummaryFromRates(zoneCount: number, rates: number[]): CornerGpsMapLegacyVriSummary {
  if (rates.length === 0) return { zoneCount };
  const sum = rates.reduce((total, value) => total + value, 0);
  return {
    zoneCount,
    minRatePercent: Math.min(...rates),
    maxRatePercent: Math.max(...rates),
    averageRatePercent: Number((sum / rates.length).toFixed(3)),
    uniqueRateCount: new Set(rates.map((value) => value.toFixed(3))).size,
  };
}

function statusFromTable(table: CsvTable): { statuses: string[]; violations: CornerGpsMapLegacyViolation[] } {
  const statusIndexes = table.header
    .map((header, index) => STATUS_HEADER_PATTERN.test(header) ? index : -1)
    .filter((index) => index >= 0);
  const statuses: string[] = [];
  const violations: CornerGpsMapLegacyViolation[] = [];
  for (const row of table.rows) {
    for (const index of statusIndexes) {
      const value = row[index]?.trim();
      if (!value) continue;
      statuses.push(safeMetadataValue(value));
      const violation = violationFromText(value);
      if (violation) violations.push(violation);
    }
  }
  return { statuses, violations: dedupeViolations(violations) };
}

function parseCsvTable(text: string): CsvTable {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  return { header, rows: rows.slice(1) };
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function keyValuePair(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*?)\s*$/);
  return match ? { key: match[1], value: match[2] } : null;
}

function metadataKey(key: string): boolean {
  return /(version|model|machine|field|job|date|operator|software|project|scenario)/i.test(key);
}

function dimensionKey(key: string): boolean {
  return /(corner|overhang|lrdu|endgun|span|tower)/i.test(key);
}

function firstMeasurement(fields: Record<string, string>, keys: string[]): number | undefined {
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!keys.some((key) => fieldKey.includes(key))) continue;
    const parsed = measurementMeters(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function firstInteger(fields: Record<string, string>, keys: string[]): number | undefined {
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!keys.some((key) => fieldKey.includes(key))) continue;
    const parsed = Math.trunc(Number(value.replace(/[^\d.-]/g, "")));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function measurementMeters(value: string): number | undefined {
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return /\b(ft|feet|foot)\b/i.test(value) ? feetToMeters(parsed) : parsed;
}

function numericValue(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function closedPathFromTable(table: CsvTable, coordinateColumns: string[]): boolean | undefined {
  if (coordinateColumns.length < 2 || table.rows.length < 2) return undefined;
  const indexes = coordinateColumns.slice(0, 2).map((name) => table.header.indexOf(name));
  const first = table.rows[0];
  const last = table.rows[table.rows.length - 1];
  return indexes.every((index) => index >= 0 && first[index] === last[index]);
}

function violationFromText(text: string): CornerGpsMapLegacyViolation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/\b(fail|failed|blocked|error|violation|outside|exceeded|invalid)\b/i.test(trimmed)) {
    return {
      severity: "blocker",
      code: codeFromText(trimmed),
      message: safeMetadataValue(trimmed),
    };
  }
  if (/\b(warn|warning|review|caution|shortfall|clearance)\b/i.test(trimmed)) {
    return {
      severity: "warning",
      code: codeFromText(trimmed),
      message: safeMetadataValue(trimmed),
    };
  }
  if (/\b(ok|pass|passed|complete|ready)\b/i.test(trimmed)) {
    return {
      severity: "info",
      code: codeFromText(trimmed),
      message: safeMetadataValue(trimmed),
    };
  }
  return null;
}

function coordinateLikeLine(line: string): boolean {
  return /(lat|latitude|lon|longitude|easting|northing|x\s*[=:,]|y\s*[=:,])/i.test(line) && numberMatches(line).length >= 2;
}

function numberMatches(value: string): RegExpMatchArray[] {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)];
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function codeFromText(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized.slice(0, 48) || "legacy_status";
}

function safeMetadataValue(value: string): string {
  return value
    .replace(/[A-Z]:\\[^\s,;]+/g, "[redacted-path]")
    .replace(/\/(?:[^/\s,;]+\/){2,}[^/\s,;]+/g, "[redacted-path]")
    .replace(/(-?\d{1,3}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/g, "[redacted-coordinate]")
    .slice(0, 240);
}

function redactedColumnName(value: string): string {
  const normalized = normalizeKey(value);
  if (/lat|latitude/.test(normalized)) return "latitude";
  if (/lon|long|longitude/.test(normalized)) return "longitude";
  if (/easting/.test(normalized)) return "easting";
  if (/northing/.test(normalized)) return "northing";
  if (normalized === "x") return "x";
  if (normalized === "y") return "y";
  return "coordinate";
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeViolations(violations: CornerGpsMapLegacyViolation[]): CornerGpsMapLegacyViolation[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.severity}:${violation.code}:${violation.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
