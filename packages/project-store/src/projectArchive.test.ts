import assert from "node:assert/strict";

import { evaluateLayout, exportScenarioGeoJson, validateCenterPivotProofGeometry } from "@cplayout/geometry";
import {
  PROJECT_GEOJSON_FILENAME,
  PROJECT_GOOGLE_EARTH_KML_FILENAME,
  PROJECT_JSON_FILENAME,
  PROJECT_MAP_XML_FILENAME,
  MAP_PACKAGES_CSV_FILENAME,
  PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES,
  PROJECT_ARCHIVE_MAX_ENTRY_BYTES,
  PROJECT_ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  PROJECT_MANIFEST_FILENAME,
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
  mapPackagesToCsv,
  metricsToCsv,
  surveyPointsToCsv,
} from "./projectArchive";
import { realCenterPivotProofProject, sampleProject } from "@cplayout/core";

const result = evaluateLayout(sampleProject);
const bundle = buildProjectArchiveBundle(sampleProject, result, exportScenarioGeoJson(sampleProject, result), "2026-05-19T12:00:00.000Z");

assert.ok(bundle.files[PROJECT_MANIFEST_FILENAME].includes("center-pivot-project-archive-v1"));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes(sampleProject.id));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes("pivot-project-v1"));
assert.ok(bundle.files[PROJECT_GEOJSON_FILENAME].includes("FeatureCollection"));
assert.ok(bundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME].includes("field_boundary"));
assert.ok(bundle.files[PROJECT_MAP_XML_FILENAME].includes("cplayout-map-v1"));
assert.ok(bundle.files[PROJECT_MAP_XML_FILENAME].includes("gpsCoordinateSystem=\"decimal_degrees\""));
assert.ok(bundle.manifest.files.includes(PROJECT_MAP_XML_FILENAME));
assert.ok(bundle.files[MAP_PACKAGES_CSV_FILENAME].startsWith("id,name,packageType"));
assert.doesNotMatch(bundle.files[PROJECT_JSON_FILENAME], /onlineImagery|referenceOverlay|tileUrlTemplate|walkthroughProgress|packageDirectory/);

const localOnlyDraftProject = {
  ...sampleProject,
  settings: {
    ...sampleProject.settings,
    onlineImagery: {
      enabled: true,
      providerId: "custom_open_xyz",
      maxTilesPerView: 32,
      customSource: {
        name: "Local-only custom source",
        tileUrlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",
      },
    },
    offlineMaps: {
      ...sampleProject.settings?.offlineMaps,
      packageDirectory: "/operator/local/tiles",
    },
    referenceOverlay: {
      enabled: true,
      roads: true,
      borders: true,
      labels: true,
      sourcePackageId: "local-reference",
      schema: "cplayout_reference_v1",
    },
    walkthroughProgress: { imagery: true, boundary: true },
  },
} as unknown as typeof sampleProject;
const localOnlyBundle = buildProjectArchiveBundle(
  localOnlyDraftProject,
  result,
  exportScenarioGeoJson(localOnlyDraftProject, result),
  "2026-05-19T12:00:00.000Z",
);
assert.doesNotMatch(localOnlyBundle.files[PROJECT_JSON_FILENAME], /onlineImagery|referenceOverlay|tileUrlTemplate|walkthroughProgress|packageDirectory/);

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
    vectorOverlay: {
      schema: "cplayout_reference_v1",
      sourceLayers: {
        roads: "roads",
        roadLabels: "road_labels",
        borders: "borders",
        places: "places",
      },
    },
    imageryProvenance: {
      providerId: "usgs_naip",
      providerName: "USGS EROS NAIP",
      sourceUrl: "https://www.usgs.gov/centers/eros/science/national-agriculture-imagery-program-naip",
      productId: "M_4010521_NE_13_1_20250715",
      acquisitionYear: 2025,
      sourceResolutionMeters: 1,
      originalCrs: "EPSG:26913",
      preprocessingSummary: "GDAL generated XYZ PNG tiles and TileJSON outside the app.",
      accessedAt: "2026-06-03T12:00:00.000Z",
      attribution: "USDA Farm Service Agency, USGS EROS NAIP",
      licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
      offlineCopyAllowed: true,
      keyedService: false,
    },
    installStatus: "available",
    attribution: "Local imagery",
    licenseText: "Offline permitted",
    importedAt: "2026-05-19T12:00:00.000Z",
  }],
});
assert.match(mapPackageCsv, /tileContentType/);
assert.match(mapPackageCsv, /vectorOverlay/);
assert.match(mapPackageCsv, /imageryProvenance/);
assert.match(mapPackageCsv, /usgs_naip/);
assert.match(mapPackageCsv, /field-imagery/);

