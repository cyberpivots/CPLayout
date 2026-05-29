import assert from "node:assert/strict";

import { projectXyToLonLat } from "./coordinates";
import { exportProjectGoogleEarthKml, importGoogleEarthKmlToProject } from "./projectKml";
import { realCenterPivotProofProject, sampleProject } from "./sampleProject";
import type { LayoutResult, XY } from "./types";

function kmlRing(points: XY[]): string {
  const closed = [...points, points[0]];
  return closed.map((point) => {
    const lonLat = projectXyToLonLat(point, sampleProject.projectCrs);
    return `${lonLat.longitude},${lonLat.latitude},0`;
  }).join(" ");
}

function polygonPlacemark(name: string, coordinates: string, extendedData = ""): string {
  return `
    <Placemark>
      <name>${name}</name>
      ${extendedData}
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
}

const boundaryRing = [
  { x: 501100, y: 4506100 },
  { x: 501240, y: 4506100 },
  { x: 501240, y: 4506240 },
  { x: 501100, y: 4506240 },
];
const obstacleRing = [
  { x: 501150, y: 4506140 },
  { x: 501180, y: 4506140 },
  { x: 501180, y: 4506170 },
  { x: 501150, y: 4506170 },
];
const pointLonLat = projectXyToLonLat({ x: 501170, y: 4506180 }, sampleProject.projectCrs);

const explicitKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${polygonPlacemark("Boundary", kmlRing(boundaryRing), `<ExtendedData><Data name="layerType"><value>field_boundary</value></Data></ExtendedData>`)}
    ${polygonPlacemark("Pump pad", kmlRing(obstacleRing), `<ExtendedData><Data name="kind"><value>building</value></Data></ExtendedData>`)}
    <Placemark>
      <name>Imported control</name>
      <ExtendedData><Data name="role"><value>control</value></Data></ExtendedData>
      <Point><coordinates>${pointLonLat.longitude},${pointLonLat.latitude},12</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

const imported = importGoogleEarthKmlToProject(sampleProject, explicitKml, { observedAt: "2026-05-21T12:00:00.000Z" });
assert.equal(imported.importedBoundary, true);
assert.equal(imported.importedObstacleCount, 1);
assert.equal(imported.importedSurveyPointCount, 1);
assert.equal(imported.project.fieldBoundary.length, 4);
assert.equal(imported.project.obstacles.at(-1)?.kind, "building");
assert.equal(imported.project.surveyPoints.at(-1)?.role, "control");
assert.equal(imported.project.surveyPoints.at(-1)?.source, "imported");
assert.match(imported.warnings.join("\n"), /Ignored altitude/);
assert.ok(Math.abs(imported.project.fieldBoundary[0].x - boundaryRing[0].x) < 0.01);
assert.ok(Math.abs(imported.project.fieldBoundary[0].y - boundaryRing[0].y) < 0.01);

const heuristicKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${polygonPlacemark("Parcel outline", kmlRing(boundaryRing))}
    ${polygonPlacemark("Ditch", kmlRing(obstacleRing))}
  </Document>
</kml>`;
const heuristic = importGoogleEarthKmlToProject(sampleProject, heuristicKml, { observedAt: "2026-05-21T12:00:00.000Z" });
assert.equal(heuristic.importedBoundary, true);
assert.equal(heuristic.importedObstacleCount, 1);
assert.equal(heuristic.project.obstacles.at(-1)?.kind, "ditch");
assert.match(heuristic.warnings.join("\n"), /No explicit field_boundary/);

const closedLineStringKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${polygonPlacemark("Boundary", kmlRing(boundaryRing), `<ExtendedData><Data name="layerType"><value>field_boundary</value></Data></ExtendedData>`)}
    <Placemark>
      <name>Fence line</name>
      <ExtendedData><Data name="kind"><value>fence</value></Data></ExtendedData>
      <LineString><coordinates>${kmlRing(obstacleRing)}</coordinates></LineString>
    </Placemark>
  </Document>
</kml>`;
const closedLine = importGoogleEarthKmlToProject(sampleProject, closedLineStringKml);
assert.equal(closedLine.importedObstacleCount, 0);
assert.equal(closedLine.importedMapFeatureCount, 1);
const closedLineFeature = closedLine.project.mapFeatures?.at(-1);
assert.equal(closedLineFeature?.kind, "fence");
assert.equal(closedLineFeature?.geometry.type, "LineString");
assert.equal(closedLineFeature?.geometry.type === "LineString" ? closedLineFeature.geometry.vertices.length : 0, 4);
assert.match(closedLine.warnings.join("\n"), /Closed utility LineString kept as a line/);

const selectedImport = importGoogleEarthKmlToProject(sampleProject, explicitKml, {
  observedAt: "2026-05-21T12:00:00.000Z",
  selectedItemIds: ["boundary", "imported-control"],
});
assert.equal(selectedImport.importedObstacleCount, 0);
assert.equal(selectedImport.importedSurveyPointCount, 1);
assert.equal(selectedImport.items.some((item) => item.name === "Pump pad" && !item.selected), true);

assert.throws(
  () => importGoogleEarthKmlToProject(sampleProject, `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><NetworkLink><name>Remote</name></NetworkLink></Document></kml>`),
  /did not contain supported/,
);

assert.throws(
  () => importGoogleEarthKmlToProject(sampleProject, `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>-181,40,0</coordinates></Point></Placemark></Document></kml>`),
  /did not contain supported/,
);

const exported = exportProjectGoogleEarthKml(sampleProject);
assert.equal(exported.warnings.length, 0);
assert.ok(exported.exportedFeatureCount >= sampleProject.obstacles.length + sampleProject.surveyPoints.length + 4);
assert.match(exported.kml, /<kml xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/);
assert.match(exported.kml, /<Style id="cplayout-field-boundary">/);
assert.match(exported.kml, /<LineStyle><color>ff1f5f39<\/color><width>3\.2<\/width><\/LineStyle>/);
assert.match(exported.kml, /<PolyStyle><color>333a8f5c<\/color><fill>1<\/fill><outline>1<\/outline><\/PolyStyle>/);
assert.match(exported.kml, /<IconStyle><color>ff0f5db8<\/color><scale>1\.15<\/scale><\/IconStyle>/);
assert.match(exported.kml, /<LabelStyle><color>ff20372a<\/color><scale>1\.05<\/scale><\/LabelStyle>/);
assert.match(exported.kml, /<styleUrl>#cplayout-field-boundary<\/styleUrl>/);
assert.match(exported.kml, /<styleUrl>#cplayout-obstacle-road<\/styleUrl>/);
assert.match(exported.kml, /<styleUrl>#cplayout-point-pivot<\/styleUrl>/);
assert.match(exported.kml, /<styleUrl>#cplayout-point-water<\/styleUrl>/);
assert.match(exported.kml, /<styleUrl>#cplayout-point-power<\/styleUrl>/);
assert.match(exported.kml, /<styleUrl>#cplayout-survey-point<\/styleUrl>/);
assert.doesNotMatch(exported.kml, /<href>https?:\/\//);
assert.match(exported.kml, /field_boundary/);
assert.match(exported.kml, /projectCrs/);
assert.match(exported.kml, /EPSG:32613/);

const exportedUtility = exportProjectGoogleEarthKml({
  ...sampleProject,
  mapFeatures: [
    {
      id: "pipeline-a",
      name: "Pipeline A",
      kind: "underground_pipeline",
      geometry: { type: "LineString", vertices: obstacleRing.slice(0, 2) },
      confidence: "imagery_digitized",
    },
  ],
});
assert.match(exportedUtility.kml, /underground_pipeline/);
assert.match(exportedUtility.kml, /<Style id="cplayout-map-line-water">/);
assert.match(exportedUtility.kml, /<styleUrl>#cplayout-map-line-water<\/styleUrl>/);
assert.match(exportedUtility.kml, /<Data name="cplayoutFeatureType"><value>map_feature<\/value><\/Data>/);
assert.equal(exportedUtility.exportedFeatureCount, exported.exportedFeatureCount + 1);

const styledMapPoints = exportProjectGoogleEarthKml({
  ...sampleProject,
  mapFeatures: [
    {
      id: "pump-location-a",
      name: "Pump Location A",
      kind: "pump_location",
      geometry: { type: "Point", point: sampleProject.waterSource },
      confidence: "rtk_fixed",
    },
    {
      id: "power-line-a",
      name: "Power Line A",
      kind: "power_line",
      geometry: { type: "LineString", vertices: obstacleRing.slice(0, 2) },
      confidence: "imagery_digitized",
    },
  ],
});
assert.match(styledMapPoints.kml, /Pump Location A/);
assert.match(styledMapPoints.kml, /<styleUrl>#cplayout-map-point<\/styleUrl>/);
assert.match(styledMapPoints.kml, /Power Line A/);
assert.match(styledMapPoints.kml, /<styleUrl>#cplayout-map-line-power<\/styleUrl>/);

const renamedUtility = exportProjectGoogleEarthKml({
  ...sampleProject,
  mapFeatures: [
    {
      id: "pipeline-a",
      name: "Renamed Pipeline A",
      kind: "underground_pipeline",
      geometry: { type: "LineString", vertices: obstacleRing.slice(0, 2) },
      confidence: "imagery_digitized",
    },
  ],
});
assert.match(renamedUtility.kml, /Renamed Pipeline A/);
assert.doesNotMatch(renamedUtility.kml, /<name>Pipeline A<\/name>/);

const deletedUtility = exportProjectGoogleEarthKml({
  ...sampleProject,
  mapFeatures: [],
});
assert.doesNotMatch(deletedUtility.kml, /pipeline-a/);
assert.doesNotMatch(deletedUtility.kml, /Renamed Pipeline A/);
assert.equal(deletedUtility.exportedFeatureCount, exported.exportedFeatureCount);

const proofLayoutResult: LayoutResult = {
  metrics: {
    fieldAcres: 132,
    irrigatedAcres: 124,
    nonIrrigatedAcres: 8,
    coveragePercent: 93.8,
    endGunAcres: 7,
    outsideFieldAcres: 0,
    obstacleConflictCount: 2,
  },
  baseCoverage: [[realCenterPivotProofProject.fieldBoundary]],
  endGunCoverage: [[realCenterPivotProofProject.fieldBoundary]],
  allowedCoverage: [[realCenterPivotProofProject.fieldBoundary]],
  outsideFieldCoverage: [],
  obstacles: realCenterPivotProofProject.obstacles.map((obstacle) => [obstacle.polygon]),
  towers: [
    {
      towerIndex: 1,
      radiusMeters: realCenterPivotProofProject.machine.spanLengthsMeters[0],
      point: {
        x: realCenterPivotProofProject.pivotCenter.x + realCenterPivotProofProject.machine.spanLengthsMeters[0],
        y: realCenterPivotProofProject.pivotCenter.y,
      },
    },
  ],
  warnings: [],
};
const exportedProofLayout = exportProjectGoogleEarthKml(realCenterPivotProofProject, proofLayoutResult);
assert.match(exportedProofLayout.kml, /Base pivot wet circle/);
assert.match(exportedProofLayout.kml, /End gun throw coverage/);
assert.match(exportedProofLayout.kml, /Allowed irrigated coverage/);
assert.match(exportedProofLayout.kml, /<Style id="cplayout-layout-allowed-coverage">/);
assert.match(exportedProofLayout.kml, /<styleUrl>#cplayout-layout-base-coverage<\/styleUrl>/);
assert.match(exportedProofLayout.kml, /<Data name="cplayoutFeatureType"><value>layout_result<\/value><\/Data>/);
const importedProofLayout = importGoogleEarthKmlToProject(sampleProject, exportedProofLayout.kml);
assert.equal(importedProofLayout.importedObstacleCount, realCenterPivotProofProject.obstacles.length);
assert.ok(importedProofLayout.skippedFeatureCount >= 3);
assert.equal(importedProofLayout.items.some((item) => item.name === "Allowed irrigated coverage"), false);

console.log("project KML tests passed");
