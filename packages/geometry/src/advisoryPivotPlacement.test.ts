import assert from "node:assert/strict";

import type { ObstacleZone, PivotMachine, PivotProject, ProjectMapFeature, XY } from "@cplayout/core";

import {
  analyzeAdvisoryMultiMachineLayout,
  analyzeIdealPivotCenter,
  buildPivotPlacementCandidates,
  compareAdvisoryMachineStrategies,
  evaluateAdvisoryCornerArm,
} from "./advisoryPivotPlacement";
import { evaluateLayout } from "./geometry";

const field: XY[] = [
  { x: 0, y: 0 },
  { x: 220, y: 0 },
  { x: 220, y: 140 },
  { x: 150, y: 140 },
  { x: 150, y: 80 },
  { x: 0, y: 80 },
];

const accessLane: ProjectMapFeature = {
  id: "north-access",
  name: "North access lane",
  kind: "access_lane",
  geometry: { type: "LineString", vertices: [{ x: 0, y: 130 }, { x: 220, y: 130 }] },
  confidence: "user_estimated",
};

const bufferedObstacle: ObstacleZone = {
  id: "center-buffer",
  name: "Center buffer",
  kind: "building",
  polygon: [
    { x: 88, y: 38 },
    { x: 112, y: 38 },
    { x: 112, y: 62 },
    { x: 88, y: 62 },
  ],
  bufferMeters: 14,
  hardConflict: true,
  noSpray: true,
  confidence: "user_estimated",
};

const project = makeProject({
  obstacles: [bufferedObstacle],
  mapFeatures: [accessLane],
  waterSource: { x: 20, y: 20 },
  powerSource: { x: 20, y: 130 },
});

const firstRun = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 5,
  waterSourceWeight: 10,
  powerSourceWeight: 8,
  accessWeight: 6,
});
const secondRun = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 5,
  waterSourceWeight: 10,
  powerSourceWeight: 8,
  accessWeight: 6,
});
assert.ok(firstRun.length > 0);
assert.deepEqual(firstRun.map((candidate) => candidate.id), secondRun.map((candidate) => candidate.id));
assert.deepEqual(project.pivotCenter, { x: 30, y: 40 });
assert.ok(firstRun.some((candidate) => candidate.sourceSeed === "maximum_inscribed_circle"));
assert.ok(firstRun.every((candidate) => candidate.canonicalGeometryMutation === false));
assert.ok(firstRun.every((candidate) => candidate.insideFieldBoundary === true));
assert.ok(firstRun.every((candidate) => candidate.boundaryClearanceMeters >= 0));
assert.ok(firstRun.every((candidate) => Number.isFinite(candidate.distanceFromCurrentMeters)));
assert.ok(firstRun.every((candidate) => candidate.dryCornerPolygons.length > 0));
assert.ok(firstRun.every((candidate) => Number.isFinite(candidate.scoreBreakdown.waterSourceProximity)));
assert.ok(firstRun.some((candidate) => candidate.minimumObstacleClearanceMeters !== null));

const readyProject = makeProject({
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ],
  pivotCenter: { x: 25, y: 100 },
  waterSource: { x: 25, y: 100 },
  powerSource: { x: 30, y: 95 },
  obstacles: [],
  mapFeatures: [],
});
const idealAnalysis = analyzeIdealPivotCenter(readyProject, {
  gridDivisions: 8,
  maxCandidates: 5,
  waterSourceWeight: 10,
  powerSourceWeight: 8,
  accessWeight: 6,
});
assert.equal(idealAnalysis.status, "ready");
assert.equal(idealAnalysis.advisoryOnly, true);
assert.equal(idealAnalysis.canonicalGeometryMutation, false);
assert.equal(idealAnalysis.qualifiedReviewRequired, true);
assert.equal(idealAnalysis.bestCandidate?.id, idealAnalysis.candidates[0].id);
assert.equal(idealAnalysis.bestCandidate?.insideFieldBoundary, true);
assert.ok((idealAnalysis.bestCandidate?.boundaryClearanceMeters ?? -1) >= 0);
assert.ok(idealAnalysis.warnings.some((warning) => warning.includes("does not mutate canonical projected XY")));
assert.ok(idealAnalysis.sourceRefs.length > 0);
assert.equal(idealAnalysis.machineZoneReviews.length, 0);
assert.deepEqual(readyProject.pivotCenter, { x: 25, y: 100 });