const logicalMapPackageProject = {
  ...sampleProject,
  mapPackages: [{
    id: "naip-local-aerial",
    name: "NAIP local aerial",
    packageType: "raster_tiles" as const,
    tileContentType: "raster" as const,
    uri: "app://map-packages/naip-local-aerial/",
    minZoom: 12,
    maxZoom: 18,
    tileScheme: "xyz" as const,
    boundsWgs84: {
      minLongitude: -105.2,
      minLatitude: 40.01,
      maxLongitude: -105.1,
      maxLatitude: 40.08,
    },
    tileJsonUrl: "app://map-packages/naip-local-aerial/tilejson.json",
    tileUrlTemplates: ["app://map-packages/naip-local-aerial/tiles/{z}/{x}/{y}.png"],
    installStatus: "available" as const,
    attribution: "USDA Farm Service Agency, USGS EROS NAIP",
    licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
    importedAt: "2026-06-03T12:00:00.000Z",
  }],
};
const logicalMapPackageBundle = buildProjectArchiveBundle(
  logicalMapPackageProject,
  evaluateLayout(logicalMapPackageProject),
  exportScenarioGeoJson(logicalMapPackageProject, evaluateLayout(logicalMapPackageProject)),
  "2026-06-03T12:00:00.000Z",
);
assert.match(logicalMapPackageBundle.files[PROJECT_JSON_FILENAME], /app:\/\/map-packages\/naip-local-aerial\/tilejson\.json/);
assert.match(logicalMapPackageBundle.files[MAP_PACKAGES_CSV_FILENAME], /app:\/\/map-packages\/naip-local-aerial\/tiles\/\{z\}\/\{x\}\/\{y\}\.png/);
assert.doesNotMatch(logicalMapPackageBundle.files[PROJECT_JSON_FILENAME], /file:\/\/\/documents\/map-packages/);
assert.doesNotMatch(logicalMapPackageBundle.files[MAP_PACKAGES_CSV_FILENAME], /file:\/\/\/documents\/map-packages/);

