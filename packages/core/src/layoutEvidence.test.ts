import assert from "node:assert/strict";

import {
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
} from "./layoutEvidence";
import { sampleProject } from "./sampleProject";

const originalPivotCenter = { ...sampleProject.pivotCenter };

const evidence = parseLayoutEvidenceRecord({
  id: "evidence-001",
  projectId: sampleProject.id,
  sourceKind: "imagery",
  createdAt: "2026-05-22T12:00:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Operator traced the north road edge from visible imagery.",
  geometry: sampleProject.fieldBoundary.slice(0, 3),
  displayWgs84: [{ longitude: -105.15, latitude: 40.05 }],
  imagery: {
    providerId: "usgs-tnm-imagery-only",
    providerName: "USGS TNM Imagery Only",
    sourceUrl: "https://basemap.nationalmap.gov/",
    accessedAt: "2026-05-22T12:00:00.000Z",
    attribution: "USGS The National Map",
    licenseText: "Public domain U.S. Government source; verify downstream source notices.",
    offlineCopyAllowed: false,
    keyedService: false,
  },
  confidence: 0.72,
  reviewStatus: "unreviewed",
});

assert.equal(evidence.projectCrs, "EPSG:32613");
assert.equal(evidence.imagery?.keyedService, false);

const recommendation = parseModelRecommendation({
  id: "recommendation-001",
  projectId: sampleProject.id,
  modelName: "baseline-local-ranker",
  modelVersion: "0.1.0",
  createdAt: "2026-05-22T12:05:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Move pivot center east to reduce outside-field acres.",
  proposedGeometry: {
    projectCrs: sampleProject.projectCrs,
    pivotCenter: { x: sampleProject.pivotCenter.x + 10, y: sampleProject.pivotCenter.y },
    displayWgs84: [{ longitude: -105.149, latitude: 40.051 }],
  },
  confidence: 0.61,
  evidenceIds: [evidence.id],
  reviewStatus: "unreviewed",
  score: 88.2,
  warnings: [],
});

assert.equal(recommendation.proposedGeometry.projectCrs, recommendation.projectCrs);
assert.deepEqual(sampleProject.pivotCenter, originalPivotCenter);

const decision = parseLayoutDecisionRecord({
  id: "decision-001",
  projectId: sampleProject.id,
  createdAt: "2026-05-22T12:10:00.000Z",
  decidedBy: "operator",
  decision: "deferred",
  recommendationId: recommendation.id,
  evidenceIds: [evidence.id],
  reason: "Needs RTK check before changing production geometry.",
});
assert.equal(decision.decision, "deferred");

assert.throws(
  () => parseLayoutEvidenceRecord({ ...evidence, projectCrs: "EPSG:4326" }),
  /Projected CRS required/,
);

assert.throws(
  () => parseLayoutEvidenceRecord({
    ...evidence,
    imagery: { ...evidence.imagery, keyedService: true },
  }),
  /Invalid input|keyedService/,
);

assert.throws(
  () => parseModelRecommendation({
    ...recommendation,
    proposedGeometry: { ...recommendation.proposedGeometry, projectCrs: "EPSG:3857" },
  }),
  /must match/,
);

console.log("layout evidence tests passed");