const machineZone: ProjectMapFeature = {
  id: "zone-a",
  name: "Zone A",
  kind: "machine_zone",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 0, y: 0 },
      { x: 160, y: 0 },
      { x: 160, y: 160 },
      { x: 0, y: 160 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const zoneAnalysis = analyzeIdealPivotCenter({ ...readyProject, mapFeatures: [machineZone] }, {
  gridDivisions: 6,
  maxCandidates: 3,
  costInput: {
    fixedMachineCost: 100000,
    costPerMeter: 500,
    costPerTower: 2500,
    currencyCode: "USD",
  },
});
assert.equal(zoneAnalysis.status, "ready");
assert.equal(zoneAnalysis.machineZoneReviews.length, 1);
assert.equal(zoneAnalysis.machineZoneReviews[0].status, "ready");
assert.equal(zoneAnalysis.machineZoneReviews[0].canonicalGeometryMutation, false);
assert.equal(zoneAnalysis.bestCandidate?.costAssessment.status, "complete");
assert.ok((zoneAnalysis.bestCandidate?.costAssessment.costPerIrrigatedAcre ?? 0) > 0);
assert.ok(Number.isFinite(zoneAnalysis.bestCandidate?.scoreBreakdown.costEfficiency));

const westMachineZone: ProjectMapFeature = {
  id: "zone-west",
  name: "West machine zone",
  kind: "machine_zone",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 150 },
      { x: 0, y: 150 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const eastMachineZone: ProjectMapFeature = {
  id: "zone-east",
  name: "East machine zone",
  kind: "machine_zone",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 95, y: 0 },
      { x: 245, y: 0 },
      { x: 245, y: 150 },
      { x: 95, y: 150 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const multiZoneProject = makeProject({
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 245, y: 0 },
    { x: 245, y: 150 },
    { x: 0, y: 150 },
  ],
  pivotCenter: { x: 25, y: 75 },
  waterSource: { x: 20, y: 75 },
  powerSource: { x: 225, y: 75 },
  obstacles: [],
  mapFeatures: [westMachineZone, eastMachineZone],
});
const multiZoneBefore = JSON.stringify(multiZoneProject);
const multiMachineReview = analyzeAdvisoryMultiMachineLayout(multiZoneProject, {
  gridDivisions: 6,
  maxCandidates: 3,
  collisionBufferMeters: 20,
});
assert.equal(multiMachineReview.status, "ready");
assert.equal(multiMachineReview.advisoryOnly, true);
assert.equal(multiMachineReview.canonicalGeometryMutation, false);
assert.equal(multiMachineReview.qualifiedReviewRequired, true);
assert.equal(multiMachineReview.compilation.machineZoneCount, 2);
assert.equal(multiMachineReview.compilation.scenarioCount, 2);
assert.equal(multiMachineReview.compilation.readyScenarioCount, 2);
assert.ok(multiMachineReview.compilation.compiledBoundaryAcres > 0);
assert.ok(multiMachineReview.compilation.modeledIrrigatedUnionAcres <= multiMachineReview.compilation.modeledIrrigatedAcresSum);
assert.equal(multiMachineReview.scenarios.length, 2);
assert.ok(multiMachineReview.scenarios.every((scenario) => scenario.status === "ready"));
assert.ok(multiMachineReview.scenarios.every((scenario) => scenario.canonicalGeometryMutation === false));
assert.ok(multiMachineReview.conflicts.some((conflict) => conflict.status === "machine_envelope_overlap"));
assert.ok(multiMachineReview.conflicts.every((conflict) => conflict.separationDeficitMeters > 0));
const overlapConflict = multiMachineReview.conflicts.find((conflict) => conflict.status === "machine_envelope_overlap");
assert.equal(overlapConflict?.severity, "critical_overlap");
assert.equal(overlapConflict?.operatorCollisionReviewRequired, true);
assert.ok((overlapConflict?.collisionZone.length ?? 0) > 0);
assert.ok((overlapConflict?.collisionZoneAcres ?? 0) > 0);
assert.ok((overlapConflict?.separationReviewZoneAcres ?? 0) >= (overlapConflict?.collisionZoneAcres ?? 0));
assert.ok(overlapConflict?.warnings.some((warning) => warning.includes("projected-XY collision/review zone evidence")));
assert.ok(multiMachineReview.warnings.some((warning) => warning.includes("does not create pivots")));
assert.equal(JSON.stringify(multiZoneProject), multiZoneBefore);

const bufferWestMachineZone: ProjectMapFeature = {
  id: "zone-buffer-west",
  name: "Buffer west machine zone",
  kind: "machine_zone",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 140 },
      { x: 0, y: 140 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const bufferEastMachineZone: ProjectMapFeature = {
  id: "zone-buffer-east",
  name: "Buffer east machine zone",
  kind: "machine_zone",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 210, y: 0 },
      { x: 350, y: 0 },
      { x: 350, y: 140 },
      { x: 210, y: 140 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const bufferOnlyProject = makeProject({
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 350, y: 0 },
    { x: 350, y: 140 },
    { x: 0, y: 140 },
  ],
  pivotCenter: { x: 70, y: 70 },
  waterSource: { x: 20, y: 70 },
  powerSource: { x: 330, y: 70 },
  obstacles: [],
  mapFeatures: [bufferWestMachineZone, bufferEastMachineZone],
});
const bufferOnlyBefore = JSON.stringify(bufferOnlyProject);
const bufferOnlyReview = analyzeAdvisoryMultiMachineLayout(bufferOnlyProject, {
  gridDivisions: 6,
  maxCandidates: 3,
  collisionBufferMeters: 0,
  minimumMachineSeparationMeters: 280,
});
const bufferConflict = bufferOnlyReview.conflicts.find((conflict) => conflict.status === "separation_buffer_warning");
assert.equal(bufferOnlyReview.status, "ready");
assert.ok(bufferConflict);
assert.equal(bufferConflict?.severity, "buffer_intrusion");
assert.equal(bufferConflict?.collisionZoneAcres, 0);
assert.equal(bufferConflict?.collisionZone.length, 0);
assert.ok((bufferConflict?.separationReviewBufferMeters ?? 0) > 0);
assert.ok((bufferConflict?.separationReviewZone.length ?? 0) > 0);
assert.ok((bufferConflict?.separationReviewZoneAcres ?? 0) > 0);
assert.equal(JSON.stringify(bufferOnlyProject), bufferOnlyBefore);

const partialSweepNoOverlapReview = analyzeAdvisoryMultiMachineLayout({
  ...bufferOnlyProject,
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 260, y: 0 },
    { x: 260, y: 140 },
    { x: 0, y: 140 },
  ],
  mapFeatures: [bufferWestMachineZone, {
    ...bufferEastMachineZone,
    geometry: {
      type: "Polygon",
      vertices: [
        { x: 100, y: 0 },
        { x: 180, y: 0 },
        { x: 180, y: 140 },
        { x: 100, y: 140 },
      ],
    },
  }],
  machine: {
    ...bufferOnlyProject.machine,
    spanLengthsMeters: [60],
    sweep: {
      mode: "partial_circle",
      startAngleDegrees: 80,
      stopAngleDegrees: 100,
      direction: "counterclockwise",
    },
  },
}, {
  gridDivisions: 6,
  maxCandidates: 3,
  collisionBufferMeters: 0,
});
const partialSweepConflict = partialSweepNoOverlapReview.conflicts[0];
assert.equal(partialSweepNoOverlapReview.status, "ready");
assert.ok(partialSweepConflict);
assert.equal(partialSweepConflict.status, "separation_buffer_warning");
assert.equal(partialSweepConflict.severity, "buffer_intrusion");
assert.equal(partialSweepConflict.collisionZoneAcres, 0);
assert.equal(partialSweepConflict.collisionZone.length, 0);

