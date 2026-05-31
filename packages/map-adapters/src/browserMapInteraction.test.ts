import assert from "node:assert/strict";

import { projectXyToLonLat, sampleProject } from "@cplayout/core";

import { browserMapClickToProjectedIntent } from "./browserMapInteraction";

const lonLat = projectXyToLonLat(sampleProject.pivotCenter, sampleProject.projectCrs);

const boundaryIntent = browserMapClickToProjectedIntent({
  activeLayer: "field_boundary",
  featureGeometry: "LineString",
  featureKind: "underground_pipeline",
  imageryEnabled: true,
  lonLat,
  mode: "draw_boundary",
  projectCrs: sampleProject.projectCrs,
  workflowMode: "design",
});
assert.equal(boundaryIntent.type, "draft_vertex");
if (boundaryIntent.type === "draft_vertex") {
  assert.ok(Math.abs(boundaryIntent.vertex.x - sampleProject.pivotCenter.x) < 0.01);
  assert.ok(Math.abs(boundaryIntent.vertex.y - sampleProject.pivotCenter.y) < 0.01);
}

const surveyIntent = browserMapClickToProjectedIntent({
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

const reviewIntent = browserMapClickToProjectedIntent({
  activeLayer: "field_boundary",
  featureGeometry: "LineString",
  featureKind: "underground_pipeline",
  imageryEnabled: true,
  lonLat,
  mode: "draw_boundary",
  projectCrs: sampleProject.projectCrs,
  workflowMode: "layout",
});
assert.deepEqual(reviewIntent, { type: "none", reason: "review_layout_no_mutation" });

console.log("browser map interaction tests passed");
