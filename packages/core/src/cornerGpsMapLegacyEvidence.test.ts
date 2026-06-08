import assert from "node:assert/strict";

import {
  inferCornerGpsMapLegacyEvidenceKind,
  parseCornerGpsMapLegacyEvidence,
} from "./cornerGpsMapLegacyEvidence";
import { feetToMeters } from "./units";

const opt = parseCornerGpsMapLegacyEvidence("opt", `
SoftwareVersion=FLT synthetic
MachineModel=VFlex Synthetic
CornerLength=181 ft
OverhangLength=82 ft
MinLRDUBoundaryDist=35 ft
Status=Warning: LRDU clearance review required
Path Point 1: X=501000 Y=4506000
Path Point 2: X=501010 Y=4506010
`);
assert.equal(opt.advisoryOnly, true);
assert.equal(opt.canonicalGeometryMutation, false);
assert.equal(opt.controllerReady, false);
assert.equal(opt.kind, "opt");
assert.ok(Math.abs((opt.machineDimensions.cornerLengthMeters ?? 0) - feetToMeters(181)) < 0.000001);
assert.ok(Math.abs((opt.machineDimensions.lrduBoundaryDistanceMeters ?? 0) - feetToMeters(35)) < 0.000001);
assert.equal(opt.pathPointSummary.pointCount, 2);
assert.equal(opt.pathPointSummary.hasCoordinateColumns, true);
assert.ok(opt.statusSummary.warningCount >= 1);
assert.match(opt.diagnostics.join("\n"), /Raw coordinates/);

const csv = parseCornerGpsMapLegacyEvidence("csv", `point,x,y,cornerLengthFt,status
1,501000,4506000,181,OK
2,501010,4506010,181,OK
3,501020,4506020,181,Violation: outside boundary
`);
assert.equal(csv.pathPointSummary.pointCount, 3);
assert.deepEqual(csv.pathPointSummary.coordinateColumns, ["x", "y"]);
assert.equal(csv.statusSummary.blockerCount, 1);
assert.match(csv.violations.map((violation) => violation.message).join("\n"), /outside boundary/);

const out = parseCornerGpsMapLegacyEvidence("out", `
Calculation Summary
Result: Failed - end gun outside boundary
TowerCount: 7
`);
assert.equal(out.machineDimensions.towerCount, 7);
assert.equal(out.statusSummary.blockerCount, 1);
assert.match(out.violations[0]?.code ?? "", /failed/);

const vri = parseCornerGpsMapLegacyEvidence("vri", `zone,ratePercent,status
1,40,OK
2,85,OK
3,65,Warning: operator review
`);
assert.equal(vri.vriSummary.zoneCount, 3);
assert.equal(vri.vriSummary.minRatePercent, 40);
assert.equal(vri.vriSummary.maxRatePercent, 85);
assert.equal(vri.vriSummary.uniqueRateCount, 3);
assert.match(vri.warnings.join("\n"), /VRI compatibility remains unverified/);

assert.equal(inferCornerGpsMapLegacyEvidenceKind("field.OPT"), "opt");
assert.equal(inferCornerGpsMapLegacyEvidenceKind("field.ggs"), null);
assert.throws(() => parseCornerGpsMapLegacyEvidence("csv", ""), /empty/);

console.log("CornerGPSMap legacy evidence tests passed");
