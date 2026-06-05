import assert from "node:assert/strict";

import { CPLAYOUT_MAP_XML_VERSION, exportProjectMapXml, importProjectMapXmlToProject } from "./projectXml";
import { sampleProject } from "./sampleProject";

const projectWithFeatures = {
  ...sampleProject,
  mapFeatures: [
    {
      id: "corner-footprint-a",
      name: "Corner footprint A",
      kind: "corner_swing_limit" as const,
      geometry: {
        type: "Polygon" as const,
        vertices: sampleProject.fieldBoundary.slice(0, 4),
      },
      confidence: "user_estimated" as const,
      notes: "Operator supplied advisory footprint.",
    },
    {
      id: "end-gun-radius-a",
      name: "End gun radius marker",
      kind: "end_gun_arc" as const,
      geometry: {
        type: "Circle" as const,
        center: sampleProject.pivotCenter,
        radiusMeters: 24,
      },
      confidence: "user_estimated" as const,
      properties: { advisoryOnly: true },
    },
  ],
  machine: {
    ...sampleProject.machine,
    catalogSelection: {
      catalogId: "valley-8000-public-preset",
      manufacturer: "Valley",
      model: "8000 Series",
      sourceUrl: "https://www.valleyirrigation.com/8000",
      sourceAccessedAt: "2026-06-02",
      advisoryOnly: true as const,
    },
    cornerArm: {
      id: "corner-arm-a",
      name: "Corner arm A",
      advisoryOnly: true as const,
      lengthMeters: 91,
      guidanceType: "gps_guidance" as const,
      sequencingType: "electronic" as const,
      orientation: "operator_supplied" as const,
      confidence: "user_estimated" as const,
      operatorConfirmedAt: "2026-06-05T00:00:00.000Z",
      notes: "Operator confirmed advisory config.",
      sourceRefs: [{
        sourceId: "SRC-VALLEY-VFLEX-CORNER",
        title: "Valley VFlex Corner",
        url: "https://www.valleyirrigation.com/vflex-corner",
        checkedAt: "2026-06-05",
        limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
      }],
    },
  },
};

const xml = exportProjectMapXml(projectWithFeatures);
assert.match(xml, new RegExp(CPLAYOUT_MAP_XML_VERSION));
assert.match(xml, /canonicalGeometry="projected_xy"/);
assert.match(xml, /gpsCoordinateSystem="decimal_degrees"/);
assert.match(xml, /<mapFeature id="corner-footprint-a"/);
assert.match(xml, /<geometry type="Circle" radiusMeters="24">/);
assert.match(xml, /catalogId="valley-8000-public-preset"/);
assert.match(xml, /<cornerArm id="corner-arm-a"/);
assert.match(xml, /sourceId="SRC-VALLEY-VFLEX-CORNER"/);
assert.doesNotMatch(xml, /tileUrlTemplate|packageDirectory|hidden/i);

const imported = importProjectMapXmlToProject(xml);
assert.equal(imported.project.id, projectWithFeatures.id);
assert.equal(imported.project.projectCrs, projectWithFeatures.projectCrs);
assert.equal(imported.project.fieldBoundary.length, projectWithFeatures.fieldBoundary.length);
assert.equal(imported.project.mapFeatures?.length, 2);
assert.equal(imported.project.mapFeatures?.[0].geometry.type, "Polygon");
assert.equal(imported.project.mapFeatures?.[1].geometry.type, "Circle");
assert.equal(imported.project.machine.catalogSelection?.catalogId, "valley-8000-public-preset");
assert.equal(imported.project.machine.cornerArm?.id, "corner-arm-a");
assert.equal(imported.project.machine.cornerArm?.sourceRefs[0].sourceId, "SRC-VALLEY-VFLEX-CORNER");
assert.equal(imported.project.wgs84Companion?.status, "projected");
assert.equal(imported.project.wgs84Companion?.coordinateSystem, "decimal_degrees");
assert.match(imported.warnings.join("\n"), /projected XY as canonical/);

const gpsOnlySourceProject = { ...projectWithFeatures, surveyPoints: [], mapFeatures: [] };
const gpsOnlyXml = exportProjectMapXml(gpsOnlySourceProject).replace(/\s+x="[^"]+"\s+y="[^"]+"/g, "");
assert.doesNotMatch(gpsOnlyXml, /\sx="/);
assert.doesNotMatch(gpsOnlyXml, /\sy="/);
const importedGpsOnly = importProjectMapXmlToProject(gpsOnlyXml);
assert.equal(importedGpsOnly.project.fieldBoundary.length, gpsOnlySourceProject.fieldBoundary.length);
assert.ok(Math.abs(importedGpsOnly.project.pivotCenter.x - gpsOnlySourceProject.pivotCenter.x) < 0.001);
assert.ok(Math.abs(importedGpsOnly.project.pivotCenter.y - gpsOnlySourceProject.pivotCenter.y) < 0.001);
assert.match(importedGpsOnly.warnings.join("\n"), /GPS-only decimal-degree XML values were converted/);

assert.throws(
  () => importProjectMapXmlToProject(gpsOnlyXml.replace(`projectCrs="${gpsOnlySourceProject.projectCrs}"`, `projectCrs="EPSG:4326"`)),
  /GPS coordinates require project CRS\/calibration/,
);

assert.throws(
  () => importProjectMapXmlToProject(`<!DOCTYPE cplayoutMap><cplayoutMap version="${CPLAYOUT_MAP_XML_VERSION}"/>`),
  /DOCTYPE/,
);

assert.throws(
  () => importProjectMapXmlToProject(`<notCplayout/>`),
  /root element/,
);

assert.throws(
  () => importProjectMapXmlToProject(xml.replace(CPLAYOUT_MAP_XML_VERSION, "old-version")),
  /Unsupported CPLayout XML version/,
);

console.log("project XML tests passed");