const projectWithMapFeatures = {
  ...sampleProject,
  mapFeatures: [
    {
      id: "pump-pad",
      name: "Pump pad",
      kind: "pump_location" as const,
      geometry: { type: "Point" as const, point: sampleProject.waterSource },
      confidence: "rtk_fixed" as const,
      properties: { inspected: true },
    },
    {
      id: "buried-main",
      name: "Buried main line",
      kind: "underground_pipeline" as const,
      geometry: {
        type: "LineString" as const,
        vertices: [sampleProject.waterSource, sampleProject.pivotCenter],
      },
      confidence: "user_estimated" as const,
      notes: "Planning-grade route.",
    },
    {
      id: "corner-footprint-a",
      name: "Corner footprint A",
      kind: "corner_swing_limit" as const,
      geometry: { type: "Polygon" as const, vertices: sampleProject.fieldBoundary.slice(0, 3) },
      confidence: "user_estimated" as const,
    },
    {
      id: "end-gun-circle-a",
      name: "End gun circle A",
      kind: "end_gun_arc" as const,
      geometry: { type: "Circle" as const, center: sampleProject.pivotCenter, radiusMeters: 24 },
      confidence: "user_estimated" as const,
    },
  ],
};
const mapFeatureBundle = buildProjectArchiveBundle(
  projectWithMapFeatures,
  evaluateLayout(projectWithMapFeatures),
  exportScenarioGeoJson(projectWithMapFeatures, evaluateLayout(projectWithMapFeatures)),
  "2026-05-19T12:00:00.000Z",
);
assert.match(bundle.files[PROJECT_JSON_FILENAME], /"mapFeatures": \[\]/);
assert.match(mapFeatureBundle.files[PROJECT_JSON_FILENAME], /"mapFeatures"/);
assert.match(mapFeatureBundle.files[PROJECT_JSON_FILENAME], /buried-main/);
const importedMapFeatureProject = importProjectArchiveZip(exportProjectArchiveZip(mapFeatureBundle));
assert.equal(importedMapFeatureProject.mapFeatures?.length, 4);
assert.equal(importedMapFeatureProject.mapFeatures?.[0].kind, "pump_location");
assert.equal(importedMapFeatureProject.mapFeatures?.[1].geometry.type, "LineString");
assert.equal(importedMapFeatureProject.mapFeatures?.[2].geometry.type, "Polygon");
assert.equal(importedMapFeatureProject.mapFeatures?.[3].geometry.type, "Circle");

const projectWithCornerArm = {
  ...sampleProject,
  machine: {
    ...sampleProject.machine,
    cornerArm: {
      id: "corner-arm-archive",
      name: "Corner arm archive",
      advisoryOnly: true as const,
      lengthMeters: 91,
      guidanceType: "gps_guidance" as const,
      sequencingType: "electronic" as const,
      orientation: "operator_supplied" as const,
      confidence: "user_estimated" as const,
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
const cornerArmBundle = buildProjectArchiveBundle(
  projectWithCornerArm,
  evaluateLayout(projectWithCornerArm),
  exportScenarioGeoJson(projectWithCornerArm, evaluateLayout(projectWithCornerArm)),
  "2026-06-05T12:00:00.000Z",
);
assert.match(cornerArmBundle.files[PROJECT_JSON_FILENAME], /corner-arm-archive/);
assert.match(cornerArmBundle.files[PROJECT_MAP_XML_FILENAME], /<cornerArm id="corner-arm-archive"/);
assert.match(cornerArmBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /cornerArmCanonicalGeometryMutation/);
const importedCornerArmProject = importProjectArchiveZip(exportProjectArchiveZip(cornerArmBundle));
assert.equal(importedCornerArmProject.machine.cornerArm?.id, "corner-arm-archive");
assert.equal(importedCornerArmProject.machine.cornerArm?.sourceRefs[0].sourceId, "SRC-VALLEY-VFLEX-CORNER");

const zipped = exportProjectArchiveZip(bundle);
assert.ok(zipped.byteLength > 500);

const imported = importProjectArchiveZip(zipped);
assert.equal(imported.id, sampleProject.id);
assert.equal(imported.projectCrs, "EPSG:32613");
assert.equal(imported.fieldBoundary.length, sampleProject.fieldBoundary.length);
assert.equal(imported.machine.spanLengthsMeters.length, sampleProject.machine.spanLengthsMeters.length);

const legacyReviewArchiveBundle = {
  ...bundle,
  manifest: {
    ...bundle.manifest,
    files: [
      ...bundle.manifest.files,
      "exports/layout-evidence.jsonl",
      "exports/layout-decisions.jsonl",
      "exports/model-recommendations.geojson",
    ],
  },
  files: {
    ...bundle.files,
    [PROJECT_MANIFEST_FILENAME]: JSON.stringify({
      ...bundle.manifest,
      files: [
        ...bundle.manifest.files,
        "exports/layout-evidence.jsonl",
        "exports/layout-decisions.jsonl",
        "exports/model-recommendations.geojson",
      ],
    }),
    "exports/layout-evidence.jsonl": "not parsed legacy review data\n",
    "exports/layout-decisions.jsonl": "not parsed legacy decision data\n",
    "exports/model-recommendations.geojson": "{ not parsed legacy recommendation geojson",
  },
};
const legacyReviewImport = importProjectArchiveZip(exportProjectArchiveZip(legacyReviewArchiveBundle));
assert.equal(legacyReviewImport.id, sampleProject.id);
assert.equal(legacyReviewImport.fieldBoundary.length, sampleProject.fieldBoundary.length);
assert.equal(bundle.manifest.files.includes("exports/layout-evidence.jsonl"), false);
assert.equal(bundle.manifest.files.includes("exports/layout-decisions.jsonl"), false);
assert.equal(bundle.manifest.files.includes("exports/model-recommendations.geojson"), false);

const proofResult = evaluateLayout(realCenterPivotProofProject);
assert.deepEqual(validateCenterPivotProofGeometry(realCenterPivotProofProject, proofResult), []);
const proofBundle = buildProjectArchiveBundle(
  realCenterPivotProofProject,
  proofResult,
  exportScenarioGeoJson(realCenterPivotProofProject, proofResult),
  "2026-05-29T12:00:00.000Z",
);
assert.match(proofBundle.files[PROJECT_JSON_FILENAME], /Public Adams County Center Pivot Proof/);
assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Base pivot wet circle/);
assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Allowed irrigated coverage/);
assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /End gun throw coverage/);
assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Diagonal service track no-spray/);
assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /cplayout-layout-allowed-coverage/);
const proofRoundTrip = importProjectArchiveZip(exportProjectArchiveZip(proofBundle));
assert.equal(proofRoundTrip.id, realCenterPivotProofProject.id);
assert.equal(proofRoundTrip.fieldBoundary.length, realCenterPivotProofProject.fieldBoundary.length);
assert.equal(proofRoundTrip.obstacles.length, realCenterPivotProofProject.obstacles.length);
assert.equal(proofRoundTrip.mapFeatures?.length, realCenterPivotProofProject.mapFeatures?.length);

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

