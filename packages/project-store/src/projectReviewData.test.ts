import assert from "node:assert/strict";

import { deriveRecommendationReviewState, sampleProject, type LayoutDecisionRecord, type ModelRecommendation } from "@cplayout/core";
import {
  appendLayoutDecisionAsync,
  appendGeneratedModelRecommendationsAsync,
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

  const generatedData = await appendGeneratedModelRecommendationsAsync(sampleProject, [{
    ...recommendation,
    id: "rec-generated-browser",
    scoreBreakdown: {
      coverage: 10,
      outsideField: 0,
      obstacle: 0,
      distance: -1,
      feasibility: 35,
    },
    metadata: {
      feasible: true,
      sourceSeed: "visual_center",
    },
  }]);
  assert.equal(generatedData.modelRecommendations.some((item) => item.id === "rec-generated-browser"), true);
  assert.equal(generatedData.modelRecommendations.find((item) => item.id === "rec-generated-browser")?.reviewStatus, "unreviewed");

  await assert.rejects(
    () => appendGeneratedModelRecommendationsAsync(sampleProject, [{
      ...recommendation,
      id: "rec-generated-wrong-crs",
      projectCrs: "EPSG:3857",
      proposedGeometry: { projectCrs: "EPSG:3857", pivotCenter: sampleProject.pivotCenter },
    }]),
    /does not match project CRS/,
  );

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
    /Unsupported review import schema version/,
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
  assert.equal((await loadProjectReviewDataAsync(sampleProject.id)).modelRecommendations.length, 3);

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

  const visualReviewImported = await importModelRecommendationsAsync(sampleProject.id, {
    schemaVersion: "cplayout-design-vision-review-v1",
    createdAt: "2026-05-29T00:00:00.000Z",
    projectId: sampleProject.id,
    projectCrs: sampleProject.projectCrs,
    canonicalGeometryMutation: false,
    artifacts: {
      mapCanvasCrop: { path: "map.png", sha256: "a".repeat(64), image: { width: 100, height: 80 } },
    },
    metrics: {
      centerOffsetRatio: 0.007,
      radiusMismatchRatio: 0.0477,
      detectionConfidence: 0.72,
    },
    layoutEvidenceRecords: [{
      id: "vision-evidence-001",
      projectId: sampleProject.id,
      sourceKind: "layout_score",
      createdAt: "2026-05-29T00:00:00.000Z",
      projectCrs: sampleProject.projectCrs,
      summary: "CV packet passed image-space checks.",
      confidence: 0.72,
      reviewStatus: "unreviewed",
    }],
    modelRecommendations: [{
      ...recommendation,
      id: "rec-visual-review-json",
      evidenceIds: ["vision-evidence-001"],
      proposedGeometry: {
        projectCrs: sampleProject.projectCrs,
        fieldBoundary: sampleProject.fieldBoundary,
        pivotCenter: sampleProject.pivotCenter,
      },
    }],
    layoutDecisionRecords: [{
      id: "vision-decision-placeholder",
      projectId: sampleProject.id,
      createdAt: "2026-05-29T00:00:00.000Z",
      decidedBy: "test_fixture",
      decision: "deferred",
      recommendationId: "rec-visual-review-json",
      evidenceIds: ["vision-evidence-001"],
      reason: "Operator review required.",
    }],
  });
  assert.equal(visualReviewImported.length, 1);
  const visualReviewData = await loadProjectReviewDataAsync(sampleProject.id);
  assert.equal(visualReviewData.evidenceRecords.some((record) => record.id === "vision-evidence-001"), true);
  assert.equal(visualReviewData.layoutDecisions.some((decisionRecord) => decisionRecord.id === "vision-decision-placeholder"), true);
  assert.equal((visualReviewData.evidenceRecords.find((record) => record.id === "vision-evidence-001")?.artifacts?.mapCanvasCrop as { sha256?: string }).sha256, "a".repeat(64));

  const boundaryLoopImported = await importModelRecommendationsAsync(sampleProject.id, boundaryLoopReport({
    accepted: true,
    gpuBacked: true,
    cudaAvailable: true,
    projectedPolygon: sampleProject.fieldBoundary,
  }));
  assert.equal(boundaryLoopImported.length, 1);
  assert.equal(boundaryLoopImported[0]?.proposedGeometry.fieldBoundary?.length, sampleProject.fieldBoundary.length);
  assert.equal(boundaryLoopImported[0]?.metadata?.schemaVersion, "cplayout-boundary-improvement-loop-v1");
  assert.equal(boundaryLoopImported[0]?.metadata?.autoApplyEligible, true);
  const boundaryLoopData = await loadProjectReviewDataAsync(sampleProject.id);
  const boundaryEvidence = boundaryLoopData.evidenceRecords.find((record) => record.id.includes("boundary-improvement-loop"));
  assert.equal(boundaryEvidence?.metrics?.gpuCudaAvailable, true);
  assert.equal(boundaryEvidence?.artifacts?.mapCanvas, "fixture-map.png");

  const rejectedBoundaryLoopImported = await importModelRecommendationsAsync(sampleProject.id, boundaryLoopReport({
    accepted: false,
    gpuBacked: false,
    cudaAvailable: false,
    projectedPolygon: sampleProject.fieldBoundary,
    createdAt: "2026-05-30T12:05:00.000Z",
  }));
  assert.equal(rejectedBoundaryLoopImported.length, 0);

  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, boundaryLoopReport({
      accepted: true,
      gpuBacked: true,
      cudaAvailable: true,
      projectCrs: "EPSG:3857",
      projectedPolygon: sampleProject.fieldBoundary,
      createdAt: "2026-05-30T12:10:00.000Z",
    })),
    /uses EPSG:3857/,
  );

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

  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{
      ...recommendation,
      id: "rec-self-intersecting-boundary",
      proposedGeometry: {
        projectCrs: sampleProject.projectCrs,
        fieldBoundary: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
          { x: 10, y: 0 },
        ],
      },
    }]),
    /self-intersect|degenerate/,
  );

  await assert.rejects(
    () => importModelRecommendationsAsync(sampleProject.id, [{
      ...recommendation,
      id: "rec-outside-pivot",
      proposedGeometry: {
        projectCrs: sampleProject.projectCrs,
        pivotCenter: { x: -999999, y: -999999 },
      },
    }]),
    /inside the field boundary/,
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

function boundaryLoopReport(options: {
  accepted: boolean;
  gpuBacked: boolean;
  cudaAvailable: boolean;
  projectedPolygon: Array<{ x: number; y: number }>;
  createdAt?: string;
  projectCrs?: string;
}): object {
  const createdAt = options.createdAt ?? "2026-05-30T12:00:00.000Z";
  return {
    schemaVersion: "cplayout-boundary-improvement-loop-v1",
    createdAt,
    projectId: sampleProject.id,
    projectCrs: options.projectCrs ?? sampleProject.projectCrs,
    designOnly: true,
    surveyGrade: false,
    canonicalGeometryMutation: false,
    minimumIterationsRequired: 5,
    iterationCount: 5,
    gpu: {
      cudaAvailable: options.cudaAvailable,
      deviceCount: options.cudaAvailable ? 1 : 0,
      devices: options.cudaAvailable ? ["NVIDIA GeForce RTX 4070 Laptop GPU"] : [],
      usedForTorchTensorPreflight: options.cudaAvailable,
      tensorPreflight: options.cudaAvailable ? { device: "NVIDIA GeForce RTX 4070 Laptop GPU", shape: [100, 100, 3] } : null,
    },
    artifacts: {
      mapCanvas: "fixture-map.png",
    },
    bestIteration: {
      iteration: 5,
      bestOperatorIoU: 0.82,
      bestCandidate: {
        source: "opencv",
        confidence: 0.78,
        edgeAlignment: 0.71,
        rectilinearity: 0.93,
        circularity: 0.31,
        containment: 1,
        operatorLabelAlignment: 0.82,
        areaRatio: 0.44,
        rejected: !options.accepted,
        rejectionReasons: options.accepted ? [] : ["candidate confidence is below accepted imagery-derived boundary threshold"],
        projectedPolygon: options.projectedPolygon,
      },
    },
    acceptance: {
      accepted: options.accepted,
      status: options.accepted ? "accepted" : "not accepted",
      gpuBacked: options.gpuBacked,
      reasons: options.accepted ? [] : ["PyTorch CUDA was not available; report is not GPU-backed"],
    },
  };
}

run().catch((error: unknown) => {
  throw error;
});
