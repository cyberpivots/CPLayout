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
assert.equal(findings.length, 6);
assert.equal(findings[0].role, "Product/Workflow");
assert.equal(findings[0].status, "pass");
assert.match(findings[0].finding, /decimal degrees/);
assert.equal(findings.find((finding) => finding.role === "GIS/Imagery")?.status, "pass");
assert.equal(findings.find((finding) => finding.role === "Storage/Export")?.status, "pass");

const projectBeforeReview = JSON.stringify(sampleProject);
buildExpertReviewFindings(
  sampleProject,
  emptyResult,
  { ...defaultAppSettings(), onlineImagery: { enabled: true, providerId: "usgs_imagery_only", maxTilesPerView: 8 } },
);
assert.equal(JSON.stringify(sampleProject), projectBeforeReview);

const projectedSettingsFindings = buildExpertReviewFindings(
  sampleProject,
  emptyResult,
  { ...defaultAppSettings(), coordinateDisplayFormat: "projected_local" },
);
assert.equal(projectedSettingsFindings[0].status, "watch");

const liveImageryFindings = buildExpertReviewFindings(
  sampleProject,
  emptyResult,
  { ...defaultAppSettings(), onlineImagery: { enabled: true, providerId: "usgs_imagery_only", maxTilesPerView: 8 } },
);
const liveImageryEvidence = liveImageryFindings.find((finding) => finding.role === "GIS/Imagery")?.evidence.join("\n") ?? "";
assert.match(liveImageryEvidence, /Browser imagery: usgs_imagery_only active; attribution required on map/);
assert.match(liveImageryEvidence, /Project package network tiles allowed: false/);
const storageEvidence = liveImageryFindings.find((finding) => finding.role === "Storage/Export")?.evidence.join("\n") ?? "";
assert.match(storageEvidence, /Saved online imagery in project: no/);

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
