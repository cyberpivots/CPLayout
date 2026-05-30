import assert from "node:assert/strict";

import type { ObstacleZone, PivotMachine, PivotProject, XY } from "@cplayout/core";

import { buildPivotCenterModelRecommendation, optimizePivotCenter } from "./pivotCenterOptimizer";

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const concave = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 45 },
  { x: 65, y: 45 },
  { x: 65, y: 120 },
  { x: 0, y: 120 },
];

const narrow = [
  { x: 0, y: 0 },
  { x: 220, y: 0 },
  { x: 220, y: 35 },
  { x: 0, y: 35 },
];

const squareProject = makeProject("square", square, { x: 8, y: 50 });
const squareAlternatives = optimizePivotCenter(squareProject, { gridDivisions: 10, maxAlternatives: 5 });
assert.ok(squareAlternatives.length > 0);
assert.equal(squareAlternatives[0].feasible, true);
assert.ok(squareAlternatives[0].metrics.outsideFieldAcres <= 0.0001);
assert.equal(typeof squareAlternatives[0].scoreBreakdown.coverage, "number");
assert.equal(squareAlternatives[0].scoreBreakdown.feasibility > 0, true);
assert.deepEqual(squareProject.pivotCenter, { x: 8, y: 50 });

const repeatedSquareAlternatives = optimizePivotCenter(squareProject, { gridDivisions: 10, maxAlternatives: 5 });
assert.deepEqual(
  repeatedSquareAlternatives.map((alternative) => alternative.id),
  squareAlternatives.map((alternative) => alternative.id),
);

const concaveAlternatives = optimizePivotCenter(makeProject("concave", concave, { x: 10, y: 10 }), { gridDivisions: 12, maxAlternatives: 6 });
assert.ok(concaveAlternatives.some((alternative) => alternative.feasible));
assert.equal(concaveAlternatives[0].feasible, true);

const narrowAlternatives = optimizePivotCenter(makeProject("narrow", narrow, { x: 20, y: 17.5 }, { spanLengthsMeters: [12] }), {
  gridDivisions: 11,
  maxAlternatives: 4,
});
assert.ok(narrowAlternatives.some((alternative) => alternative.feasible));
assert.equal(narrowAlternatives[0].feasible, true);

const obstacle: ObstacleZone = {
  id: "center-exclusion",
  name: "Center exclusion",
  kind: "exclusion",
  polygon: [
    { x: 42, y: 42 },
    { x: 58, y: 42 },
    { x: 58, y: 58 },
    { x: 42, y: 58 },
  ],
  bufferMeters: 0,
  hardConflict: true,
  noSpray: true,
  confidence: "user_estimated",
};
const obstacleAlternatives = optimizePivotCenter(makeProject("obstacle", square, { x: 50, y: 50 }, {}, [obstacle]), {
  gridDivisions: 10,
  maxAlternatives: 6,
});
assert.equal(obstacleAlternatives[0].feasible, true);
assert.equal(obstacleAlternatives[0].metrics.obstacleConflictCount, 0);
assert.ok(obstacleAlternatives.some((alternative) => alternative.sourceSeed === "local_refinement"));
const obstacleConflictAlternative = obstacleAlternatives.find((alternative) => alternative.metrics.obstacleConflictCount > 0);
if (obstacleConflictAlternative) {
  assert.equal(obstacleConflictAlternative.feasible, false);
  assert.ok(obstacleConflictAlternative.disqualificationReasons.some((reason) => reason.includes("Obstacle conflicts")));
}

const recommendation = buildPivotCenterModelRecommendation(squareProject, squareAlternatives[0], "2026-05-29T00:00:00.000Z");
assert.equal(recommendation.projectId, squareProject.id);
assert.deepEqual(recommendation.proposedGeometry.pivotCenter, squareAlternatives[0].pivotCenter);
assert.equal(recommendation.reviewStatus, "unreviewed");
assert.deepEqual(recommendation.scoreBreakdown, squareAlternatives[0].scoreBreakdown);
assert.equal((recommendation.metadata as { feasible?: boolean }).feasible, squareAlternatives[0].feasible);
assert.ok(recommendation.warnings.some((warning) => warning.includes("Advisory optimizer output only")));

if (obstacleConflictAlternative) {
  const blockedRecommendation = buildPivotCenterModelRecommendation(squareProject, obstacleConflictAlternative, "2026-05-29T00:00:00.000Z");
  assert.equal((blockedRecommendation.metadata as { feasible?: boolean }).feasible, false);
  assert.ok(((blockedRecommendation.metadata as { hardFailures?: string[] }).hardFailures ?? []).length > 0);
}

console.log("pivot center optimizer tests passed");

function makeProject(
  id: string,
  fieldBoundary: XY[],
  pivotCenter: XY,
  machineOverrides: Partial<PivotMachine> = {},
  obstacles: ObstacleZone[] = [],
): PivotProject {
  const machine: PivotMachine = {
    id: `${id}-machine`,
    name: "Test machine",
    spanLengthsMeters: [20],
    overhangMeters: 0,
    endGunThrowMeters: 0,
    towerClearanceBufferMeters: 0,
    machineClearanceBufferMeters: 0,
    sweep: { mode: "full_circle" },
    ...machineOverrides,
  };

  return {
    id,
    name: id,
    projectCrs: "LOCAL:TEST",
    unitSystem: "metric",
    fieldBoundary,
    pivotCenter,
    waterSource: pivotCenter,
    powerSource: pivotCenter,
    machine,
    obstacles,
    surveyPoints: [],
  };
}
