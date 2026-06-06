import assert from "node:assert/strict";

import { importProjectedGeoJsonToProject, importSurveyCsvToProject } from "./projectImports";
import { createProjectEditorState, reduceProjectEditorState } from "./projectReducer";
import { sampleProject } from "./sampleProject";

const boundary = [
  { x: 501000, y: 4506000 },
  { x: 501200, y: 4506000 },
  { x: 501200, y: 4506200 },
  { x: 501000, y: 4506200 },
];

let state = createProjectEditorState(sampleProject);
const noOpSettingsState = reduceProjectEditorState(state, {
  type: "update_project_settings",
  unitSystem: sampleProject.unitSystem,
  settings: sampleProject.settings!,
});
assert.equal(noOpSettingsState.revision, 0);
assert.equal(noOpSettingsState.past.length, 0);

const mapPackageState = reduceProjectEditorState(state, {
  type: "upsert_map_package",
  mapPackage: {
    id: "naip-logical-package",
    name: "NAIP logical package",
    packageType: "raster_tiles",
    tileContentType: "raster",
    uri: "app://map-packages/naip-logical-package/",
    minZoom: 12,
    maxZoom: 18,
    tileScheme: "xyz",
    boundsWgs84: {
      minLongitude: -105.2,
      minLatitude: 40.01,
      maxLongitude: -105.1,
      maxLatitude: 40.08,
    },
    tileJsonUrl: "app://map-packages/naip-logical-package/tilejson.json",
    tileUrlTemplates: ["app://map-packages/naip-logical-package/tiles/{z}/{x}/{y}.png"],
    imageryProvenance: {
      providerId: "usgs_naip",
      providerName: "USGS EROS NAIP",
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
  },
});
assert.equal(mapPackageState.project.mapPackages?.[0].id, "naip-logical-package");
assert.deepEqual(mapPackageState.project.fieldBoundary, state.project.fieldBoundary);
assert.equal(mapPackageState.lastError, null);

state = reduceProjectEditorState(state, { type: "commit_boundary_draft", vertices: boundary });
assert.equal(state.project.fieldBoundary.length, 4);
assert.equal(state.past.length, 1);
assert.equal(state.lastError, null);

state = reduceProjectEditorState(state, {
  type: "commit_obstacle_draft",
  confidence: "rtk_fixed",
  kind: "exclusion",
  name: "Test exclusion",
  vertices: [
    { x: 501020, y: 4506020 },
    { x: 501040, y: 4506020 },
    { x: 501040, y: 4506040 },
  ],
});
assert.equal(state.project.obstacles.at(-1)?.name, "Test exclusion");
assert.equal(state.project.obstacles.at(-1)?.confidence, "rtk_fixed");

state = reduceProjectEditorState(state, { type: "undo" });
assert.notEqual(state.project.obstacles.at(-1)?.name, "Test exclusion");
state = reduceProjectEditorState(state, { type: "redo" });
assert.equal(state.project.obstacles.at(-1)?.name, "Test exclusion");

state = reduceProjectEditorState(state, {
  type: "move_boundary_vertex",
  vertexIndex: 0,
  point: { x: 500990, y: 4505990 },
});
assert.deepEqual(state.project.fieldBoundary[0], { x: 500990, y: 4505990 });
state = reduceProjectEditorState(state, { type: "undo" });
assert.deepEqual(state.project.fieldBoundary[0], boundary[0]);
state = reduceProjectEditorState(state, { type: "redo" });
assert.deepEqual(state.project.fieldBoundary[0], { x: 500990, y: 4505990 });

state = reduceProjectEditorState(state, {
  type: "add_survey_point",
  point: {
    id: "survey-map-capture",
    label: "Map capture",
    role: "water_source",
    projected: { x: 501060, y: 4506060 },
    observedAt: "2026-05-19T12:00:00.000Z",
    source: "manual",
    confidence: "imagery_digitized",
  },
});
assert.equal(state.project.surveyPoints.some((point) => point.id === "survey-map-capture"), true);
state = reduceProjectEditorState(state, { type: "promote_survey_point", id: "survey-map-capture", target: "water_source" });
assert.deepEqual(state.project.waterSource, { x: 501060, y: 4506060 });
state = reduceProjectEditorState(state, {
  type: "update_survey_point",
  point: {
    ...state.project.surveyPoints.find((point) => point.id === "survey-map-capture")!,
    label: "Updated map capture",
  },
});
assert.equal(state.project.surveyPoints.find((point) => point.id === "survey-map-capture")?.label, "Updated map capture");
state = reduceProjectEditorState(state, { type: "undo" });
assert.equal(state.project.surveyPoints.find((point) => point.id === "survey-map-capture")?.label, "Map capture");
state = reduceProjectEditorState(state, { type: "redo" });
assert.equal(state.project.surveyPoints.find((point) => point.id === "survey-map-capture")?.label, "Updated map capture");
state = reduceProjectEditorState(state, { type: "delete_survey_point", id: "survey-map-capture" });
assert.equal(state.project.surveyPoints.some((point) => point.id === "survey-map-capture"), false);

state = reduceProjectEditorState(state, {
  type: "add_map_feature",
  feature: {
    id: "pipeline-a",
    name: "Pipeline A",
    kind: "underground_pipeline",
    geometry: { type: "LineString", vertices: boundary.slice(0, 3) },
    confidence: "user_estimated",
  },
});
assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "pipeline-a"), true);
const beforeLineFeatureEditPivotCenter = state.project.pivotCenter;
state = reduceProjectEditorState(state, {
  type: "move_map_feature_vertex",
  featureId: "pipeline-a",
  vertexIndex: 1,
  point: { x: 501225, y: 4506005 },
});
const movedPipelineGeometry = state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.geometry;
assert.equal(movedPipelineGeometry?.type, "LineString");
if (movedPipelineGeometry?.type === "LineString") {
  assert.deepEqual(movedPipelineGeometry.vertices[1], { x: 501225, y: 4506005 });
}
assert.deepEqual(state.project.pivotCenter, beforeLineFeatureEditPivotCenter);
assert.equal(state.project.wgs84Companion?.mapFeatures?.some((feature) => feature.id === "pipeline-a" && feature.geometry.type === "LineString"), true);
state = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "pipeline-a",
  vertexIndex: 2,
});
const shortenedPipelineGeometry = state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.geometry;
assert.equal(shortenedPipelineGeometry?.type, "LineString");
if (shortenedPipelineGeometry?.type === "LineString") {
  assert.equal(shortenedPipelineGeometry.vertices.length, 2);
}
const beforeInvalidLineFeatureDelete = state.project;
const invalidLineFeatureDelete = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "pipeline-a",
  vertexIndex: 1,
});
assert.equal(invalidLineFeatureDelete.lastError, "Map feature line needs at least two vertices before commit.");
assert.equal(invalidLineFeatureDelete.project, beforeInvalidLineFeatureDelete);
state = reduceProjectEditorState(state, {
  type: "update_map_feature",
  feature: {
    ...state.project.mapFeatures!.find((feature) => feature.id === "pipeline-a")!,
    name: "Updated Pipeline A",
  },
});
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.name, "Updated Pipeline A");
state = reduceProjectEditorState(state, { type: "undo" });
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.name, "Pipeline A");
state = reduceProjectEditorState(state, { type: "redo" });
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.name, "Updated Pipeline A");
state = reduceProjectEditorState(state, { type: "delete_map_feature", id: "pipeline-a" });
assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "pipeline-a"), false);
state = reduceProjectEditorState(state, { type: "undo" });
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "pipeline-a")?.name, "Updated Pipeline A");
state = reduceProjectEditorState(state, { type: "redo" });
assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "pipeline-a"), false);

