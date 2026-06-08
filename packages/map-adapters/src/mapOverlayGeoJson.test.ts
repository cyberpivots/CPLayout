import assert from "node:assert/strict";

import { defaultAppSettings, resolveReferenceOverlaySource, sampleProject } from "@cplayout/core";
import { evaluateLayout, planAdvisoryFieldPivots } from "@cplayout/geometry";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import { buildWorkbenchStyle } from "./mapWorkbenchStyle";

const beforeProjectGeometry = JSON.stringify({
  fieldBoundary: sampleProject.fieldBoundary,
  obstacles: sampleProject.obstacles,
  pivotCenter: sampleProject.pivotCenter,
});
const result = evaluateLayout(sampleProject);
const featureCollection = projectLayoutToWgs84FeatureCollection(sampleProject, result);
const advisoryFieldPivotPlan = planAdvisoryFieldPivots(sampleProject, {
  gridDivisions: 6,
  maxMachines: 3,
  candidatePoolSize: 24,
  collisionBufferMeters: sampleProject.machine.machineClearanceBufferMeters,
});
const featureCollectionWithAdvisoryPlan = projectLayoutToWgs84FeatureCollection(sampleProject, result, [], advisoryFieldPivotPlan);
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
    {
      id: "corner-footprint-a",
      name: "Corner Footprint A",
      kind: "corner_swing_limit" as const,
      geometry: { type: "Polygon" as const, vertices: sampleProject.fieldBoundary.slice(0, 3) },
      confidence: "user_estimated" as const,
    },
    {
      id: "end-gun-circle-a",
      name: "End Gun Circle A",
      kind: "end_gun_arc" as const,
      geometry: { type: "Circle" as const, center: sampleProject.pivotCenter, radiusMeters: 24 },
      confidence: "user_estimated" as const,
    },
  ],
};
const featureCollectionWithMapFeature = projectLayoutToWgs84FeatureCollection(projectWithMapFeature, evaluateLayout(projectWithMapFeature));
const boundsWithMapFeature = projectWgs84Bounds(projectWithMapFeature);
const settings = defaultAppSettings();
const workbenchStyleWithAdvisoryPlan = buildWorkbenchStyle(
  null,
  featureCollectionWithAdvisoryPlan,
  resolveReferenceOverlaySource({
    preferences: { ...settings.referenceOverlay, mode: "off" },
    mapPackages: [],
    target: "web_maplibre_gl_js",
  }),
  { ...settings.referenceOverlay, mode: "off" },
);

assert.equal(featureCollection.type, "FeatureCollection");
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "field_boundary"));
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "wheel_track_path" && feature.properties.renderOnly === true && feature.properties.canonicalGeometryMutation === false));
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "end_machine_path" && feature.properties.renderOnly === true && feature.properties.canonicalGeometryMutation === false));
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "wheel_track_path" && feature.geometry.type === "MultiPolygon"));
assert.ok(featureCollection.features.some((feature) => feature.properties.layerType === "end_machine_path" && feature.geometry.type === "MultiPolygon"));
assert.ok(featureCollectionWithAdvisoryPlan.features.some((feature) => feature.properties.layerType === "advisory_generated_field_pivot_coverage" && feature.properties.canonicalGeometryMutation === false));
assert.ok(featureCollectionWithAdvisoryPlan.features.some((feature) => feature.properties.layerType === "advisory_generated_field_pivot_center" && feature.properties.advisoryOnly === true));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "advisory-generated-field-pivot-fill"));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "advisory-generated-field-pivot-center"));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "wheel-track-fill"));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "wheel-track-line"));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "end-machine-path-fill"));
assert.ok(workbenchStyleWithAdvisoryPlan.layers.some((layer) => layer.id === "end-machine-path-line"));
assert.ok(featureCollectionWithMapFeature.features.some((feature) => feature.properties.layerType === "map_feature" && feature.properties.name === "Pipeline A"));
assert.ok(featureCollectionWithMapFeature.features.some((feature) => feature.properties.layerType === "map_feature" && feature.properties.name === "Corner Footprint A" && feature.geometry.type === "MultiPolygon"));
assert.ok(featureCollectionWithMapFeature.features.some((feature) => feature.properties.layerType === "map_feature" && feature.properties.name === "End Gun Circle A" && feature.geometry.type === "MultiPolygon"));
assert.ok(bounds.every((value) => Number.isFinite(value)));
assert.ok(boundsWithMapFeature.every((value) => Number.isFinite(value)));
assert.ok(center.every((value) => Number.isFinite(value)));
assert.equal(JSON.stringify({
  fieldBoundary: sampleProject.fieldBoundary,
  obstacles: sampleProject.obstacles,
  pivotCenter: sampleProject.pivotCenter,
}), beforeProjectGeometry);

console.log("map overlay GeoJSON tests passed");
