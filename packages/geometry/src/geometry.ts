import * as polygonClipping from "polygon-clipping";

import {
  AdvisoryCornerArmConfig,
  LayoutMechanicalConflict,
  LayoutResult,
  MultiPolygonXY,
  ObstacleZone,
  PivotMachine,
  PivotProject,
  ProjectMapFeature,
  ProjectSettings,
  PivotSweep,
  PolygonXY,
  TowerPoint,
  XY,
} from "@cplayout/core";
import { assertProjectedCrs, feetToMeters, squareMetersToAcres } from "@cplayout/core";

type ClipPosition = [number, number];
type ClipPolygon = ClipPosition[][];
type ClipMultiPolygon = ClipPolygon[];

const DEFAULT_SEGMENTS = 288;
const EPSILON_AREA = 0.000001;
const DEFAULT_CORNER_ARM_WHEEL_TRACK_EXTENSION_METERS = 66;
const DEFAULT_CORNER_ARM_OVERHANG_EXTENSION_METERS = 25;
export const DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS = 0.01;

export type CornerArmPathModel = "max_extension_envelope" | "corner_swing_limit_variable_reach";
export type CornerArmExtensionEvidenceSource = "none" | "corner_swing_limit";

export interface CornerArmPathPoint {
  angleDegrees: number;
  sequenceIndex: number;
  wheelTrackRadiusMeters: number;
  overhangEndRadiusMeters: number;
  wheelTrackExtensionMeters: number;
  overhangEndExtensionMeters: number;
  point: XY;
}

export interface CornerArmExtensionSlopeSummary {
  domain: "angle_degrees";
  maxExtensionMetersPerDegree: number;
  maxRetractionMetersPerDegree: number;
  maxAbsoluteMetersPerDegree: number;
  sampleCount: number;
}

export interface CornerArmPathConstraintSummary {
  safetyZoneMeters: number;
  activeFieldBoundary: CornerArmBoundaryConstraintSummary;
  planningBoundary: CornerArmPlanningBoundaryConstraintSummary;
  speedRatio: CornerArmSpeedRatioConstraintSummary;
  steering: CornerArmSteeringConstraintSummary;
  extensionRate: CornerArmRateConstraintSummary;
  warnings: string[];
}

export interface CornerArmBoundaryConstraintSummary {
  status: "meets_required_clearance" | "shortfall" | "not_evaluated";
  minimumSignedDistanceMeters?: number;
  shortfallMeters?: number;
}

export interface CornerArmPlanningBoundaryConstraintSummary extends CornerArmBoundaryConstraintSummary {
  evidenceFeatureIds: string[];
}

export interface CornerArmSpeedRatioConstraintSummary {
  status: "operator_measured" | "rpm_only_source_required" | "not_available";
  lrduMeasuredSpeedMetersPerMinute?: number;
  sduMeasuredSpeedMetersPerMinute?: number;
  sduToLrduRatio?: number;
}

export interface CornerArmSteeringConstraintSummary {
  status: "source_backed" | "not_available";
  minSteerAngleDegrees?: number;
  maxSteerAngleDegrees?: number;
}

export interface CornerArmRateConstraintSummary {
  status: "source_backed" | "not_available";
  maxExtensionRateMetersPerMinute?: number;
  maxRetractionRateMetersPerMinute?: number;
}

export interface CornerArmPathEvaluation {
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  anchorRadiusMeters: number;
  maxExtensionMeters: number;
  wheelTrackExtensionMeters: number;
  overhangLengthMeters: number;
  wheelTrackRadiusMeters: number;
  overhangEndRadiusMeters: number;
  wheelOverhangSeparationVerified: boolean;
  pathModel: CornerArmPathModel;
  modelFamily: NonNullable<AdvisoryCornerArmConfig["modelFamily"]>;
  extensionEvidenceSource: CornerArmExtensionEvidenceSource;
  evidenceFeatureIds: string[];
  sampledPathPoints: CornerArmPathPoint[];
  sampledPathPointCount: number;
  wheelTrackCenterlineSegments: XY[][];
  overhangEndCenterlineSegments: XY[][];
  extensionSlopeDomain: "angle_degrees";
  extensionSlopeSummary: CornerArmExtensionSlopeSummary;
  constraintSummary: CornerArmPathConstraintSummary;
  wheelTrackEnvelope: MultiPolygonXY;
  overhangEndEnvelope: MultiPolygonXY;
  extensionEnvelope: MultiPolygonXY;
  warnings: string[];
}

export type LayoutPathOverlayKind =
  | "wheel_track"
  | "end_of_machine"
  | "corner_arm_wheel_track"
  | "corner_arm_overhang_end";

export interface LayoutPathOverlay {
  kind: LayoutPathOverlayKind;
  label: string;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  radiusMeters: number;
  bufferMeters: number;
  centerlineSegments: XY[][];
  insideFieldEnvelope: MultiPolygonXY;
  outsideFieldEnvelope: MultiPolygonXY;
  towerIndex?: number;
  evidenceFeatureIds?: string[];
  wheelOverhangSeparationVerified?: boolean;
  anchorRadiusMeters?: number;
  pathModel?: CornerArmPathModel;
  modelFamily?: NonNullable<AdvisoryCornerArmConfig["modelFamily"]>;
  extensionEvidenceSource?: CornerArmExtensionEvidenceSource;
  sampledPathPointCount?: number;
  maxExtensionMeters?: number;
  extensionSlopeDomain?: "angle_degrees";
  maxExtensionSlopeMetersPerDegree?: number;
  maxRetractionSlopeMetersPerDegree?: number;
  warnings?: string[];
}

export interface LayoutPathOverlayOptions {
  settings?: Pick<ProjectSettings, "layoutReview">;
}

export type MachineBoundaryClearanceRowKind =
  | "pivot_center"
  | "wheel_track"
  | "end_of_machine"
  | "end_gun_reach"
  | "corner_arm_wheel_track"
  | "corner_arm_overhang_end";

export interface MachineBoundaryClearanceRow {
  kind: MachineBoundaryClearanceRowKind;
  label: string;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  radiusMeters: number;
  bufferMeters: number;
  minimumBoundaryDistanceMeters: number;
  requiredBoundaryClearanceMeters: number;
  clearanceShortfallMeters: number;
  meetsRequiredBoundaryClearance: boolean;
  outsideFieldEnvelope: MultiPolygonXY;
  outsideFieldAreaSquareMeters: number;
  outsideFieldAcres: number;
  sampledPointCount: number;
  towerIndex?: number;
  evidenceFeatureIds?: string[];
  wheelOverhangSeparationVerified?: boolean;
  warnings: string[];
}

export function machineRadiusMeters(machine: PivotMachine): number {
  return machine.spanLengthsMeters.reduce((sum, span) => sum + span, 0) + machine.overhangMeters;
}

export function lrduAnchorRadiusMeters(machine: PivotMachine): number {
  return machine.spanLengthsMeters.reduce((sum, span) => sum + span, 0);
}

export function endGunRadiusMeters(machine: PivotMachine): number {
  return machineRadiusMeters(machine) + Math.max(0, machine.endGunThrowMeters);
}

