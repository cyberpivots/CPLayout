import assert from "node:assert/strict";

import { evaluateLayout, exportScenarioGeoJson, validateCenterPivotProofGeometry } from "@cplayout/geometry";
import {
  PROJECT_GEOJSON_FILENAME,
  PROJECT_GOOGLE_EARTH_KML_FILENAME,
  PROJECT_JSON_FILENAME,
  LAYOUT_DECISIONS_JSONL_FILENAME,
  LAYOUT_EVIDENCE_JSONL_FILENAME,
  MAP_PACKAGES_CSV_FILENAME,
  MODEL_RECOMMENDATIONS_GEOJSON_FILENAME,
  PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES,
  PROJECT_MANIFEST_FILENAME,
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
  layoutDecisionsToJsonl,
  layoutEvidenceToJsonl,
  mapPackagesToCsv,
  metricsToCsv,
  modelRecommendationsToProjectedGeoJson,
  surveyPointsToCsv,
} from "./projectArchive";
import { realCenterPivotProofProject, sampleProject, type LayoutDecisionRecord, type LayoutEvidenceRecord, type ModelRecommendation } from "@cplayout/core";

const result = evaluateLayout(sampleProject);
const bundle = buildProjectArchiveBundle(sampleProject, result, exportScenarioGeoJson(sampleProject, result), "2026-05-19T12:00:00.000Z");

assert.ok(bundle.files[PROJECT_MANIFEST_FILENAME].includes("center-pivot-project-archive-v1"));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes(sampleProject.id));
assert.ok(bundle.files[PROJECT_JSON_FILENAME].includes("pivot-project-v1"));
assert.ok(bundle.files[PROJECT_GEOJSON_FILENAME].includes("FeatureCollection"));
assert.ok(bundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME].includes("field_boundary"));
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
    installStatus: "available",
    attribution: "Local imagery",
    licenseText: "Offline permitted",
    importedAt: "2026-05-19T12:00:00.000Z",
  }],
});
assert.match(mapPackageCsv, /tileContentType/);
assert.match(mapPackageCsv, /vectorOverlay/);
assert.match(mapPackageCsv, /field-imagery/);

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
assert.equal(importedMapFeatureProject.mapFeatures?.length, 2);
assert.equal(importedMapFeatureProject.mapFeatures?.[0].kind, "pump_location");
assert.equal(importedMapFeatureProject.mapFeatures?.[1].geometry.type, "LineString");

const evidenceRecord: LayoutEvidenceRecord = {
  id: "evidence-001",
  projectId: sampleProject.id,
  sourceKind: "imagery",
  createdAt: "2026-05-22T12:00:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Operator traced a visible road edge for review.",
  geometry: sampleProject.fieldBoundary.slice(0, 3),
  imagery: {
    providerId: "usgs-tnm-imagery-only",
    providerName: "USGS TNM Imagery Only",
    sourceUrl: "https://basemap.nationalmap.gov/",
    accessedAt: "2026-05-22T12:00:00.000Z",
    attribution: "USGS The National Map",
    licenseText: "Public domain U.S. Government source; verify downstream source notices.",
    offlineCopyAllowed: false,
    keyedService: false,
  },
  confidence: 0.72,
  reviewStatus: "unreviewed",
};
const modelRecommendation: ModelRecommendation = {
  id: "recommendation-001",
  projectId: sampleProject.id,
  modelName: "baseline-local-ranker",
  modelVersion: "0.1.0",
  createdAt: "2026-05-22T12:05:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Move pivot center east to reduce outside-field acres.",
  proposedGeometry: {
    projectCrs: sampleProject.projectCrs,
    pivotCenter: { x: sampleProject.pivotCenter.x + 10, y: sampleProject.pivotCenter.y },
    fieldBoundary: sampleProject.fieldBoundary,
  },
  confidence: 0.61,
  evidenceIds: [evidenceRecord.id],
  reviewStatus: "unreviewed",
  score: 88.2,
  warnings: [],
};
const layoutDecision: LayoutDecisionRecord = {
  id: "decision-001",
  projectId: sampleProject.id,
  createdAt: "2026-05-22T12:10:00.000Z",
  decidedBy: "operator",
  decision: "deferred",
  recommendationId: modelRecommendation.id,
  evidenceIds: [evidenceRecord.id],
  reason: "Needs field verification before production geometry changes.",
};
assert.match(layoutEvidenceToJsonl([evidenceRecord]), /Operator traced/);
assert.match(layoutDecisionsToJsonl([layoutDecision]), /field verification/);
assert.match(JSON.stringify(modelRecommendationsToProjectedGeoJson([modelRecommendation])), /project_crs_xy/);

const bundleWithAdjacentData = buildProjectArchiveBundle(
  sampleProject,
  result,
  exportScenarioGeoJson(sampleProject, result),
  "2026-05-19T12:00:00.000Z",
  {
    evidenceRecords: [evidenceRecord],
    modelRecommendations: [modelRecommendation],
    layoutDecisions: [layoutDecision],
  },
);
assert.ok(bundleWithAdjacentData.manifest.files.includes(LAYOUT_EVIDENCE_JSONL_FILENAME));
assert.ok(bundleWithAdjacentData.manifest.files.includes(LAYOUT_DECISIONS_JSONL_FILENAME));
assert.ok(bundleWithAdjacentData.manifest.files.includes(MODEL_RECOMMENDATIONS_GEOJSON_FILENAME));
assert.match(bundleWithAdjacentData.files[LAYOUT_EVIDENCE_JSONL_FILENAME], /"keyedService":false/);
assert.match(bundleWithAdjacentData.files[MODEL_RECOMMENDATIONS_GEOJSON_FILENAME], /"coordinateReferenceSystem": "project_crs_xy"/);
assert.throws(
  () => buildProjectArchiveBundle(sampleProject, result, exportScenarioGeoJson(sampleProject, result), "2026-05-19T12:00:00.000Z", {
    evidenceRecords: [{ ...evidenceRecord, projectId: "other-project" }],
  }),
  /belongs to other-project/,
);

const zipped = exportProjectArchiveZip(bundle);
assert.ok(zipped.byteLength > 500);

const imported = importProjectArchiveZip(zipped);
assert.equal(imported.id, sampleProject.id);
assert.equal(imported.projectCrs, "EPSG:32613");
assert.equal(imported.fieldBoundary.length, sampleProject.fieldBoundary.length);
assert.equal(imported.machine.spanLengthsMeters.length, sampleProject.machine.spanLengthsMeters.length);

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
      [LAYOUT_EVIDENCE_JSONL_FILENAME]: "",
    },
  })),
  /manifest\.json does not list/,
);

console.log("project archive tests passed");
