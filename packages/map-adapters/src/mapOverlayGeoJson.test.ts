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
const projectWithMapFeature = {
  ...sampleProject,
  mapFeatures: [
    {
      id: "pipeline-a",
      name: "Pipeline A",
      kind: "underground_pipeline" as const,
      geometry: { type: "LineString" as const, vertices: sampleProject.fieldBoundary.slice(0, 2) },
      confidence: "imagery_digitized" as const,
    },
  ],
};
const featureCollectionWithMapFeature = projectLayoutToWgs84FeatureCollection(projectWithMapFeature, evaluateLayout(projectWithMapFeature));
const boundsWithMapFeature = projectWgs84Bounds(projectWithMapFeature);

assert.equal(featureCollection.type, "FeatureCollection");
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "field_boundary"));
assert.ok(featureCollectionWithMapFeature.features.some((feature) => feature.properties.layerType === "map_feature" && feature.properties.name === "Pipeline A"));
assert.ok(bounds.every((value) => Number.isFinite(value)));
assert.ok(boundsWithMapFeature.every((value) => Number.isFinite(value)));
assert.ok(center.every((value) => Number.isFinite(value)));
assert.equal(JSON.stringify({
  fieldBoundary: sampleProject.fieldBoundary,
  obstacles: sampleProject.obstacles,
  pivotCenter: sampleProject.pivotCenter,
}), beforeProjectGeometry);

console.log("map overlay GeoJSON tests passed");
