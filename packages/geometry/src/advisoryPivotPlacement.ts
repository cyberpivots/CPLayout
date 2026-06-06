import * as polygonClipping from "polygon-clipping";

import type {
  AdvisoryCornerArmConfig,
  AdvisorySourceReference,
  LayoutMetrics,
  MultiPolygonXY,
  PivotProject,
  ProjectMapFeature,
  XY,
} from "@cplayout/core";
import { squareMetersToAcres } from "@cplayout/core";

import {
  DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS,
  boundsForGeometry,
  createAnnularSector,
  createCirclePolygon,
  evaluateLayout,
  machineRadiusMeters,
  multiPolygonAreaSquareMeters,
} from "./geometry";
import { optimizePivotCenter, type PivotCenterAlternative, type PivotCenterSeedKind } from "./pivotCenterOptimizer";

type ClipPosition = [number, number];
type ClipPolygon = ClipPosition[][];
type ClipMultiPolygon = ClipPolygon[];

export interface PivotPlacementCandidateOptions {
  gridDivisions?: number;
  maxCandidates?: number;
  boundaryEpsilonSquareMeters?: number;
  obstacleBufferMeters?: number;
  waterSourceWeight?: number;
  powerSourceWeight?: number;
  accessWeight?: number;
  includeMaximumInscribedCircleSeed?: boolean;
  includeMachineZoneReviews?: boolean;
  minimumBoundaryClearanceMeters?: number;
  minimumObstacleClearanceMeters?: number;
  obstacleCrossingProfiles?: AdvisoryObstacleCrossingProfile[];
  costInput?: AdvisoryCostInput;
  sourceRefs?: AdvisorySourceReference[];
}

export interface PivotPlacementScoreBreakdown {
  coverage: number;
  boundaryFit: number;
  obstacleClearance: number;
  waterSourceProximity: number;
  powerSourceProximity: number;
  accessProximity: number;
  dryCornerPenalty: number;
  costEfficiency: number;
  feasibility: number;
}

export interface AdvisoryCostInput {
  fixedMachineCost?: number;
  costPerMeter?: number;
  costPerTower?: number;
  currencyCode?: string;
  notes?: string;
  sourceRefs?: AdvisorySourceReference[];
}

export interface AdvisoryCostAssessment {
  status: "complete" | "missing_cost_input" | "invalid_cost_input" | "no_irrigated_acres";
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  estimatedCost: number | null;
  costPerIrrigatedAcre: number | null;
  currencyCode: string;
  sourceRefs: AdvisorySourceReference[];
  warnings: string[];
}

export interface AdvisoryObstacleCrossingProfile {
  obstacleId: string;
  crossingAllowed: boolean;
  minimumClearanceMeters?: number;
  reason: string;
  sourceRefs?: AdvisorySourceReference[];
  advisoryOnly: true;
}

export interface PivotPlacementCandidate {
  id: string;
  pivotCenter: XY;
  metrics: LayoutMetrics;
  score: number;
  scoreBreakdown: PivotPlacementScoreBreakdown;
  feasible: boolean;
  insideFieldBoundary: boolean;
  boundaryClearanceMeters: number;
  sourceSeed: PivotCenterSeedKind | "maximum_inscribed_circle";
  dryCornerPolygons: MultiPolygonXY;
  dryCornerAcres: number;
  obstacleBufferMeters: number;
  minimumObstacleClearanceMeters: number | null;
  distanceFromCurrentMeters: number;
  distanceToWaterSourceMeters: number;
  distanceToPowerSourceMeters: number;
  distanceToAccessMeters: number | null;
  minimumRequiredBoundaryClearanceMeters: number;
  minimumRequiredObstacleClearanceMeters: number;
  obstacleCrossingProfileIds: string[];
  costAssessment: AdvisoryCostAssessment;
  warnings: string[];
  disqualificationReasons: string[];
  sourceRefs: AdvisorySourceReference[];
  canonicalGeometryMutation: false;
}

export type IdealCenterPointAnalysisStatus = "ready" | "no_boundary" | "no_candidates" | "no_feasible_candidate";

