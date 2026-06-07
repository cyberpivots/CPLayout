import assert from "node:assert/strict";

import {
  CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS,
  cornerGpsMapPresetToAdvisoryCornerArmConfig,
  decodeCornerGpsMapFltConfig,
  parseCornerGpsMapBpf,
  parseCornerGpsMapConfigXml,
  previewCornerGpsMapBpfImport,
} from "./cornerGpsMapImport";
import { sampleProject } from "./sampleProject";
import { feetToMeters } from "./units";

const validBpf = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<BorderPoints>
  <BenchMark Latitude="40.000000" Longitude="-104.002000" Altitude="1500.000000" />
  <CenterPoint Latitude="40.000000" Longitude="-104.000000" Altitude="1501.000000" />
  <BorderPoint Latitude="39.999000" Longitude="-104.001000" />
  <BorderPoint Latitude="40.001000" Longitude="-104.001000" />
  <BorderPoint Latitude="40.001000" Longitude="-103.999000" />
  <BorderPoint Latitude="39.999000" Longitude="-103.999000" />
  <BorderPoint Latitude="39.999000" Longitude="-104.001000" />
</BorderPoints>`;

const evidence = parseCornerGpsMapBpf(validBpf, {
  sourceId: "SRC-SYNTHETIC-BPF",
  title: "Synthetic BPF fixture",
  checkedAt: "2026-06-07",
  limit: "Synthetic parser fixture only.",
});
assert.equal(evidence.benchmark?.altitude, 1500);
assert.equal(evidence.centerPoint?.latitude, 40);
assert.equal(evidence.borderPoints.length, 5);
assert.equal(evidence.normalizedBorderPoints.length, 4);
assert.equal(evidence.duplicateClosingPointRemoved, true);
assert.equal(evidence.ringOrder, "clockwise");
assert.deepEqual(evidence.blockedReasons, []);

const preview = previewCornerGpsMapBpfImport(sampleProject, validBpf, {
  observedAt: "2026-06-07T00:00:00.000Z",
});
assert.equal(preview.canApply, true);
assert.equal(preview.importedBoundary, true);
assert.equal(preview.importedSurveyPointCount, 1);
assert.equal(preview.project.fieldBoundary.length, 4);
assert.notDeepEqual(preview.project.fieldBoundary, sampleProject.fieldBoundary);
assert.deepEqual(preview.project.pivotCenter, sampleProject.pivotCenter);
assert.equal(preview.project.surveyPoints.at(-1)?.role, "pivot_center");
assert.equal(preview.project.surveyPoints.at(-1)?.wgs84?.longitude, -104);
assert.match(preview.items.find((item) => item.id === "pivot-center")?.warning ?? "", /does not move/);

const boundaryOnlyPreview = previewCornerGpsMapBpfImport(sampleProject, validBpf, {
  selectedItemIds: ["field-boundary"],
});
assert.equal(boundaryOnlyPreview.canApply, true);
assert.equal(boundaryOnlyPreview.importedBoundary, true);
assert.equal(boundaryOnlyPreview.importedSurveyPointCount, 0);
assert.equal(boundaryOnlyPreview.project.surveyPoints.length, sampleProject.surveyPoints.length);

const missingBenchmark = parseCornerGpsMapBpf(`<?xml version="1.0"?>
<BorderPoints>
  <CenterPoint Latitude="40" Longitude="-104" />
  <BorderPoint Latitude="39.999" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-103.999" />
</BorderPoints>`);
assert.match(missingBenchmark.warnings.join("\n"), /BenchMark/);
assert.deepEqual(missingBenchmark.blockedReasons, []);

const zeroCenterPreview = previewCornerGpsMapBpfImport(sampleProject, `<?xml version="1.0"?>
<BorderPoints>
  <BenchMark Latitude="40" Longitude="-104" />
  <CenterPoint Latitude="0" Longitude="0" />
  <BorderPoint Latitude="39.999" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-103.999" />
