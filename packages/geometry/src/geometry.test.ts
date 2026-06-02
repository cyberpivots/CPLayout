import assert from "node:assert/strict";

import {
  calculateTowerPoints,
  createSectorPolygon,
  endGunRadiusMeters,
  evaluateMechanicalConflicts,
  evaluateLayout,
  machineRadiusMeters,
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

assert.throws(
  () => evaluateLayout({ ...sampleProject, projectCrs: "EPSG:4326" }),
  /Projected CRS required/,
);

console.log("geometry tests passed");