export interface IdealCenterPointAnalysis {
  status: IdealCenterPointAnalysisStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  projectCrs: string;
  fieldBoundaryVertexCount: number;
  bestCandidate: PivotPlacementCandidate | null;
  candidates: PivotPlacementCandidate[];
  machineZoneReviews: AdvisoryMachineZoneReview[];
  blockers: string[];
  warnings: string[];
  sourceRefs: AdvisorySourceReference[];
}

export interface AdvisoryMachineZoneReview {
  featureId: string;
  featureName: string;
  featureKind: "planning_boundary" | "machine_zone";
  status: "ready" | "unsupported_geometry" | "no_feasible_candidate";
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  boundaryVertexCount: number;
  bestCandidate: PivotPlacementCandidate | null;
  candidateCount: number;
  warnings: string[];
  sourceRefs: AdvisorySourceReference[];
}

export interface AdvisoryCornerArmEvaluationOptions {
  sourceRefs?: AdvisorySourceReference[];
}

export interface AdvisoryCornerArmEvaluation {
  status: "ready" | "missing_config" | "invalid_config";
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  unverifiedKinematics: true;
  qualifiedReviewRequired: true;
  sourceRefs: AdvisorySourceReference[];
  warnings: string[];
  config?: AdvisoryCornerArmConfig;
  pathEnvelope: MultiPolygonXY;
  coverageCandidate: MultiPolygonXY;
  dryCornerPolygons: MultiPolygonXY;
  evidenceFeatureIds: string[];
  estimatedAddedCoverageAcres: number;
  baseAllowedCoverageAcres: number;
}

export const DEFAULT_ADVISORY_PLACEMENT_SOURCE_REFS: AdvisorySourceReference[] = [
  {
    sourceId: "SRC-NRCS-NEH-623-CH11",
    title: "USDA NRCS NEH Part 623 Chapter 11 Sprinkler Irrigation",
    url: "https://www.wcc.nrcs.usda.gov/ftpref/wntsc/waterMgt/irrigation/NEH15/ch11.pdf",
    checkedAt: "2026-06-05",
    limit: "Sprinkler irrigation terminology and review criteria only; not CPLayout design certification.",
  },
  {
    sourceId: "SRC-POSTGIS-MAXIMUM-INSCRIBED-CIRCLE",
    title: "PostGIS ST_MaximumInscribedCircle",
    url: "https://postgis.net/docs/ST_MaximumInscribedCircle.html",
    checkedAt: "2026-06-05",
    limit: "Algorithm inspiration for seed placement only; does not prove field accuracy.",
  },
];

export const DEFAULT_CORNER_ARM_SOURCE_REFS: AdvisorySourceReference[] = [
  {
    sourceId: "SRC-VALLEY-VFLEX-CORNER",
    title: "Valley VFlex Corner",
    url: "https://www.valleyirrigation.com/vflex-corner",
    checkedAt: "2026-06-05",
    limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
  },
  {
    sourceId: "SRC-VALLEY-PRECISION-CORNER",
    title: "Valley Precision Corner",
    url: "https://valleyirrigation.com/precision-corner",
    checkedAt: "2026-06-05",
    limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
  },
  {
    sourceId: "SRC-NDSU-AE91",
    title: "NDSU Selecting a Sprinkler Irrigation System",
    url: "https://www.ndsu.edu/agriculture/extension/publications/selecting-sprinkler-irrigation-system",
    checkedAt: "2026-06-05",
    limit: "Extension guidance for planning context only; qualified review remains required.",
  },
];

export function buildPivotPlacementCandidates(
  project: PivotProject,
  options: PivotPlacementCandidateOptions = {},
): PivotPlacementCandidate[] {
  const gridDivisions = Math.max(3, Math.floor(options.gridDivisions ?? 9));
  const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? 5));
  const sourceRefs = options.sourceRefs ?? DEFAULT_ADVISORY_PLACEMENT_SOURCE_REFS;
  const optimizerAlternatives = optimizePivotCenter(project, {
    gridDivisions,
    maxAlternatives: Math.max(maxCandidates + 2, 6),
    boundaryEpsilonSquareMeters: options.boundaryEpsilonSquareMeters ?? DEFAULT_BOUNDARY_EPSILON_SQUARE_METERS,
    includeVisualCenterSeed: true,
  });

  const candidates = optimizerAlternatives.map((alternative) => candidateFromAlternative(project, alternative, options, sourceRefs));
  if (options.includeMaximumInscribedCircleSeed !== false) {
    const micSeed = maximumInscribedCircleSeed(project.fieldBoundary, gridDivisions);
    candidates.push(candidateFromProject(project, micSeed.center, "maximum_inscribed_circle", options, sourceRefs));
  }

  return dedupePlacementCandidates(candidates)
    .sort(comparePlacementCandidates)
    .slice(0, maxCandidates);
}