state = reduceProjectEditorState(state, {
  type: "add_map_feature",
  feature: {
    id: "corner-footprint-a",
    name: "Corner Footprint A",
    kind: "corner_swing_limit",
    geometry: { type: "Polygon", vertices: boundary },
    confidence: "user_estimated",
  },
});
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "corner-footprint-a")?.geometry.type, "Polygon");
state = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "corner-footprint-a",
  vertexIndex: 3,
});
const shortenedCornerGeometry = state.project.mapFeatures?.find((feature) => feature.id === "corner-footprint-a")?.geometry;
assert.equal(shortenedCornerGeometry?.type, "Polygon");
if (shortenedCornerGeometry?.type === "Polygon") {
  assert.equal(shortenedCornerGeometry.vertices.length, 3);
}
const invalidPolygonDelete = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "corner-footprint-a",
  vertexIndex: 2,
});
assert.equal(invalidPolygonDelete.lastError, "Map feature polygon needs at least three vertices before commit.");
assert.equal(invalidPolygonDelete.project, state.project);
state = reduceProjectEditorState(state, {
  type: "add_map_feature",
  feature: {
    id: "end-gun-circle-a",
    name: "End Gun Circle A",
    kind: "end_gun_arc",
    geometry: { type: "Circle", center: state.project.pivotCenter, radiusMeters: 24 },
    confidence: "user_estimated",
  },
});
assert.equal(state.project.mapFeatures?.find((feature) => feature.id === "end-gun-circle-a")?.geometry.type, "Circle");
assert.equal(state.project.wgs84Companion?.mapFeatures?.some((feature) => feature.id === "end-gun-circle-a" && feature.geometry.type === "Circle"), true);
state = reduceProjectEditorState(state, {
  type: "move_map_feature_vertex",
  featureId: "end-gun-circle-a",
  vertexIndex: 0,
  point: { x: state.project.pivotCenter.x + 14, y: state.project.pivotCenter.y + 6 },
});
const movedEndGunGeometry = state.project.mapFeatures?.find((feature) => feature.id === "end-gun-circle-a")?.geometry;
assert.equal(movedEndGunGeometry?.type, "Circle");
if (movedEndGunGeometry?.type === "Circle") {
  assert.deepEqual(movedEndGunGeometry.center, { x: state.project.pivotCenter.x + 14, y: state.project.pivotCenter.y + 6 });
}
const invalidCircleFeatureDelete = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "end-gun-circle-a",
  vertexIndex: 0,
});
assert.equal(invalidCircleFeatureDelete.lastError, "Map feature center cannot be deleted; delete the feature instead.");
assert.equal(invalidCircleFeatureDelete.project, state.project);
state = reduceProjectEditorState(state, {
  type: "add_map_feature",
  feature: {
    id: "pump-point-a",
    name: "Pump Point A",
    kind: "pump_location",
    geometry: { type: "Point", point: { x: state.project.pivotCenter.x - 8, y: state.project.pivotCenter.y - 9 } },
    confidence: "user_estimated",
  },
});
state = reduceProjectEditorState(state, {
  type: "move_map_feature_vertex",
  featureId: "pump-point-a",
  vertexIndex: 0,
  point: { x: state.project.pivotCenter.x - 4, y: state.project.pivotCenter.y - 5 },
});
const movedPumpGeometry = state.project.mapFeatures?.find((feature) => feature.id === "pump-point-a")?.geometry;
assert.equal(movedPumpGeometry?.type, "Point");
if (movedPumpGeometry?.type === "Point") {
  assert.deepEqual(movedPumpGeometry.point, { x: state.project.pivotCenter.x - 4, y: state.project.pivotCenter.y - 5 });
}
const invalidPointFeatureDelete = reduceProjectEditorState(state, {
  type: "delete_map_feature_vertex",
  featureId: "pump-point-a",
  vertexIndex: 0,
});
assert.equal(invalidPointFeatureDelete.lastError, "Map feature point cannot be deleted; delete the feature instead.");
assert.equal(invalidPointFeatureDelete.project, state.project);
const beforeUpsertPivotCenter = state.project.pivotCenter;
const machineZoneUpsertState = reduceProjectEditorState(state, {
  type: "upsert_map_features",
  features: [
    {
      id: "generated-field-pivot-zone-1",
      name: "Generated Pivot Zone 1",
      kind: "machine_zone",
      geometry: { type: "Circle", center: { x: state.project.pivotCenter.x + 10, y: state.project.pivotCenter.y + 10 }, radiusMeters: 180 },
      confidence: "optimized",
      notes: "Generated advisory review zone; not a saved pivot.",
      properties: {
        advisoryOnly: true,
        canonicalGeometryMutation: false,
        qualifiedReviewRequired: true,
        generatedFieldPivotSequence: 1,
      },
    },
    {
      id: "generated-field-pivot-zone-2",
      name: "Generated Pivot Zone 2",
      kind: "machine_zone",
      geometry: { type: "Circle", center: { x: state.project.pivotCenter.x + 260, y: state.project.pivotCenter.y + 10 }, radiusMeters: 180 },
      confidence: "optimized",
    },
  ],
});
assert.equal(machineZoneUpsertState.project.mapFeatures?.filter((feature) => feature.kind === "machine_zone").length, 2);
assert.deepEqual(machineZoneUpsertState.project.pivotCenter, beforeUpsertPivotCenter);
assert.equal(machineZoneUpsertState.revision, state.revision + 1);
assert.equal(machineZoneUpsertState.project.wgs84Companion?.mapFeatures?.some((feature) => feature.id === "generated-field-pivot-zone-1" && feature.geometry.type === "Circle"), true);
const updatedMachineZoneUpsertState = reduceProjectEditorState(machineZoneUpsertState, {
  type: "upsert_map_features",
  features: [
    {
      ...machineZoneUpsertState.project.mapFeatures!.find((feature) => feature.id === "generated-field-pivot-zone-1")!,
      name: "Updated Generated Pivot Zone 1",
    },
  ],
});
assert.equal(updatedMachineZoneUpsertState.project.mapFeatures?.filter((feature) => feature.id.startsWith("generated-field-pivot-zone-")).length, 2);
assert.equal(updatedMachineZoneUpsertState.project.mapFeatures?.find((feature) => feature.id === "generated-field-pivot-zone-1")?.name, "Updated Generated Pivot Zone 1");

