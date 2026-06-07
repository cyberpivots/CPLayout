import {
  CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS,
  CornerGpsMapReviewSettings,
  PivotProject,
  ProjectMapFeature,
  XY,
} from "@cplayout/core";

import { endGunRadiusMeters, machineRadiusMeters } from "./geometry";

export type CornerGpsMapAdvisoryReviewStatus = "ready" | "blocked";
export type CornerGpsMapAdvisoryIssueSeverity = "info" | "warning" | "blocker";

export interface CornerGpsMapAdvisoryIssue {
  severity: CornerGpsMapAdvisoryIssueSeverity;
  code: string;
  message: string;
  shortfallMeters?: number;
}

export interface CornerGpsMapAdvisoryReviewMetrics {
  machineRadiusMeters: number;
  endGunRadiusMeters: number;
  minBoundaryDistanceFromPivotMeters: number | null;
  lrduBoundaryClearanceMeters: number | null;
  endGunBoundaryClearanceMeters: number | null;
  minObstacleClearanceMeters: number | null;
}

export interface CornerGpsMapAdvisoryReview {
  status: CornerGpsMapAdvisoryReviewStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  unverifiedManufacturerKinematics: true;
  qualifiedReviewRequired: true;
  settings: CornerGpsMapReviewSettings;
  metrics: CornerGpsMapAdvisoryReviewMetrics;
  issues: CornerGpsMapAdvisoryIssue[];
  advisoryPathFeatureIds: string[];
}

export interface CornerGpsMapAdvisoryReviewOptions {
  settings?: CornerGpsMapReviewSettings;
}

const ADVISORY_PATH_FEATURE_KINDS = new Set<ProjectMapFeature["kind"]>([
  "machine_zone",
  "linear_move_path",
  "measurement_line",
  "end_gun_arc",
  "corner_swing_limit",
]);

export function evaluateCornerGpsMapAdvisoryReview(
  project: PivotProject,
  options: CornerGpsMapAdvisoryReviewOptions = {},
): CornerGpsMapAdvisoryReview {
  const settings = options.settings ?? CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS;
  const issues: CornerGpsMapAdvisoryIssue[] = [
    {
      severity: "warning",
      code: "unverified_manufacturer_kinematics",
      message: "CornerGPSMap-inspired review is advisory only; proprietary path generation, steering, GGS/VRI export, and sprinkler sequencing remain unverified.",
    },
  ];
  const machineRadius = machineRadiusMeters(project.machine);
  const endGunRadius = endGunRadiusMeters(project.machine);
  let minBoundaryDistance: number | null = null;
  let lrduBoundaryClearance: number | null = null;
  let endGunBoundaryClearance: number | null = null;
  let minObstacleClearance: number | null = null;

  if (project.fieldBoundary.length < 3) {
    issues.push({
      severity: "blocker",
      code: "missing_projected_boundary",
      message: "Projected field boundary is required before CornerGPSMap advisory review.",
    });
  } else {
    minBoundaryDistance = minDistanceToRing(project.pivotCenter, project.fieldBoundary);
    lrduBoundaryClearance = minBoundaryDistance - machineRadius;
    endGunBoundaryClearance = minBoundaryDistance - endGunRadius - settings.safetyZoneMeters;
    if (lrduBoundaryClearance < settings.minLrduBoundaryClearanceMeters) {
      issues.push({
        severity: "blocker",
        code: "lrdu_boundary_clearance_shortfall",
        message: "Estimated LRDU clearance to the projected field boundary is below the source-labeled CornerGPSMap review minimum.",
        shortfallMeters: settings.minLrduBoundaryClearanceMeters - lrduBoundaryClearance,
      });
    }
    if (endGunBoundaryClearance < 0) {
      issues.push({
        severity: "warning",
        code: "end_gun_boundary_review",
        message: "Estimated end-gun reach plus source-labeled safety zone reaches beyond the projected field boundary.",
        shortfallMeters: Math.abs(endGunBoundaryClearance),
      });
    }
  }

  if (project.obstacles.length > 0) {
    minObstacleClearance = Math.min(...project.obstacles.map((obstacle) => {
      const radialDistance = minDistanceToRing(project.pivotCenter, obstacle.polygon);
      return Math.abs(radialDistance - machineRadius) - obstacle.bufferMeters;
    }));
    if (minObstacleClearance < settings.safetyZoneMeters) {
      issues.push({
        severity: "warning",
        code: "obstacle_clearance_review",
        message: "At least one obstacle is close to the estimated LRDU radius and needs qualified review.",
        shortfallMeters: settings.safetyZoneMeters - minObstacleClearance,
      });
    }
  } else {
    issues.push({
      severity: "info",
      code: "no_obstacle_evidence",
      message: "No obstacle polygons are saved; CornerGPSMap-style obstacle clearance cannot be reviewed.",
    });
  }

  const advisoryPathFeatureIds = (project.mapFeatures ?? [])
    .filter((feature) => ADVISORY_PATH_FEATURE_KINDS.has(feature.kind))
    .map((feature) => feature.id);
  if (advisoryPathFeatureIds.length === 0) {
    issues.push({
      severity: "info",
      code: "no_advisory_path_features",
      message: "No LRDU, SDU, end-gun, machine-zone, or corner-swing evidence features are saved for review.",
    });
  }

  return {
    status: issues.some((issue) => issue.severity === "blocker") ? "blocked" : "ready",
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    unverifiedManufacturerKinematics: true,
    qualifiedReviewRequired: true,
    settings,
    metrics: {
      machineRadiusMeters: machineRadius,
      endGunRadiusMeters: endGunRadius,
      minBoundaryDistanceFromPivotMeters: minBoundaryDistance,
      lrduBoundaryClearanceMeters: lrduBoundaryClearance,
      endGunBoundaryClearanceMeters: endGunBoundaryClearance,
      minObstacleClearanceMeters: minObstacleClearance,
    },
    issues,
    advisoryPathFeatureIds,
  };
}

function minDistanceToRing(point: XY, ring: XY[]): number {
  if (ring.length === 0) return Number.POSITIVE_INFINITY;
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    minDistance = Math.min(minDistance, distancePointToSegment(point, a, b));
  }
  return minDistance;
}

function distancePointToSegment(point: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