export function polygonAreaSquareMeters(ring: XY[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function multiPolygonAreaSquareMeters(multiPolygon: MultiPolygonXY): number {
  return multiPolygon.reduce((total, polygon) => {
    const [outer, ...holes] = polygon;
    const outerArea = polygonAreaSquareMeters(outer ?? []);
    const holeArea = holes.reduce((sum, hole) => sum + polygonAreaSquareMeters(hole), 0);
    return total + Math.max(0, outerArea - holeArea);
  }, 0);
}

export function createCirclePolygon(center: XY, radiusMeters: number, segments = DEFAULT_SEGMENTS): XY[] {
  assertPositive(radiusMeters, "radiusMeters");
  return Array.from({ length: segments }, (_, index) => {
    const theta = (index / segments) * Math.PI * 2;
    return {
      x: center.x + radiusMeters * Math.cos(theta),
      y: center.y + radiusMeters * Math.sin(theta),
    };
  });
}

export function createSectorPolygon(center: XY, radiusMeters: number, sweep: PivotSweep, segments = DEFAULT_SEGMENTS): XY[] {
  assertPositive(radiusMeters, "radiusMeters");
  if (sweep.mode === "full_circle") {
    return createCirclePolygon(center, radiusMeters, segments);
  }

  const angles = buildSweepAngles(sweep.startAngleDegrees, sweep.stopAngleDegrees, sweep.direction, segments);
  return [
    center,
    ...angles.map((angleDegrees) => polarOffset(center, radiusMeters, angleDegrees)),
    center,
  ];
}

export function createAnnularSector(center: XY, innerRadius: number, outerRadius: number, sweep: PivotSweep): MultiPolygonXY {
  if (outerRadius <= innerRadius) return [];
  if (innerRadius <= 0) return [[createSectorPolygon(center, outerRadius, sweep)]];
  const outer = toClipMultiPolygon([[createSectorPolygon(center, outerRadius, sweep)]]);
  const inner = toClipMultiPolygon([[createSectorPolygon(center, innerRadius, sweep)]]);
  return fromClipMultiPolygon(polygonClipping.difference(outer, inner) as ClipMultiPolygon);
}

export function calculateTowerPoints(center: XY, machine: PivotMachine, angleDegrees: number): TowerPoint[] {
  let radiusMeters = 0;
  return machine.spanLengthsMeters.map((spanLength, index) => {
    radiusMeters += spanLength;
    return {
      towerIndex: index + 1,
      radiusMeters,
      point: polarOffset(center, radiusMeters, angleDegrees),
    };
  });
}

export function evaluateLayout(project: PivotProject): LayoutResult {
  assertProjectedCrs(project.projectCrs);

  const coverage = calculateWetCoverage(project);
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const noSprayObstacles = project.obstacles.filter((obstacle) => obstacle.noSpray);
  const obstaclePolygons = project.obstacles.map((obstacle) => [obstacle.polygon]);
  const noSprayObstaclePolygons = noSprayObstacles.map((obstacle) => [obstacle.polygon]);
  const obstacleMulti = toClipMultiPolygon(obstaclePolygons);
  const noSprayObstacleMulti = toClipMultiPolygon(noSprayObstaclePolygons);
  const baseInsideField = polygonClipping.intersection(coverage.base, field) as ClipMultiPolygon | null;
  const endGunInsideField = polygonClipping.intersection(coverage.endGunClip, field) as ClipMultiPolygon | null;
  const insideField = polygonClipping.intersection(coverage.wetRaw, field) as ClipMultiPolygon | null;
  const outsideField = polygonClipping.difference(coverage.wetRaw, field) as ClipMultiPolygon;
  const baseAllowed = baseInsideField
    ? (noSprayObstacles.length > 0
      ? polygonClipping.difference(baseInsideField, noSprayObstacleMulti) as ClipMultiPolygon
      : baseInsideField)
    : [];
  const endGunAllowed = endGunInsideField
    ? (noSprayObstacles.length > 0
      ? polygonClipping.difference(endGunInsideField, noSprayObstacleMulti) as ClipMultiPolygon
      : endGunInsideField)
    : [];
  const allowed = insideField
    ? (noSprayObstacles.length > 0
      ? polygonClipping.difference(insideField, noSprayObstacleMulti) as ClipMultiPolygon
      : insideField)
    : [];
  const mechanicalConflicts = evaluateMechanicalConflicts(project);

  const fieldArea = polygonAreaSquareMeters(project.fieldBoundary);
  const allowedArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(allowed));
  const baseAllowedArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(baseAllowed));
  const endGunArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(endGunAllowed));
  const wetInsideFieldArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(insideField ?? []));
  const blockedByNoSprayArea = Math.max(0, wetInsideFieldArea - allowedArea);
  const outsideArea = multiPolygonAreaSquareMeters(fromClipMultiPolygon(outsideField));
  const obstacleConflictCount = project.obstacles.filter((obstacle) => {
    const intersection = polygonClipping.intersection(coverage.wetRaw, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
    return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? [])) > EPSILON_AREA;
  }).length;
  const noSprayConflictCount = noSprayObstacles.filter((obstacle) => {
    const intersection = polygonClipping.intersection(coverage.wetRaw, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
    return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? [])) > EPSILON_AREA;
  }).length;
  const hardMechanicalConflictCount = uniqueConflictObstacleCount(mechanicalConflicts);
  const towerTrackConflictCount = uniqueConflictObstacleCount(mechanicalConflicts.filter((conflict) => conflict.conflictType === "tower_track"));

  const warnings = buildWarnings(project, outsideArea, obstacleConflictCount, noSprayConflictCount, hardMechanicalConflictCount);
  const towerAngle = project.machine.sweep.mode === "partial_circle"
    ? project.machine.sweep.startAngleDegrees
    : 45;

  return {
    metrics: {
      fieldAcres: squareMetersToAcres(fieldArea),
      irrigatedAcres: squareMetersToAcres(allowedArea),
      nonIrrigatedAcres: squareMetersToAcres(Math.max(0, fieldArea - allowedArea)),
      coveragePercent: fieldArea > 0 ? (allowedArea / fieldArea) * 100 : 0,
      standardPivotAcres: squareMetersToAcres(baseAllowedArea),
      endGunAcres: squareMetersToAcres(endGunArea),
      cornerArmAcres: 0,
      outsideFieldAcres: squareMetersToAcres(outsideArea),
      blockedByNoSprayAcres: squareMetersToAcres(blockedByNoSprayArea),
      obstacleConflictCount,
      noSprayConflictCount,
      hardMechanicalConflictCount,
      towerTrackConflictCount,
    },
    baseCoverage: fromClipMultiPolygon(coverage.base),
    endGunCoverage: coverage.endGun,
    allowedCoverage: fromClipMultiPolygon(allowed),
    outsideFieldCoverage: fromClipMultiPolygon(outsideField),
    obstacles: fromClipMultiPolygon(obstacleMulti),
    mechanicalConflicts,
    towers: calculateTowerPoints(project.pivotCenter, project.machine, towerAngle),
    warnings,
  };
}

export function evaluateMechanicalConflicts(project: PivotProject): LayoutMechanicalConflict[] {
  const hardObstacles = project.obstacles.filter((obstacle) => obstacle.hardConflict);
  if (hardObstacles.length === 0) return [];

  const machineRadius = machineRadiusMeters(project.machine);
  const towerBuffer = Math.max(0.5, project.machine.towerClearanceBufferMeters);
  const machineBuffer = Math.max(0.5, project.machine.machineClearanceBufferMeters);
  const machinePath = createBufferedPathClip(project.pivotCenter, machineRadius, machineBuffer, project.machine.sweep);
  const towerTracks = towerTrackClips(project);
  const conflicts: LayoutMechanicalConflict[] = [];

  for (const obstacle of hardObstacles) {
    const machinePathArea = obstacleIntersectionArea(machinePath, obstacle);
    if (machinePathArea > EPSILON_AREA) {
      conflicts.push(mechanicalConflict(obstacle, "machine_path", machinePathArea));
    }

    const towerTrackArea = towerTracks.reduce((area, towerTrack) => area + obstacleIntersectionArea(towerTrack, obstacle), 0);
    if (towerTrackArea > EPSILON_AREA) {
      conflicts.push(mechanicalConflict(obstacle, "tower_track", towerTrackArea));
    }
  }

  return conflicts;
}

export function buildLayoutPathOverlays(project: PivotProject, options: LayoutPathOverlayOptions = {}): LayoutPathOverlay[] {
  assertProjectedCrs(project.projectCrs);

  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const clipCenterlines = (segments: XY[][]): XY[][] => clipCenterlineSegmentsToField(segments, project.fieldBoundary);
  const overlays: LayoutPathOverlay[] = [];
  const towerBuffer = Math.max(0, project.machine.towerClearanceBufferMeters);
  let towerRadius = 0;

  project.machine.spanLengthsMeters.forEach((spanLength, index) => {
    towerRadius += spanLength;
    overlays.push(layoutPathOverlay(
      "wheel_track",
      `Tower ${index + 1} wheel track`,
      towerRadius,
      towerBuffer,
      clipCenterlines([pathCenterlineSegment(project.pivotCenter, towerRadius, project.machine.sweep)]),
      field,
      createBufferedPathClip(project.pivotCenter, towerRadius, towerBuffer, project.machine.sweep),
      index + 1,
    ));
  });

  const machineRadius = machineRadiusMeters(project.machine);
  const machineBuffer = Math.max(0, project.machine.machineClearanceBufferMeters);
  overlays.push(layoutPathOverlay(
    "end_of_machine",
    "End of machine path",
    machineRadius,
    machineBuffer,
    clipCenterlines([pathCenterlineSegment(project.pivotCenter, machineRadius, project.machine.sweep)]),
    field,
    createBufferedPathClip(project.pivotCenter, machineRadius, machineBuffer, project.machine.sweep),
  ));

  const cornerArmPath = evaluateCornerArmPath(project, options);
  if (cornerArmPath) {
    overlays.push(layoutPathOverlay(
      "corner_arm_wheel_track",
      "Corner-arm wheel track",
      cornerArmPath.wheelTrackRadiusMeters,
      towerBuffer,
      clipCenterlines(cornerArmPath.wheelTrackCenterlineSegments),
      field,
      toClipMultiPolygon(cornerArmPath.wheelTrackEnvelope),
      undefined,
      {
        evidenceFeatureIds: cornerArmPath.evidenceFeatureIds,
        wheelOverhangSeparationVerified: cornerArmPath.wheelOverhangSeparationVerified,
        anchorRadiusMeters: cornerArmPath.anchorRadiusMeters,
        pathModel: cornerArmPath.pathModel,
        modelFamily: cornerArmPath.modelFamily,
        extensionEvidenceSource: cornerArmPath.extensionEvidenceSource,
        sampledPathPointCount: cornerArmPath.sampledPathPointCount,
        maxExtensionMeters: cornerArmPath.maxExtensionMeters,
        extensionSlopeDomain: cornerArmPath.extensionSlopeDomain,
        maxExtensionSlopeMetersPerDegree: cornerArmPath.extensionSlopeSummary.maxExtensionMetersPerDegree,
        maxRetractionSlopeMetersPerDegree: cornerArmPath.extensionSlopeSummary.maxRetractionMetersPerDegree,
        warnings: cornerArmPath.warnings,
      },
    ));
    overlays.push(layoutPathOverlay(
      "corner_arm_overhang_end",
      "Corner-arm overhang end",
      cornerArmPath.overhangEndRadiusMeters,
      machineBuffer,
      clipCenterlines(cornerArmPath.overhangEndCenterlineSegments),
      field,
      toClipMultiPolygon(cornerArmPath.overhangEndEnvelope),
      undefined,
      {
        evidenceFeatureIds: cornerArmPath.evidenceFeatureIds,
        wheelOverhangSeparationVerified: cornerArmPath.wheelOverhangSeparationVerified,
        anchorRadiusMeters: cornerArmPath.anchorRadiusMeters,
        pathModel: cornerArmPath.pathModel,
        modelFamily: cornerArmPath.modelFamily,
        extensionEvidenceSource: cornerArmPath.extensionEvidenceSource,
        sampledPathPointCount: cornerArmPath.sampledPathPointCount,
        maxExtensionMeters: cornerArmPath.maxExtensionMeters,
        extensionSlopeDomain: cornerArmPath.extensionSlopeDomain,
        maxExtensionSlopeMetersPerDegree: cornerArmPath.extensionSlopeSummary.maxExtensionMetersPerDegree,
        maxRetractionSlopeMetersPerDegree: cornerArmPath.extensionSlopeSummary.maxRetractionMetersPerDegree,
        warnings: cornerArmPath.warnings,
      },
    ));
  }

  return overlays;
}