assert.throws(
  () => importProjectArchiveZip(new Uint8Array(PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES + 1)),
  /compressed size exceeds/,
);

assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip({
    ...bundle,
    manifest: {
      ...bundle.manifest,
      files: [...bundle.manifest.files, "../evil.txt"],
    },
    files: {
      ...bundle.files,
      [PROJECT_MANIFEST_FILENAME]: JSON.stringify({
        ...bundle.manifest,
        files: [...bundle.manifest.files, "../evil.txt"],
      }),
      "../evil.txt": "escape",
    },
  })),
  /unsafe path/,
);

assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip({
    ...bundle,
    manifest: {
      ...bundle.manifest,
      files: [...bundle.manifest.files, "exports/unexpected.json"],
    },
    files: {
      ...bundle.files,
      [PROJECT_MANIFEST_FILENAME]: JSON.stringify({
        ...bundle.manifest,
        files: [...bundle.manifest.files, "exports/unexpected.json"],
      }),
      "exports/unexpected.json": "{}",
    },
  })),
  /unsupported file/,
);

assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip({
    ...bundle,
    files: {
      ...bundle.files,
      [PROJECT_JSON_FILENAME]: " ".repeat(PROJECT_ARCHIVE_MAX_ENTRY_BYTES + 1),
    },
  })),
  /entry project\.json exceeds/,
);

assert.throws(
  () => importProjectArchiveZip(exportProjectArchiveZip({
    ...bundle,
    files: {
      ...bundle.files,
      [PROJECT_GEOJSON_FILENAME]: " ".repeat(PROJECT_ARCHIVE_MAX_UNCOMPRESSED_BYTES + 1),
    },
  })),
  /entry exports\/scenario\.geojson exceeds|uncompressed size exceeds/,
);

console.log("project archive tests passed");