export function analyzeIdealPivotCenter(
  project: PivotProject,
  options: PivotPlacementCandidateOptions = {},
): IdealCenterPointAnalysis {
  const sourceRefs = options.sourceRefs ?? DEFAULT_ADVISORY_PLACEMENT_SOURCE_REFS;
  const base = {
    advisoryOnly: true as const,
    canonicalGeometryMutation: false as const,
    qualifiedReviewRequired: true as const,
    projectCrs: project.projectCrs,
    fieldBoundaryVertexCount: project.fieldBoundary.length,
    sourceRefs,
  };

  if (project.fieldBoundary.length < 3) {
    return {
      ...base,
      status: "no_boundary",
      bestCandidate: null,
      candidates: [],
      machineZoneReviews: [],
      blockers: ["At least three projected-XY field boundary vertices are required before ideal center-point analysis."],
      warnings: ["Automatic center-point analysis did not run because the field boundary is incomplete."],
    };
  }

  const candidates = buildPivotPlacementCandidates(project, options);
  const machineZoneReviews = options.includeMachineZoneReviews === false
    ? []
    : buildMachineZoneReviews(project, options, sourceRefs);
  const bestCandidate = candidates.find((candidate) => candidate.feasible && candidate.insideFieldBoundary) ?? null;
  const status: IdealCenterPointAnalysisStatus = bestCandidate
    ? "ready"
    : candidates.length === 0
      ? "no_candidates"
      : "no_feasible_candidate";
  const blockers = status === "ready"
    ? []
    : status === "no_candidates"
      ? ["No projected-XY center candidates were generated inside the field boundary."]
      : ["No generated center candidate satisfied field-boundary, wet-coverage, and obstacle constraints."];
  const warnings = [
    "Ideal center-point analysis is advisory and does not mutate canonical projected XY until the operator applies a candidate.",
    "Qualified review is required before treating the selected pivot center as an engineering design.",
    ...blockers,
  ];

  return {
    ...base,
    status,
    bestCandidate,
    candidates,
    machineZoneReviews,
    blockers,
    warnings,
  };
}