</BorderPoints>`);
assert.equal(zeroCenterPreview.canApply, false);
assert.match(zeroCenterPreview.warnings.join("\n"), /0,0/);

const unknownTag = parseCornerGpsMapBpf(`<?xml version="1.0"?>
<BorderPoints>
  <CenterPoint Latitude="40" Longitude="-104" />
  <CornerPath Latitude="40" Longitude="-104" />
  <BorderPoint Latitude="39.999" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-103.999" />
</BorderPoints>`);
assert.match(unknownTag.blockedReasons.join("\n"), /CornerPath/);

const badCoordinate = parseCornerGpsMapBpf(`<?xml version="1.0"?>
<BorderPoints>
  <CenterPoint Latitude="95" Longitude="-104" />
  <BorderPoint Latitude="39.999" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-104.001" />
  <BorderPoint Latitude="40.001" Longitude="-103.999" />
</BorderPoints>`);
assert.match(badCoordinate.blockedReasons.join("\n"), /Latitude/);

const unprojectablePreview = previewCornerGpsMapBpfImport({ ...sampleProject, projectCrs: "EPSG:4326" }, validBpf);
assert.equal(unprojectablePreview.canApply, false);
assert.match(unprojectablePreview.warnings.join("\n"), /Projected CRS required/);

const configXml = `<?xml version="1.0" encoding="utf-8"?>
<GPSMapConfig xmlns="http://tempuri.org/GPSMapConfig.xsd">
  <Pivot>
    <Model ModelID="17" Name="185 VFlex, 82 OH" CornerLength="181" OverhangLength="86" MaxCornerAngle="162" MinCornerAngle="75" CornerSpeed="1.55" MaxOutwardAngle="100" MaxInwardAngle="10" CornerType="Single" MinLRDUBoundaryDist="35" />
    <Model ModelID="43" Name="351 Dual Span" CornerLength="351" OverhangLength="36" MaxCornerAngle="165" MinCornerAngle="22" CornerType="Dual" ConnectingLength="180" FreestandingLength="135" MinLRDUBoundaryDist="17" MinFreestandingAngle="25" />
  </Pivot>
  <Linear>
    <Model ModelID="L1" Name="Small Field Single Span Linear" CornerLength="0" />
  </Linear>
</GPSMapConfig>`;
const parsedConfig = parseCornerGpsMapConfigXml(configXml);
assert.equal(parsedConfig.presets.length, 3);
const vflex = parsedConfig.presets[0];
assert.equal(vflex.kind, "pivot");
assert.equal(vflex.cornerType, "Single");
assert.ok(Math.abs((vflex.cornerLengthMeters ?? 0) - feetToMeters(181)) < 0.000001);
assert.equal(vflex.cornerSpeedFeetPerMinute, 1.55);
const dual = parsedConfig.presets[1];
assert.equal(dual.cornerType, "Dual");
assert.ok(Math.abs((dual.connectingLengthMeters ?? 0) - feetToMeters(180)) < 0.000001);
assert.equal(parsedConfig.presets[2].kind, "linear");

const encoded = Buffer.from(configXml, "utf8").toString("base64");
assert.match(decodeCornerGpsMapFltConfig(encoded), /351 Dual Span/);

const advisoryConfig = cornerGpsMapPresetToAdvisoryCornerArmConfig(vflex, {
  operatorConfirmedAt: "2026-06-07T00:00:00.000Z",
});
assert.equal(advisoryConfig.advisoryOnly, true);
assert.equal(advisoryConfig.guidanceType, "gps_guidance");
assert.equal(advisoryConfig.lengthMeters, vflex.cornerLengthMeters);
assert.match(advisoryConfig.notes ?? "", /proprietary kinematics/);

assert.equal(CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS.advisoryOnly, true);
assert.ok(Math.abs(CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS.safetyZoneMeters - feetToMeters(15)) < 0.000001);
assert.ok(Math.abs(CORNER_GPS_MAP_DEFAULT_REVIEW_SETTINGS.minLrduBoundaryClearanceMeters - feetToMeters(35)) < 0.000001);

console.log("CornerGPSMap import tests passed");