export function evaluateCornerArmPath(project: PivotProject, options: LayoutPathOverlayOptions = {}): CornerArmPathEvaluation | null {
  assertProjectedCrs(project.projectCrs);

  const config = project.machine.cornerArm ?? defaultAdvisoryCornerArmConfig();
  const usingDefaultConfig = project.machine.cornerArm === undefined;
  const cornerArmPaths = cornerArmPathLengths(config);
  if (!cornerArmPaths) return null;

  const anchorRadius = lrduAnchorRadiusMeters(project.machine);
  const evidence = cornerSwingEvidence(project);
  const hasEvidence = evidence.multiPolygon.length > 0;
  const modelFamily = config.modelFamily ?? "single_span_lrdu_sdu";
  const sampledPath = sampleCornerArmPath(project, anchorRadius, cornerArmPaths, evidence.multiPolygon);
  const pathModel: CornerArmPathModel = hasEvidence ? "corner_swing_limit_variable_reach" : "max_extension_envelope";
  const maxWheelTrackRadius = anchorRadius + cornerArmPaths.wheelTrackLengthMeters;
  const maxOverhangEndRadius = anchorRadius + cornerArmPaths.overhangEndLengthMeters;
  const extensionEnvelope = createCornerArmExtensionEnvelope(
    project,
    anchorRadius,
    maxOverhangEndRadius,
    hasEvidence ? evidence.multiPolygon : [],
  );
  const wheelTrackCenterlineSegments = cornerArmCenterlineSegments(project.pivotCenter, sampledPath.points, "wheel");
  const overhangEndCenterlineSegments = cornerArmCenterlineSegments(project.pivotCenter, sampledPath.points, "overhang");
  const constraintSummary = buildCornerArmConstraintSummary(project, config, overhangEndCenterlineSegments, options.settings);
  const warnings = [
    "Corner-arm path is advisory projected/local XY geometry and does not mutate canonical project geometry.",
    "Extension/retraction slopes are sampled reach changes per pivot angle degree, not time-based mechanical speeds or controller timing.",
    ...constraintSummary.warnings,
    ...(cornerArmPaths.wheelOverhangSeparationVerified
      ? []
      : ["Corner-arm wheel track and overhang separation is unverified; legacy length is rendered as advisory total reach."]),
    ...(hasEvidence
      ? []
      : ["No corner_swing_limit map feature is present; conservative max-extension envelope is rendered without operator footprint evidence."]),
    ...(usingDefaultConfig
      ? ["No saved corner-arm config is present; CPLayout renders a public/default advisory corner-arm path without persisting it to the project."]
      : []),
    ...(hasEvidence && sampledPath.points.length === 0
      ? ["corner_swing_limit evidence did not intersect sampled advisory corner-arm reach angles; rendered path envelopes are empty."]
      : []),
    ...(modelFamily === "dualspan"
      ? ["DualSpan model family is metadata/review-only in this advisory path model; CPLayout does not reproduce proprietary dual-swing kinematics."]
      : []),
  ];

  return {
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    anchorRadiusMeters: round(anchorRadius),
    maxExtensionMeters: round(cornerArmPaths.overhangEndLengthMeters),
    wheelTrackExtensionMeters: round(cornerArmPaths.wheelTrackLengthMeters),
    overhangLengthMeters: round(Math.max(0, cornerArmPaths.overhangEndLengthMeters - cornerArmPaths.wheelTrackLengthMeters)),
    wheelTrackRadiusMeters: round(maxWheelTrackRadius),
    overhangEndRadiusMeters: round(maxOverhangEndRadius),
    wheelOverhangSeparationVerified: cornerArmPaths.wheelOverhangSeparationVerified,
    pathModel,
    modelFamily,
    extensionEvidenceSource: hasEvidence ? "corner_swing_limit" : "none",
    evidenceFeatureIds: evidence.ids,
    sampledPathPoints: sampledPath.points.map((point) => ({
      angleDegrees: round(normalizeDegrees(point.angleDegrees)),
      sequenceIndex: point.sequenceIndex,
      wheelTrackRadiusMeters: round(point.wheelTrackRadiusMeters),
      overhangEndRadiusMeters: round(point.overhangEndRadiusMeters),
      wheelTrackExtensionMeters: round(point.wheelTrackExtensionMeters),
      overhangEndExtensionMeters: round(point.overhangEndExtensionMeters),
      point: { x: round(point.point.x), y: round(point.point.y) },
    })),
    sampledPathPointCount: sampledPath.points.length,
    wheelTrackCenterlineSegments,
    overhangEndCenterlineSegments,
    extensionSlopeDomain: "angle_degrees",
    extensionSlopeSummary: sampledPath.extensionSlopeSummary,
    constraintSummary,
    wheelTrackEnvelope: sampledPath.wheelTrackEnvelope,
    overhangEndEnvelope: sampledPath.overhangEndEnvelope,
    extensionEnvelope,
    warnings,
  };
}

export function evaluateMachineBoundaryClearance(
  project: PivotProject,
  settings?: Pick<ProjectSettings, "layoutReview">,
): MachineBoundaryClearanceRow[] {
  assertProjectedCrs(project.projectCrs);

  const requiredBoundaryClearanceMeters = Math.max(0, settings?.layoutReview?.requiredBoundaryClearanceMeters ?? 0);
  const rows: MachineBoundaryClearanceRow[] = [];
  const pointDistance = signedBoundaryDistance(project.pivotCenter, project.fieldBoundary);
  rows.push(machineBoundaryClearanceRow({
    kind: "pivot_center",
    label: "Pivot center",
    radiusMeters: 0,
    bufferMeters: 0,
    minimumBoundaryDistanceMeters: pointDistance,
    requiredBoundaryClearanceMeters,
    outsideFieldEnvelope: pointDistance < 0 ? [[createCirclePolygon(project.pivotCenter, 0.5, 16)]] : [],
    sampledPointCount: 1,
    warnings: ["Pivot-center clearance is advisory and does not move the saved pivot unless the operator applies a candidate."],
  }));

  const overlays = buildLayoutPathOverlays(project);
  for (const overlay of overlays) {
    const sampled = sampledPathBoundaryDistance(project, overlay.radiusMeters);
    rows.push(machineBoundaryClearanceRow({
      kind: overlay.kind,
      label: overlay.label,
      radiusMeters: overlay.radiusMeters,
      bufferMeters: overlay.bufferMeters,
      minimumBoundaryDistanceMeters: sampled.minimumBoundaryDistanceMeters,
      requiredBoundaryClearanceMeters,
      outsideFieldEnvelope: overlay.outsideFieldEnvelope,
      sampledPointCount: sampled.sampledPointCount,
      towerIndex: overlay.towerIndex,
      evidenceFeatureIds: overlay.evidenceFeatureIds,
      wheelOverhangSeparationVerified: overlay.wheelOverhangSeparationVerified,
      warnings: overlay.warnings ?? [],
    }));
  }

  const endGunRadius = endGunRadiusMeters(project.machine);
  if (endGunRadius > machineRadiusMeters(project.machine)) {
    const sampled = sampledPathBoundaryDistance(project, endGunRadius);
    rows.push(machineBoundaryClearanceRow({
      kind: "end_gun_reach",
      label: "End-gun reach",
      radiusMeters: endGunRadius,
      bufferMeters: 0,
      minimumBoundaryDistanceMeters: sampled.minimumBoundaryDistanceMeters,
      requiredBoundaryClearanceMeters,
      outsideFieldEnvelope: pathOutsideFieldEnvelope(project, endGunRadius, 0.5),
      sampledPointCount: sampled.sampledPointCount,
      warnings: ["End-gun reach is a wet-coverage review row, not a physical tower or corner-arm path."],
    }));
  }

  return rows;
}