export function evaluateAdvisoryCornerArm(
  project: PivotProject,
  config: AdvisoryCornerArmConfig | undefined = project.machine.cornerArm,
  options: AdvisoryCornerArmEvaluationOptions = {},
): AdvisoryCornerArmEvaluation {
  const sourceRefs = config?.sourceRefs ?? options.sourceRefs ?? DEFAULT_CORNER_ARM_SOURCE_REFS;
  const baseResult = evaluateLayout(project);
  const dryCornerPolygons = dryCornerPolygonsFor(project, baseResult.allowedCoverage);
  const baseAllowedCoverageAcres = baseResult.metrics.irrigatedAcres;
  const base: Omit<AdvisoryCornerArmEvaluation, "status"> = {
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    unverifiedKinematics: true,
    qualifiedReviewRequired: true,
    sourceRefs,
    warnings: [
      "Corner-arm output is advisory and separate from base/end-gun layout metrics.",
      "Manufacturer-specific corner-arm kinematics remain unverified; qualified review is required.",
    ],
    config,
    pathEnvelope: [],
    coverageCandidate: [],
    dryCornerPolygons,
    evidenceFeatureIds: [],
    estimatedAddedCoverageAcres: 0,
    baseAllowedCoverageAcres,
  };

  if (!config) {
    return {
      ...base,
      status: "missing_config",
      warnings: [...base.warnings, "No operator-confirmed corner-arm advisory config is saved on this machine."],
    };
  }

  if (config.advisoryOnly !== true || config.lengthMeters <= 0 || config.sourceRefs.length === 0) {
    return {
      ...base,
      status: "invalid_config",
      warnings: [...base.warnings, "Corner-arm config must be advisory-only, positive length, and source-backed."],
    };
  }

  const machineRadius = machineRadiusMeters(project.machine);
  const pathEnvelope = intersectMultiPolygons(
    createAnnularSector(project.pivotCenter, machineRadius, machineRadius + config.lengthMeters, project.machine.sweep),
    [[project.fieldBoundary]],
  );
  const evidence = cornerSwingEvidence(project);
  const reviewEnvelope = evidence.multiPolygon.length > 0
    ? intersectMultiPolygons(pathEnvelope, evidence.multiPolygon)
    : pathEnvelope;
  const coverageCandidate = intersectMultiPolygons(reviewEnvelope, dryCornerPolygons);
  const estimatedAddedCoverageAcres = squareMetersToAcres(multiPolygonAreaSquareMeters(coverageCandidate));

  return {
    ...base,
    status: "ready",
    sourceRefs: config.sourceRefs,
    pathEnvelope: reviewEnvelope,
    coverageCandidate,
    evidenceFeatureIds: evidence.ids,
    estimatedAddedCoverageAcres,
    warnings: [
      ...base.warnings,
      ...(evidence.ids.length === 0 ? ["No corner_swing_limit map feature is present; envelope is unconstrained by operator footprint evidence."] : []),
      "Coverage candidate is not merged into allowedCoverage, endGunCoverage, or feasibility.",
    ],
  };
}

function candidateFromAlternative(
  originalProject: PivotProject,
  alternative: PivotCenterAlternative,
  options: PivotPlacementCandidateOptions,
  sourceRefs: AdvisorySourceReference[],
): PivotPlacementCandidate {
  return candidateFromProject(
    originalProject,
    alternative.pivotCenter,
    alternative.sourceSeed,
    options,
    sourceRefs,
    alternative,
  );
}

