import * as polygonClipping from "polygon-clipping";

import type {
  AdvisoryCornerArmConfig,
  AdvisorySourceReference,
  LayoutMetrics,
  MultiPolygonXY,
  PivotMachine,
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
  createSectorPolygon,
  evaluateLayout,
  machineRadiusMeters,
  multiPolygonAreaSquareMeters,
  polygonAreaSquareMeters,
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

export type AdvisoryMultiMachineReviewStatus =
  | "missing_zones"
  | "single_zone_review"
  | "ready"
  | "no_feasible_scenarios";

export interface AdvisoryMultiMachineReviewOptions extends PivotPlacementCandidateOptions {
  collisionBufferMeters?: number;
  minimumMachineSeparationMeters?: number;
}

export interface AdvisoryMachineScenario {
  id: string;
  zoneFeatureId: string;
  zoneName: string;
  zoneKind: "planning_boundary" | "machine_zone";
  status: "ready" | "unsupported_geometry" | "no_feasible_candidate";
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  boundaryVertexCount: number;
  zoneAcres: number;
  machineRadiusMeters: number;
  bestCandidate: PivotPlacementCandidate | null;
  candidateCount: number;
  modeledIrrigatedAcres: number;
  modeledCoverage: MultiPolygonXY;
  machineEnvelope: MultiPolygonXY;
  warnings: string[];
  sourceRefs: AdvisorySourceReference[];
}

export interface AdvisoryMachineEnvelopeConflict {
  id: string;
  leftScenarioId: string;
  rightScenarioId: string;
  leftZoneName: string;
  rightZoneName: string;
  status: "machine_envelope_overlap" | "separation_buffer_warning";
  severity: "critical_overlap" | "buffer_intrusion";
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  operatorCollisionReviewRequired: true;
  centerDistanceMeters: number;
  leftMachineRadiusMeters: number;
  rightMachineRadiusMeters: number;
  collisionBufferMeters: number;
  minimumRequiredSeparationMeters: number;
  separationDeficitMeters: number;
  separationReviewBufferMeters: number;
  collisionZone: MultiPolygonXY;
  collisionZoneAcres: number;
  separationReviewZone: MultiPolygonXY;
  separationReviewZoneAcres: number;
  envelopeOverlapAcres: number;
  warnings: string[];
}

export interface AdvisoryBoundaryCompilation {
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  fieldBoundaryAcres: number;
  planningBoundaryCount: number;
  machineZoneCount: number;
  scenarioCount: number;
  readyScenarioCount: number;
  unsupportedScenarioCount: number;
  compiledBoundaryAcres: number;
  scenarioZoneAcres: number;
  modeledIrrigatedAcresSum: number;
  modeledIrrigatedUnionAcres: number;
  duplicateModeledCoverageAcres: number;
}

export interface AdvisoryMultiMachineReview {
  status: AdvisoryMultiMachineReviewStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  projectCrs: string;
  scenarios: AdvisoryMachineScenario[];
  conflicts: AdvisoryMachineEnvelopeConflict[];
  compilation: AdvisoryBoundaryCompilation;
  blockers: string[];
  warnings: string[];
  sourceRefs: AdvisorySourceReference[];
}

export type AdvisoryMachineStrategyKind =
  | "current_machine"
  | "full_circle_same_radius"
  | "full_circle_radius"
  | "linear_lateral_move"
  | "unsupported_linear_lateral"
  | "unsupported_bender_second_pivot";

export type AdvisoryMachineStrategyStatus =
  | "ready"
  | "no_feasible_candidate"
  | "unsupported_model";

export type AdvisoryMachineStrategyComparisonStatus =
  | "ready"
  | "no_boundary"
  | "no_feasible_strategy";

export interface AdvisoryMachineStrategyInput {
  id: string;
  label: string;
  strategyKind: AdvisoryMachineStrategyKind;
  machine?: PivotMachine;
  pathFeatureId?: string;
  notes?: string;
  sourceRefs?: AdvisorySourceReference[];
}

export interface AdvisoryMachineStrategyComparisonOptions extends PivotPlacementCandidateOptions {
  strategies?: AdvisoryMachineStrategyInput[];
  generatedFullCircleRadiiMeters?: number[];
  includeGeneratedRadiusStrategies?: boolean;
  includeUnsupportedConceptPlaceholders?: boolean;
}

export interface AdvisoryMachineStrategyResult {
  id: string;
  label: string;
  strategyKind: AdvisoryMachineStrategyKind;
  status: AdvisoryMachineStrategyStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  machineRadiusMeters: number;
  spanCount: number;
  sweepMode: PivotMachine["sweep"]["mode"] | "unsupported";
  bestCandidate: PivotPlacementCandidate | null;
  pathFeatureId?: string;
  candidateCount: number;
  irrigatedAcres: number;
  outsideFieldAcres: number;
  coveragePercent: number;
  costAssessment: AdvisoryCostAssessment | null;
  costEfficiencyAcresPerHundredThousand: number | null;
  advisoryScore: number;
  warnings: string[];
  sourceRefs: AdvisorySourceReference[];
}

export interface AdvisoryMachineStrategyComparison {
  status: AdvisoryMachineStrategyComparisonStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  qualifiedReviewRequired: true;
  projectCrs: string;
  strategies: AdvisoryMachineStrategyResult[];
  bestStrategy: AdvisoryMachineStrategyResult | null;
  costInputStatus: AdvisoryCostAssessment["status"];
  blockers: string[];
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

export function analyzeAdvisoryMultiMachineLayout(
  project: PivotProject,
  options: AdvisoryMultiMachineReviewOptions = {},
): AdvisoryMultiMachineReview {
  const sourceRefs = options.sourceRefs ?? DEFAULT_ADVISORY_PLACEMENT_SOURCE_REFS;
  const planningBoundaries = planningBoundaryFeatures(project);
  const machineZones = machineZoneFeatures(project);
  const scenarioFeatures = machineZones.length > 0 ? machineZones : planningBoundaries;
  const scenarios = scenarioFeatures.map((feature) => buildAdvisoryMachineScenario(project, feature, options, sourceRefs));
  const readyScenarios = scenarios.filter((scenario) => scenario.status === "ready" && scenario.bestCandidate);
  const conflicts = buildMachineEnvelopeConflicts(project, readyScenarios, options);
  const compilation = buildBoundaryCompilation(project, planningBoundaries, machineZones, scenarios);
  const blockers = scenarioFeatures.length === 0
    ? ["Add at least one advisory machine zone or planning boundary before multi-machine layout review."]
    : readyScenarios.length === 0
      ? ["No advisory machine scenario has a feasible center candidate."]
      : [];
  const status: AdvisoryMultiMachineReviewStatus = scenarioFeatures.length === 0
    ? "missing_zones"
    : readyScenarios.length === 0
      ? "no_feasible_scenarios"
      : readyScenarios.length === 1
        ? "single_zone_review"
        : "ready";

  return {
    status,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    qualifiedReviewRequired: true,
    projectCrs: project.projectCrs,
    scenarios,
    conflicts,
    compilation,
    blockers,
    warnings: [
      "Multi-machine layout review is advisory and does not create pivots, zones, or canonical projected-XY geometry.",
      "Each scenario reuses the current machine template; span package, corner-arm, flow, pressure, and vendor constraints require qualified review.",
      "Envelope conflicts are conservative geometry warnings and do not model timing, tower phasing, alignment controls, or bender-machine kinematics.",
      ...(compilation.duplicateModeledCoverageAcres > 0.001 ? ["Modeled irrigated acreage overlaps between scenarios; summed acres are not de-duplicated."] : []),
      ...blockers,
    ],
    sourceRefs,
  };
}

export function compareAdvisoryMachineStrategies(
  project: PivotProject,
  options: AdvisoryMachineStrategyComparisonOptions = {},
): AdvisoryMachineStrategyComparison {
  const sourceRefs = options.sourceRefs ?? DEFAULT_ADVISORY_PLACEMENT_SOURCE_REFS;
  const base = {
    advisoryOnly: true as const,
    canonicalGeometryMutation: false as const,
    qualifiedReviewRequired: true as const,
    projectCrs: project.projectCrs,
    sourceRefs,
  };

  if (project.fieldBoundary.length < 3) {
    return {
      ...base,
      status: "no_boundary",
      strategies: [],
      bestStrategy: null,
      costInputStatus: costInputStatusForInput(options.costInput),
      blockers: ["At least three projected-XY field boundary vertices are required before advisory machine strategy comparison."],
      warnings: ["Machine strategy comparison did not run because the field boundary is incomplete."],
    };
  }

  const strategyInputs = buildMachineStrategyInputs(project, options, sourceRefs);
  const strategies = strategyInputs
    .map((strategy) => evaluateMachineStrategy(project, strategy, options, sourceRefs))
    .sort(compareMachineStrategyResults);
  const bestStrategy = strategies.find((strategy) => strategy.status === "ready") ?? null;
  const costInputStatus = firstCostStatus(strategies, options.costInput);
  const blockers = bestStrategy
    ? []
    : ["No advisory machine strategy produced a feasible center candidate."];

  return {
    ...base,
    status: bestStrategy ? "ready" : "no_feasible_strategy",
    strategies,
    bestStrategy,
    costInputStatus,
    blockers,
    warnings: [
      "Machine strategy comparison is advisory and does not mutate canonical projected XY, machine settings, zones, or project storage.",
      "Generated full-circle strategies are approximate planning templates derived from the current span package; operator/vendor confirmation is required.",
      ...(costInputStatus === "missing_cost_input" ? ["Cost ranking is incomplete because no explicit local cost input was supplied."] : []),
      ...(costInputStatus === "invalid_cost_input" ? ["Cost ranking is blocked because the supplied local cost input is invalid."] : []),
      ...blockers,
    ],
    sourceRefs,
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

function planningBoundaryFeatures(project: PivotProject): ProjectMapFeature[] {
  return (project.mapFeatures ?? []).filter((feature) => feature.kind === "planning_boundary");
}

function machineZoneFeatures(project: PivotProject): ProjectMapFeature[] {
  return (project.mapFeatures ?? []).filter((feature) => feature.kind === "machine_zone");
}

function buildAdvisoryMachineScenario(
  project: PivotProject,
  feature: ProjectMapFeature,
  options: AdvisoryMultiMachineReviewOptions,
  sourceRefs: AdvisorySourceReference[],
): AdvisoryMachineScenario {
  const zoneBoundary = mapFeatureBoundary(feature);
  const base = {
    id: `scenario-${feature.id}`,
    zoneFeatureId: feature.id,
    zoneName: feature.name,
    zoneKind: feature.kind as "planning_boundary" | "machine_zone",
    advisoryOnly: true as const,
    canonicalGeometryMutation: false as const,
    qualifiedReviewRequired: true as const,
    boundaryVertexCount: zoneBoundary?.length ?? 0,
    zoneAcres: zoneBoundary ? squareMetersToAcres(polygonAreaSquareMeters(zoneBoundary)) : 0,
    machineRadiusMeters: machineRadiusMeters(project.machine),
    sourceRefs,
  };

  if (!zoneBoundary || zoneBoundary.length < 3) {
    return {
      ...base,
      status: "unsupported_geometry",
      bestCandidate: null,
      candidateCount: 0,
      modeledIrrigatedAcres: 0,
      modeledCoverage: [],
      machineEnvelope: [],
      warnings: ["Advisory machine scenario requires a polygon or circle boundary with at least three projected-XY vertices."],
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

  if (!bestCandidate) {
    return {
      ...base,
      status: "no_feasible_candidate",
      bestCandidate: null,
      candidateCount: candidates.length,
      modeledIrrigatedAcres: 0,
      modeledCoverage: [],
      machineEnvelope: [],
      warnings: [
        `${feature.kind.replaceAll("_", " ")} scenario is transient and does not create a saved pivot or field boundary.`,
        "No feasible center candidate was found inside this advisory zone.",
      ],
    };
  }

  const scenarioProject: PivotProject = {
    ...zoneProject,
    pivotCenter: bestCandidate.pivotCenter,
  };
  const result = evaluateLayout(scenarioProject);
  const machineEnvelope = machineEnvelopeFor(project, bestCandidate.pivotCenter);

  return {
    ...base,
    status: "ready",
    bestCandidate,
    candidateCount: candidates.length,
    modeledIrrigatedAcres: result.metrics.irrigatedAcres,
    modeledCoverage: result.allowedCoverage,
    machineEnvelope,
    warnings: [
      `${feature.kind.replaceAll("_", " ")} scenario is transient and does not create a saved pivot or field boundary.`,
      "Scenario uses the current machine as a planning template for this zone only.",
      ...bestCandidate.warnings,
    ],
  };
}

function machineEnvelopeFor(project: PivotProject, pivotCenter: XY, radiusMeters = machineRadiusMeters(project.machine)): MultiPolygonXY {
  const radius = radiusMeters;
  if (radius <= 0) return [];
  return [[createSectorPolygon(pivotCenter, radius, project.machine.sweep)]];
}

function buildMachineEnvelopeConflicts(
  project: PivotProject,
  scenarios: AdvisoryMachineScenario[],
  options: AdvisoryMultiMachineReviewOptions,
): AdvisoryMachineEnvelopeConflict[] {
  const collisionBufferMeters = Math.max(0, options.collisionBufferMeters ?? 0);
  const explicitMinimumSeparationMeters = Math.max(0, options.minimumMachineSeparationMeters ?? 0);
  const conflicts: AdvisoryMachineEnvelopeConflict[] = [];

  for (let leftIndex = 0; leftIndex < scenarios.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scenarios.length; rightIndex += 1) {
      const left = scenarios[leftIndex];
      const right = scenarios[rightIndex];
      const leftCenter = left.bestCandidate?.pivotCenter;
      const rightCenter = right.bestCandidate?.pivotCenter;
      if (!leftCenter || !rightCenter) continue;

      const envelopeSeparation = left.machineRadiusMeters + right.machineRadiusMeters;
      const minimumRequiredSeparationMeters = Math.max(
        explicitMinimumSeparationMeters,
        envelopeSeparation + collisionBufferMeters,
      );
      const centerDistanceMeters = distance(leftCenter, rightCenter);
      const separationDeficitMeters = minimumRequiredSeparationMeters - centerDistanceMeters;
      if (separationDeficitMeters <= 0) continue;

      const collisionZone = intersectMultiPolygons(
        left.machineEnvelope,
        right.machineEnvelope,
      );
      const envelopeOverlapAcres = squareMetersToAcres(multiPolygonAreaSquareMeters(collisionZone));
      const separationReviewBufferMeters = Math.max(0, (minimumRequiredSeparationMeters - envelopeSeparation) / 2);
      const separationReviewZone = separationReviewBufferMeters > 0
        ? intersectMultiPolygons(
          machineEnvelopeFor(project, leftCenter, left.machineRadiusMeters + separationReviewBufferMeters),
          machineEnvelopeFor(project, rightCenter, right.machineRadiusMeters + separationReviewBufferMeters),
        )
        : collisionZone;
      const separationReviewZoneAcres = squareMetersToAcres(multiPolygonAreaSquareMeters(separationReviewZone));
      const status = envelopeOverlapAcres > 0.001
        ? "machine_envelope_overlap"
        : "separation_buffer_warning";
      const severity = status === "machine_envelope_overlap" ? "critical_overlap" : "buffer_intrusion";

      conflicts.push({
        id: `conflict-${left.id}-${right.id}`,
        leftScenarioId: left.id,
        rightScenarioId: right.id,
        leftZoneName: left.zoneName,
        rightZoneName: right.zoneName,
        status,
        severity,
        advisoryOnly: true,
        canonicalGeometryMutation: false,
        qualifiedReviewRequired: true,
        operatorCollisionReviewRequired: true,
        centerDistanceMeters: round(centerDistanceMeters),
        leftMachineRadiusMeters: round(left.machineRadiusMeters),
        rightMachineRadiusMeters: round(right.machineRadiusMeters),
        collisionBufferMeters: round(collisionBufferMeters),
        minimumRequiredSeparationMeters: round(minimumRequiredSeparationMeters),
        separationDeficitMeters: round(Math.max(0, separationDeficitMeters)),
        separationReviewBufferMeters: round(separationReviewBufferMeters),
        collisionZone,
        collisionZoneAcres: round(envelopeOverlapAcres),
        separationReviewZone,
        separationReviewZoneAcres: round(separationReviewZoneAcres),
        envelopeOverlapAcres: round(envelopeOverlapAcres),
        warnings: [
          "Conflict includes projected-XY collision/review zone evidence only; it does not mutate saved project geometry.",
          "Conflict does not model real tower timing, controls, interlocks, or field operations.",
          "Qualified review is required before using this warning for machine placement decisions.",
        ],
      });
    }
  }

  return conflicts;
}

function buildBoundaryCompilation(
  project: PivotProject,
  planningBoundaries: ProjectMapFeature[],
  machineZones: ProjectMapFeature[],
  scenarios: AdvisoryMachineScenario[],
): AdvisoryBoundaryCompilation {
  const allBoundaries = [...planningBoundaries, ...machineZones]
    .map((feature) => mapFeatureBoundary(feature))
    .filter((boundary): boundary is XY[] => Boolean(boundary && boundary.length >= 3));
  const compiledBoundary = allBoundaries.length > 0
    ? unionMultiPolygons(allBoundaries.map((boundary) => [boundary]))
    : [[project.fieldBoundary]];
  const modeledCoverages = scenarios
    .filter((scenario) => scenario.status === "ready")
    .flatMap((scenario) => scenario.modeledCoverage);
  const modeledCoverageUnion = unionMultiPolygons(modeledCoverages);
  const modeledIrrigatedAcresSum = scenarios.reduce((sum, scenario) => sum + scenario.modeledIrrigatedAcres, 0);
  const modeledIrrigatedUnionAcres = squareMetersToAcres(multiPolygonAreaSquareMeters(modeledCoverageUnion));

  return {
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    fieldBoundaryAcres: round(squareMetersToAcres(polygonAreaSquareMeters(project.fieldBoundary))),
    planningBoundaryCount: planningBoundaries.length,
    machineZoneCount: machineZones.length,
    scenarioCount: scenarios.length,
    readyScenarioCount: scenarios.filter((scenario) => scenario.status === "ready").length,
    unsupportedScenarioCount: scenarios.filter((scenario) => scenario.status === "unsupported_geometry").length,
    compiledBoundaryAcres: round(squareMetersToAcres(multiPolygonAreaSquareMeters(compiledBoundary))),
    scenarioZoneAcres: round(scenarios.reduce((sum, scenario) => sum + scenario.zoneAcres, 0)),
    modeledIrrigatedAcresSum: round(modeledIrrigatedAcresSum),
    modeledIrrigatedUnionAcres: round(modeledIrrigatedUnionAcres),
    duplicateModeledCoverageAcres: round(Math.max(0, modeledIrrigatedAcresSum - modeledIrrigatedUnionAcres)),
  };
}

function buildMachineStrategyInputs(
  project: PivotProject,
  options: AdvisoryMachineStrategyComparisonOptions,
  sourceRefs: AdvisorySourceReference[],
): AdvisoryMachineStrategyInput[] {
  const inputs: AdvisoryMachineStrategyInput[] = options.strategies
    ? [...options.strategies]
    : [{
      id: "current-machine",
      label: "Current machine",
      strategyKind: "current_machine",
      machine: project.machine,
      sourceRefs,
    }];
  const currentRadius = machineRadiusMeters(project.machine);
  const linearPathFeatures = linearMovePathFeatures(project);

  if (project.machine.sweep.mode === "partial_circle" && currentRadius > 0) {
    inputs.push({
      id: "full-circle-same-radius",
      label: "Full circle at current radius",
      strategyKind: "full_circle_same_radius",
      machine: {
        ...project.machine,
        id: `${project.machine.id}-full-circle`,
        name: `${project.machine.name} full circle`,
        sweep: { mode: "full_circle" },
        endGunAngleRanges: undefined,
      },
      sourceRefs,
      notes: "Compares the current radius against a full-circle sweep; it is not a machine quote or vendor recommendation.",
    });
  }

  if (options.includeGeneratedRadiusStrategies !== false && currentRadius > 0) {
    const radii = options.generatedFullCircleRadiiMeters ?? generatedFullCircleRadii(currentRadius);
    for (const radius of radii) {
      if (!Number.isFinite(radius) || radius <= 0) continue;
      inputs.push({
        id: `full-circle-radius-${radius.toFixed(2)}`,
        label: `Full circle ${radius.toFixed(0)} m radius`,
        strategyKind: "full_circle_radius",
        machine: approximateFullCircleMachine(project.machine, radius),
        sourceRefs,
        notes: "Generated radius strategy is a local planning approximation from the current span package.",
      });
    }
  }

  for (const feature of linearPathFeatures) {
    inputs.push({
      id: `linear-lateral-${feature.id}`,
      label: feature.name || "Linear/lateral move path",
      strategyKind: "linear_lateral_move",
      machine: {
        ...project.machine,
        id: `${project.machine.id}-linear-lateral-${feature.id}`,
        name: `${project.machine.name} linear/lateral template`,
        sweep: { mode: "full_circle" },
        endGunAngleRanges: undefined,
      },
      pathFeatureId: feature.id,
      sourceRefs,
      notes: "Linear/lateral strategy uses an operator-supplied projected-XY travel path and an approximate swept strip.",
    });
  }

  if (options.includeUnsupportedConceptPlaceholders !== false) {
    inputs.push(
      ...(linearPathFeatures.length === 0 ? [{
        id: "linear-lateral-placeholder",
        label: "Linear/lateral move",
        strategyKind: "unsupported_linear_lateral",
        sourceRefs,
        notes: "Linear/lateral move design requires a separate path, guidance, water-supply, and travel-stop model.",
      } as AdvisoryMachineStrategyInput] : []),
      {
        id: "bender-second-pivot-placeholder",
        label: "Bender / second pivot point",
        strategyKind: "unsupported_bender_second_pivot",
        sourceRefs,
        notes: "Bender or second-pivot behavior requires source-backed tower-pivot kinematics before scoring.",
      },
    );
  }

  return dedupeMachineStrategyInputs(inputs);
}

function evaluateMachineStrategy(
  project: PivotProject,
  strategy: AdvisoryMachineStrategyInput,
  options: AdvisoryMachineStrategyComparisonOptions,
  defaultSourceRefs: AdvisorySourceReference[],
): AdvisoryMachineStrategyResult {
  const sourceRefs = strategy.sourceRefs ?? defaultSourceRefs;
  const unsupportedWarning = unsupportedStrategyWarning(strategy);
  if (unsupportedWarning || !strategy.machine) {
    return {
      id: strategy.id,
      label: strategy.label,
      strategyKind: strategy.strategyKind,
      status: "unsupported_model",
      advisoryOnly: true,
      canonicalGeometryMutation: false,
      qualifiedReviewRequired: true,
      machineRadiusMeters: 0,
      spanCount: 0,
      sweepMode: "unsupported",
      bestCandidate: null,
      pathFeatureId: strategy.pathFeatureId,
      candidateCount: 0,
      irrigatedAcres: 0,
      outsideFieldAcres: 0,
      coveragePercent: 0,
      costAssessment: null,
      costEfficiencyAcresPerHundredThousand: null,
      advisoryScore: Number.NEGATIVE_INFINITY,
      warnings: [
        unsupportedWarning ?? "Machine strategy is missing a machine template and was not scored.",
        ...(strategy.notes ? [strategy.notes] : []),
      ],
      sourceRefs,
    };
  }

  if (strategy.strategyKind === "linear_lateral_move") {
    return evaluateLinearLateralStrategy(project, strategy, options, sourceRefs);
  }

  const strategyProject: PivotProject = {
    ...project,
    machine: strategy.machine,
  };
  const candidates = buildPivotPlacementCandidates(strategyProject, {
    ...options,
    includeMachineZoneReviews: false,
    sourceRefs,
  });
  const bestCandidate = candidates.find((candidate) => candidate.feasible && candidate.insideFieldBoundary) ?? null;
  const costAssessment = bestCandidate?.costAssessment
    ?? assessAdvisoryCost(strategyProject, 0, options.costInput, sourceRefs);
  const costEfficiencyAcresPerHundredThousand = costAssessment.estimatedCost && bestCandidate
    ? round(bestCandidate.metrics.irrigatedAcres / (costAssessment.estimatedCost / 100000))
    : null;
  const advisoryScore = bestCandidate
    ? round(bestCandidate.score + (costEfficiencyAcresPerHundredThousand ?? 0))
    : Number.NEGATIVE_INFINITY;

  return {
    id: strategy.id,
    label: strategy.label,
    strategyKind: strategy.strategyKind,
    status: bestCandidate ? "ready" : "no_feasible_candidate",
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    qualifiedReviewRequired: true,
    machineRadiusMeters: round(machineRadiusMeters(strategy.machine)),
    spanCount: strategy.machine.spanLengthsMeters.length,
    sweepMode: strategy.machine.sweep.mode,
    bestCandidate,
    pathFeatureId: strategy.pathFeatureId,
    candidateCount: candidates.length,
    irrigatedAcres: bestCandidate?.metrics.irrigatedAcres ?? 0,
    outsideFieldAcres: bestCandidate?.metrics.outsideFieldAcres ?? 0,
    coveragePercent: bestCandidate?.metrics.coveragePercent ?? 0,
    costAssessment,
    costEfficiencyAcresPerHundredThousand,
    advisoryScore,
    warnings: [
      `${strategy.label} is an advisory machine strategy only; applying it requires explicit operator edits and validation.`,
      ...(strategy.notes ? [strategy.notes] : []),
      ...(bestCandidate ? bestCandidate.warnings : ["No feasible pivot-center candidate was found for this machine strategy."]),
    ],
    sourceRefs,
  };
}

function unsupportedStrategyWarning(strategy: AdvisoryMachineStrategyInput): string | null {
  if (strategy.strategyKind === "unsupported_linear_lateral") {
    return "Linear/lateral move scoring is not implemented; CPLayout needs a source-backed travel-path and water-supply model before ranking it.";
  }
  if (strategy.strategyKind === "unsupported_bender_second_pivot") {
    return "Bender or second-pivot scoring is not implemented; CPLayout does not model tower-pivot kinematics yet.";
  }
  return null;
}

function evaluateLinearLateralStrategy(
  project: PivotProject,
  strategy: AdvisoryMachineStrategyInput,
  options: AdvisoryMachineStrategyComparisonOptions,
  sourceRefs: AdvisorySourceReference[],
): AdvisoryMachineStrategyResult {
  const pathFeature = linearMovePathFeatures(project).find((feature) => feature.id === strategy.pathFeatureId);
  const machine = strategy.machine;
  const unsupportedBase = {
    id: strategy.id,
    label: strategy.label,
    strategyKind: strategy.strategyKind,
    advisoryOnly: true as const,
    canonicalGeometryMutation: false as const,
    qualifiedReviewRequired: true as const,
    machineRadiusMeters: machine ? round(machineRadiusMeters(machine)) : 0,
    spanCount: machine?.spanLengthsMeters.length ?? 0,
    sweepMode: machine?.sweep.mode ?? "unsupported" as const,
    bestCandidate: null,
    pathFeatureId: strategy.pathFeatureId,
    candidateCount: 0,
    irrigatedAcres: 0,
    outsideFieldAcres: 0,
    coveragePercent: 0,
    costAssessment: null,
    costEfficiencyAcresPerHundredThousand: null,
    advisoryScore: Number.NEGATIVE_INFINITY,
    sourceRefs,
  };

  if (!machine || !pathFeature || pathFeature.geometry.type !== "LineString" || pathFeature.geometry.vertices.length < 2) {
    return {
      ...unsupportedBase,
      status: "unsupported_model",
      warnings: [
        "Linear/lateral move scoring requires a projected-XY line path feature with at least two vertices.",
        ...(strategy.notes ? [strategy.notes] : []),
      ],
    };
  }

  const linear = evaluateLinearLateralCoverage(project, machine, pathFeature.geometry.vertices);
  const costAssessment = assessAdvisoryCost({ ...project, machine }, linear.metrics.irrigatedAcres, options.costInput, sourceRefs);
  const costEfficiencyAcresPerHundredThousand = costAssessment.estimatedCost
    ? round(linear.metrics.irrigatedAcres / (costAssessment.estimatedCost / 100000))
    : null;
  const advisoryScore = round(
    linear.metrics.irrigatedAcres
    - Math.min(40, linear.metrics.outsideFieldAcres * 10)
    - linear.metrics.obstacleConflictCount * 25
    + (costEfficiencyAcresPerHundredThousand ?? 0),
  );

  return {
    ...unsupportedBase,
    status: linear.metrics.irrigatedAcres > 0 ? "ready" : "no_feasible_candidate",
    candidateCount: 1,
    irrigatedAcres: linear.metrics.irrigatedAcres,
    outsideFieldAcres: linear.metrics.outsideFieldAcres,
    coveragePercent: linear.metrics.coveragePercent,
    costAssessment,
    costEfficiencyAcresPerHundredThousand,
    advisoryScore,
    warnings: [
      `${strategy.label} is an advisory linear/lateral move approximation only; applying it requires explicit operator edits and validation.`,
      "Swept-strip coverage assumes the supplied path is the machine centerline and uses the current machine radius as half-width.",
      "The model does not verify hose/ditch water supply, cable guidance, slope, reversal timing, tower alignment, or manufacturer constraints.",
      ...(strategy.notes ? [strategy.notes] : []),
      ...linear.warnings,
    ],
  };
}

function evaluateLinearLateralCoverage(
  project: PivotProject,
  machine: PivotMachine,
  pathVertices: XY[],
): { metrics: LayoutMetrics; warnings: string[] } {
  const fieldArea = polygonAreaSquareMeters(project.fieldBoundary);
  const halfWidth = machineRadiusMeters(machine);
  const swept = sweptStripForLineString(pathVertices, halfWidth);
  const noSprayObstacles = project.obstacles.filter((obstacle) => obstacle.noSpray);
  const insideField = intersectMultiPolygons(swept, [[project.fieldBoundary]]);
  const allowed = noSprayObstacles.reduce(
    (current, obstacle) => differenceMultiPolygons(current, [[obstacle.polygon]]),
    insideField,
  );
  const outsideField = differenceMultiPolygons(swept, [[project.fieldBoundary]]);
  const allowedArea = multiPolygonAreaSquareMeters(allowed);
  const outsideArea = multiPolygonAreaSquareMeters(outsideField);
  const obstacleConflictCount = project.obstacles.filter((obstacle) => (
    multiPolygonAreaSquareMeters(intersectMultiPolygons(swept, [[obstacle.polygon]])) > 0.000001
  )).length;
  const noSprayConflictCount = noSprayObstacles.filter((obstacle) => (
    multiPolygonAreaSquareMeters(intersectMultiPolygons(swept, [[obstacle.polygon]])) > 0.000001
  )).length;
  const hardMechanicalConflictCount = project.obstacles.filter((obstacle) => (
    obstacle.hardConflict
    && multiPolygonAreaSquareMeters(intersectMultiPolygons(swept, [[obstacle.polygon]])) > 0.000001
  )).length;

  return {
    metrics: {
      fieldAcres: squareMetersToAcres(fieldArea),
      irrigatedAcres: squareMetersToAcres(allowedArea),
      nonIrrigatedAcres: squareMetersToAcres(Math.max(0, fieldArea - allowedArea)),
      coveragePercent: fieldArea > 0 ? (allowedArea / fieldArea) * 100 : 0,
      endGunAcres: 0,
      outsideFieldAcres: squareMetersToAcres(outsideArea),
      obstacleConflictCount,
      noSprayConflictCount,
      hardMechanicalConflictCount,
      towerTrackConflictCount: 0,
    },
    warnings: [
      ...(outsideArea > 0 ? [`Linear/lateral swept strip extends outside the field by ${squareMetersToAcres(outsideArea).toFixed(2)} acres.`] : []),
      ...(obstacleConflictCount > 0 ? [`Linear/lateral swept strip intersects ${obstacleConflictCount} obstacle feature${obstacleConflictCount === 1 ? "" : "s"}.`] : []),
    ],
  };
}

function linearMovePathFeatures(project: PivotProject): ProjectMapFeature[] {
  return (project.mapFeatures ?? []).filter((feature) => feature.kind === "linear_move_path");
}

function sweptStripForLineString(vertices: XY[], halfWidthMeters: number): MultiPolygonXY {
  if (vertices.length < 2 || halfWidthMeters <= 0) return [];
  const polygons: MultiPolygonXY = [];
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const rectangle = segmentStripPolygon(vertices[index], vertices[index + 1], halfWidthMeters);
    if (rectangle.length > 0) polygons.push([rectangle]);
  }
  for (const vertex of vertices) {
    polygons.push([createCirclePolygon(vertex, halfWidthMeters, 48)]);
  }
  return unionMultiPolygons(polygons);
}

function segmentStripPolygon(start: XY, end: XY, halfWidthMeters: number): XY[] {
  const length = distance(start, end);
  if (length <= 0) return [];
  const normal = {
    x: -(end.y - start.y) / length,
    y: (end.x - start.x) / length,
  };
  const offset = { x: normal.x * halfWidthMeters, y: normal.y * halfWidthMeters };
  return [
    { x: start.x + offset.x, y: start.y + offset.y },
    { x: end.x + offset.x, y: end.y + offset.y },
    { x: end.x - offset.x, y: end.y - offset.y },
    { x: start.x - offset.x, y: start.y - offset.y },
  ];
}

function generatedFullCircleRadii(currentRadius: number): number[] {
  return [0.6, 0.8, 1, 1.2]
    .map((ratio) => round(currentRadius * ratio))
    .filter((radius, index, radii) => radius > 0 && radii.indexOf(radius) === index);
}

function approximateFullCircleMachine(machine: PivotMachine, radiusMeters: number): PivotMachine {
  const positiveSpans = machine.spanLengthsMeters.filter((span) => Number.isFinite(span) && span > 0);
  const averageSpan = positiveSpans.length > 0
    ? positiveSpans.reduce((sum, span) => sum + span, 0) / positiveSpans.length
    : Math.max(1, radiusMeters);
  const spanCount = Math.max(1, Math.ceil(radiusMeters / Math.max(1, averageSpan)));
  const spanLength = radiusMeters / spanCount;
  return {
    ...machine,
    id: `${machine.id}-full-circle-${radiusMeters.toFixed(2)}`,
    name: `${machine.name} ${radiusMeters.toFixed(0)} m full circle`,
    spanLengthsMeters: Array.from({ length: spanCount }, () => spanLength),
    overhangMeters: 0,
    sweep: { mode: "full_circle" },
    endGunAngleRanges: undefined,
  };
}

function dedupeMachineStrategyInputs(inputs: AdvisoryMachineStrategyInput[]): AdvisoryMachineStrategyInput[] {
  const byKey = new Map<string, AdvisoryMachineStrategyInput>();
  for (const input of inputs) {
    const radius = input.machine ? machineRadiusMeters(input.machine).toFixed(3) : "unsupported";
    const sweep = input.machine ? JSON.stringify(input.machine.sweep) : input.strategyKind;
    const key = `${input.strategyKind}:${input.pathFeatureId ?? "no-path"}:${radius}:${sweep}`;
    if (!byKey.has(key)) byKey.set(key, input);
  }
  return [...byKey.values()];
}

function compareMachineStrategyResults(left: AdvisoryMachineStrategyResult, right: AdvisoryMachineStrategyResult): number {
  if (left.status !== right.status) return strategyStatusRank(left.status) - strategyStatusRank(right.status);
  if (right.advisoryScore !== left.advisoryScore) return right.advisoryScore - left.advisoryScore;
  if (right.irrigatedAcres !== left.irrigatedAcres) return right.irrigatedAcres - left.irrigatedAcres;
  return left.label.localeCompare(right.label);
}

function strategyStatusRank(status: AdvisoryMachineStrategyStatus): number {
  if (status === "ready") return 0;
  if (status === "no_feasible_candidate") return 1;
  return 2;
}

function firstCostStatus(
  strategies: AdvisoryMachineStrategyResult[],
  input: AdvisoryCostInput | undefined,
): AdvisoryCostAssessment["status"] {
  const status = strategies.find((strategy) => strategy.costAssessment)?.costAssessment?.status;
  if (status) return status;
  return costInputStatusForInput(input);
}

function costInputStatusForInput(input: AdvisoryCostInput | undefined): AdvisoryCostAssessment["status"] {
  if (!input) return "missing_cost_input";
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
    return "invalid_cost_input";
  }
  return "complete";
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

function unionMultiPolygons(multiPolygon: MultiPolygonXY): MultiPolygonXY {
  if (multiPolygon.length === 0) return [];
  return fromClipMultiPolygon(polygonClipping.union(toClipMultiPolygon(multiPolygon)) as ClipMultiPolygon | null);
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
