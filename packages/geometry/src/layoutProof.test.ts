import assert from "node:assert/strict";

import { realCenterPivotProofProject } from "@cplayout/core";

import { evaluateLayout } from "./geometry";
import { validateCenterPivotProofGeometry } from "./layoutProof";

const result = evaluateLayout(realCenterPivotProofProject);
assert.deepEqual(validateCenterPivotProofGeometry(realCenterPivotProofProject, result), []);
assert.ok(result.baseCoverage.length > 0);
assert.ok(result.allowedCoverage.length > 0);
assert.ok(result.endGunCoverage.length > 0);
assert.equal(result.towers.length, realCenterPivotProofProject.machine.spanLengthsMeters.length);

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
assert.match(triangleErrors.join("\n"), /at least 24 vertices/);
assert.match(triangleErrors.join("\n"), /not a triangle proof marker/);

const shiftedBoundaryProject = {
  ...realCenterPivotProofProject,
  id: "bad-shifted-proof",
  fieldBoundary: realCenterPivotProofProject.fieldBoundary.map((point) => ({ x: point.x + 900, y: point.y })),
};
const shiftedErrors = validateCenterPivotProofGeometry(shiftedBoundaryProject, evaluateLayout(shiftedBoundaryProject));
assert.match(shiftedErrors.join("\n"), /Pivot center must be inside/);

console.log("layout proof tests passed");
