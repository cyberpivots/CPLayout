import type { AppSettings } from "./settings";
import type { LayoutResult, PivotProject } from "./types";
import { assertProjectedCrs } from "./units";

export const EXPERT_REVIEW_ROLES = [
  "Product/Workflow",
  "GIS/Imagery",
  "Pivot Design",
  "Survey/RTK",
  "Storage/Export",
  "QA/Safety",
] as const;

export type ExpertReviewRole = typeof EXPERT_REVIEW_ROLES[number];
export type ExpertReviewStatus = "pass" | "watch" | "blocked";

export interface ExpertReviewFinding {
  role: ExpertReviewRole;
  status: ExpertReviewStatus;
  headline: string;
  finding: string;
  evidence: string[];
  acceptanceGate: string;
}

export function buildExpertReviewFindings(
  project: PivotProject,
  result: LayoutResult,
  settings: AppSettings,
): ExpertReviewFinding[] {
  return [
    productWorkflowReview(settings),
    gisImageryReview(project, settings),
    pivotDesignReview(project, result),
    surveyRtkReview(project, settings),
    storageExportReview(project, settings),
    qaSafetyReview(result),
  ];
}

function productWorkflowReview(settings: AppSettings): ExpertReviewFinding {
  const decimalDegreesDefault = settings.coordinateDisplayFormat === "decimal_degrees";
  return {
    role: "Product/Workflow",
    status: decimalDegreesDefault ? "pass" : "watch",
    headline: decimalDegreesDefault ? "Decimal-degree coordinate entry is active" : "Coordinate entry is not using the WGS84 default",
    finding: decimalDegreesDefault
      ? "The console keeps field entry in decimal degrees while projected/local coordinates remain available for expert inspection."
      : "Switch user-facing WGS84 entry and display to decimal degrees by default; keep projected/local coordinates available as an expert mode.",
    evidence: [
      `Coordinate display: ${settings.coordinateDisplayFormat.replaceAll("_", " ")}`,
      `Workflow mode: ${settings.mappingWorkflowMode === "design" ? "Edit Geometry" : "Review Layout"}`,
      `Unit system: ${settings.unitSystem.replaceAll("_", " ")}`,
    ],
    acceptanceGate: "New and restored projects show decimal degrees unless the project explicitly stores another coordinate display format.",
  };
}

function gisImageryReview(project: PivotProject, settings: AppSettings): ExpertReviewFinding {
  const projectedCrs = isProjectedCrs(project.projectCrs);
  const packageCount = project.mapPackages?.length ?? 0;
  const packageMetadataReady = packageCount === 0
    ? true
    : project.mapPackages?.every((mapPackage) => mapPackage.attribution && mapPackage.licenseText) ?? false;
  const status: ExpertReviewStatus = projectedCrs && packageMetadataReady ? "pass" : "blocked";

  return {
    role: "GIS/Imagery",
    status,
    headline: projectedCrs ? "Projected CRS remains canonical" : "Project CRS is not calculation-safe",
    finding: projectedCrs
      ? "Geometry mutation and layout calculations stay in projected/local XY. WGS84, KML/KMZ, and live imagery remain input, display, and evidence layers."
      : "Layout calculations must not run against a geographic CRS. Select a projected/local project CRS before editing field geometry.",
    evidence: [
      `Project CRS: ${project.projectCrs}`,
      `Map style: ${settings.mapStyle.replaceAll("_", " ")}`,
      `Browser imagery: ${settings.onlineImagery.enabled ? `${settings.onlineImagery.providerId} active; attribution required on map` : "disabled"}`,
      `Offline map packages: ${packageCount}`,
      `Map attribution required: ${settings.offlineMaps.requireAttribution}`,
      `Project package network tiles allowed: ${settings.offlineMaps.allowNetworkTiles}`,
    ],
    acceptanceGate: "A project export can be validated with projected XY geometry plus complete attribution/license metadata for every offline map package.",
  };
}