const separatedReview = analyzeAdvisoryMultiMachineLayout({
  ...bufferOnlyProject,
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 430, y: 0 },
    { x: 430, y: 140 },
    { x: 0, y: 140 },
  ],
  mapFeatures: [bufferWestMachineZone, {
    ...bufferEastMachineZone,
    geometry: {
      type: "Polygon",
      vertices: [
        { x: 290, y: 0 },
        { x: 430, y: 0 },
        { x: 430, y: 140 },
        { x: 290, y: 140 },
      ],
    },
  }],
}, {
  gridDivisions: 6,
  maxCandidates: 3,
  collisionBufferMeters: 0,
});
assert.equal(separatedReview.status, "ready");
assert.equal(separatedReview.conflicts.length, 0);

const missingZoneReview = analyzeAdvisoryMultiMachineLayout(readyProject, { gridDivisions: 5, maxCandidates: 2 });
assert.equal(missingZoneReview.status, "missing_zones");
assert.equal(missingZoneReview.scenarios.length, 0);
assert.ok(missingZoneReview.blockers.some((blocker) => blocker.includes("machine zone or planning boundary")));

const planningBoundaryReview = analyzeAdvisoryMultiMachineLayout({
  ...readyProject,
  mapFeatures: [{
    id: "full-scope",
    name: "Full scope boundary",
    kind: "planning_boundary",
    geometry: {
      type: "Polygon",
      vertices: readyProject.fieldBoundary,
    },
    confidence: "user_estimated",
  }],
}, { gridDivisions: 5, maxCandidates: 2 });
assert.equal(planningBoundaryReview.status, "single_zone_review");
assert.equal(planningBoundaryReview.compilation.planningBoundaryCount, 1);
assert.equal(planningBoundaryReview.compilation.readyScenarioCount, 1);