const obstacleId = state.project.obstacles.at(-1)?.id ?? "";
state = reduceProjectEditorState(state, {
  type: "move_obstacle_vertex",
  obstacleId,
  vertexIndex: 1,
  point: { x: 501050, y: 4506025 },
});
assert.deepEqual(state.project.obstacles.at(-1)?.polygon[1], { x: 501050, y: 4506025 });

state = reduceProjectEditorState(state, { type: "delete_obstacle_vertex", obstacleId, vertexIndex: 2 });
assert.equal(state.lastError, "Obstacle needs at least three vertices before commit.");
assert.equal(state.project.obstacles.at(-1)?.polygon.length, 3);

const replacedObstacleVertices = [
  { x: 501010, y: 4506010 },
  { x: 501060, y: 4506010 },
  { x: 501060, y: 4506060 },
  { x: 501010, y: 4506060 },
];
state = reduceProjectEditorState(state, { type: "replace_obstacle_polygon", obstacleId, vertices: replacedObstacleVertices });
assert.deepEqual(state.project.obstacles.find((obstacle) => obstacle.id === obstacleId)?.polygon, replacedObstacleVertices);
const invalidObstacleReplace = reduceProjectEditorState(state, {
  type: "replace_obstacle_polygon",
  obstacleId,
  vertices: replacedObstacleVertices.slice(0, 2),
});
assert.match(invalidObstacleReplace.lastError ?? "", /at least three vertices/);
assert.deepEqual(invalidObstacleReplace.project.obstacles.find((obstacle) => obstacle.id === obstacleId)?.polygon, replacedObstacleVertices);