function pivotDesignReview(project: PivotProject, result: LayoutResult): ExpertReviewFinding {
  const hasConflicts = result.metrics.obstacleConflictCount > 0 || result.metrics.outsideFieldAcres > 0;
  const hasMachine = project.machine.spanLengthsMeters.length > 0;
  const status: ExpertReviewStatus = hasMachine && !hasConflicts ? "pass" : "watch";
  return {
    role: "Pivot Design",
    status,
    headline: status === "pass" ? "Current pivot geometry is feasible for review" : "Pivot geometry needs design review",
    finding: status === "pass"
      ? "The machine, field boundary, and obstacle model can be reviewed without active outside-field or obstacle conflicts."
      : "Resolve machine definition gaps, outside-field coverage, or obstacle conflicts before using the layout for production decisions.",
    evidence: [
      `Machine spans: ${project.machine.spanLengthsMeters.length}`,
      `Coverage: ${result.metrics.coveragePercent.toFixed(1)}%`,
      `Outside field acres: ${result.metrics.outsideFieldAcres.toFixed(2)}`,
      `Obstacle conflicts: ${result.metrics.obstacleConflictCount}`,
    ],
    acceptanceGate: "The operator accepts the projected-XY pivot geometry after coverage, clearance, obstacle, and sweep checks.",
  };
}

function surveyRtkReview(project: PivotProject, settings: AppSettings): ExpertReviewFinding {
  const fixedCount = project.surveyPoints.filter((point) => point.confidence === "rtk_fixed").length;
  const surveyCount = project.surveyPoints.length;
  const status: ExpertReviewStatus = surveyCount === 0 ? "watch" : fixedCount > 0 ? "pass" : "watch";
  return {
    role: "Survey/RTK",
    status,
    headline: fixedCount > 0 ? "RTK-fixed survey evidence is present" : "Survey evidence is planning-grade",
    finding: fixedCount > 0
      ? "Survey/control points include RTK-fixed evidence and can support operator review of imagery-traced geometry."
      : "Add RTK-fixed, imported, or field-verified control points before treating imagery-traced geometry as production-ready.",
    evidence: [
      `Survey points: ${surveyCount}`,
      `RTK fixed points: ${fixedCount}`,
      `Minimum fix gate: ${settings.gpsQuality.minimumFixType.replaceAll("_", " ")}`,
      `Minimum satellites: ${settings.gpsQuality.minSatellites}`,
    ],
    acceptanceGate: "Survey points meet the configured quality gate or are explicitly marked as planning-grade evidence.",
  };
}

function storageExportReview(project: PivotProject, settings: AppSettings): ExpertReviewFinding {
  const localOnly = settings.offlineMaps.allowNetworkTiles === false;
  const storesLocalDirectory = Boolean(settings.offlineMaps.packageDirectory);
  return {
    role: "Storage/Export",
    status: localOnly && storesLocalDirectory ? "pass" : "blocked",
    headline: "Offline-first storage boundary is explicit",
    finding: "Project-relevant settings round-trip in project documents, while online imagery, custom source drafts, walkthrough progress, and local package directories remain local-only app settings.",
    evidence: [
      `Preferred package type: ${settings.offlineMaps.preferredPackageType}`,
      `Local package directory: ${settings.offlineMaps.packageDirectory}`,
      `Project has settings: ${project.settings ? "yes" : "no"}`,
      `Saved online imagery in project: ${project.settings && "onlineImagery" in project.settings ? "yes" : "no"}`,
    ],
    acceptanceGate: "Native persistence stays behind Expo SQLite verification; web remains on the current browser backend until the web SQLite gate passes.",
  };
}

function qaSafetyReview(result: LayoutResult): ExpertReviewFinding {
  const hasWarnings = result.warnings.length > 0;
  const hasConflicts = result.metrics.obstacleConflictCount > 0 || result.metrics.outsideFieldAcres > 0;
  const status: ExpertReviewStatus = hasWarnings || hasConflicts ? "watch" : "pass";

  return {
    role: "QA/Safety",
    status,
    headline: status === "pass" ? "Current scenario has no active safety warnings" : "Scenario needs field review before use",
    finding: status === "pass"
      ? "The current layout metrics do not report obstacle conflicts or outside-field coverage."
      : "Treat conflicts, outside-field coverage, and warnings as blockers for production field use until reviewed.",
    evidence: [
      `Obstacle conflicts: ${result.metrics.obstacleConflictCount}`,
      `Outside field acres: ${result.metrics.outsideFieldAcres.toFixed(2)}`,
      `Warnings: ${result.warnings.length}`,
    ],
    acceptanceGate: "Validation output, project export, and reviewer notes are saved before field deployment decisions.",
  };
}

function isProjectedCrs(projectCrs: string): boolean {
  try {
    assertProjectedCrs(projectCrs);
    return true;
  } catch {
    return false;
  }
}
