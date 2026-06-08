import assert from "node:assert/strict";

import {
  calculateTowerPoints,
  buildLayoutPathOverlays,
  createSectorPolygon,
  endGunRadiusMeters,
  evaluateMechanicalConflicts,
  evaluateLayout,
  machineRadiusMeters,
  multiPolygonAreaSquareMeters,
  polygonAreaSquareMeters,
  validateWetCoverageWithinField,
} from "./geometry";
import { sampleProject } from "@cplayout/core";

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

assert.equal(polygonAreaSquareMeters(square), 10000);

const machineRadius = machineRadiusMeters(sampleProject.machine);
assert.equal(machineRadius, 207.3);

const towers = calculateTowerPoints({ x: 0, y: 0 }, sampleProject.machine, 0);
assert.deepEqual(towers.map((tower) => Number(tower.radiusMeters.toFixed(1))), [47.2, 94.4, 141.6, 188.8]);

const sector = createSectorPolygon(
  { x: 0, y: 0 },
  10,
  { mode: "partial_circle", startAngleDegrees: 350, stopAngleDegrees: 20, direction: "counterclockwise" },
  36,
);
assert.ok(sector.length > 4);

const result = evaluateLayout(sampleProject);
assert.ok(result.metrics.fieldAcres > 120);
assert.ok(result.metrics.irrigatedAcres > 25);
assert.ok(result.metrics.coveragePercent > 15);
assert.ok(result.metrics.noSprayConflictCount >= 0);
assert.ok(result.metrics.hardMechanicalConflictCount >= 0);
assert.ok(result.warnings.length >= 1);

const fieldBoundedProject = {
  ...sampleProject,
  projectCrs: "LOCAL:TEST",
  fieldBoundary: square,
  pivotCenter: { x: 50, y: 50 },
  machine: {
    ...sampleProject.machine,
    spanLengthsMeters: [20],
    overhangMeters: 0,
    endGunThrowMeters: 0,
    sweep: { mode: "full_circle" as const },
  },
  obstacles: [],
  surveyPoints: [],
};

assert.equal(validateWetCoverageWithinField(fieldBoundedProject).feasible, true);

const boundaryCrossing = validateWetCoverageWithinField({
  ...fieldBoundedProject,
  pivotCenter: { x: 90, y: 50 },
});
assert.equal(boundaryCrossing.feasible, false);
assert.ok(boundaryCrossing.outsideFieldAreaSquareMeters > 0);

const endGunFullSweep = evaluateLayout(fieldBoundedProject);
const endGunArcProject = {
  ...fieldBoundedProject,
  machine: {
    ...fieldBoundedProject.machine,
    endGunThrowMeters: 20,
    endGunAngleRanges: [
      { startAngleDegrees: 0, stopAngleDegrees: 90, direction: "counterclockwise" as const },
    ],
  },
};
const endGunArcResult = evaluateLayout(endGunArcProject);
const fullEndGunProject = {
  ...fieldBoundedProject,
  machine: {
    ...fieldBoundedProject.machine,
    endGunThrowMeters: 20,
    endGunAngleRanges: [],
  },
};
const fullEndGunResult = evaluateLayout(fullEndGunProject);
assert.equal(endGunRadiusMeters(endGunArcProject.machine), 40);
assert.ok(endGunArcResult.metrics.endGunAcres > endGunFullSweep.metrics.endGunAcres);
assert.ok(endGunArcResult.metrics.endGunAcres < fullEndGunResult.metrics.endGunAcres);

