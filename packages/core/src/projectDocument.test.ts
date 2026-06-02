import assert from "node:assert/strict";

import { PROJECT_DOCUMENT_VERSION, parseProjectDocument, serializeProjectDocument } from "./projectDocument";
import { sampleProject } from "./sampleProject";

const serialized = serializeProjectDocument(sampleProject);
assert.match(serialized, new RegExp(PROJECT_DOCUMENT_VERSION));

const parsed = parseProjectDocument(serialized);
assert.equal(parsed.id, sampleProject.id);
assert.equal(parsed.projectCrs, "EPSG:32613");
assert.deepEqual(parsed.pivotCenter, sampleProject.pivotCenter);
assert.equal(parsed.wgs84Companion?.status, "projected");
assert.equal(parsed.wgs84Companion?.coordinateSystem, "decimal_degrees");
assert.equal(parsed.wgs84Companion?.fieldBoundary?.length, sampleProject.fieldBoundary.length);
assert.equal(parsed.settings?.offlineMaps.allowNetworkTiles, false);
assert.equal("packageDirectory" in (parsed.settings?.offlineMaps ?? {}), false);
assert.equal("onlineImagery" in (parsed.settings ?? {}), false);
assert.equal("referenceOverlay" in (parsed.settings ?? {}), false);
assert.doesNotMatch(serialized, /onlineImagery|referenceOverlay|tileUrlTemplate|walkthroughProgress|packageDirectory/);
assert.equal(parsed.settings?.mappingWorkflowMode, "design");
assert.deepEqual(parsed.mapFeatures, []);

const parsedWithStaleCompanion = parseProjectDocument({
  documentVersion: PROJECT_DOCUMENT_VERSION,
  project: {
    ...sampleProject,
    wgs84Companion: {
      status: "projected",
      source: "derived_from_project_xy",
      coordinateSystem: "decimal_degrees",
      projectCrs: sampleProject.projectCrs,
      pivotCenter: { longitude: 0, latitude: 0 },
    },
  },
});
assert.notDeepEqual(parsedWithStaleCompanion.wgs84Companion?.pivotCenter, { longitude: 0, latitude: 0 });
assert.deepEqual(parsedWithStaleCompanion.wgs84Companion?.pivotCenter, parsed.wgs84Companion?.pivotCenter);

const parsedWithLocalOnlyDrafts = parseProjectDocument({
  ...sampleProject,
  settings: {
    ...sampleProject.settings,
    onlineImagery: {
      enabled: true,
      providerId: "custom_open_xyz",
      maxTilesPerView: 32,
      customSource: {
        name: "Local-only source",
        tileUrlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",
      },
    },
    offlineMaps: {
      ...sampleProject.settings?.offlineMaps,
      packageDirectory: "/local/operator/maps",
    },
    walkthroughProgress: {
      imagery: true,
      boundary: true,
    },
    referenceOverlay: {
      enabled: true,
      roads: true,
      borders: true,
      labels: true,
      sourcePackageId: "local-reference",
      schema: "openmaptiles",
    },
  },
});
assert.equal("onlineImagery" in (parsedWithLocalOnlyDrafts.settings ?? {}), false);
assert.equal("referenceOverlay" in (parsedWithLocalOnlyDrafts.settings ?? {}), false);
assert.equal("walkthroughProgress" in (parsedWithLocalOnlyDrafts.settings ?? {}), false);
assert.equal("packageDirectory" in (parsedWithLocalOnlyDrafts.settings?.offlineMaps ?? {}), false);

const parsedMapFeatures = parseProjectDocument({
  ...sampleProject,
  mapFeatures: [
    {
      id: "pipeline-a",
      name: "Pipeline A",
      kind: "underground_pipeline",
      geometry: { type: "LineString", vertices: sampleProject.fieldBoundary.slice(0, 2) },
      confidence: "imagery_digitized",
    },
  ],
});
assert.equal(parsedMapFeatures.mapFeatures?.[0].kind, "underground_pipeline");

const parsedExtendedMapFeatures = parseProjectDocument({
  ...sampleProject,
  mapFeatures: [
    {
      id: "corner-footprint-a",
      name: "Corner footprint A",
      kind: "corner_swing_limit",
      geometry: { type: "Polygon", vertices: sampleProject.fieldBoundary.slice(0, 3) },
      confidence: "user_estimated",
    },
    {
      id: "end-gun-radius-a",
      name: "End gun radius A",
      kind: "end_gun_arc",
      geometry: { type: "Circle", center: sampleProject.pivotCenter, radiusMeters: 24 },
      confidence: "user_estimated",
    },
  ],
});
assert.equal(parsedExtendedMapFeatures.mapFeatures?.[0].geometry.type, "Polygon");
assert.equal(parsedExtendedMapFeatures.mapFeatures?.[1].geometry.type, "Circle");

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
assert.equal(parsedLegacySettings.settings?.mappingWorkflowMode, "design");

const parsedLayoutSettings = parseProjectDocument({
  ...sampleProject,
  settings: {
    ...sampleProject.settings!,
    mappingWorkflowMode: "layout",
  },
});
assert.equal(parsedLayoutSettings.settings?.mappingWorkflowMode, "layout");

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
