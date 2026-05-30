import assert from "node:assert/strict";

import { improvedCenterPivotReviewProject, realCenterPivotProofProject } from "@cplayout/core";

import { evaluateLayout } from "./geometry";
import { validateCenterPivotProofGeometry } from "./layoutProof";

function assertValidProofFixture(project: typeof realCenterPivotProofProject): ReturnType<typeof evaluateLayout> {
  const result = evaluateLayout(project);
  assert.deepEqual(validateCenterPivotProofGeometry(project, result), []);
  assert.ok(result.baseCoverage.length > 0);
  assert.ok(result.allowedCoverage.length > 0);
  assert.ok(result.endGunCoverage.length > 0);
  assert.equal(result.towers.length, project.machine.spanLengthsMeters.length);
  return result;
}

const result = assertValidProofFixture(realCenterPivotProofProject);
const improvedResult = assertValidProofFixture(improvedCenterPivotReviewProject);
assert.equal(improvedCenterPivotReviewProject.id, "public-adams-county-center-pivot-improved-review");
assert.equal(improvedCenterPivotReviewProject.name, "Public Adams County Improved Pivot Review");
assert.equal(improvedCenterPivotReviewProject.obstacles.length, 1);
assert.equal(improvedCenterPivotReviewProject.obstacles[0].id, "south-county-road-setback");
assert.equal(improvedResult.metrics.obstacleConflictCount, 1);
assert.equal(improvedResult.metrics.outsideFieldAcres, 0);
assert.ok(Math.abs(improvedResult.metrics.irrigatedAcres - 127.13) < 0.01);
assert.ok(Math.abs(improvedResult.metrics.coveragePercent - 71.73) < 0.01);

const triangleBoundaryProject = {
  ...realCenterPivotProofProject,
  id: "bad-triangle-proof",
  fieldBoundary: realCenterPivotProofProject.fieldBoundary.slice(0, 3),
  obstacles: [
    {
      ...realCenterPivotProofProject.obstacles[0],
      polygon: realCenterPivotProofProject.obstacles[0].polygon.slice(0, 3),
    },
  ],
};
const triangleErrors = validateCenterPivotProofGeometry(triangleBoundaryProject, evaluateLayout(triangleBoundaryProject));
assert.match(triangleErrors.join("\n"), /at least 4 vertices/);
assert.match(triangleErrors.join("\n"), /not a triangle proof marker/);

const circularBoundaryProject = {
  ...realCenterPivotProofProject,
  id: "bad-circular-proof-boundary",
  fieldBoundary: Array.from({ length: 96 }, (_, index) => {
    const theta = (index / 96) * Math.PI * 2;
    return {
      x: realCenterPivotProofProject.pivotCenter.x + Math.cos(theta) * 430,
      y: realCenterPivotProofProject.pivotCenter.y + Math.sin(theta) * 430,
    };
  }),
};
const circularErrors = validateCenterPivotProofGeometry(circularBoundaryProject, evaluateLayout(circularBoundaryProject));
assert.match(circularErrors.join("\n"), /not a circular pivot coverage ring/);

const shiftedBoundaryProject = {
  ...realCenterPivotProofProject,
  id: "bad-shifted-proof",
  fieldBoundary: realCenterPivotProofProject.fieldBoundary.map((point) => ({ x: point.x + 900, y: point.y })),
};
const shiftedErrors = validateCenterPivotProofGeometry(shiftedBoundaryProject, evaluateLayout(shiftedBoundaryProject));
assert.match(shiftedErrors.join("\n"), /Pivot center must be inside/);

console.log("layout proof tests passed");
