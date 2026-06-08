import { projectXyToLonLat } from "./coordinates";
import type { LonLat, PivotProject, SurveyPoint, XY } from "./types";

export interface CornerGpsMapBpfExportPoint extends LonLat {
  altitude?: number;
}

export type CornerGpsMapBpfBoundarySource = { kind: "field_boundary"; label?: string };

export type CornerGpsMapBpfPointSource =
  | { kind: "project_pivot_center"; label?: string }
  | { kind: "survey_point"; surveyPointId: string; label?: string }
  | { kind: "wgs84"; point: CornerGpsMapBpfExportPoint; label?: string };

export interface CornerGpsMapBpfExportOptions {
  boundarySource?: CornerGpsMapBpfBoundarySource;
  centerSource?: CornerGpsMapBpfPointSource;
  benchmark?: CornerGpsMapBpfPointSource;
  coordinatePrecision?: number;
  altitudePrecision?: number;
  sourceLabel?: string;
}

export interface CornerGpsMapBpfExportPointCounts {
  borderPoints: number;
  centerPoints: number;
  benchmarkPoints: number;
}

export interface CornerGpsMapBpfExportDiagnostics {
  boundarySource: string;
  centerSource: string;
  benchmarkSource?: string;
  sourceLabel?: string;
  projectCrs: string;
  coordinateSystem: "WGS84 decimal degrees";
  canonicalGeometryMutation: false;
}

export interface CornerGpsMapBpfExportResult {
  xmlText: string;
  diagnostics: CornerGpsMapBpfExportDiagnostics;
  exportedPointCounts: CornerGpsMapBpfExportPointCounts;
  compatibilityWarnings: string[];
}

const DEFAULT_COORDINATE_PRECISION = 7;
const DEFAULT_ALTITUDE_PRECISION = 3;

export function exportCornerGpsMapBpf(
  project: PivotProject,
  options: CornerGpsMapBpfExportOptions = {},
): CornerGpsMapBpfExportResult {
  const boundarySource = options.boundarySource ?? { kind: "field_boundary" };
  if (boundarySource.kind !== "field_boundary") {
    throw new Error("CornerGPSMap BPF export currently supports the project field boundary only.");
  }
  if (project.fieldBoundary.length < 3) {
    throw new Error("CornerGPSMap BPF export requires at least three projected field-boundary vertices.");
  }

  const coordinatePrecision = boundedPrecision(options.coordinatePrecision, DEFAULT_COORDINATE_PRECISION);
  const altitudePrecision = boundedPrecision(options.altitudePrecision, DEFAULT_ALTITUDE_PRECISION);
  const compatibilityWarnings: string[] = [
    "BPF export is WGS84 visual/interchange evidence only; canonical projected XY project geometry is not changed.",
    "Controller-ready GGS/VRI output and proprietary CornerGPSMap/FLT runtime compatibility remain unverified.",
  ];
  const borderPoints = project.fieldBoundary.map((point, index) => projectPointToLonLat(project, point, `field boundary vertex ${index + 1}`));
  const centerSource = options.centerSource ?? { kind: "project_pivot_center" };
  const centerPoint = resolvePointSource(project, centerSource);
  const benchmarkPoint = options.benchmark ? resolvePointSource(project, options.benchmark) : undefined;
  if (!benchmarkPoint) {
    compatibilityWarnings.push("No BenchMark point was exported; CornerGPSMap can import boundary and center evidence, but review local workflow expectations.");
  }

  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<BorderPoints>",
  ];
  if (options.sourceLabel) lines.push(`  <!-- ${escapeComment(options.sourceLabel)} -->`);
  if (benchmarkPoint) lines.push(`  ${pointElement("BenchMark", benchmarkPoint, coordinatePrecision, altitudePrecision)}`);
  lines.push(`  ${pointElement("CenterPoint", centerPoint, coordinatePrecision, altitudePrecision)}`);
  for (const point of borderPoints) {
    lines.push(`  ${pointElement("BorderPoint", point, coordinatePrecision, altitudePrecision)}`);
  }
  lines.push("</BorderPoints>");

  return {
    xmlText: `${lines.join("\n")}\n`,
    diagnostics: {
      boundarySource: sourceLabel(boundarySource),
      centerSource: sourceLabel(centerSource),
      benchmarkSource: options.benchmark ? sourceLabel(options.benchmark) : undefined,
      sourceLabel: options.sourceLabel,
      projectCrs: project.projectCrs,
      coordinateSystem: "WGS84 decimal degrees",
      canonicalGeometryMutation: false,
    },
    exportedPointCounts: {
      borderPoints: borderPoints.length,
      centerPoints: 1,
      benchmarkPoints: benchmarkPoint ? 1 : 0,
    },
    compatibilityWarnings,
  };
}

function resolvePointSource(project: PivotProject, source: CornerGpsMapBpfPointSource): CornerGpsMapBpfExportPoint {
  if (source.kind === "project_pivot_center") return projectPointToLonLat(project, project.pivotCenter, "project pivot center");
  if (source.kind === "wgs84") return validateLonLat(source.point, sourceLabel(source));
  const surveyPoint = project.surveyPoints.find((point) => point.id === source.surveyPointId);
  if (!surveyPoint) throw new Error(`Survey point ${source.surveyPointId} was not found for BPF export.`);
  return surveyPointToExportPoint(project, surveyPoint);
}

function surveyPointToExportPoint(project: PivotProject, point: SurveyPoint): CornerGpsMapBpfExportPoint {
  if (point.wgs84) return validateLonLat(point.wgs84, `survey point ${point.id}`);
  return projectPointToLonLat(project, point.projected, `survey point ${point.id}`);
}

function projectPointToLonLat(project: PivotProject, point: XY, label: string): CornerGpsMapBpfExportPoint {
  try {
    return projectXyToLonLat(point, project.projectCrs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not project ${label} from ${project.projectCrs} to WGS84 for CornerGPSMap BPF export: ${message}`);
  }
}

function pointElement(
  tag: "BenchMark" | "CenterPoint" | "BorderPoint",
  point: CornerGpsMapBpfExportPoint,
  coordinatePrecision: number,
  altitudePrecision: number,
): string {
  const attributes = [
    `Latitude="${formatNumber(point.latitude, coordinatePrecision)}"`,
    `Longitude="${formatNumber(point.longitude, coordinatePrecision)}"`,
  ];
  if (point.altitude !== undefined) attributes.push(`Altitude="${formatNumber(point.altitude, altitudePrecision)}"`);
  return `<${tag} ${attributes.join(" ")} />`;
}

function validateLonLat(point: LonLat, label: string): CornerGpsMapBpfExportPoint {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error(`${label} latitude must be a finite value between -90 and 90 degrees.`);
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error(`${label} longitude must be a finite value between -180 and 180 degrees.`);
  }
  return { ...point };
}

function sourceLabel(source: CornerGpsMapBpfBoundarySource | CornerGpsMapBpfPointSource): string {
  if (source.label) return source.label;
  if (source.kind === "field_boundary") return "project field boundary";
  if (source.kind === "project_pivot_center") return "project pivot center";
  if (source.kind === "survey_point") return `survey point ${source.surveyPointId}`;
  return "explicit WGS84 point";
}

function boundedPrecision(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > 12) {
    throw new Error("CornerGPSMap BPF coordinate precision must be an integer between 0 and 12.");
  }
  return value;
}

function formatNumber(value: number, precision: number): string {
  return value.toFixed(precision);
}

function escapeComment(value: string): string {
  return value.replace(/-->/g, "--&gt;").replace(/[\r\n\t]/g, " ");
}
