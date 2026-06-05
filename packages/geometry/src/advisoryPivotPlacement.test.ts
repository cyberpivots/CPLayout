import assert from "node:assert/strict";

import type { ObstacleZone, PivotMachine, PivotProject, ProjectMapFeature, XY } from "@cplayout/core";

import {
  buildPivotPlacementCandidates,
  evaluateAdvisoryCornerArm,
} from "./advisoryPivotPlacement";
import { evaluateLayout } from "./geometry";

const field: XY[] = [
  { x: 0, y: 0 },
  { x: 220, y: 0 },
  { x: 220, y: 140 },
  { x: 150, y: 140 },
  { x: 150, y: 80 },
  { x: 0, y: 80 },
];

const accessLane: ProjectMapFeature = {
  id: "north-access",
  name: "North access lane",
  kind: "access_lane",
  geometry: { type: "LineString", vertices: [{ x: 0, y: 130 }, { x: 220, y: 130 }] },
  confidence: "user_estimated",
};

const bufferedObstacle: ObstacleZone = {
  id: "center-buffer",
  name: "Center buffer",
  kind: "building",
  polygon: [
    { x: 88, y: 38 },
    { x: 112, y: 38 },
    { x: 112, y: 62 },
    { x: 88, y: 62 },
  ],
  bufferMeters: 14,
  hardConflict: true,
  noSpray: true,
  confidence: "user_estimated",
};

const project = makeProject({
  obstacles: [bufferedObstacle],
  mapFeatures: [accessLane],
  waterSource: { x: 20, y: 20 },
  powerSource: { x: 20, y: 130 },
});

const firstRun = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 5,
  waterSourceWeight: 10,
  powerSourceWeight: 8,
  accessWeight: 6,
});
const secondRun = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 5,
  waterSourceWeight: 10,
  powerSourceWeight: 8,
  accessWeight: 6,
});
assert.ok(firstRun.length > 0);
assert.deepEqual(firstRun.map((candidate) => candidate.id), secondRun.map((candidate) => candidate.id));
assert.deepEqual(project.pivotCenter, { x: 30, y: 40 });
assert.ok(firstRun.some((candidate) => candidate.sourceSeed === "maximum_inscribed_circle"));
assert.ok(firstRun.every((candidate) => candidate.canonicalGeometryMutation === false));
assert.ok(firstRun.every((candidate) => candidate.dryCornerPolygons.length > 0));
assert.ok(firstRun.every((candidate) => Number.isFinite(candidate.scoreBreakdown.waterSourceProximity)));
assert.ok(firstRun.some((candidate) => candidate.minimumObstacleClearanceMeters !== null));

const waterWeighted = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 3,
  waterSourceWeight: 60,
  powerSourceWeight: 0,
  accessWeight: 0,
});
const powerWeighted = buildPivotPlacementCandidates(project, {
  gridDivisions: 8,
  maxCandidates: 3,
  waterSourceWeight: 0,
  powerSourceWeight: 60,
  accessWeight: 0,
});
assert.notEqual(waterWeighted[0].id, powerWeighted[0].id);

const cornerSwingLimit: ProjectMapFeature = {
  id: "corner-evidence",
  name: "Corner evidence",
  kind: "corner_swing_limit",
  geometry: {
    type: "Polygon",
    vertices: [
      { x: 150, y: 82 },
      { x: 218, y: 82 },
      { x: 218, y: 138 },
      { x: 152, y: 138 },
    ],
  },
  confidence: "user_estimated",
};
const cornerProject = makeProject({
  mapFeatures: [accessLane, cornerSwingLimit],
  machine: {
    ...defaultMachine(),
    cornerArm: {
      id: "corner-arm-a",
      name: "Corner arm A",
      advisoryOnly: true,
      lengthMeters: 65,
      guidanceType: "gps_guidance",
      sequencingType: "electronic",
      orientation: "operator_supplied",
      confidence: "user_estimated",
      sourceRefs: [{
        sourceId: "SRC-VALLEY-VFLEX-CORNER",
        title: "Valley VFlex Corner",
        url: "https://www.valleyirrigation.com/vflex-corner",
        checkedAt: "2026-06-05",
        limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
      }],
    },
  },
});
const before = evaluateLayout(cornerProject);
const evaluation = evaluateAdvisoryCornerArm(cornerProject);
const after = evaluateLayout(cornerProject);
assert.equal(evaluation.status, "ready");
assert.equal(evaluation.canonicalGeometryMutation, false);
assert.equal(evaluation.unverifiedKinematics, true);
assert.deepEqual(evaluation.evidenceFeatureIds, ["corner-evidence"]);
assert.ok(evaluation.estimatedAddedCoverageAcres >= 0);
assert.deepEqual(after.allowedCoverage, before.allowedCoverage);
assert.equal(after.metrics.endGunAcres, before.metrics.endGunAcres);
assert.equal(after.metrics.irrigatedAcres, before.metrics.irrigatedAcres);

const missingEvaluation = evaluateAdvisoryCornerArm({ ...cornerProject, machine: { ...cornerProject.machine, cornerArm: undefined } });
assert.equal(missingEvaluation.status, "missing_config");
assert.equal(missingEvaluation.coverageCandidate.length, 0);

console.log("advisory pivot placement tests passed");

function makeProject(overrides: Partial<PivotProject> = {}): PivotProject {
  const pivotCenter = overrides.pivotCenter ?? { x: 30, y: 40 };
  return {
    id: "advisory-placement-test",
    name: "Advisory placement test",
    projectCrs: "LOCAL:TEST",
    unitSystem: "metric",
    fieldBoundary: field,
    pivotCenter,
    waterSource: overrides.waterSource ?? { x: 0, y: 0 },
    powerSource: overrides.powerSource ?? { x: 220, y: 140 },
    machine: overrides.machine ?? defaultMachine(),
    obstacles: overrides.obstacles ?? [],
    surveyPoints: [],
    mapFeatures: overrides.mapFeatures ?? [],
  };
}

function defaultMachine(): PivotMachine {
  return {
    id: "machine-a",
    name: "Machine A",
    spanLengthsMeters: [30, 30],
    overhangMeters: 0,
    endGunThrowMeters: 0,
    towerClearanceBufferMeters: 4,
    machineClearanceBufferMeters: 6,
    sweep: { mode: "full_circle" },
  };
}
