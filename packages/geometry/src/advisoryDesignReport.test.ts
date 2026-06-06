import assert from "node:assert/strict";

import { sampleProject, type ProjectMapFeature } from "@cplayout/core";

import {
  analyzeAdvisoryMultiMachineLayout,
  analyzeAdvisoryObstacleInteractions,
  compareAdvisoryMachineStrategies,
  planAdvisoryFieldPivots,
} from "./advisoryPivotPlacement";
import { auditGeneratedFieldPivotReviewZones, buildAdvisoryDesignReport } from "./advisoryDesignReport";
import { evaluateLayout } from "./geometry";

const costInput = {
  fixedMachineCost: 80000,
  costPerMeter: 700,
  costPerTower: 3000,
  currencyCode: "USD",
  notes: "Local planning assumption for report test.",
};
const initialPivotCenter = { ...sampleProject.pivotCenter };
const result = evaluateLayout(sampleProject);
const fieldPivotPlan = planAdvisoryFieldPivots(sampleProject, {
  gridDivisions: 6,
  maxMachines: 3,
  candidatePoolSize: 24,
  collisionBufferMeters: sampleProject.machine.machineClearanceBufferMeters,
  costInput,
});
const multiMachineReview = analyzeAdvisoryMultiMachineLayout(sampleProject, {
  maxCandidates: 3,
  collisionBufferMeters: sampleProject.machine.machineClearanceBufferMeters,
  costInput,
});
const strategyComparison = compareAdvisoryMachineStrategies(sampleProject, {
  maxCandidates: 2,
  costInput,
});
const obstacleInteractionReview = analyzeAdvisoryObstacleInteractions(sampleProject);
const firstCandidate = fieldPivotPlan.candidates[0];
assert.ok(firstCandidate, "expected at least one generated field-pivot candidate");
const savedReviewZone: ProjectMapFeature = {
  id: "generated-zone-1",
  name: "Generated Pivot Zone 1",
  kind: "machine_zone",
  geometry: {
    type: "Circle",
    center: firstCandidate.pivotCenter,
    radiusMeters: firstCandidate.machineRadiusMeters,
  },
  confidence: "optimized",
  properties: {
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    qualifiedReviewRequired: true,
    source: "generated_field_pivot_plan",
    generatedFieldPivotCandidateId: firstCandidate.id,
    generatedFieldPivotSequence: firstCandidate.sequence,
    machineRadiusMeters: firstCandidate.machineRadiusMeters,
  },
};
const projectWithCurrentZone = {
  ...sampleProject,
  mapFeatures: [...(sampleProject.mapFeatures ?? []), savedReviewZone],
};
const projectWithStaleZone = {
  ...sampleProject,
  mapFeatures: [...(sampleProject.mapFeatures ?? []), {
    ...savedReviewZone,
    geometry: {
      type: "Circle" as const,
      center: { x: firstCandidate.pivotCenter.x + 2, y: firstCandidate.pivotCenter.y },
      radiusMeters: firstCandidate.machineRadiusMeters + 1,
    },
  }],
};
const missingZoneAudit = auditGeneratedFieldPivotReviewZones(sampleProject, fieldPivotPlan);
const currentZoneAudit = auditGeneratedFieldPivotReviewZones(projectWithCurrentZone, fieldPivotPlan);
const staleZoneAudit = auditGeneratedFieldPivotReviewZones(projectWithStaleZone, fieldPivotPlan);

assert.equal(missingZoneAudit.currentCount, 0);
assert.equal(missingZoneAudit.missingCount, fieldPivotPlan.selectedMachineCount);
assert.ok(currentZoneAudit.currentCount >= 1);
assert.equal(currentZoneAudit.items.find((item) => item.sequence === firstCandidate.sequence)?.status, "current");
assert.ok(staleZoneAudit.staleCount >= 1);
assert.equal(staleZoneAudit.items.find((item) => item.sequence === firstCandidate.sequence)?.status, "stale");
assert.ok(staleZoneAudit.items.find((item) => item.sequence === firstCandidate.sequence)?.reasons.some((reason) => reason.includes("center differs")));

const report = buildAdvisoryDesignReport({
  project: projectWithCurrentZone,
  result,
  fieldPivotPlan,
  multiMachineReview,
  strategyComparison,
  obstacleInteractionReview,
  reviewZoneAudit: currentZoneAudit,
  generatedAt: "2026-06-06T12:00:00.000Z",
});

assert.equal(report.title, "Advisory Design Report");
assert.equal(report.generatedAt, "2026-06-06T12:00:00.000Z");
assert.equal(report.projectId, projectWithCurrentZone.id);
assert.equal(report.projectCrs, projectWithCurrentZone.projectCrs);
assert.equal(report.advisoryOnly, true);
assert.equal(report.canonicalGeometryMutation, false);
assert.equal(report.qualifiedReviewRequired, true);
assert.equal(report.readiness, "ready_for_review");
assert.equal(report.reviewZoneAudit.currentCount, currentZoneAudit.currentCount);
assert.ok(report.headline.includes("generated centers"));
assert.ok(report.sections.some((section) => section.id === "generated-pivots"));
assert.ok(report.sections.some((section) => section.id === "strategy-cost"));
assert.ok(report.sections.some((section) => section.id === "obstacles-utilities"));
assert.ok(report.sourceRefs.length > 0);
assert.ok(report.warnings.some((warning) => warning.includes("does not mutate canonical projected XY") || warning.includes("Canonical geometry")));
assert.match(report.text, /Advisory Design Report/);
assert.match(report.text, /Canonical geometry mutation: false/);
assert.match(report.text, /Qualified review required: true/);
assert.match(report.text, /Review-zone audit: \d+ current, \d+ missing, \d+ stale/);
assert.match(report.text, /Cost review is local and advisory/);
assert.match(report.text, /not vendor quotes|vendor quotes|quote equipment/);
assert.match(report.text, /Crossing\/passability labels are planning prompts only/);
assert.match(report.text, /Profiled crossing items: 0/);
assert.deepEqual(sampleProject.pivotCenter, initialPivotCenter);