const strategyProject = makeProject({
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 260, y: 0 },
    { x: 260, y: 220 },
    { x: 0, y: 220 },
  ],
  pivotCenter: { x: 40, y: 110 },
  waterSource: { x: 30, y: 110 },
  powerSource: { x: 230, y: 110 },
  obstacles: [],
  mapFeatures: [],
  machine: {
    ...defaultMachine(),
    spanLengthsMeters: [45, 45],
  },
});
const strategyProjectBefore = JSON.stringify(strategyProject);
const strategyComparison = compareAdvisoryMachineStrategies(strategyProject, {
  gridDivisions: 6,
  maxCandidates: 3,
  generatedFullCircleRadiiMeters: [55, 75, 95],
  costInput: {
    fixedMachineCost: 80000,
    costPerMeter: 700,
    costPerTower: 3000,
    currencyCode: "USD",
  },
});
assert.equal(strategyComparison.status, "ready");
assert.equal(strategyComparison.advisoryOnly, true);
assert.equal(strategyComparison.canonicalGeometryMutation, false);
assert.equal(strategyComparison.qualifiedReviewRequired, true);
assert.equal(strategyComparison.costInputStatus, "complete");
assert.ok(strategyComparison.bestStrategy);
assert.ok(strategyComparison.strategies.some((strategy) => strategy.strategyKind === "current_machine"));
assert.ok(strategyComparison.strategies.some((strategy) => strategy.strategyKind === "full_circle_radius"));
assert.ok(strategyComparison.strategies.some((strategy) => strategy.strategyKind === "unsupported_linear_lateral" && strategy.status === "unsupported_model"));
assert.ok(strategyComparison.strategies.some((strategy) => strategy.strategyKind === "unsupported_bender_second_pivot" && strategy.status === "unsupported_model"));
assert.ok(strategyComparison.strategies.filter((strategy) => strategy.status === "ready").every((strategy) => strategy.costAssessment?.status === "complete"));
assert.ok(strategyComparison.strategies.filter((strategy) => strategy.status === "ready").every((strategy) => Number.isFinite(strategy.advisoryScore)));
assert.ok(strategyComparison.warnings.some((warning) => warning.includes("does not mutate canonical projected XY")));
assert.equal(JSON.stringify(strategyProject), strategyProjectBefore);

