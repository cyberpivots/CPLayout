import assert from "node:assert/strict";

import type { PivotMachine, PivotProject } from "@cplayout/core";
import { feetToMeters } from "@cplayout/core";

import { evaluateCornerGpsMapAdvisoryReview } from "./cornerGpsMapAdvisoryReview";

const readyProject = makeProject();
const readyReview = evaluateCornerGpsMapAdvisoryReview(readyProject);
assert.equal(readyReview.status, "ready");
assert.equal(readyReview.advisoryOnly, true);
assert.equal(readyReview.canonicalGeometryMutation, false);
assert.equal(readyReview.unverifiedManufacturerKinematics, true);
assert.equal(readyReview.qualifiedReviewRequired, true);
assert.ok((readyReview.metrics.lrduBoundaryClearanceMeters ?? 0) > feetToMeters(35));
assert.equal(readyReview.advisoryPathFeatureIds.length, 0);
assert.ok(readyReview.issues.some((issue) => issue.code === "no_obstacle_evidence"));

const pathFeatureReview = evaluateCornerGpsMapAdvisoryReview(makeProject({
  mapFeatures: [{
    id: "corner-review-zone",
    name: "Corner review zone",
    kind: "corner_swing_limit",
    geometry: {
      type: "Polygon",
      vertices: [
        { x: 780, y: 780 },
        { x: 960, y: 780 },
        { x: 960, y: 960 },
      ],
    },
    confidence: "user_estimated",
    properties: {
      evidenceOnly: true,
      canonicalGeometryMutation: false,
    },
  }],
}));
assert.deepEqual(pathFeatureReview.advisoryPathFeatureIds, ["corner-review-zone"]);

const blockedReview = evaluateCornerGpsMapAdvisoryReview(makeProject({
  machine: machine({ spanLengthsMeters: [495] }),
}));
assert.equal(blockedReview.status, "blocked");
assert.ok(blockedReview.issues.some((issue) => issue.code === "lrdu_boundary_clearance_shortfall" && (issue.shortfallMeters ?? 0) > 0));

const endGunReview = evaluateCornerGpsMapAdvisoryReview(makeProject({
  machine: machine({ spanLengthsMeters: [300], endGunThrowMeters: 220 }),
}));
assert.equal(endGunReview.status, "ready");
assert.ok(endGunReview.issues.some((issue) => issue.code === "end_gun_boundary_review"));

const obstacleReview = evaluateCornerGpsMapAdvisoryReview(makeProject({
  obstacles: [{
    id: "service-road",
    name: "Service road",
    kind: "road",
    polygon: [
      { x: 798, y: 470 },
      { x: 820, y: 470 },
      { x: 820, y: 530 },
      { x: 798, y: 530 },
    ],
    bufferMeters: 5,
    hardConflict: true,
    noSpray: true,
    confidence: "user_estimated",
  }],
}));
assert.equal(obstacleReview.status, "ready");
assert.ok(obstacleReview.issues.some((issue) => issue.code === "obstacle_clearance_review"));

const missingBoundaryReview = evaluateCornerGpsMapAdvisoryReview(makeProject({
  fieldBoundary: [],
}));
assert.equal(missingBoundaryReview.status, "blocked");
assert.ok(missingBoundaryReview.issues.some((issue) => issue.code === "missing_projected_boundary"));

assert.deepEqual(readyProject.fieldBoundary, makeProject().fieldBoundary);

console.log("CornerGPSMap advisory review tests passed");

function makeProject(overrides: Partial<PivotProject> = {}): PivotProject {
  return {
    id: "corner-gps-map-review-test",
    name: "CornerGPSMap review test",
    projectCrs: "LOCAL:TEST",
    unitSystem: "metric",
    fieldBoundary: overrides.fieldBoundary ?? [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    pivotCenter: overrides.pivotCenter ?? { x: 500, y: 500 },
    waterSource: overrides.waterSource ?? { x: 20, y: 20 },
    powerSource: overrides.powerSource ?? { x: 980, y: 20 },
    machine: overrides.machine ?? machine(),
    obstacles: overrides.obstacles ?? [],
    surveyPoints: overrides.surveyPoints ?? [],
    mapFeatures: overrides.mapFeatures ?? [],
    settings: overrides.settings,
    mapPackages: overrides.mapPackages,
  };
}

function machine(overrides: Partial<PivotMachine> = {}): PivotMachine {
  return {
    id: "review-machine",
    name: "Review machine",
    spanLengthsMeters: overrides.spanLengthsMeters ?? [300],
    overhangMeters: overrides.overhangMeters ?? 0,
    endGunThrowMeters: overrides.endGunThrowMeters ?? 0,
    towerClearanceBufferMeters: overrides.towerClearanceBufferMeters ?? 3,
    machineClearanceBufferMeters: overrides.machineClearanceBufferMeters ?? 5,
    sweep: overrides.sweep ?? { mode: "full_circle" },
    endGunAngleRanges: overrides.endGunAngleRanges,
    catalogSelection: overrides.catalogSelection,
    cornerArm: overrides.cornerArm,
  };
}