function candidateFromProject(
  originalProject: PivotProject,
  pivotCenter: XY,
  sourceSeed: PivotPlacementCandidate["sourceSeed"],
  options: PivotPlacementCandidateOptions,
  sourceRefs: AdvisorySourceReference[],
  alternative?: PivotCenterAlternative,
): PivotPlacementCandidate {
  const project = { ...originalProject, pivotCenter };
  const result = evaluateLayout(project);
  const dryCornerPolygons = dryCornerPolygonsFor(project, result.allowedCoverage);
  const dryCornerAcres = squareMetersToAcres(multiPolygonAreaSquareMeters(dryCornerPolygons));
  const bounds = boundsForGeometry([originalProject.fieldBoundary]);
  const diagonal = Math.max(1, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const obstacleBufferMeters = Math.max(0, options.obstacleBufferMeters ?? maxObstacleBuffer(originalProject));
  const insideFieldBoundary = pointInPolygon(pivotCenter, originalProject.fieldBoundary);
  const boundaryClearanceMeters = (insideFieldBoundary ? 1 : -1) * distanceToRing(pivotCenter, originalProject.fieldBoundary);
  const minimumObstacleClearanceMeters = minimumObstacleClearance(pivotCenter, originalProject, obstacleBufferMeters);
  const minimumRequiredBoundaryClearanceMeters = Math.max(0, options.minimumBoundaryClearanceMeters ?? 0);
  const minimumRequiredObstacleClearanceMeters = Math.max(0, options.minimumObstacleClearanceMeters ?? 0);
  const obstacleCrossingProfileIds = matchingCrossingProfileIds(originalProject, options.obstacleCrossingProfiles ?? []);
  const distanceFromCurrentMeters = distance(pivotCenter, originalProject.pivotCenter);
  const distanceToWaterSourceMeters = distance(pivotCenter, originalProject.waterSource);
  const distanceToPowerSourceMeters = distance(pivotCenter, originalProject.powerSource);
  const distanceToAccessMeters = distanceToAccess(pivotCenter, originalProject);
  const feasible = alternative?.feasible ?? (result.metrics.outsideFieldAcres <= 0.0001 && result.metrics.obstacleConflictCount === 0);
  const costAssessment = assessAdvisoryCost(originalProject, result.metrics.irrigatedAcres, options.costInput, sourceRefs);
  const scoreBreakdown = placementScoreBreakdown({
    metrics: result.metrics,
    dryCornerAcres,
    feasible,
    minimumObstacleClearanceMeters,
    distanceToWaterSourceMeters,
    distanceToPowerSourceMeters,
    distanceToAccessMeters,
    diagonal,
    waterSourceWeight: options.waterSourceWeight ?? 8,
    powerSourceWeight: options.powerSourceWeight ?? 6,
    accessWeight: options.accessWeight ?? 4,
    costPerIrrigatedAcre: costAssessment.costPerIrrigatedAcre,
  });
  const score = totalPlacementScore(scoreBreakdown);
  const disqualificationReasons = [
    ...(alternative?.disqualificationReasons ?? []),
    ...(!insideFieldBoundary ? ["Candidate pivot center is outside the field boundary."] : []),
    ...(boundaryClearanceMeters < minimumRequiredBoundaryClearanceMeters ? [`Candidate boundary clearance ${boundaryClearanceMeters.toFixed(2)} meters is below required ${minimumRequiredBoundaryClearanceMeters.toFixed(2)} meters.`] : []),
    ...(minimumObstacleClearanceMeters !== null && minimumObstacleClearanceMeters < 0 ? [`Candidate is inside obstacle buffer by ${Math.abs(minimumObstacleClearanceMeters).toFixed(2)} meters.`] : []),
    ...(minimumObstacleClearanceMeters !== null && minimumObstacleClearanceMeters < minimumRequiredObstacleClearanceMeters ? [`Candidate obstacle clearance ${minimumObstacleClearanceMeters.toFixed(2)} meters is below required ${minimumRequiredObstacleClearanceMeters.toFixed(2)} meters.`] : []),
  ];

  return {
    id: `placement-${sourceSeed}-${pivotCenter.x.toFixed(2)}-${pivotCenter.y.toFixed(2)}`,
    pivotCenter,
    metrics: result.metrics,
    score,
    scoreBreakdown,
    feasible: feasible && insideFieldBoundary && disqualificationReasons.length === 0,
    insideFieldBoundary,
    boundaryClearanceMeters,
    sourceSeed,
    dryCornerPolygons,
    dryCornerAcres,
    obstacleBufferMeters,
    minimumObstacleClearanceMeters,
    distanceFromCurrentMeters,
    distanceToWaterSourceMeters,
    distanceToPowerSourceMeters,
    distanceToAccessMeters,
    minimumRequiredBoundaryClearanceMeters,
    minimumRequiredObstacleClearanceMeters,
    obstacleCrossingProfileIds,
    costAssessment,
    warnings: [
      ...result.warnings,
      ...(costAssessment.status === "missing_cost_input" ? ["Cost efficiency is incomplete because no explicit local cost input was supplied."] : []),
      ...(obstacleCrossingProfileIds.length > 0 ? [`${obstacleCrossingProfileIds.length} obstacle crossing profile${obstacleCrossingProfileIds.length === 1 ? "" : "s"} are advisory only; layout metrics still use project hard/no-spray obstacle settings.`] : []),
      "Placement candidate is advisory; apply requires explicit operator confirmation.",
    ],
    disqualificationReasons,
    sourceRefs,
    canonicalGeometryMutation: false,
  };
}

function placementScoreBreakdown(input: {
  metrics: LayoutMetrics;
  dryCornerAcres: number;
  feasible: boolean;
  minimumObstacleClearanceMeters: number | null;
  distanceToWaterSourceMeters: number;
  distanceToPowerSourceMeters: number;
  distanceToAccessMeters: number | null;
  diagonal: number;
  waterSourceWeight: number;
  powerSourceWeight: number;
  accessWeight: number;
  costPerIrrigatedAcre: number | null;
}): PivotPlacementScoreBreakdown {
  const obstacleClearance = input.minimumObstacleClearanceMeters === null
    ? 0
    : Math.max(-35, Math.min(18, input.minimumObstacleClearanceMeters / 2));
  const costEfficiency = input.costPerIrrigatedAcre === null
    ? 0
    : -Math.max(0, Math.min(35, input.costPerIrrigatedAcre / 1000));
  return {
    coverage: round(input.metrics.irrigatedAcres),
    boundaryFit: round(-Math.min(40, input.metrics.outsideFieldAcres * 10)),
    obstacleClearance: round(obstacleClearance),
    waterSourceProximity: round(proximityScore(input.distanceToWaterSourceMeters, input.diagonal, input.waterSourceWeight)),
    powerSourceProximity: round(proximityScore(input.distanceToPowerSourceMeters, input.diagonal, input.powerSourceWeight)),
    accessProximity: round(input.distanceToAccessMeters === null ? 0 : proximityScore(input.distanceToAccessMeters, input.diagonal, input.accessWeight)),
    dryCornerPenalty: round(-Math.min(35, input.dryCornerAcres * 0.18)),
    costEfficiency: round(costEfficiency),
    feasibility: input.feasible ? 35 : -75,
  };
}

function totalPlacementScore(breakdown: PivotPlacementScoreBreakdown): number {
  return round(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
}

function assessAdvisoryCost(
  project: PivotProject,
  irrigatedAcres: number,
  input: AdvisoryCostInput | undefined,
  defaultSourceRefs: AdvisorySourceReference[],
): AdvisoryCostAssessment {
  const sourceRefs = input?.sourceRefs ?? defaultSourceRefs;
  const base = {
    advisoryOnly: true as const,
    canonicalGeometryMutation: false as const,
    estimatedCost: null,
    costPerIrrigatedAcre: null,
    currencyCode: input?.currencyCode?.trim() || "USD",
    sourceRefs,
  };
  if (!input) {
    return {
      ...base,
      status: "missing_cost_input",
      warnings: ["No explicit local cost input was supplied; CPLayout did not infer machine price."],
    };
  }
  const fixedMachineCost = input.fixedMachineCost ?? 0;
  const costPerMeter = input.costPerMeter ?? 0;
  const costPerTower = input.costPerTower ?? 0;
  if (
    !Number.isFinite(fixedMachineCost)
    || !Number.isFinite(costPerMeter)
    || !Number.isFinite(costPerTower)
    || fixedMachineCost < 0
    || costPerMeter < 0
    || costPerTower < 0
    || fixedMachineCost + costPerMeter + costPerTower <= 0
  ) {
    return {
      ...base,
      status: "invalid_cost_input",
      warnings: ["Cost input must include at least one nonnegative fixed, per-meter, or per-tower value."],
    };
  }
  const estimatedCost = fixedMachineCost
    + machineRadiusMeters(project.machine) * costPerMeter
    + project.machine.spanLengthsMeters.length * costPerTower;
  if (irrigatedAcres <= 0) {
    return {
      ...base,
      status: "no_irrigated_acres",
      estimatedCost: round(estimatedCost),
      warnings: ["Cost per irrigated acre was not computed because modeled irrigated acres are zero."],
    };
  }
  return {
    ...base,
    status: "complete",
    estimatedCost: round(estimatedCost),
    costPerIrrigatedAcre: round(estimatedCost / irrigatedAcres),
    warnings: [
      "Cost efficiency uses operator-supplied local cost inputs only and is not a price quote.",
      ...(input.notes ? [input.notes] : []),
    ],
  };
}

function buildMachineZoneReviews(
  project: PivotProject,
  options: PivotPlacementCandidateOptions,
  sourceRefs: AdvisorySourceReference[],
): AdvisoryMachineZoneReview[] {
  const zoneFeatures = (project.mapFeatures ?? []).filter((feature) => (
    feature.kind === "planning_boundary" || feature.kind === "machine_zone"
  ));
  return zoneFeatures.map((feature): AdvisoryMachineZoneReview => {
    const zoneBoundary = mapFeatureBoundary(feature);
    const base = {
      featureId: feature.id,
      featureName: feature.name,
      featureKind: feature.kind as "planning_boundary" | "machine_zone",
      advisoryOnly: true as const,
      canonicalGeometryMutation: false as const,
      qualifiedReviewRequired: true as const,
      boundaryVertexCount: zoneBoundary?.length ?? 0,
      sourceRefs,
    };
    if (!zoneBoundary || zoneBoundary.length < 3) {
      return {
        ...base,
        status: "unsupported_geometry",
        bestCandidate: null,
        candidateCount: 0,
        warnings: ["Machine-zone review requires a polygon or circle map feature with at least three projected-XY vertices."],
      };
    }
    const zoneProject: PivotProject = {
      ...project,
      fieldBoundary: zoneBoundary,
    };
    const candidates = buildPivotPlacementCandidates(zoneProject, {
      ...options,
      includeMachineZoneReviews: false,
      sourceRefs,
    });
    const bestCandidate = candidates.find((candidate) => candidate.feasible && candidate.insideFieldBoundary) ?? null;
    return {
      ...base,
      status: bestCandidate ? "ready" : "no_feasible_candidate",
      bestCandidate,
      candidateCount: candidates.length,
      warnings: [
        `${feature.kind.replaceAll("_", " ")} review is transient and does not create another pivot, zone, or canonical field boundary.`,
        ...(bestCandidate ? [] : ["No feasible center candidate was found inside this advisory zone."]),
      ],
    };
  });
}

function dryCornerPolygonsFor(project: PivotProject, allowedCoverage: MultiPolygonXY): MultiPolygonXY {
  return differenceMultiPolygons([[project.fieldBoundary]], allowedCoverage);
}

function maximumInscribedCircleSeed(fieldBoundary: XY[], gridDivisions: number): { center: XY; radiusMeters: number } {
  const bounds = boundsForGeometry([fieldBoundary]);
  let best = centroid(fieldBoundary);
  let bestDistance = pointInPolygon(best, fieldBoundary) ? distanceToRing(best, fieldBoundary) : -1;
  const passes = [
    { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY, divisions: Math.max(6, gridDivisions) },
    { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY, divisions: Math.max(12, gridDivisions * 2) },
  ];

  for (const pass of passes) {
    const xStep = (pass.maxX - pass.minX) / pass.divisions;
    const yStep = (pass.maxY - pass.minY) / pass.divisions;
    for (let yIndex = 0; yIndex <= pass.divisions; yIndex += 1) {
      for (let xIndex = 0; xIndex <= pass.divisions; xIndex += 1) {
        const point = { x: pass.minX + xStep * xIndex, y: pass.minY + yStep * yIndex };
        if (!pointInPolygon(point, fieldBoundary)) continue;
        const candidateDistance = distanceToRing(point, fieldBoundary);
        if (candidateDistance > bestDistance) {
          best = point;
          bestDistance = candidateDistance;
        }
      }
    }
  }

  return { center: best, radiusMeters: Math.max(0, bestDistance) };
}

function maxObstacleBuffer(project: PivotProject): number {
  return project.obstacles.reduce((max, obstacle) => Math.max(max, obstacle.bufferMeters), 0);
}

function minimumObstacleClearance(point: XY, project: PivotProject, additionalBufferMeters: number): number | null {
  if (project.obstacles.length === 0) return null;
  return project.obstacles.reduce((minimum, obstacle) => {
    const clearance = distanceToRing(point, obstacle.polygon) - obstacle.bufferMeters - additionalBufferMeters;
    return Math.min(minimum, clearance);
  }, Number.POSITIVE_INFINITY);
}

function matchingCrossingProfileIds(
  project: PivotProject,
  profiles: AdvisoryObstacleCrossingProfile[],
): string[] {
  const obstacleIds = new Set(project.obstacles.map((obstacle) => obstacle.id));
  return profiles
    .filter((profile) => profile.advisoryOnly === true && obstacleIds.has(profile.obstacleId))
    .map((profile) => profile.obstacleId);
}

function distanceToAccess(point: XY, project: PivotProject): number | null {
  const candidates: number[] = [];
  for (const obstacle of project.obstacles) {
    if (obstacle.kind === "road") candidates.push(distanceToRing(point, obstacle.polygon));
  }
  for (const feature of project.mapFeatures ?? []) {
    if (feature.kind !== "access_lane" && feature.kind !== "road") continue;
    candidates.push(distanceToMapFeature(point, feature));
  }
  const finite = candidates.filter(Number.isFinite);
  return finite.length > 0 ? Math.min(...finite) : null;
}

function distanceToMapFeature(point: XY, feature: ProjectMapFeature): number {
  if (feature.geometry.type === "Point") return distance(point, feature.geometry.point);
  if (feature.geometry.type === "Circle") return Math.abs(distance(point, feature.geometry.center) - feature.geometry.radiusMeters);
  const vertices = feature.geometry.vertices;
  if (feature.geometry.type === "Polygon") return distanceToRing(point, vertices);
  return distanceToLineString(point, vertices);
}

function mapFeatureBoundary(feature: ProjectMapFeature): XY[] | null {
  if (feature.geometry.type === "Polygon") return feature.geometry.vertices;
  if (feature.geometry.type === "Circle") return createCirclePolygon(feature.geometry.center, feature.geometry.radiusMeters, 96);
  return null;
}

function distanceToLineString(point: XY, vertices: XY[]): number {
  if (vertices.length === 0) return Number.POSITIVE_INFINITY;
  if (vertices.length === 1) return distance(point, vertices[0]);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length - 1; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, vertices[index], vertices[index + 1]));
  }
  return minimum;
}

