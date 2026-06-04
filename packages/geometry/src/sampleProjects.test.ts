import assert from "node:assert/strict";

import {
  advisoryCornerArmSampleProject,
  endGunShutoffArcSampleProject,
  improvedFullCircleSampleProject,
  partialSweepNearRoadSampleProject,
  sampleDesignProjects,
  sampleProject,
} from "@cplayout/core";

import { buildDesignScenarioPreview } from "./designScenarios";
import { evaluateLayout } from "./geometry";
import { rankLayoutAlternatives } from "./layoutScoring";

const before = JSON.stringify(sampleDesignProjects.map((entry) => entry.project));

assert.equal(sampleDesignProjects.length, 5);
assert.equal(sampleDesignProjects[0].project, sampleProject);
assert.equal(sampleDesignProjects[0].reviewStatus, "needs_review");
assert.ok(sampleDesignProjects.slice(1).every((entry) => entry.reviewStatus === "curated"));
assert.ok(sampleDesignProjects.every((entry) => entry.project.projectCrs === "EPSG:32613"));

const baseline = evaluateLayout(sampleProject);
assert.ok(baseline.metrics.obstacleConflictCount > 0);
assert.ok(baseline.metrics.hardMechanicalConflictCount > 0);

const improvedFullCircle = evaluateLayout(improvedFullCircleSampleProject);
assert.equal(improvedFullCircle.metrics.obstacleConflictCount, 0);
assert.equal(improvedFullCircle.metrics.hardMechanicalConflictCount, 0);
assert.equal(improvedFullCircle.metrics.outsideFieldAcres, 0);
assert.ok(improvedFullCircle.metrics.coveragePercent > 20);

const partialSweep = evaluateLayout(partialSweepNearRoadSampleProject);
assert.equal(partialSweepNearRoadSampleProject.machine.sweep.mode, "partial_circle");
assert.ok(partialSweep.metrics.obstacleConflictCount > 0);
assert.ok(partialSweep.metrics.hardMechanicalConflictCount > 0);
assert.equal(partialSweep.metrics.outsideFieldAcres, 0);

const endGunArc = evaluateLayout(endGunShutoffArcSampleProject);
assert.equal(endGunArc.metrics.obstacleConflictCount, 0);
assert.equal(endGunArc.metrics.hardMechanicalConflictCount, 0);
assert.ok(endGunArc.metrics.endGunAcres > 1);
assert.ok((endGunShutoffArcSampleProject.machine.endGunAngleRanges?.length ?? 0) > 0);

const cornerArm = evaluateLayout(advisoryCornerArmSampleProject);
assert.equal(cornerArm.metrics.obstacleConflictCount, 0);
assert.ok((advisoryCornerArmSampleProject.mapFeatures ?? []).some((feature) => feature.kind === "corner_swing_limit"));
assert.ok(buildDesignScenarioPreview(advisoryCornerArmSampleProject, { includeOptimizedCandidates: false })
  .some((scenario) => scenario.source === "advisory_corner_arm" && scenario.feasible === false));

const ranked = rankLayoutAlternatives([
  { id: "baseline", project: sampleProject, confidence: 0.8, source: "operator" },
  { id: "improved-full-circle", project: improvedFullCircleSampleProject, confidence: 0.8, source: "operator" },
  { id: "partial-sweep-road", project: partialSweepNearRoadSampleProject, confidence: 0.8, source: "operator" },
], {
  hardBoundary: true,
  maxObstacleConflicts: 0,
  maxOutsideFieldAcres: 0.0001,
  minCoveragePercent: 1,
});

assert.equal(ranked[0].id, "improved-full-circle");
assert.equal(ranked[0].feasible, true);
assert.equal(ranked.at(-1)?.id, "partial-sweep-road");

buildDesignScenarioPreview(improvedFullCircleSampleProject, { maxOptimizedCandidates: 2 });
assert.equal(JSON.stringify(sampleDesignProjects.map((entry) => entry.project)), before);

console.log("sample project fixture tests passed");