export interface BoundaryConstraintResult {
  feasible: boolean;
  outsideFieldAreaSquareMeters: number;
  outsideFieldAcres: number;
  epsilonSquareMeters: number;
  outsideFieldCoverage: MultiPolygonXY;
}

export function validateWetCoverageWithinField(
  project: PivotProject,
  epsilonSquareMeters = DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS,
): BoundaryConstraintResult {
  assertProjectedCrs(project.projectCrs);

  const coverage = calculateWetCoverage(project);
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const outsideField = polygonClipping.difference(coverage.wetRaw, field) as ClipMultiPolygon;
  const outsideFieldCoverage = fromClipMultiPolygon(outsideField);
  const outsideFieldAreaSquareMeters = multiPolygonAreaSquareMeters(outsideFieldCoverage);

  return {
    feasible: outsideFieldAreaSquareMeters <= epsilonSquareMeters,
    outsideFieldAreaSquareMeters,
    outsideFieldAcres: squareMetersToAcres(outsideFieldAreaSquareMeters),
    epsilonSquareMeters,
    outsideFieldCoverage,
  };
}

function calculateWetCoverage(project: PivotProject): {
  base: ClipMultiPolygon;
  endGun: MultiPolygonXY;
  endGunClip: ClipMultiPolygon;
  wetRaw: ClipMultiPolygon;
} {
  const machineRadius = machineRadiusMeters(project.machine);
  const endGunRadius = endGunRadiusMeters(project.machine);
  const base = toClipMultiPolygon([[createSectorPolygon(project.pivotCenter, machineRadius, project.machine.sweep)]]);
  const endGunClip = createEndGunCoverageClip(project, machineRadius, endGunRadius);
  const endGun = fromClipMultiPolygon(endGunClip);
  const wetRaw = endGunClip.length > 0
    ? polygonClipping.union(base, endGunClip) as ClipMultiPolygon
    : base;

  return { base, endGun, endGunClip, wetRaw };
}

function createEndGunCoverageClip(project: PivotProject, machineRadius: number, endGunRadius: number): ClipMultiPolygon {
  if (endGunRadius <= machineRadius) return [];

  const sweepAnnulus = toClipMultiPolygon(createAnnularSector(project.pivotCenter, machineRadius, endGunRadius, project.machine.sweep));
  const ranges = (project.machine.endGunAngleRanges ?? []).filter((range) => (
    Number.isFinite(range.startAngleDegrees)
    && Number.isFinite(range.stopAngleDegrees)
  ));
  if (ranges.length === 0) return sweepAnnulus;

  const rangeAnnulus = toClipMultiPolygon(ranges.flatMap((range) => createAnnularSector(
    project.pivotCenter,
    machineRadius,
    endGunRadius,
    {
      mode: "partial_circle",
      startAngleDegrees: range.startAngleDegrees,
      stopAngleDegrees: range.stopAngleDegrees,
      direction: range.direction,
    },
  )));
  return polygonClipping.intersection(sweepAnnulus, rangeAnnulus) as ClipMultiPolygon | null ?? [];
}

export function exportScenarioGeoJson(project: PivotProject, result: LayoutResult): object {
  return {
    type: "FeatureCollection",
    properties: {
      projectId: project.id,
      projectName: project.name,
      projectCrs: project.projectCrs,
      unitSystem: project.unitSystem,
      settings: project.settings,
      mapPackages: project.mapPackages ?? [],
      generatedBy: "center-pivot-layout-rn",
    },
    features: [
      feature("field_boundary", [[project.fieldBoundary]], { sourceConfidence: "manual" }),
      feature("allowed_coverage", result.allowedCoverage, result.metrics),
      feature("outside_field_coverage", result.outsideFieldCoverage, { acres: result.metrics.outsideFieldAcres }),
      feature("obstacles", result.obstacles, { count: project.obstacles.length }),
      ...result.towers.map((tower) => ({
        type: "Feature",
        properties: {
          layerType: "tower_location",
          towerIndex: tower.towerIndex,
          radiusMeters: tower.radiusMeters,
        },
        geometry: {
          type: "Point",
          coordinates: [tower.point.x, tower.point.y],
        },
      })),
    ],
  };
}