function cornerSwingEvidence(project: PivotProject): { ids: string[]; multiPolygon: MultiPolygonXY } {
  const features = (project.mapFeatures ?? []).filter((feature) => feature.kind === "corner_swing_limit");
  return {
    ids: features.map((feature) => feature.id),
    multiPolygon: features.flatMap((feature): MultiPolygonXY => {
      if (feature.geometry.type === "Polygon") return [[feature.geometry.vertices]];
      if (feature.geometry.type === "Circle") return [[createCirclePolygon(feature.geometry.center, feature.geometry.radiusMeters, 96)]];
      if (feature.geometry.type === "LineString" && feature.geometry.vertices.length >= 3) return [[feature.geometry.vertices]];
      return [];
    }),
  };
}

function proximityScore(distanceMeters: number, diagonalMeters: number, weight: number): number {
  return Math.max(0, 1 - distanceMeters / Math.max(1, diagonalMeters)) * Math.max(0, weight);
}

function dedupePlacementCandidates(candidates: PivotPlacementCandidate[]): PivotPlacementCandidate[] {
  const byPoint = new Map<string, PivotPlacementCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.pivotCenter.x.toFixed(3)},${candidate.pivotCenter.y.toFixed(3)}`;
    const current = byPoint.get(key);
    if (!current || comparePlacementCandidates(candidate, current) < 0) byPoint.set(key, candidate);
  }
  return [...byPoint.values()];
}

function comparePlacementCandidates(left: PivotPlacementCandidate, right: PivotPlacementCandidate): number {
  if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
  if (right.score !== left.score) return right.score - left.score;
  if (right.metrics.irrigatedAcres !== left.metrics.irrigatedAcres) return right.metrics.irrigatedAcres - left.metrics.irrigatedAcres;
  return left.id.localeCompare(right.id);
}

function intersectMultiPolygons(left: MultiPolygonXY, right: MultiPolygonXY): MultiPolygonXY {
  if (left.length === 0 || right.length === 0) return [];
  return fromClipMultiPolygon(polygonClipping.intersection(toClipMultiPolygon(left), toClipMultiPolygon(right)) as ClipMultiPolygon | null);
}

function differenceMultiPolygons(left: MultiPolygonXY, right: MultiPolygonXY): MultiPolygonXY {
  if (left.length === 0) return [];
  if (right.length === 0) return left;
  return fromClipMultiPolygon(polygonClipping.difference(toClipMultiPolygon(left), toClipMultiPolygon(right)) as ClipMultiPolygon | null);
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
  return first.x === last.x && first.y === last.y ? ring : [...ring, first];
}

function centroid(ring: XY[]): XY {
  if (ring.length === 0) return { x: 0, y: 0 };
  const total = ring.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / ring.length, y: total.y / ring.length };
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
