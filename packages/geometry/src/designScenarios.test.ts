import assert from "node:assert/strict";

import { sampleProject } from "@cplayout/core";
import { buildDesignScenarioPreview } from "./designScenarios";

const scenarios = buildDesignScenarioPreview(sampleProject, { maxOptimizedCandidates: 2 });

assert.ok(scenarios.some((scenario) => scenario.id === "current-layout"));
assert.ok(scenarios.some((scenario) => scenario.id === "no-end-gun"));
assert.ok(scenarios.some((scenario) => scenario.id === "end-gun-arc"));
assert.ok(scenarios.some((scenario) => scenario.id === "sweep-toggle"));
assert.ok(scenarios.filter((scenario) => scenario.source === "deterministic_optimizer").length <= 2);
assert.ok(scenarios.every((scenario) => Number.isFinite(scenario.metrics.coveragePercent)));
assert.ok(scenarios.every((scenario) => Array.isArray(scenario.rejectionReasons)));

const hardBoundaryProject = {
  ...sampleProject,
  pivotCenter: { x: sampleProject.pivotCenter.x + 900, y: sampleProject.pivotCenter.y },
};
const rejected = buildDesignScenarioPreview(hardBoundaryProject, { includeOptimizedCandidates: false });
assert.ok(rejected.some((scenario) => scenario.feasible === false && scenario.rejectionReasons.length > 0));

const cornerArmProject = {
  ...sampleProject,
  mapFeatures: [
    ...(sampleProject.mapFeatures ?? []),
    {
      id: "corner-arm-footprint",
      name: "Vendor supplied corner arm footprint",
      kind: "corner_swing_limit" as const,
      geometry: {
        type: "LineString" as const,
        vertices: sampleProject.fieldBoundary.slice(0, 2),
      },
      confidence: "user_estimated" as const,
    },
  ],
};
assert.ok(buildDesignScenarioPreview(cornerArmProject, { includeOptimizedCandidates: false })
  .some((scenario) => scenario.source === "advisory_corner_arm" && scenario.feasible === false));

console.log("design scenario tests passed");
