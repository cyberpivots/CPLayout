import type { AppSettings } from "./settings";
import type { LayoutResult, PivotProject } from "./types";
import { assertProjectedCrs } from "./units";

export const EXPERT_REVIEW_ROLES = [
  "Product/UX",
  "GIS/Mapping",
  "Architecture/Storage",
  "ML Feasibility",
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
    productUxReview(settings),
    gisMappingReview(project, settings),
    architectureStorageReview(project, settings),
    mlFeasibilityReview(),
    qaSafetyReview(result),
  ];
}

function productUxReview(settings: AppSettings): ExpertReviewFinding {
  const decimalDegreesDefault = settings.coordinateDisplayFormat === "decimal_degrees";
  return {
    role: "Product/UX",
    status: decimalDegreesDefault ? "pass" : "watch",
    headline: decimalDegreesDefault ? "Decimal-degree coordinate entry is active" : "Coordinate entry is not using the WGS84 default",
    finding: decimalDegreesDefault
      ? "User-facing WGS84 entry and display start in decimal degrees while projected/local coordinates remain available."
      : "Switch user-facing WGS84 entry and display to decimal degrees by default; keep projected/local coordinates available as an expert mode.",
    evidence: [
      `Coordinate display: ${settings.coordinateDisplayFormat.replaceAll("_", " ")}`,
      `Unit system: ${settings.unitSystem.replaceAll("_", " ")}`,
    ],
    acceptanceGate: "New and restored projects show decimal degrees unless the project explicitly stores another coordinate display format.",
  };
}

function gisMappingReview(project: PivotProject, settings: AppSettings): ExpertReviewFinding {
  const projectedCrs = isProjectedCrs(project.projectCrs);
  const packageCount = project.mapPackages?.length ?? 0;
  const packageMetadataReady = packageCount === 0
    ? true
    : project.mapPackages?.every((mapPackage) => mapPackage.attribution && mapPackage.licenseText) ?? false;
  const status: ExpertReviewStatus = projectedCrs && packageMetadataReady ? "pass" : "blocked";

  return {
    role: "GIS/Mapping",
    status,
    headline: projectedCrs ? "Projected CRS remains canonical" : "Project CRS is not calculation-safe",
    finding: projectedCrs
      ? "Geometry mutation and layout calculations stay in projected/local XY. WGS84 is limited to input, display, source metadata, and tile bounds."
      : "Layout calculations must not run against a geographic CRS. Select a projected/local project CRS before editing field geometry.",
    evidence: [
      `Project CRS: ${project.projectCrs}`,
      `Map style: ${settings.mapStyle.replaceAll("_", " ")}`,
      `Online imagery preview: ${settings.onlineImagery.enabled ? settings.onlineImagery.providerId : "disabled"}`,
      `Offline map packages: ${packageCount}`,
      `Map attribution required: ${settings.offlineMaps.requireAttribution}`,
      `Network tiles allowed: ${settings.offlineMaps.allowNetworkTiles}`,
    ],
    acceptanceGate: "A project export can be validated with projected XY geometry plus complete attribution/license metadata for every offline map package.",
  };
}

function architectureStorageReview(project: PivotProject, settings: AppSettings): ExpertReviewFinding {
  const localOnly = settings.offlineMaps.allowNetworkTiles === false;
  const storesLocalDirectory = Boolean(settings.offlineMaps.packageDirectory);
  return {
    role: "Architecture/Storage",
    status: localOnly && storesLocalDirectory ? "pass" : "blocked",
    headline: "Offline-first storage boundary is explicit",
    finding: "Project-relevant settings round-trip in project documents, while local package directories remain local-only app settings.",
    evidence: [
      `Preferred package type: ${settings.offlineMaps.preferredPackageType}`,
      `Local package directory: ${settings.offlineMaps.packageDirectory}`,
      `Project has settings: ${project.settings ? "yes" : "no"}`,
    ],
    acceptanceGate: "Native persistence stays behind Expo SQLite verification; web remains on the current browser backend until the web SQLite gate passes.",
  };
}

function mlFeasibilityReview(): ExpertReviewFinding {
  return {
    role: "ML Feasibility",
    status: "watch",
    headline: "ML stays research-gated and offline-first",
    finding: "Use Python/GDAL/ML only in offline preprocessing or companion tools until a native on-device inference path is device-proven.",
    evidence: [
      "No ML runtime dependency is required for the current app shell.",
      "React Native UI consumes typed project data and metadata, not Python GIS packages directly.",
    ],
    acceptanceGate: "Any app-embedded ML proposal includes model format, native runtime, Expo development-build impact, bundle size, offline test data, and device verification.",
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