export function ringsToSvgPath(multiPolygon: MultiPolygonXY): string {
  return multiPolygon
    .map((polygon) => polygon
      .map((ring) => ring.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${(-point.y).toFixed(2)}`).join(" ") + " Z")
      .join(" "))
    .join(" ");
}

export function boundsForGeometry(rings: XY[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  const points = rings.flat();
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
}

export function polarOffset(center: XY, radiusMeters: number, angleDegrees: number): XY {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: center.x + radiusMeters * Math.cos(radians),
    y: center.y + radiusMeters * Math.sin(radians),
  };
}

function buildSweepAngles(startAngle: number, stopAngle: number, direction: "clockwise" | "counterclockwise", maxSegments: number): number[] {
  const start = normalizeDegrees(startAngle);
  const stop = normalizeDegrees(stopAngle);
  const delta = direction === "counterclockwise"
    ? normalizeDegrees(stop - start)
    : -normalizeDegrees(start - stop);
  const segmentCount = Math.max(8, Math.ceil((Math.abs(delta) / 360) * maxSegments));
  return Array.from({ length: segmentCount + 1 }, (_, index) => start + (delta * index) / segmentCount);
}

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function toClipMultiPolygon(multiPolygon: MultiPolygonXY): ClipMultiPolygon {
  return multiPolygon.map((polygon) => polygon.map((ring) => closeRing(ring).map((point) => [point.x, point.y] as ClipPosition)));
}

function fromClipMultiPolygon(multiPolygon: ClipMultiPolygon | null): MultiPolygonXY {
  if (!multiPolygon) return [];
  return multiPolygon.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))));
}

function closeRing(ring: XY[]): XY[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) return ring;
  return [...ring, first];
}

function feature(layerType: string, geometry: MultiPolygonXY, properties: object): object {
  return {
    type: "Feature",
    properties: { layerType, ...properties },
    geometry: {
      type: "MultiPolygon",
      coordinates: toClipMultiPolygon(geometry),
    },
  };
}

function buildWarnings(
  project: PivotProject,
  outsideArea: number,
  obstacleConflictCount: number,
  noSprayConflictCount: number,
  hardMechanicalConflictCount: number,
): string[] {
  const warnings: string[] = [];
  if (outsideArea > 5) {
    warnings.push("Machine wet radius extends beyond the field boundary. Treat field edge as a hard boundary before construction approval.");
  }
  if (noSprayConflictCount > 0) {
    warnings.push(`${noSprayConflictCount} no-spray obstacle or exclusion zone removes modeled wet coverage.`);
  } else if (obstacleConflictCount > 0) {
    warnings.push(`${obstacleConflictCount} obstacle or exclusion zone intersects the modeled wet area.`);
  }
  if (hardMechanicalConflictCount > 0) {
    warnings.push(`${hardMechanicalConflictCount} hard obstacle intersects a modeled tower track or machine path.`);
  }
  if (project.surveyPoints.some((point) => point.confidence !== "rtk_fixed")) {
    warnings.push("Some project inputs are not RTK-fixed. Keep the layout planning-grade until critical points are surveyed.");
  }
  return warnings;
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}

function towerTrackClips(project: PivotProject): ClipMultiPolygon[] {
  const towerBuffer = Math.max(0.5, project.machine.towerClearanceBufferMeters);
  let towerRadius = 0;
  return project.machine.spanLengthsMeters.map((spanLength) => {
    towerRadius += spanLength;
    return createBufferedPathClip(project.pivotCenter, towerRadius, towerBuffer, project.machine.sweep);
  });
}

function createBufferedPathClip(center: XY, radiusMeters: number, bufferMeters: number, sweep: PivotSweep): ClipMultiPolygon {
  return toClipMultiPolygon(createAnnularSector(
    center,
    Math.max(0, radiusMeters - bufferMeters),
    radiusMeters + bufferMeters,
    sweep,
  ));
}

function obstacleIntersectionArea(clip: ClipMultiPolygon, obstacle: ObstacleZone): number {
  const intersection = polygonClipping.intersection(clip, toClipMultiPolygon([[obstacle.polygon]])) as ClipMultiPolygon | null;
  return multiPolygonAreaSquareMeters(fromClipMultiPolygon(intersection ?? []));
}

function sampledPathBoundaryDistance(project: PivotProject, radiusMeters: number): {
  minimumBoundaryDistanceMeters: number;
  sampledPointCount: number;
} {
  const angles = project.machine.sweep.mode === "full_circle"
    ? Array.from({ length: DEFAULT_SEGMENTS }, (_value, index) => (index / DEFAULT_SEGMENTS) * 360)
    : buildSweepAngles(project.machine.sweep.startAngleDegrees, project.machine.sweep.stopAngleDegrees, project.machine.sweep.direction, DEFAULT_SEGMENTS);
  const distances = angles.map((angle) => signedBoundaryDistance(polarOffset(project.pivotCenter, radiusMeters, angle), project.fieldBoundary));
  return {
    minimumBoundaryDistanceMeters: round(distances.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY)),
    sampledPointCount: distances.length,
  };
}

function minimumSignedDistanceToRing(points: XY[], ring: XY[]): number | undefined {
  if (points.length === 0 || ring.length < 3) return undefined;
  const distances = points.map((point) => signedBoundaryDistance(point, ring));
  return round(distances.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY));
}

function pathCenterlineSegment(center: XY, radiusMeters: number, sweep: PivotSweep): XY[] {
  const angles = sweep.mode === "full_circle"
    ? Array.from({ length: DEFAULT_SEGMENTS }, (_value, index) => (index / DEFAULT_SEGMENTS) * 360)
    : buildSweepAngles(sweep.startAngleDegrees, sweep.stopAngleDegrees, sweep.direction, DEFAULT_SEGMENTS);
  const points = angles.map((angle) => roundedPoint(polarOffset(center, radiusMeters, angle)));
  if (sweep.mode === "full_circle" && points.length > 2) return [...points, points[0]];
  return points;
}

function roundedPoint(point: XY): XY {
  return { x: round(point.x), y: round(point.y) };
}

function machineBoundaryClearanceRow(input: {
  kind: MachineBoundaryClearanceRowKind;
  label: string;
  radiusMeters: number;
  bufferMeters: number;
  minimumBoundaryDistanceMeters: number;
  requiredBoundaryClearanceMeters: number;
  outsideFieldEnvelope: MultiPolygonXY;
  sampledPointCount: number;
  towerIndex?: number;
  evidenceFeatureIds?: string[];
  wheelOverhangSeparationVerified?: boolean;
  warnings: string[];
}): MachineBoundaryClearanceRow {
  const minimumBoundaryDistanceMeters = round(input.minimumBoundaryDistanceMeters);
  const requiredBoundaryClearanceMeters = round(Math.max(0, input.requiredBoundaryClearanceMeters));
  const clearanceShortfallMeters = round(Math.max(0, requiredBoundaryClearanceMeters - minimumBoundaryDistanceMeters));
  const outsideFieldAreaSquareMeters = multiPolygonAreaSquareMeters(input.outsideFieldEnvelope);
  return {
    kind: input.kind,
    label: input.label,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    radiusMeters: round(input.radiusMeters),
    bufferMeters: round(input.bufferMeters),
    minimumBoundaryDistanceMeters,
    requiredBoundaryClearanceMeters,
    clearanceShortfallMeters,
    meetsRequiredBoundaryClearance: clearanceShortfallMeters <= 0,
    outsideFieldEnvelope: input.outsideFieldEnvelope,
    outsideFieldAreaSquareMeters: round(outsideFieldAreaSquareMeters),
    outsideFieldAcres: squareMetersToAcres(outsideFieldAreaSquareMeters),
    sampledPointCount: input.sampledPointCount,
    ...(input.towerIndex === undefined ? {} : { towerIndex: input.towerIndex }),
    ...(input.evidenceFeatureIds === undefined ? {} : { evidenceFeatureIds: input.evidenceFeatureIds }),
    ...(input.wheelOverhangSeparationVerified === undefined ? {} : { wheelOverhangSeparationVerified: input.wheelOverhangSeparationVerified }),
    warnings: [
      "Machine-to-boundary clearance is sampled advisory geometry in projected/local XY and does not mutate canonical project geometry.",
      ...(clearanceShortfallMeters > 0 ? [`Required boundary clearance is short by ${clearanceShortfallMeters.toFixed(2)} meters.`] : []),
      ...input.warnings,
    ],
  };
}

function pathOutsideFieldEnvelope(project: PivotProject, radiusMeters: number, bufferMeters: number): MultiPolygonXY {
  const field = toClipMultiPolygon([[project.fieldBoundary]]);
  const envelope = createBufferedPathClip(project.pivotCenter, radiusMeters, Math.max(0.5, bufferMeters), project.machine.sweep);
  return fromClipMultiPolygon(polygonClipping.difference(envelope, field) as ClipMultiPolygon);
}

type CornerArmPathLengths = NonNullable<ReturnType<typeof cornerArmPathLengths>>;

interface SampledCornerArmPathPoint extends CornerArmPathPoint {
  sequenceDegrees: number;
  sequenceIndex: number;
}

function sampleCornerArmPath(
  project: PivotProject,
  anchorRadiusMeters: number,
  cornerArmPaths: CornerArmPathLengths,
  evidenceMultiPolygon: MultiPolygonXY,
): {
  points: SampledCornerArmPathPoint[];
  wheelTrackEnvelope: MultiPolygonXY;
  overhangEndEnvelope: MultiPolygonXY;
  extensionSlopeSummary: CornerArmExtensionSlopeSummary;
} {
  const hasEvidence = evidenceMultiPolygon.length > 0;
  const angles = sweepSampleAngles(project.machine.sweep);
  const points = angles.flatMap((sample): SampledCornerArmPathPoint[] => {
    const boundaryExtension = activeBoundaryBoundedExtensionMeters(
      project.pivotCenter,
      project.fieldBoundary,
      anchorRadiusMeters,
      sample.angleDegrees,
      cornerArmPaths.overhangEndLengthMeters,
    );
    const evidenceExtension = hasEvidence
      ? evidenceBoundedExtensionMeters(project.pivotCenter, anchorRadiusMeters, sample.angleDegrees, boundaryExtension, evidenceMultiPolygon)
      : boundaryExtension;
    if (evidenceExtension <= 0) return [];
    const wheelTrackExtension = cornerArmPaths.wheelOverhangSeparationVerified
      ? Math.min(cornerArmPaths.wheelTrackLengthMeters, evidenceExtension)
      : evidenceExtension;
    const overhangEndRadius = anchorRadiusMeters + evidenceExtension;
    const wheelTrackRadius = anchorRadiusMeters + wheelTrackExtension;
    return [{
      angleDegrees: sample.angleDegrees,
      sequenceDegrees: sample.sequenceDegrees,
      sequenceIndex: sample.sequenceIndex,
      wheelTrackRadiusMeters: wheelTrackRadius,
      overhangEndRadiusMeters: overhangEndRadius,
      wheelTrackExtensionMeters: wheelTrackExtension,
      overhangEndExtensionMeters: evidenceExtension,
      point: polarOffset(project.pivotCenter, overhangEndRadius, sample.angleDegrees),
    }];
  });

  return {
    points,
    wheelTrackEnvelope: bufferedSampledPathEnvelope(
        project.pivotCenter,
        points.map((point) => ({ ...point, radiusMeters: point.wheelTrackRadiusMeters })),
        Math.max(0.5, project.machine.towerClearanceBufferMeters),
        false,
      ),
    overhangEndEnvelope: bufferedSampledPathEnvelope(
        project.pivotCenter,
        points.map((point) => ({ ...point, radiusMeters: point.overhangEndRadiusMeters })),
        Math.max(0.5, project.machine.machineClearanceBufferMeters),
        false,
      ),
    extensionSlopeSummary: cornerArmSlopeSummary(points),
  };
}

function cornerArmCenterlineSegments(
  center: XY,
  points: SampledCornerArmPathPoint[],
  path: "wheel" | "overhang",
): XY[][] {
  if (points.length === 0) return [];
  const segments: XY[][] = [];
  let active: XY[] = [];
  let previous: SampledCornerArmPathPoint | null = null;

  for (const point of points) {
    if (previous && point.sequenceIndex !== previous.sequenceIndex + 1) {
      if (active.length >= 2) segments.push(active);
      active = [];
    }
    const radius = path === "wheel" ? point.wheelTrackRadiusMeters : point.overhangEndRadiusMeters;
    active.push(roundedPoint(polarOffset(center, radius, point.angleDegrees)));
    previous = point;
  }
  if (active.length >= 2) segments.push(active);

  if (
    segments.length === 1
    && points.length === DEFAULT_SEGMENTS
    && points[0]?.sequenceIndex === 0
    && points[points.length - 1]?.sequenceIndex === DEFAULT_SEGMENTS - 1
  ) {
    const [segment] = segments;
    return [[...segment, segment[0]]];
  }

  return segments;
}

function buildCornerArmConstraintSummary(
  project: PivotProject,
  config: AdvisoryCornerArmConfig,
  overhangEndCenterlineSegments: XY[][],
  settings?: Pick<ProjectSettings, "layoutReview">,
): CornerArmPathConstraintSummary {
  const safetyZoneMeters = round(Math.max(0, settings?.layoutReview?.requiredBoundaryClearanceMeters ?? project.settings?.layoutReview.requiredBoundaryClearanceMeters ?? feetToMeters(15)));
  const centerlinePoints = overhangEndCenterlineSegments.flat();
  const activeMinimum = minimumSignedDistanceToRing(centerlinePoints, project.fieldBoundary);
  const activeShortfall = activeMinimum === undefined ? undefined : round(Math.max(0, safetyZoneMeters - activeMinimum));
  const planning = planningBoundaryConstraintSummary(project, centerlinePoints, safetyZoneMeters);
  const speedRatio = cornerArmSpeedRatioConstraintSummary(project);
  const steering = cornerArmSteeringConstraintSummary(config);
  const extensionRate = cornerArmRateConstraintSummary(config);
  const warnings = [
    ...(activeMinimum === undefined ? ["Corner-arm safety-zone review did not run because no centerline samples or field boundary were available."] : []),
    ...(activeShortfall !== undefined && activeShortfall > 0 ? [`Corner-arm overhang centerline is short of the active field-boundary safety zone by ${activeShortfall.toFixed(2)} meters.`] : []),
    ...(planning.status === "shortfall" ? [`Corner-arm planning-boundary review reports a separate ${planning.shortfallMeters?.toFixed(2)} meter shortfall; planning-boundary evidence does not relax the active field boundary.`] : []),
    ...(speedRatio.status === "operator_measured" ? [] : ["Corner-arm speed-ratio constraint is not applied unless both LRDU and SDU speeds are operator measured; RPM-only values remain source-required metadata."]),
    ...(steering.status === "source_backed" ? [] : ["Corner-arm steer-angle limits are not applied because source-backed steer-angle metadata is unavailable."]),
    ...(extensionRate.status === "source_backed" ? [] : ["Corner-arm extension/retraction rate limits are not applied because source-backed rate metadata is unavailable."]),
  ];

  return {
    safetyZoneMeters,
    activeFieldBoundary: activeMinimum === undefined
      ? { status: "not_evaluated" }
      : {
        status: activeShortfall && activeShortfall > 0 ? "shortfall" : "meets_required_clearance",
        minimumSignedDistanceMeters: activeMinimum,
        shortfallMeters: activeShortfall,
      },
    planningBoundary: planning,
    speedRatio,
    steering,
    extensionRate,
    warnings,
  };
}

function planningBoundaryConstraintSummary(
  project: PivotProject,
  points: XY[],
  safetyZoneMeters: number,
): CornerArmPlanningBoundaryConstraintSummary {
  const boundaries = (project.mapFeatures ?? []).filter((feature) => feature.kind === "planning_boundary");
  const candidates = boundaries.map((feature) => ({
    feature,
    ring: featureBoundaryRing(feature),
  })).filter((candidate): candidate is { feature: ProjectMapFeature; ring: XY[] } => Boolean(candidate.ring && candidate.ring.length >= 3));

  if (candidates.length === 0 || points.length === 0) {
    return {
      status: "not_evaluated",
      evidenceFeatureIds: candidates.map((candidate) => candidate.feature.id),
    };
  }

  const minimum = round(points.reduce((best, point) => {
    const pointBest = candidates.reduce((candidateBest, candidate) => (
      Math.max(candidateBest, signedBoundaryDistance(point, candidate.ring))
    ), Number.NEGATIVE_INFINITY);
    return Math.min(best, pointBest);
  }, Number.POSITIVE_INFINITY));
  const shortfall = round(Math.max(0, safetyZoneMeters - minimum));
  return {
    status: shortfall > 0 ? "shortfall" : "meets_required_clearance",
    evidenceFeatureIds: candidates.map((candidate) => candidate.feature.id),
    minimumSignedDistanceMeters: minimum,
    shortfallMeters: shortfall,
  };
}

function featureBoundaryRing(feature: ProjectMapFeature): XY[] | null {
  if (feature.geometry.type === "Polygon") return feature.geometry.vertices;
  if (feature.geometry.type === "Circle") return createCirclePolygon(feature.geometry.center, feature.geometry.radiusMeters, 96);
  if (feature.geometry.type === "LineString" && feature.geometry.vertices.length >= 3) return feature.geometry.vertices;
  return null;
}

function cornerArmSpeedRatioConstraintSummary(project: PivotProject): CornerArmSpeedRatioConstraintSummary {
  const lrdu = project.machine.driveUnits?.lrdu;
  const sdu = project.machine.driveUnits?.sdu;
  const lrduSpeed = lrdu?.operatorMeasuredSpeedMetersPerMinute;
  const sduSpeed = sdu?.operatorMeasuredSpeedMetersPerMinute;
  if (lrduSpeed !== undefined && sduSpeed !== undefined && lrduSpeed > 0 && sduSpeed > 0) {
    return {
      status: "operator_measured",
      lrduMeasuredSpeedMetersPerMinute: round(lrduSpeed),
      sduMeasuredSpeedMetersPerMinute: round(sduSpeed),
      sduToLrduRatio: round(sduSpeed / lrduSpeed),
    };
  }
  if (lrdu?.customMotorRpm !== undefined || sdu?.customMotorRpm !== undefined || lrdu?.driveMotor?.rpm !== undefined || sdu?.driveMotor?.rpm !== undefined) {
    return { status: "rpm_only_source_required" };
  }
  return { status: "not_available" };
}

function cornerArmSteeringConstraintSummary(config: AdvisoryCornerArmConfig): CornerArmSteeringConstraintSummary {
  if (config.minSteerAngleDegrees === undefined && config.maxSteerAngleDegrees === undefined) return { status: "not_available" };
  return {
    status: "source_backed",
    ...(config.minSteerAngleDegrees === undefined ? {} : { minSteerAngleDegrees: round(config.minSteerAngleDegrees) }),
    ...(config.maxSteerAngleDegrees === undefined ? {} : { maxSteerAngleDegrees: round(config.maxSteerAngleDegrees) }),
  };
}

function cornerArmRateConstraintSummary(config: AdvisoryCornerArmConfig): CornerArmRateConstraintSummary {
  if (config.maxExtensionRateMetersPerMinute === undefined && config.maxRetractionRateMetersPerMinute === undefined) return { status: "not_available" };
  return {
    status: "source_backed",
    ...(config.maxExtensionRateMetersPerMinute === undefined ? {} : { maxExtensionRateMetersPerMinute: round(config.maxExtensionRateMetersPerMinute) }),
    ...(config.maxRetractionRateMetersPerMinute === undefined ? {} : { maxRetractionRateMetersPerMinute: round(config.maxRetractionRateMetersPerMinute) }),
  };
}

function sweepSampleAngles(sweep: PivotSweep): { angleDegrees: number; sequenceDegrees: number; sequenceIndex: number }[] {
  const angles = sweep.mode === "full_circle"
    ? Array.from({ length: DEFAULT_SEGMENTS }, (_value, index) => (index / DEFAULT_SEGMENTS) * 360)
    : buildSweepAngles(sweep.startAngleDegrees, sweep.stopAngleDegrees, sweep.direction, DEFAULT_SEGMENTS);
  return angles.map((angleDegrees, sequenceIndex) => ({
    angleDegrees,
    sequenceDegrees: sequenceIndex === 0 ? 0 : Math.abs(angleDegrees - angles[0]),
    sequenceIndex,
  }));
}

function evidenceBoundedExtensionMeters(
  center: XY,
  anchorRadiusMeters: number,
  angleDegrees: number,
  maxExtensionMeters: number,
  evidenceMultiPolygon: MultiPolygonXY,
): number {
  const steps = 48;
  let best = 0;
  for (let step = 1; step <= steps; step += 1) {
    const extension = (maxExtensionMeters * step) / steps;
    const point = polarOffset(center, anchorRadiusMeters + extension, angleDegrees);
    if (pointInMultiPolygon(point, evidenceMultiPolygon)) best = extension;
  }
  return best;
}

function activeBoundaryBoundedExtensionMeters(
  center: XY,
  fieldBoundary: XY[],
  anchorRadiusMeters: number,
  angleDegrees: number,
  maxExtensionMeters: number,
): number {
  if (fieldBoundary.length < 3) return maxExtensionMeters;
  const steps = 96;
  let best = 0;
  for (let step = 1; step <= steps; step += 1) {
    const extension = (maxExtensionMeters * step) / steps;
    const point = polarOffset(center, anchorRadiusMeters + extension, angleDegrees);
    if (pointInPolygon(point, fieldBoundary)) best = extension;
  }
  return best;
}

function clipCenterlineSegmentsToField(segments: XY[][], fieldBoundary: XY[]): XY[][] {
  if (fieldBoundary.length < 3) return segments;
  return segments.flatMap((segment) => clipPolylineToPolygon(segment, fieldBoundary));
}

function clipPolylineToPolygon(vertices: XY[], fieldBoundary: XY[]): XY[][] {
  if (vertices.length < 2) return [];
  const clipped: XY[][] = [];
  let active: XY[] = [];

  for (let index = 1; index < vertices.length; index += 1) {
    const start = vertices[index - 1];
    const end = vertices[index];
    const pieces = clipLineSegmentToPolygon(start, end, fieldBoundary);
    for (const piece of pieces) {
      if (active.length === 0) {
        active.push(piece.start, piece.end);
        continue;
      }
      const last = active[active.length - 1];
      if (pointsAlmostEqual(last, piece.start)) {
        active.push(piece.end);
      } else {
        if (active.length >= 2) clipped.push(dedupeSequentialPoints(active));
        active = [piece.start, piece.end];
      }
    }
    if (pieces.length === 0 && active.length >= 2) {
      clipped.push(dedupeSequentialPoints(active));
      active = [];
    }
  }

  if (active.length >= 2) clipped.push(dedupeSequentialPoints(active));
  return clipped.filter((segment) => segment.length >= 2);
}

function clipLineSegmentToPolygon(start: XY, end: XY, fieldBoundary: XY[]): Array<{ start: XY; end: XY }> {
  const splitParameters = [0, 1];
  for (let index = 0; index < fieldBoundary.length; index += 1) {
    const edgeStart = fieldBoundary[index];
    const edgeEnd = fieldBoundary[(index + 1) % fieldBoundary.length];
    const intersection = segmentIntersectionParameter(start, end, edgeStart, edgeEnd);
    if (intersection !== null) splitParameters.push(intersection);
  }
  const sorted = uniqueSortedParameters(splitParameters);
  const pieces: Array<{ start: XY; end: XY }> = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1];
    const to = sorted[index];
    if (to - from <= 0.0000001) continue;
    const midpoint = interpolatePoint(start, end, (from + to) / 2);
    if (!pointInPolygon(midpoint, fieldBoundary)) continue;
    pieces.push({
      start: roundedPoint(interpolatePoint(start, end, from)),
      end: roundedPoint(interpolatePoint(start, end, to)),
    });
  }
  return pieces;
}

function segmentIntersectionParameter(start: XY, end: XY, edgeStart: XY, edgeEnd: XY): number | null {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const edgeX = edgeEnd.x - edgeStart.x;
  const edgeY = edgeEnd.y - edgeStart.y;
  const denominator = cross(segmentX, segmentY, edgeX, edgeY);
  const offsetX = edgeStart.x - start.x;
  const offsetY = edgeStart.y - start.y;
  if (Math.abs(denominator) < 0.000000001) {
    if (Math.abs(cross(offsetX, offsetY, segmentX, segmentY)) > 0.000000001) return null;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    if (segmentLengthSquared === 0) return null;
    const first = ((edgeStart.x - start.x) * segmentX + (edgeStart.y - start.y) * segmentY) / segmentLengthSquared;
    const second = ((edgeEnd.x - start.x) * segmentX + (edgeEnd.y - start.y) * segmentY) / segmentLengthSquared;
    const from = Math.max(0, Math.min(first, second));
    const to = Math.min(1, Math.max(first, second));
    if (to < 0 || from > 1) return null;
    return clamp01(from);
  }
  const t = cross(offsetX, offsetY, edgeX, edgeY) / denominator;
  const u = cross(offsetX, offsetY, segmentX, segmentY) / denominator;
  if (t < -0.0000001 || t > 1.0000001 || u < -0.0000001 || u > 1.0000001) return null;
  return clamp01(t);
}

function uniqueSortedParameters(parameters: number[]): number[] {
  const sorted = parameters.map(clamp01).sort((left, right) => left - right);
  return sorted.reduce((unique, value) => {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(previous - value) > 0.0000001) unique.push(value);
    return unique;
  }, [] as number[]);
}

function interpolatePoint(start: XY, end: XY, t: number): XY {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function dedupeSequentialPoints(vertices: XY[]): XY[] {
  return vertices.reduce((deduped, point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || !pointsAlmostEqual(previous, point)) deduped.push(point);
    return deduped;
  }, [] as XY[]);
}

function pointsAlmostEqual(left: XY, right: XY): boolean {
  return Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001;
}

function cross(leftX: number, leftY: number, rightX: number, rightY: number): number {
  return leftX * rightY - leftY * rightX;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bufferedSampledPathEnvelope(
  center: XY,
  samples: Array<SampledCornerArmPathPoint & { radiusMeters: number }>,
  bufferMeters: number,
  closeLoop: boolean,
): MultiPolygonXY {
  if (samples.length === 0) return [];
  const clips: ClipMultiPolygon[] = [];
  for (const sample of samples) {
    clips.push(toClipMultiPolygon([[createCirclePolygon(polarOffset(center, sample.radiusMeters, sample.angleDegrees), bufferMeters, 24)]]));
  }
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current.sequenceIndex === previous.sequenceIndex + 1) {
      clips.push(toClipMultiPolygon([[lineSegmentBufferPolygon(
        polarOffset(center, previous.radiusMeters, previous.angleDegrees),
        polarOffset(center, current.radiusMeters, current.angleDegrees),
        bufferMeters,
      )]]));
    }
  }
  if (closeLoop && samples.length > 2) {
    clips.push(toClipMultiPolygon([[lineSegmentBufferPolygon(
      polarOffset(center, samples[samples.length - 1].radiusMeters, samples[samples.length - 1].angleDegrees),
      polarOffset(center, samples[0].radiusMeters, samples[0].angleDegrees),
      bufferMeters,
    )]]));
  }
  return fromClipMultiPolygon(unionClipMultiPolygons(clips));
}

function lineSegmentBufferPolygon(start: XY, end: XY, bufferMeters: number): XY[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return createCirclePolygon(start, bufferMeters, 24);
  const offsetX = (-dy / length) * bufferMeters;
  const offsetY = (dx / length) * bufferMeters;
  return [
    { x: start.x + offsetX, y: start.y + offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: start.x - offsetX, y: start.y - offsetY },
  ];
}

function unionClipMultiPolygons(clips: ClipMultiPolygon[]): ClipMultiPolygon {
  if (clips.length === 0) return [];
  if (clips.length === 1) return clips[0];
  return clips.slice(1).reduce(
    (merged, clip) => polygonClipping.union(merged, clip) as ClipMultiPolygon,
    clips[0],
  );
}

function createCornerArmExtensionEnvelope(
  project: PivotProject,
  anchorRadiusMeters: number,
  overhangEndRadiusMeters: number,
  evidenceMultiPolygon: MultiPolygonXY,
): MultiPolygonXY {
  const envelope = toClipMultiPolygon(createAnnularSector(project.pivotCenter, anchorRadiusMeters, overhangEndRadiusMeters, project.machine.sweep));
  if (evidenceMultiPolygon.length === 0) return fromClipMultiPolygon(envelope);
  const evidence = toClipMultiPolygon(evidenceMultiPolygon);
  return fromClipMultiPolygon(polygonClipping.intersection(envelope, evidence) as ClipMultiPolygon | null ?? []);
}

function cornerArmSlopeSummary(points: SampledCornerArmPathPoint[]): CornerArmExtensionSlopeSummary {
  let maxExtension = 0;
  let maxRetraction = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.sequenceIndex !== previous.sequenceIndex + 1) continue;
    const angleDelta = Math.abs(current.sequenceDegrees - previous.sequenceDegrees);
    if (angleDelta <= 0) continue;
    const slope = (current.overhangEndExtensionMeters - previous.overhangEndExtensionMeters) / angleDelta;
    if (slope > 0) maxExtension = Math.max(maxExtension, slope);
    if (slope < 0) maxRetraction = Math.max(maxRetraction, Math.abs(slope));
  }
  return {
    domain: "angle_degrees",
    maxExtensionMetersPerDegree: round(maxExtension),
    maxRetractionMetersPerDegree: round(maxRetraction),
    maxAbsoluteMetersPerDegree: round(Math.max(maxExtension, maxRetraction)),
    sampleCount: points.length,
  };
}

function signedBoundaryDistance(point: XY, fieldBoundary: XY[]): number {
  const boundaryDistance = distanceToRing(point, fieldBoundary);
  return (pointInPolygon(point, fieldBoundary) ? 1 : -1) * boundaryDistance;
}

function defaultAdvisoryCornerArmConfig(): AdvisoryCornerArmConfig {
  return {
    id: "default-advisory-corner-arm",
    name: "Default advisory corner arm",
    advisoryOnly: true,
    lengthMeters: DEFAULT_CORNER_ARM_WHEEL_TRACK_EXTENSION_METERS + DEFAULT_CORNER_ARM_OVERHANG_EXTENSION_METERS,
    wheelTrackLengthMeters: DEFAULT_CORNER_ARM_WHEEL_TRACK_EXTENSION_METERS,
    overhangLengthMeters: DEFAULT_CORNER_ARM_OVERHANG_EXTENSION_METERS,
    metadataSource: "manufacturer_public",
    modelFamily: "single_span_lrdu_sdu",
    guidanceType: "gps_guidance",
    sequencingType: "electronic",
    orientation: "unknown",
    confidence: "user_estimated",
    sourceRefs: [{
      sourceId: "SRC-VALLEY-VFLEX-CORNER",
      title: "Valley VFlex Corner",
      url: "https://www.valleyirrigation.com/vflex-corner",
      checkedAt: "2026-06-05",
      limit: "Public/default advisory rendering only; not a field-specific preset, compatibility certification, or proprietary kinematic reproduction.",
    }],
    notes: "Default advisory path used for map visualization only; CPLayout does not persist this config unless the operator saves one.",
  };
}

function cornerArmPathLengths(config: AdvisoryCornerArmConfig | undefined): {
  wheelTrackLengthMeters: number;
  overhangEndLengthMeters: number;
  wheelOverhangSeparationVerified: boolean;
} | null {
  if (!config || config.lengthMeters <= 0) return null;
  const totalLengthMeters = Math.max(0, config.lengthMeters);
  const explicitWheelLength = config.wheelTrackLengthMeters;
  const explicitOverhangLength = config.overhangLengthMeters;
  if (
    explicitWheelLength !== undefined
    && Number.isFinite(explicitWheelLength)
    && explicitWheelLength > 0
    && explicitOverhangLength !== undefined
    && Number.isFinite(explicitOverhangLength)
    && explicitOverhangLength >= 0
  ) {
    return {
      wheelTrackLengthMeters: explicitWheelLength,
      overhangEndLengthMeters: explicitWheelLength + explicitOverhangLength,
      wheelOverhangSeparationVerified: true,
    };
  }
  if (explicitWheelLength !== undefined && Number.isFinite(explicitWheelLength) && explicitWheelLength > 0) {
    return {
      wheelTrackLengthMeters: explicitWheelLength,
      overhangEndLengthMeters: Math.max(totalLengthMeters, explicitWheelLength),
      wheelOverhangSeparationVerified: false,
    };
  }
  if (
    explicitOverhangLength !== undefined
    && Number.isFinite(explicitOverhangLength)
    && explicitOverhangLength >= 0
    && explicitOverhangLength < totalLengthMeters
  ) {
    return {
      wheelTrackLengthMeters: totalLengthMeters - explicitOverhangLength,
      overhangEndLengthMeters: totalLengthMeters,
      wheelOverhangSeparationVerified: false,
    };
  }
  return {
    wheelTrackLengthMeters: totalLengthMeters,
    overhangEndLengthMeters: totalLengthMeters,
    wheelOverhangSeparationVerified: false,
  };
}

function cornerSwingEvidence(project: PivotProject): { ids: string[]; multiPolygon: MultiPolygonXY } {
  const features = (project.mapFeatures ?? []).filter((feature) => feature.kind === "corner_swing_limit");
  return {
    ids: features.map((feature) => feature.id),
    multiPolygon: features.flatMap(cornerSwingEvidencePolygon),
  };
}

function cornerSwingEvidencePolygon(feature: ProjectMapFeature): MultiPolygonXY {
  if (feature.geometry.type === "Polygon") return [[feature.geometry.vertices]];
  if (feature.geometry.type === "Circle") return [[createCirclePolygon(feature.geometry.center, feature.geometry.radiusMeters, 96)]];
  if (feature.geometry.type === "LineString" && feature.geometry.vertices.length >= 3) return [[feature.geometry.vertices]];
  return [];
}

function layoutPathOverlay(
  kind: LayoutPathOverlay["kind"],
  label: string,
  radiusMeters: number,
  bufferMeters: number,
  centerlineSegments: XY[][],
  field: ClipMultiPolygon,
  envelope: ClipMultiPolygon,
  towerIndex?: number,
  options: {
    evidenceLimit?: ClipMultiPolygon | null;
    evidenceFeatureIds?: string[];
    wheelOverhangSeparationVerified?: boolean;
    anchorRadiusMeters?: number;
    pathModel?: CornerArmPathModel;
    modelFamily?: NonNullable<AdvisoryCornerArmConfig["modelFamily"]>;
    extensionEvidenceSource?: CornerArmExtensionEvidenceSource;
    sampledPathPointCount?: number;
    maxExtensionMeters?: number;
    extensionSlopeDomain?: "angle_degrees";
    maxExtensionSlopeMetersPerDegree?: number;
    maxRetractionSlopeMetersPerDegree?: number;
    warnings?: string[];
  } = {},
): LayoutPathOverlay {
  const limitedEnvelope = options.evidenceLimit
    ? polygonClipping.intersection(envelope, options.evidenceLimit) as ClipMultiPolygon | null
    : envelope;
  const inside = polygonClipping.intersection(limitedEnvelope ?? [], field) as ClipMultiPolygon | null;
  const outside = polygonClipping.difference(limitedEnvelope ?? [], field) as ClipMultiPolygon;
  return {
    kind,
    label,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    radiusMeters,
    bufferMeters,
    centerlineSegments,
    insideFieldEnvelope: fromClipMultiPolygon(inside ?? []),
    outsideFieldEnvelope: fromClipMultiPolygon(outside),
    ...(towerIndex === undefined ? {} : { towerIndex }),
    ...(options.evidenceFeatureIds === undefined ? {} : { evidenceFeatureIds: options.evidenceFeatureIds }),
    ...(options.wheelOverhangSeparationVerified === undefined ? {} : { wheelOverhangSeparationVerified: options.wheelOverhangSeparationVerified }),
    ...(options.anchorRadiusMeters === undefined ? {} : { anchorRadiusMeters: options.anchorRadiusMeters }),
    ...(options.pathModel === undefined ? {} : { pathModel: options.pathModel }),
    ...(options.modelFamily === undefined ? {} : { modelFamily: options.modelFamily }),
    ...(options.extensionEvidenceSource === undefined ? {} : { extensionEvidenceSource: options.extensionEvidenceSource }),
    ...(options.sampledPathPointCount === undefined ? {} : { sampledPathPointCount: options.sampledPathPointCount }),
    ...(options.maxExtensionMeters === undefined ? {} : { maxExtensionMeters: options.maxExtensionMeters }),
    ...(options.extensionSlopeDomain === undefined ? {} : { extensionSlopeDomain: options.extensionSlopeDomain }),
    ...(options.maxExtensionSlopeMetersPerDegree === undefined ? {} : { maxExtensionSlopeMetersPerDegree: options.maxExtensionSlopeMetersPerDegree }),
    ...(options.maxRetractionSlopeMetersPerDegree === undefined ? {} : { maxRetractionSlopeMetersPerDegree: options.maxRetractionSlopeMetersPerDegree }),
    ...(options.warnings === undefined ? {} : { warnings: options.warnings }),
  };
}

function mechanicalConflict(
  obstacle: ObstacleZone,
  conflictType: LayoutMechanicalConflict["conflictType"],
  areaSquareMeters: number,
): LayoutMechanicalConflict {
  return {
    obstacleId: obstacle.id,
    obstacleKind: obstacle.kind,
    obstacleName: obstacle.name,
    conflictType,
    areaSquareMeters: Number(areaSquareMeters.toFixed(6)),
  };
}

function uniqueConflictObstacleCount(conflicts: LayoutMechanicalConflict[]): number {
  return new Set(conflicts.map((conflict) => conflict.obstacleId)).size;
}

function pointInMultiPolygon(point: XY, multiPolygon: MultiPolygonXY): boolean {
  return multiPolygon.some((polygon) => {
    const [outer, ...holes] = polygon;
    return Boolean(outer && pointInPolygon(point, outer) && !holes.some((hole) => pointInPolygon(point, hole)));
  });
}

function pointInPolygon(point: XY, ring: XY[]): boolean {
  let inside = false;
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: XY, start: XY, end: XY): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000001) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) return false;
  const segmentLengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= segmentLengthSquared;
}

function distanceToRing(point: XY, ring: XY[]): number {
  return ring.reduce((minimum, start, index) => {
    const end = ring[(index + 1) % ring.length];
    return Math.min(minimum, distanceToSegment(point, start, end));
  }, Number.POSITIVE_INFINITY);
}

function distanceToSegment(point: XY, start: XY, end: XY): number {
  const segmentLengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (segmentLengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / segmentLengthSquared));
  return distance(point, {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  });
}

function distance(left: XY, right: XY): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
