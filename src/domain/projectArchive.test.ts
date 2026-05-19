import assert from "node:assert/strict";

import { evaluateLayout, exportScenarioGeoJson } from "./geometry";
import {
  PROJECT_GEOJSON_FILENAME,
  PROJECT_JSON_FILENAME,
  MAP_PACKAGES_CSV_FILENAME,
  PROJECT_MANIFEST_FILENAME,
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
  mapPackagesToCsv,
  metricsToCsv,
  surveyPointsToCsv,
} from "./projectArchive";
import { sampleProject } from "./sampleProject";

const result = evaluateLayout(sampleProject);
const bundle = buildProjectArchiveBundle(sampleProject, result, exportScenarioGeoJson(sampleProject, result), "2026-05-19T12:00:00.000Z");

assert.ok(bundle.files[PROJECT_MANIFEST_FILENAME].includes("center-pivot-project-archive-v1"));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes(sampleProject.id));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes("pivot-project-v1"));
assert.ok(bundle.files[PROJECT_GEOJSON_FILENAME].includes("FeatureCollection"));
assert.ok(bundle.files[MAP_PACKAGES_CSV_FILENAME].startsWith("id,name,packageType"));

const surveyCsv = surveyPointsToCsv(sampleProject.surveyPoints);
assert.match(surveyCsv, /^id,label,role,x,y,longitude,latitude,observedAt,source,confidence,notes/);
assert.match(surveyCsv, /pivot-rtk/);

const metricsCsv = metricsToCsv(result);
assert.match(metricsCsv, /coveragePercent/);

const mapPackageCsv = mapPackagesToCsv({
  ...sampleProject,
  mapPackages: [{
    id: "field-imagery",
    name: "Field imagery",
    packageType: "pmtiles",
    tileContentType: "raster",
    uri: "file:///offline/field.pmtiles",
    minZoom: 10,
    maxZoom: 18,
    tileScheme: "xyz",
    boundsWgs84: {
      minLongitude: -105.21,
      minLatitude: 40.01,
      maxLongitude: -105.11,
      maxLatitude: 40.11,
    },
    tileJsonUrl: "http://127.0.0.1:8765/field/tilejson.json",
    tileUrlTemplates: ["http://127.0.0.1:8765/field/{z}/{x}/{y}.png"],
    installStatus: "available",
    attribution: "Local imagery",
    licenseText: "Offline permitted",
    importedAt: "2026-05-19T12:00:00.000Z",
  }],
});
assert.match(mapPackageCsv, /tileContentType/);
assert.match(mapPackageCsv, /field-imagery/);

const zipped = exportProjectArchiveZip(bundle);
assert.ok(zipped.byteLength > 500);

const imported = importProjectArchiveZip(zipped);
assert.equal(imported.id, sampleProject.id);
assert.equal(imported.projectCrs, "EPSG:32613");
assert.equal(imported.fieldBoundary.length, sampleProject.fieldBoundary.length);
assert.equal(imported.machine.spanLengthsMeters.length, sampleProject.machine.spanLengthsMeters.length);

const badVersionBundle = {
  ...bundle,
  files: {
    ...bundle.files,
    [PROJECT_MANIFEST_FILENAME]: JSON.stringify({
      ...bundle.manifest,
      projectDocumentVersion: "old-version",
    }),
  },
};
assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip(badVersionBundle)),
  /Invalid input|projectDocumentVersion/,
);

const wrongProjectIdBundle = {
  ...bundle,
  files: {
    ...bundle.files,
    [PROJECT_MANIFEST_FILENAME]: JSON.stringify({
      ...bundle.manifest,
      projectId: "different-project",
    }),
  },
};
assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip(wrongProjectIdBundle)),
  /projectId does not match/,
);

assert.throws(
  () => importProjectArchiveZip(new Uint8Array([1, 2, 3])),
  /invalid zip data|unexpected EOF|central directory/i,
);

console.log("project archive tests passed");
