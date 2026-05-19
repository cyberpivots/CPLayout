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

assert.equal(
  importSurveyCsvToProject(sampleProject, "id,label,role,x,y,source,confidence\np1,Point 1,control,501010,4506010,imported,rtk_fixed\n").importedPointCount,
  1,
);
assert.throws(() => importSurveyCsvToProject(sampleProject, "id,label,longitude,latitude\np1,No XY,-104,40\n"), /projected x and y/);

console.log("project reducer/import tests passed");