const hardConflictProject = {
  ...fieldBoundedProject,
  machine: {
    ...fieldBoundedProject.machine,
    spanLengthsMeters: [35],
    towerClearanceBufferMeters: 4,
    machineClearanceBufferMeters: 4,
  },
  obstacles: [
    {
      id: "tower-road",
      name: "Tower road crossing",
      kind: "road" as const,
      polygon: [
        { x: 82, y: 46 },
        { x: 90, y: 46 },
        { x: 90, y: 54 },
        { x: 82, y: 54 },
      ],
      bufferMeters: 0,
      hardConflict: true,
      noSpray: false,
      confidence: "user_estimated" as const,
    },
  ],
};
const hardConflictResult = evaluateLayout(hardConflictProject);
assert.equal(hardConflictResult.metrics.noSprayConflictCount, 0);
assert.equal(hardConflictResult.metrics.hardMechanicalConflictCount, 1);
assert.equal(hardConflictResult.metrics.towerTrackConflictCount, 1);
assert.ok(evaluateMechanicalConflicts(hardConflictProject).some((conflict) => conflict.conflictType === "tower_track"));

const beforePathOverlayProjectGeometry = JSON.stringify({
  fieldBoundary: fieldBoundedProject.fieldBoundary,
  machine: fieldBoundedProject.machine,
  pivotCenter: fieldBoundedProject.pivotCenter,
});
const fullCirclePathOverlays = buildLayoutPathOverlays({
  ...fieldBoundedProject,
  machine: {
    ...fieldBoundedProject.machine,
    spanLengthsMeters: [15, 20],
    overhangMeters: 5,
    towerClearanceBufferMeters: 2,
    machineClearanceBufferMeters: 3,
  },
});
assert.deepEqual(fullCirclePathOverlays.map((overlay) => overlay.kind), ["wheel_track", "wheel_track", "end_of_machine"]);
assert.deepEqual(fullCirclePathOverlays.filter((overlay) => overlay.kind === "wheel_track").map((overlay) => overlay.radiusMeters), [15, 35]);
assert.equal(fullCirclePathOverlays[0]?.towerIndex, 1);
assert.equal(fullCirclePathOverlays[2]?.radiusMeters, 40);
assert.equal(fullCirclePathOverlays[2]?.bufferMeters, 3);
assert.ok(fullCirclePathOverlays.every((overlay) => multiPolygonAreaSquareMeters(overlay.insideFieldEnvelope) > 0));
assert.ok(fullCirclePathOverlays.every((overlay) => multiPolygonAreaSquareMeters(overlay.outsideFieldEnvelope) === 0));
assert.equal(JSON.stringify({
  fieldBoundary: fieldBoundedProject.fieldBoundary,
  machine: fieldBoundedProject.machine,
  pivotCenter: fieldBoundedProject.pivotCenter,
}), beforePathOverlayProjectGeometry);

const partialOutsidePathOverlays = buildLayoutPathOverlays({
  ...fieldBoundedProject,
  pivotCenter: { x: 90, y: 50 },
  machine: {
    ...fieldBoundedProject.machine,
    spanLengthsMeters: [35],
    overhangMeters: 10,
    towerClearanceBufferMeters: 4,
    machineClearanceBufferMeters: 5,
    sweep: { mode: "partial_circle", startAngleDegrees: 260, stopAngleDegrees: 40, direction: "counterclockwise" as const },
  },
});
const partialTowerOverlay = partialOutsidePathOverlays.find((overlay) => overlay.kind === "wheel_track");
const partialMachineOverlay = partialOutsidePathOverlays.find((overlay) => overlay.kind === "end_of_machine");
assert.ok(partialTowerOverlay);
assert.ok(partialMachineOverlay);
assert.ok(multiPolygonAreaSquareMeters(partialTowerOverlay.insideFieldEnvelope) > 0);
assert.ok(multiPolygonAreaSquareMeters(partialTowerOverlay.outsideFieldEnvelope) > 0);
assert.equal(partialMachineOverlay.radiusMeters, 45);
assert.ok(multiPolygonAreaSquareMeters(partialMachineOverlay.outsideFieldEnvelope) > 0);

assert.throws(
  () => evaluateLayout({ ...sampleProject, projectCrs: "EPSG:4326" }),
  /Projected CRS required/,
);

console.log("geometry tests passed");