const deletedBoundary = reduceProjectEditorState(state, { type: "delete_boundary_vertex", vertexIndex: 3 });
assert.equal(deletedBoundary.project.fieldBoundary.length, 3);

const invalid = reduceProjectEditorState(state, { type: "commit_boundary_draft", vertices: [{ x: 1, y: 2 }] });
assert.match(invalid.lastError ?? "", /at least three vertices/);
assert.equal(invalid.project, state.project);

const projectedGeoJson = {
  type: "FeatureCollection",
  properties: { projectCrs: sampleProject.projectCrs },
  features: [
    {
      type: "Feature",
      properties: { layerType: "field_boundary" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [501000, 4506000],
          [501300, 4506000],
          [501300, 4506300],
          [501000, 4506300],
          [501000, 4506000],
        ]],
      },
    },
  ],
};
assert.equal(importProjectedGeoJsonToProject(sampleProject, projectedGeoJson).importedBoundary, true);

assert.throws(
  () => importProjectedGeoJsonToProject(sampleProject, {
    ...projectedGeoJson,
    properties: { projectCrs: "EPSG:4326" },
  }),
  /WGS84 is an input\/display layer only/,
);

assert.throws(
  () => importProjectedGeoJsonToProject(sampleProject, {
    ...projectedGeoJson,
    properties: {},
  }),
  /properties\.projectCrs/,
);

assert.throws(
  () => importProjectedGeoJsonToProject(sampleProject, {
    ...projectedGeoJson,
    properties: { projectCrs: "EPSG:3857" },
  }),
  /does not match project CRS/,
);

assert.equal(
  importSurveyCsvToProject(sampleProject, "id,label,role,x,y,source,confidence\np1,Point 1,control,501010,4506010,imported,rtk_fixed\n").importedPointCount,
  1,
);
assert.throws(() => importSurveyCsvToProject(sampleProject, "id,label,longitude,latitude\np1,No XY,-104,40\n"), /projected x and y/);

const importedProjectState = reduceProjectEditorState(createProjectEditorState(sampleProject), {
  type: "apply_project_import",
  project: {
    ...sampleProject,
    name: "Imported project state",
    fieldBoundary: boundary,
  },
});
assert.equal(importedProjectState.project.name, "Imported project state");
assert.equal(importedProjectState.project.fieldBoundary.length, 4);
assert.equal(importedProjectState.past.length, 1);

console.log("project reducer/import tests passed");
