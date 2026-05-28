import assert from "node:assert/strict";

import { sampleProject } from "@cplayout/core";
import { rankLayoutAlternatives, scoreLayoutAlternative } from "./layoutScoring";

const originalPivotCenter = { ...sampleProject.pivotCenter };

const lowerConfidence = scoreLayoutAlternative({
  id: "operator-draft",
  project: sampleProject,
  confidence: 0.25,
  source: "operator",
});

const higherConfidence = scoreLayoutAlternative({
  id: "model-review",
  project: sampleProject,
  confidence: 0.9,
  source: "model",
});

assert.ok(higherConfidence.score > lowerConfidence.score);
assert.equal(higherConfidence.project, sampleProject);

const outsideFieldAlternative = {
  ...sampleProject,
  pivotCenter: { x: sampleProject.pivotCenter.x + 900, y: sampleProject.pivotCenter.y },
};

const ranked = rankLayoutAlternatives([
  { id: "outside-field", project: outsideFieldAlternative, confidence: 0.95, source: "model" },
  { id: "current-layout", project: sampleProject, confidence: 0.75, source: "operator" },
], {
  maxOutsideFieldAcres: 1,
  minCoveragePercent: 20,
});

assert.equal(ranked[0].id, "current-layout");
assert.ok(ranked[0].metrics.outsideFieldAcres <= ranked[1].metrics.outsideFieldAcres);
assert.deepEqual(sampleProject.pivotCenter, originalPivotCenter);

console.log("layout scoring tests passed");
