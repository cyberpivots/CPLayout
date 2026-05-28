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

state = reduceProjectEditorState(state, { type: "commit_boundary_draft", vertices: boundary });
assert.equal(state.project.fieldBoundary.length, 4);
assert.equal(state.past.length, 1);
assert.equal(state.lastError, null);

state = reduceProjectEditorState(state, {
  type: "commit_obstacle_draft",
  kind: "exclusion",
  name: "Test exclusion",
  vertices: [
    { x: 501020, y: 4506020 },
    { x: 501040, y: 4506020 },
    { x: 501040, y: 4506040 },
  ],
});
assert.equal(state.project.obstacles.at(-1)?.name, "Test exclusion");

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
