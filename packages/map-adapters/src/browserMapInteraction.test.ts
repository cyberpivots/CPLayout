import assert from "node:assert/strict";

import { projectXyToLonLat, sampleProject } from "@cplayout/core";

import { browserMapClickToProjectedIntent } from "./browserMapInteraction";
import { mapClickToProjectedIntent } from "./mapClickIntent";

const lonLat = projectXyToLonLat(sampleProject.pivotCenter, sampleProject.projectCrs);

const boundaryParams = {
  activeLayer: "field_boundary",
  featureGeometry: "LineString",
  featureKind: "underground_pipeline",
  imageryEnabled: true,
  lonLat,
  mode: "draw_boundary",
  projectCrs: sampleProject.projectCrs,
  workflowMode: "design",
} as const;
const boundaryIntent = mapClickToProjectedIntent(boundaryParams);
assert.deepEqual(browserMapClickToProjectedIntent(boundaryParams), boundaryIntent);
assert.equal(boundaryIntent.type, "draft_vertex");
if (boundaryIntent.type === "draft_vertex") {
  assert.ok(Math.abs(boundaryIntent.vertex.x - sampleProject.pivotCenter.x) < 0.01);
  assert.ok(Math.abs(boundaryIntent.vertex.y - sampleProject.pivotCenter.y) < 0.01);
}

const surveyIntent = mapClickToProjectedIntent({
  activeLayer: "control_point",
  featureGeometry: "LineString",
  featureKind: "underground_pipeline",
  imageryEnabled: true,
  lonLat,
  mode: "capture_point",
  projectCrs: sampleProject.projectCrs,
  workflowMode: "design",
});
assert.equal(surveyIntent.type, "add_survey_point");
if (surveyIntent.type === "add_survey_point") {
  assert.equal(surveyIntent.point.confidence, "imagery_digitized");
  assert.equal(surveyIntent.point.role, "control");
  assert.deepEqual(surveyIntent.point.wgs84, lonLat);
}

const layoutIntent = mapClickToProjectedIntent({
  activeLayer: "field_boundary",
  featureGeometry: "LineString",
  featureKind: "underground_pipeline",
  imageryEnabled: true,
  lonLat,
  mode: "draw_boundary",
  projectCrs: sampleProject.projectCrs,
  workflowMode: "layout",
});
assert.deepEqual(layoutIntent, { type: "none", reason: "layout_mode_no_mutation" });

console.log("map click intent tests passed");