const linearMovePath: ProjectMapFeature = {
  id: "linear-path-a",
  name: "Linear move path A",
  kind: "linear_move_path",
  geometry: {
    type: "LineString",
    vertices: [
      { x: 70, y: 110 },
      { x: 190, y: 110 },
    ],
  },
  confidence: "user_estimated",
  properties: { advisoryOnly: true, canonicalGeometryMutation: false },
};
const linearStrategyProject = makeProject({
  ...strategyProject,
  machine: {
    ...strategyProject.machine,
    spanLengthsMeters: [35],
  },
  mapFeatures: [linearMovePath],
});
const linearStrategyBefore = JSON.stringify(linearStrategyProject);
const linearStrategyComparison = compareAdvisoryMachineStrategies(linearStrategyProject, {
  gridDivisions: 5,
  maxCandidates: 2,
  includeGeneratedRadiusStrategies: false,
  costInput: {
    fixedMachineCost: 65000,
    costPerMeter: 400,
    costPerTower: 2000,
    currencyCode: "USD",
  },
});
const linearStrategy = linearStrategyComparison.strategies.find((strategy) => strategy.strategyKind === "linear_lateral_move");
assert.equal(linearStrategyComparison.status, "ready");
assert.ok(linearStrategy);
assert.equal(linearStrategy?.status, "ready");
assert.equal(linearStrategy?.pathFeatureId, "linear-path-a");
assert.equal(linearStrategy?.bestCandidate, null);
assert.ok((linearStrategy?.irrigatedAcres ?? 0) > 0);
assert.equal(linearStrategy?.costAssessment?.status, "complete");
assert.equal(linearStrategyComparison.strategies.some((strategy) => strategy.strategyKind === "unsupported_linear_lateral"), false);
assert.ok(linearStrategy?.warnings.some((warning) => warning.includes("Swept-strip coverage assumes")));
assert.equal(JSON.stringify(linearStrategyProject), linearStrategyBefore);

const missingCostStrategyComparison = compareAdvisoryMachineStrategies(strategyProject, {
  gridDivisions: 5,
  maxCandidates: 2,
  includeUnsupportedConceptPlaceholders: false,
});
assert.equal(missingCostStrategyComparison.status, "ready");
assert.equal(missingCostStrategyComparison.costInputStatus, "missing_cost_input");
assert.ok(missingCostStrategyComparison.warnings.some((warning) => warning.includes("Cost ranking is incomplete")));

const partialStrategyComparison = compareAdvisoryMachineStrategies({
  ...strategyProject,
  machine: {
    ...strategyProject.machine,
    sweep: {
      mode: "partial_circle",
      startAngleDegrees: 180,
      stopAngleDegrees: 20,
      direction: "counterclockwise",
    },
  },
}, {
  gridDivisions: 5,
  maxCandidates: 2,
  includeGeneratedRadiusStrategies: false,
  includeUnsupportedConceptPlaceholders: false,
});
assert.ok(partialStrategyComparison.strategies.some((strategy) => strategy.strategyKind === "full_circle_same_radius"));

const noBoundaryStrategyComparison = compareAdvisoryMachineStrategies(makeProject({
  fieldBoundary: [],
  obstacles: [],
  mapFeatures: [],
}));
assert.equal(noBoundaryStrategyComparison.status, "no_boundary");
assert.equal(noBoundaryStrategyComparison.bestStrategy, null);
assert.ok(noBoundaryStrategyComparison.blockers.some((blocker) => blocker.includes("field boundary vertices")));

const missingCostCandidate = buildPivotPlacementCandidates(readyProject, { gridDivisions: 6, maxCandidates: 1 })[0];
assert.equal(missingCostCandidate.costAssessment.status, "missing_cost_input");
assert.equal(missingCostCandidate.scoreBreakdown.costEfficiency, 0);

const strictClearanceAnalysis = analyzeIdealPivotCenter(readyProject, {
  gridDivisions: 5,
  maxCandidates: 3,
  minimumBoundaryClearanceMeters: 120,
});
assert.ok(strictClearanceAnalysis.candidates.some((candidate) => candidate.disqualificationReasons.some((reason) => reason.includes("boundary clearance"))));

const infeasibleAnalysis = analyzeIdealPivotCenter(makeProject({
  fieldBoundary: [
    { x: 0, y: 0 },
    { x: 18, y: 0 },
    { x: 18, y: 18 },
    { x: 0, y: 18 },
  ],
  pivotCenter: { x: 9, y: 9 },
  waterSource: { x: 9, y: 9 },
  powerSource: { x: 9, y: 9 },
  machine: {
    ...defaultMachine(),
    spanLengthsMeters: [60],
  },
  obstacles: [],
  mapFeatures: [],
}), { gridDivisions: 5, maxCandidates: 3 });
assert.equal(infeasibleAnalysis.status, "no_feasible_candidate");
assert.equal(infeasibleAnalysis.bestCandidate, null);
assert.ok(infeasibleAnalysis.candidates.length > 0);
assert.ok(infeasibleAnalysis.blockers.some((blocker) => blocker.includes("No generated center candidate")));

