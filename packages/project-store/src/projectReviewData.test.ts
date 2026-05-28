import assert from "node:assert/strict";

import { deriveRecommendationReviewState, sampleProject, type LayoutDecisionRecord, type ModelRecommendation } from "@cplayout/core";
import {
  appendLayoutDecisionAsync,
  importModelRecommendationsAsync,
  loadProjectReviewDataAsync,
  modelRecommendationsToProjectedGeoJson,
  PROJECT_REVIEW_DATA_SCHEMA_VERSION,
  projectRepository,
  saveProjectReviewDataAsync,
} from "./index";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
});

const recommendation: ModelRecommendation = {
  id: "rec-browser-001",
  projectId: sampleProject.id,
  modelName: "baseline-local-ranker",
  modelVersion: "0.1.0",
  createdAt: "2026-05-28T12:00:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Move pivot center slightly east for review.",
  proposedGeometry: {
    projectCrs: sampleProject.projectCrs,
    pivotCenter: { x: sampleProject.pivotCenter.x + 12, y: sampleProject.pivotCenter.y },
  },
  confidence: 0.68,
  evidenceIds: [],
  reviewStatus: "unreviewed",
  score: 84.2,
  warnings: ["Baseline recommender only; verify before geometry edits."],
};

async function run(): Promise<void> {
  globalThis.localStorage.clear();
  await projectRepository.saveProjectAsync(sampleProject);
  await saveProjectReviewDataAsync(sampleProject.id, { modelRecommendations: [recommendation] });
  const saved = await loadProjectReviewDataAsync(sampleProject.id);
  assert.equal(saved.modelRecommendations.length, 1);
  assert.equal(saved.modelRecommendations[0]?.id, recommendation.id);
  assert.match(globalThis.localStorage.getItem(reviewStorageKey(sampleProject.id)) ?? "", new RegExp(PROJECT_REVIEW_DATA_SCHEMA_VERSION));

  globalThis.localStorage.setItem(reviewStorageKey(`${sampleProject.id}-legacy`), JSON.stringify({
    evidenceRecords: [],
    modelRecommendations: [],
    layoutDecisions: [],
  }));
  assert.deepEqual(await loadProjectReviewDataAsync(`${sampleProject.id}-legacy`), {
    evidenceRecords: [],
    modelRecommendations: [],
    layoutDecisions: [],
  });

  const decision: LayoutDecisionRecord = {
    id: "decision-browser-001",
    projectId: sampleProject.id,
    createdAt: "2026-05-28T12:05:00.000Z",
    decidedBy: "operator",
    decision: "accepted",
    recommendationId: recommendation.id,
    evidenceIds: [],
    reason: "Accepted for planning review only; no geometry mutation.",
  };
  await appendLayoutDecisionAsync(sampleProject.id, decision);
  const decided = await loadProjectReviewDataAsync(sampleProject.id);
  assert.equal(decided.layoutDecisions.length, 1);
  assert.equal(decided.modelRecommendations[0]?.reviewStatus, "unreviewed");
  assert.equal(deriveRecommendationReviewState(decided.modelRecommendations[0] as ModelRecommendation, decided.layoutDecisions), "accepted");
  const reloadedProject = await projectRepository.loadProjectAsync(sampleProject.id);
  assert.deepEqual(reloadedProject?.pivotCenter, sampleProject.pivotCenter);

  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{ ...recommendation, id: "wrong-project", projectId: "other" }]),
    /belongs to other/,
  );
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{ ...recommendation, id: "wrong-crs", projectCrs: "EPSG:3857", proposedGeometry: { projectCrs: "EPSG:3857" } }]),
    /uses EPSG:3857/,
  );
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{ ...recommendation, id: "geographic", projectCrs: "EPSG:4326", proposedGeometry: { projectCrs: "EPSG:4326" } }]),
    /projected/i,
  );
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, { schemaVersion: "future", type: "FeatureCollection", features: [] }),
    /Unsupported model recommendation schema version/,
  );
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, { type: "FeatureCollection", features: [] }),
    /Unsupported model recommendation schema version/,
  );
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{ ...recommendation, imagery: { keyedService: true } }]),
    /hidden-key imagery provenance/,
  );

  const imported = await importModelRecommendationsAsync(sampleProject.id, JSON.stringify([{
    ...recommendation,
    id: "rec-browser-002",
    reviewStatus: "unreviewed",
  }]));
  assert.equal(imported.length, 1);
  assert.equal((await loadProjectReviewDataAsync(sampleProject.id)).modelRecommendations.length, 2);

  const geoJson = modelRecommendationsToProjectedGeoJson([{
    ...recommendation,
    id: "rec-browser-geojson",
    proposedGeometry: {
      projectCrs: sampleProject.projectCrs,
      pivotCenter: { x: sampleProject.pivotCenter.x + 7, y: sampleProject.pivotCenter.y },
      fieldBoundary: sampleProject.fieldBoundary,
    },
  }]);
  const geoJsonImported = await importModelRecommendationsAsync(sampleProject.id, geoJson);
  assert.equal(geoJsonImported.length, 1);
  assert.equal(geoJsonImported[0]?.proposedGeometry.fieldBoundary?.length, sampleProject.fieldBoundary.length);

  const mismatchedGroupedGeoJson = modelRecommendationsToProjectedGeoJson([{
    ...recommendation,
    id: "rec-browser-mixed-group",
    proposedGeometry: {
      projectCrs: sampleProject.projectCrs,
      pivotCenter: { x: sampleProject.pivotCenter.x + 9, y: sampleProject.pivotCenter.y },
      fieldBoundary: sampleProject.fieldBoundary,
    },
  }]) as { features: Array<{ properties: Record<string, unknown> }> };
  mismatchedGroupedGeoJson.features[1] = {
    ...mismatchedGroupedGeoJson.features[1],
    properties: {
      ...mismatchedGroupedGeoJson.features[1]?.properties,
      projectId: "other-project",
    },
  };
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, mismatchedGroupedGeoJson),
    /mismatched projectId/,
  );

  const duplicatePivotGeoJson = modelRecommendationsToProjectedGeoJson([{
    ...recommendation,
    id: "rec-browser-duplicate-pivot",
  }]) as { features: unknown[] };
  duplicatePivotGeoJson.features.push(duplicatePivotGeoJson.features[0]);
  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, duplicatePivotGeoJson),
    /duplicate pivot_center/,
  );

  const corruptStorage = "{invalid json";
  globalThis.localStorage.setItem(reviewStorageKey("corrupt-project"), corruptStorage);
  await assert.rejects(
    () => loadProjectReviewDataAsync("corrupt-project"),
    /not valid JSON/,
  );
  assert.equal(globalThis.localStorage.getItem(reviewStorageKey("corrupt-project")), corruptStorage);

  console.log("project review data tests passed");
}

function reviewStorageKey(projectId: string): string {
  return `center-pivot-layout-review-data-v1:${projectId}`;
}

run().catch((error: unknown) => {
  throw error;
});
