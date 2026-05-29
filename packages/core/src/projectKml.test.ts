import assert from "node:assert/strict";

import { projectXyToLonLat } from "./coordinates";
import { exportProjectGoogleEarthKml, importGoogleEarthKmlToProject } from "./projectKml";
import { sampleProject } from "./sampleProject";
import type { XY } from "./types";

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
assert.equal(exportedUtility.exportedFeatureCount, exported.exportedFeatureCount + 1);

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

console.log("project KML tests passed");
