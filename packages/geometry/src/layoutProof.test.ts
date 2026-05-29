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