const waterWeighted = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 3,
  waterSourceWeight: 60,
  powerSourceWeight: 0,
  accessWeight: 0,
});
const powerWeighted = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 3,
  waterSourceWeight: 0,
  powerSourceWeight: 60,
  accessWeight: 0,
});
assert.notEqual(waterWeighted[0].id, powerWeighted[0].id);

const crossingProfileCandidate = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 1,
  obstacleCrossingProfiles: [{
    obstacleId: bufferedObstacle.id,
    crossingAllowed: true,
    minimumClearanceMeters: 4,
    reason: "Operator says this low object may be spanned; requires field/vendor review.",
    advisoryOnly: true,
  }],
})[0];
assert.deepEqual(crossingProfileCandidate.obstacleCrossingProfileIds, [bufferedObstacle.id]);
assert.ok(crossingProfileCandidate.warnings.some((warning) => warning.includes("obstacle crossing profile")));

const cornerSwingLimit: ProjectMapFeature = {
  id: "corner-evidence",
  name: "Corner evidence",
  kind: "corner_swing_limit",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 150, y: 82 },
      { x: 218, y: 82 },
      { x: 218, y: 138 },
      { x: 152, y: 138 },
    ],
  },
  confidence: "user_estimated",
};
const cornerProject = makeProject({
  mapFeatures: [accessLane, cornerSwingLimit],
  machine: {
    ...defaultMachine(),
    cornerArm: {
      id: "corner-arm-a",
      name: "Corner arm A",
      advisoryOnly: true,
      lengthMeters: 65,
      guidanceType: "gps_guidance",
      sequencingType: "electronic",
      orientation: "operator_supplied",
      confidence: "user_estimated",
      sourceRefs: [{
        sourceId: "SRC-VALLEY-VFLEX-CORNER",
        title: "Valley VFlex Corner",
        url: "https://www.valleyirrigation.com/vflex-corner",
        checkedAt: "2026-06-05",
        limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
      }],
    },
  },
});
const before = evaluateLayout(cornerProject);
const evaluation = evaluateAdvisoryCornerArm(cornerProject);
const after = evaluateLayout(cornerProject);
assert.equal(evaluation.status, "ready");
assert.equal(evaluation.canonicalGeometryMutation, false);
assert.equal(evaluation.unverifiedKinematics, true);
assert.deepEqual(evaluation.evidenceFeatureIds, ["corner-evidence"]);
assert.ok(evaluation.estimatedAddedCoverageAcres >= 0);
assert.deepEqual(after.allowedCoverage, before.allowedCoverage);
assert.equal(after.metrics.endGunAcres, before.metrics.endGunAcres);
assert.equal(after.metrics.irrigatedAcres, before.metrics.irrigatedAcres);

const missingEvaluation = evaluateAdvisoryCornerArm({ ...cornerProject, machine: { ...cornerProject.machine, cornerArm: undefined } });
assert.equal(missingEvaluation.status, "missing_config");
assert.equal(missingEvaluation.coverageCandidate.length, 0);

console.log("advisory pivot placement tests passed");

function makeProject(overrides: Partial<PivotProject> = {}): PivotProject {
  const pivotCenter = overrides.pivotCenter ?? { x: 30, y: 40 };
  return {
    id: "advisory-placement-test",
    name: "Advisory placement test",
    projectCrs: "LOCAL:TEST",
    unitSystem: "metric",
    fieldBoundary: overrides.fieldBoundary ?? field,
    pivotCenter,
    waterSource: overrides.waterSource ?? { x: 0, y: 0 },
    powerSource: overrides.powerSource ?? { x: 220, y: 140 },
    machine: overrides.machine ?? defaultMachine(),
    obstacles: overrides.obstacles ?? [],
    surveyPoints: [],
    mapFeatures: overrides.mapFeatures ?? [],
  };
}

function defaultMachine(): PivotMachine {
  return {
    id: "machine-a",
    name: "Machine A",
    spanLengthsMeters: [30, 30],
    overhangMeters: 0,
    endGunThrowMeters: 0,
    towerClearanceBufferMeters: 4,
    machineClearanceBufferMeters: 6,
    sweep: { mode: "full_circle" },
  };
}
