import assert from "node:assert/strict";

import { PROJECT_DOCUMENT_VERSION, parseProjectDocument, serializeProjectDocument } from "./projectDocument";
import { sampleProject } from "./sampleProject";

const serialized = serializeProjectDocument(sampleProject);
assert.match(serialized, new RegExp(PROJECT_DOCUMENT_VERSION));

const parsed = parseProjectDocument(serialized);
assert.equal(parsed.id, sampleProject.id);
assert.equal(parsed.projectCrs, "EPSG:32613");
assert.deepEqual(parsed.pivotCenter, sampleProject.pivotCenter);
assert.equal(parsed.settings?.offlineMaps.allowNetworkTiles, false);
assert.equal("packageDirectory" in (parsed.settings?.offlineMaps ?? {}), false);
assert.equal("onlineImagery" in (parsed.settings ?? {}), false);

const parsedLegacySettings = parseProjectDocument({
  ...sampleProject,
  settings: {
    unitSystem: "metric",
    coordinateDisplayFormat: "decimal_degrees",
    defaultZoomLevel: 1,
    mapStyle: "field_light",
    drawing: {
      vertexSnapToleranceMeters: 1,
      featureSnapToleranceMeters: 3,
      selectionTolerancePixels: 18,
      panStepMeters: 120,
      zoomStepFactor: 1.35,
    },
    gpsQuality: {
      minimumFixType: "rtk_fixed",
      minSatellites: 12,
      maxHdop: 1.2,
      maxHorizontalAccuracyMeters: 0.05,
      maxCorrectionAgeSeconds: 3,
    },
    offlineMaps: {
      preferredPackageType: "pmtiles",
      requireAttribution: true,
      allowNetworkTiles: false,
    },
  },
});
assert.equal(parsedLegacySettings.settings?.coordinateDisplayFormat, "decimal_degrees");

const parsedLegacyMapPackage = parseProjectDocument({
  ...sampleProject,
  mapPackages: [{
    id: "legacy-local-tiles",
    name: "Legacy local tiles",
    packageType: "raster_tiles",
    uri: "file:///offline/legacy",
    minZoom: 12,
    maxZoom: 16,
    boundsWgs84: {
      minLongitude: -105.2,
      minLatitude: 40.01,
      maxLongitude: -105.1,
      maxLatitude: 40.08,
    },
    attribution: "Operator supplied",
    licenseText: "Offline use permitted",
    importedAt: "2026-05-19T12:00:00.000Z",
  }],
});
assert.equal(parsedLegacyMapPackage.mapPackages?.[0].tileContentType, "raster");
assert.equal(parsedLegacyMapPackage.mapPackages?.[0].tileScheme, "xyz");
assert.equal(parsedLegacyMapPackage.mapPackages?.[0].installStatus, "metadata_only");

assert.throws(
  () => parseProjectDocument({ ...sampleProject, projectCrs: "EPSG:4326" }),
  /Projected CRS required/,
);

for (const geographicCrs of ["CRS:84", "OGC:CRS84", "+proj=longlat +datum=WGS84", "EPSG:4269"]) {
  assert.throws(
    () => parseProjectDocument({ ...sampleProject, projectCrs: geographicCrs }),
    /Projected CRS required/,
  );
}

assert.throws(
  () => parseProjectDocument({ ...sampleProject, projectCrs: "EPSG:999999" }),
  /Supported projected CRS required/,
);

assert.throws(
  () => parseProjectDocument({ documentVersion: "bad-version", project: sampleProject }),
  /fieldBoundary|projectCrs|Invalid input/,
);

console.log("project document tests passed");
