import assert from "node:assert/strict";

import { buildExpertReviewFindings } from "./expertReview";
import { defaultAppSettings } from "./settings";
import type { LayoutResult } from "./types";
import { sampleProject } from "./sampleProject";

const emptyResult: LayoutResult = {
  metrics: {
    fieldAcres: 120,
    irrigatedAcres: 95,
    nonIrrigatedAcres: 25,
    coveragePercent: 79.2,
    endGunAcres: 8,
    outsideFieldAcres: 0,
    obstacleConflictCount: 0,
  },
  baseCoverage: [],
  endGunCoverage: [],
  allowedCoverage: [],
  outsideFieldCoverage: [],
  obstacles: [],
  towers: [],
  warnings: [],
};

const findings = buildExpertReviewFindings(sampleProject, emptyResult, defaultAppSettings());
assert.equal(findings.length, 5);
assert.equal(findings[0].role, "Product/UX");
assert.equal(findings[0].status, "pass");
assert.match(findings[0].finding, /decimal degrees/);
assert.equal(findings.find((finding) => finding.role === "ML Feasibility")?.status, "watch");

const projectedSettingsFindings = buildExpertReviewFindings(
  sampleProject,
  emptyResult,
  { ...defaultAppSettings(), coordinateDisplayFormat: "projected_local" },
);
assert.equal(projectedSettingsFindings[0].status, "watch");

const warningFindings = buildExpertReviewFindings(
  sampleProject,
  {
    ...emptyResult,
    metrics: { ...emptyResult.metrics, outsideFieldAcres: 1.25, obstacleConflictCount: 1 },
    warnings: ["Obstacle conflict"],
  },
  defaultAppSettings(),
);
assert.equal(warningFindings.find((finding) => finding.role === "QA/Safety")?.status, "watch");

console.log("expert review tests passed");
