import assert from "node:assert/strict";

import { sampleProject } from "@cplayout/core";
import { evaluateLayout } from "@cplayout/geometry";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";

const beforeProjectGeometry = JSON.stringify({
  fieldBoundary: sampleProject.fieldBoundary,
  obstacles: sampleProject.obstacles,
  pivotCenter: sampleProject.pivotCenter,
});
const result = evaluateLayout(sampleProject);
const featureCollection = projectLayoutToWgs84FeatureCollection(sampleProject, result);
const bounds = projectWgs84Bounds(sampleProject);
const center = projectWgs84Center(sampleProject);

assert.equal(featureCollection.type, "FeatureCollection");
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "field_boundary"));
assert.ok(bounds.every((value) => Number.isFinite(value)));
assert.ok(center.every((value) => Number.isFinite(value)));
assert.equal(JSON.stringify({
  fieldBoundary: sampleProject.fieldBoundary,
  obstacles: sampleProject.obstacles,
  pivotCenter: sampleProject.pivotCenter,
}), beforeProjectGeometry);

console.log("map overlay GeoJSON tests passed");
