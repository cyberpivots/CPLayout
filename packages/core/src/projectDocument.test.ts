import assert from "node:assert/strict";

import { PROJECT_DOCUMENT_VERSION, parseProjectDocument, serializeProjectDocument } from "./projectDocument";
import { sampleProject, willRheaJasonHarmelinkExampleProject } from "./sampleProject";

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
assert.equal(parsed.settings?.aerialImagery.mode, "auto");
assert.equal("packageDirectory" in (parsed.settings?.offlineMaps ?? {}), false);
assert.equal("onlineImagery" in (parsed.settings ?? {}), false);
assert.equal("referenceOverlay" in (parsed.settings ?? {}), false);
assert.doesNotMatch(serialized, /onlineImagery|referenceOverlay|tileUrlTemplate|walkthroughProgress|packageDirectory/);
assert.equal(parsed.settings?.mappingWorkflowMode, "design");
assert.equal(parsed.settings?.layoutReview.requiredBoundaryClearanceMeters, 0);
assert.equal(parsed.settings?.layoutReview.showMachineBoundaryDistances, true);
assert.deepEqual(parsed.mapFeatures, []);

const parsedWillRhea = parseProjectDocument(serializeProjectDocument(willRheaJasonHarmelinkExampleProject));
assert.equal(parsedWillRhea.id, "will-rhea-jason-harmelink-example");
assert.equal(parsedWillRhea.projectCrs, "EPSG:32614");
assert.deepEqual(parsedWillRhea.fieldBoundary, willRheaJasonHarmelinkExampleProject.fieldBoundary);
assert.deepEqual(parsedWillRhea.pivotCenter, willRheaJasonHarmelinkExampleProject.pivotCenter);
assert.equal(parsedWillRhea.wgs84Companion?.source, "derived_from_project_xy");
assert.equal(parsedWillRhea.mapFeatures?.filter((feature) => feature.kind === "machine_zone").length, 3);
assert.equal(
  parsedWillRhea.mapFeatures?.find((feature) => feature.id === "will-rhea-full-scope-field-boundary-evidence")?.kind,
  "planning_boundary",
);
assert.equal(
  parsedWillRhea.mapFeatures?.find((feature) => feature.id === "will-rhea-middle-machine-field-boundary")?.properties?.sourceKmlEntryName,
  "doc.kml",
);
assert.equal(
  parsedWillRhea.mapFeatures?.find((feature) => feature.id === "will-rhea-south-machine-field-boundary")?.properties?.canonicalGeometryMutation,
  false,
);

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
    aerialImagery: {
      mode: "manual",
      sourcePackageId: "local-naip-aerial",
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
assert.deepEqual(parsedWithLocalOnlyDrafts.settings?.aerialImagery, {
  mode: "manual",
  sourcePackageId: "local-naip-aerial",
});

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

const parsedAwarenessMapFeatures = parseProjectDocument({
  ...sampleProject,
  mapFeatures: [
    {
      id: "north-machine-zone",
      name: "North machine zone",
      kind: "machine_zone",
      geometry: { type: "Polygon", vertices: sampleProject.fieldBoundary.slice(0, 3) },
      confidence: "user_estimated",
      properties: { advisoryOnly: true, canonicalGeometryMutation: false },
    },
    {
      id: "generated-field-pivot-zone-1",
      name: "Generated Pivot Zone 1",
      kind: "machine_zone",
      geometry: { type: "Circle", center: sampleProject.pivotCenter, radiusMeters: 180 },
      confidence: "optimized",
      properties: {
        advisoryOnly: true,
        canonicalGeometryMutation: false,
        qualifiedReviewRequired: true,
        source: "generated_field_pivot_plan",
      },
    },
    {
      id: "lrdu-measurement",
      name: "LRDU measurement",
      kind: "measurement_line",
      geometry: { type: "LineString", vertices: sampleProject.fieldBoundary.slice(0, 2) },
      confidence: "imagery_digitized",
      properties: { lengthMeters: 1514.96 },
    },
    {
      id: "well-a",
      name: "Well A",
      kind: "well_location",
      geometry: { type: "Point", point: sampleProject.waterSource },
      confidence: "user_estimated",
    },
    {
      id: "buried-wire-a",
      name: "Buried wire A",
      kind: "underground_wire",
      geometry: { type: "LineString", vertices: sampleProject.fieldBoundary.slice(1, 3) },
      confidence: "user_estimated",
    },
    {
      id: "linear-move-path-a",
      name: "Linear move path A",
      kind: "linear_move_path",
      geometry: { type: "LineString", vertices: sampleProject.fieldBoundary.slice(2, 4) },
      confidence: "user_estimated",
      properties: { advisoryOnly: true, canonicalGeometryMutation: false },
    },
  ],
});
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[0].kind, "machine_zone");
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[1].geometry.type, "Circle");
assert.deepEqual(parsedAwarenessMapFeatures.pivotCenter, sampleProject.pivotCenter);
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[2].kind, "measurement_line");
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[3].kind, "well_location");
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[4].kind, "underground_wire");
assert.equal(parsedAwarenessMapFeatures.mapFeatures?.[5].kind, "linear_move_path");

