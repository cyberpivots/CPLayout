import assert from "node:assert/strict";

import { parseCornerGpsMapBpf, previewCornerGpsMapBpfImport } from "./cornerGpsMapImport";
import { exportCornerGpsMapBpf } from "./cornerGpsMapExport";
import { sampleProject } from "./sampleProject";

const before = structuredClone(sampleProject);
const exported = exportCornerGpsMapBpf(sampleProject, {
  benchmark: {
    kind: "wgs84",
    point: { latitude: 40.000001, longitude: -104.000001, altitude: 1510.25 },
    label: "synthetic WGS84 benchmark",
  },
  coordinatePrecision: 8,
  sourceLabel: "Synthetic CPLayout BPF export fixture",
});

assert.match(exported.xmlText, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
assert.match(exported.xmlText, /<BorderPoints>/);
assert.match(exported.xmlText, /<BenchMark /);
assert.match(exported.xmlText, /<CenterPoint /);
assert.equal(exported.exportedPointCounts.borderPoints, sampleProject.fieldBoundary.length);
assert.equal(exported.exportedPointCounts.centerPoints, 1);
assert.equal(exported.exportedPointCounts.benchmarkPoints, 1);
assert.equal(exported.diagnostics.canonicalGeometryMutation, false);
assert.match(exported.compatibilityWarnings.join("\n"), /WGS84 visual\/interchange evidence/);

const evidence = parseCornerGpsMapBpf(exported.xmlText);
assert.equal(evidence.normalizedBorderPoints.length, sampleProject.fieldBoundary.length);
assert.equal(evidence.benchmark?.altitude, 1510.25);
assert.deepEqual(evidence.blockedReasons, []);

const preview = previewCornerGpsMapBpfImport(sampleProject, exported.xmlText, {
  selectedItemIds: ["pivot-center"],
  observedAt: "2026-06-07T00:00:00.000Z",
});
assert.equal(preview.canApply, true);
assert.equal(preview.importedBoundary, false);
assert.equal(preview.importedSurveyPointCount, 1);
assert.deepEqual(preview.project.pivotCenter, sampleProject.pivotCenter);
assert.deepEqual(sampleProject, before);

const withoutBenchmark = exportCornerGpsMapBpf(sampleProject);
assert.equal(withoutBenchmark.exportedPointCounts.benchmarkPoints, 0);
assert.match(withoutBenchmark.compatibilityWarnings.join("\n"), /No BenchMark point/);

const centerFromSurvey = exportCornerGpsMapBpf(sampleProject, {
  centerSource: { kind: "survey_point", surveyPointId: "pivot-rtk" },
});
assert.match(centerFromSurvey.diagnostics.centerSource, /pivot-rtk/);

assert.throws(
  () => exportCornerGpsMapBpf({ ...sampleProject, projectCrs: "LOCAL:TEST" }),
  /Projected CRS required|not supported|Could not project/i,
);

console.log("CornerGPSMap BPF export tests passed");
