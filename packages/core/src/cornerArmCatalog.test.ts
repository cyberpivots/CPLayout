import assert from "node:assert/strict";

import {
  CORNER_ARM_INITIAL_SCAFFOLD_SOURCE,
  VALLEY_CORNER_ARM_SCAFFOLD_CATALOG,
  VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE,
  VALLEY_CORNER_ARM_SPECS_A_STANDALONE_SOURCE,
  findCornerArmScaffoldCatalogEntry,
} from "./cornerArmCatalog";
import { feetToMeters } from "./units";

assert.equal(CORNER_ARM_INITIAL_SCAFFOLD_SOURCE.sourceStatus, "scaffold_only");
assert.equal(VALLEY_CORNER_ARM_SPECS_A_STANDALONE_SOURCE.sourceStatus, "scaffold_only");
assert.equal(VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE.sourceStatus, "scaffold_only");
assert.notEqual(
  VALLEY_CORNER_ARM_SPECS_A_STANDALONE_SOURCE.artifactSha256,
  VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE.artifactSha256,
);

assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.length, 3);
assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.every((entry) => entry.sourceStatus === "scaffold_only"), true);
assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.every((entry) => entry.productionReady === false), true);
assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.every((entry) => entry.normalizedRecordStatus === "EXTERNAL_OFFICIAL"), true);
assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.every((entry) => entry.sourceRefs.every((source) => source.sourceStatus === "scaffold_only")), true);
assert.equal(VALLEY_CORNER_ARM_SCAFFOLD_CATALOG.every((entry) => entry.sourceRefs.some((source) => source.sourceId === VALLEY_CORNER_ARM_SPECS_A_EMBEDDED_SOURCE.sourceId)), true);

const precision205 = findCornerArmScaffoldCatalogEntry("valley-precision-corner-205ft-normalized");
assert.ok(precision205);
assert.equal(precision205.label, "Valley Precision Corner 205 ft scaffold");
assert.equal(precision205.family, "precision_corner");
assert.equal(Number(precision205.spanLengthMeters.toFixed(6)), Number(feetToMeters(205).toFixed(6)));
assert.equal(Number(precision205.overhangLengthMeters.toFixed(6)), Number(feetToMeters(82).toFixed(6)));
assert.equal(Number(precision205.effectiveLengthMeters?.toFixed(6)), Number(feetToMeters(276).toFixed(6)));
assert.equal(precision205.cornerSpeedRatio, 1.55);
assert.equal(precision205.lrduMotorRpm, 34);
assert.equal(precision205.sduMotorRpm, 56);

const vflex = findCornerArmScaffoldCatalogEntry("valley-vflex-corner-66m-25m-normalized");
assert.ok(vflex);
assert.equal(vflex.spanLengthMeters, 66);
assert.equal(vflex.overhangLengthMeters, 25);
assert.equal(vflex.effectiveLengthMeters, undefined);