const cornerArmSourceRef = {
  sourceId: "SRC-VALLEY-VFLEX-CORNER",
  title: "Valley VFlex Corner",
  url: "https://www.valleyirrigation.com/vflex-corner",
  checkedAt: "2026-06-05",
  limit: "Manufacturer public feature/specification reference only; CPLayout does not certify compatibility or kinematics.",
};
const parsedCornerArmProject = parseProjectDocument({
  ...sampleProject,
  machine: {
    ...sampleProject.machine,
    cornerArm: {
      id: "corner-arm-a",
      name: "Corner arm A",
      advisoryOnly: true,
      lengthMeters: 91,
      wheelTrackLengthMeters: 78,
      overhangLengthMeters: 13,
      metadataSource: "operator_supplied",
      modelFamily: "single_span_lrdu_sdu",
      guidanceType: "gps_guidance",
      sequencingType: "electronic",
      orientation: "operator_supplied",
      confidence: "user_estimated",
      sourceRefs: [cornerArmSourceRef],
      operatorConfirmedAt: "2026-06-05T00:00:00.000Z",
      notes: "Operator confirmed advisory config.",
    },
  },
});
assert.equal(parsedCornerArmProject.machine.cornerArm?.advisoryOnly, true);
assert.equal(parsedCornerArmProject.machine.cornerArm?.wheelTrackLengthMeters, 78);
assert.equal(parsedCornerArmProject.machine.cornerArm?.overhangLengthMeters, 13);
assert.equal(parsedCornerArmProject.machine.cornerArm?.metadataSource, "operator_supplied");
assert.equal(parsedCornerArmProject.machine.cornerArm?.modelFamily, "single_span_lrdu_sdu");
assert.equal(parsedCornerArmProject.machine.cornerArm?.sourceRefs[0].sourceId, "SRC-VALLEY-VFLEX-CORNER");
assert.equal(parseProjectDocument(sampleProject).machine.cornerArm, undefined);
assert.throws(
  () => parseProjectDocument({
    ...sampleProject,
    machine: {
      ...sampleProject.machine,
      cornerArm: {
        id: "bad-corner-arm",
        name: "Bad corner arm",
        advisoryOnly: true,
        lengthMeters: 91,
        guidanceType: "gps_guidance",
        sequencingType: "electronic",
        orientation: "operator_supplied",
        confidence: "user_estimated",
        sourceRefs: [],
      },
    },
  }),
  /sourceRefs|too_small|at least/,
);

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
assert.equal(parsedLegacySettings.settings?.aerialImagery.mode, "auto");
assert.equal(parsedLegacySettings.settings?.layoutReview.requiredBoundaryClearanceMeters, 0);
assert.equal(parsedLegacySettings.settings?.layoutReview.showMachineBoundaryDistances, true);

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

const parsedNaipMapPackage = parseProjectDocument({
  ...sampleProject,
  mapPackages: [{
    id: "naip-local-aerial",
    name: "NAIP local aerial",
    packageType: "raster_tiles",
    tileContentType: "raster",
    uri: "app://map-packages/naip-local-aerial/",
    minZoom: 12,
    maxZoom: 18,
    tileScheme: "xyz",
    boundsWgs84: {
      minLongitude: -105.2,
      minLatitude: 40.01,
      maxLongitude: -105.1,
      maxLatitude: 40.08,
    },
    tileJsonUrl: "app://map-packages/naip-local-aerial/tilejson.json",
    tileUrlTemplates: ["app://map-packages/naip-local-aerial/tiles/{z}/{x}/{y}.png"],
    imageryProvenance: {
      providerId: "usgs_naip",
      providerName: "USGS EROS NAIP",
      sourceUrl: "https://www.usgs.gov/centers/eros/science/national-agriculture-imagery-program-naip",
      productId: "M_4010521_NE_13_1_20250715",
      acquisitionYear: 2025,
      sourceResolutionMeters: 1,
      originalCrs: "EPSG:26913",
      preprocessingSummary: "GDAL generated XYZ PNG tiles outside the app.",
      accessedAt: "2026-06-03T12:00:00.000Z",
      attribution: "USDA Farm Service Agency, USGS EROS NAIP",
      licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
      offlineCopyAllowed: true,
      keyedService: false,
    },
    installStatus: "available",
    attribution: "USDA Farm Service Agency, USGS EROS NAIP",
    licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
    importedAt: "2026-06-03T12:00:00.000Z",
  }],
});
assert.equal(parsedNaipMapPackage.mapPackages?.[0].imageryProvenance?.providerId, "usgs_naip");
assert.equal(parsedNaipMapPackage.mapPackages?.[0].tileJsonUrl, "app://map-packages/naip-local-aerial/tilejson.json");

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
