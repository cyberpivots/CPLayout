import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatVerifyImageryEvidencePacketSummary,
  parseVerifyImageryEvidenceArgs,
  verifyImageryEvidencePacket,
} from "./verifyImageryEvidencePacket";

const root = mkdtempSync(join(tmpdir(), "cplayout-imagery-evidence-"));
mkdirSync(root, { recursive: true });

const metadataPacketPath = join(root, "metadata-only.json");
writeFileSync(metadataPacketPath, JSON.stringify(packetFixture({
  candidateReports: [{
    id: "metadata-candidate",
    kind: "pivot_center",
    projectCrs: "EPSG:32613",
    calibrationStatus: "image_space_only",
    metadata: { imagePoint: { x: 120, y: 140 }, scoreBreakdown: { circleCue: 0.8 } },
    artifactIds: ["mapCanvasCrop"],
    evidenceOnly: true,
    appImportable: false,
    canonicalGeometryMutation: false,
    writesProjectDatabase: false,
  }],
})), "utf8");

const metadataSummary = verifyImageryEvidencePacket({ packetPath: metadataPacketPath });
assert.equal(metadataSummary.ok, true);
assert.equal(metadataSummary.candidateReviews[0]?.status, "metadata_only");
assert.match(formatVerifyImageryEvidencePacketSummary(metadataSummary), /metadata-candidate:metadata_only/);

const metadataRequireProjected = verifyImageryEvidencePacket({
  packetPath: metadataPacketPath,
  requireCalibratedProjectedCandidate: true,
});
assert.equal(metadataRequireProjected.ok, false);
assert.match(metadataRequireProjected.reasons.join("\n"), /No candidate review is calibrated_projected_xy/);

const projectedPacketPath = join(root, "projected.json");
writeFileSync(projectedPacketPath, JSON.stringify(projectedPacketFixture()), "utf8");
const projectedSummary = verifyImageryEvidencePacket({
  packetPath: projectedPacketPath,
  requireCalibratedProjectedCandidate: true,
});
assert.equal(projectedSummary.ok, true);
assert.equal(projectedSummary.summary.validProjectedCandidateCount, 1);
assert.equal(projectedSummary.candidateReviews[0]?.status, "calibrated_projected_xy");

const unsafePacketPath = join(root, "unsafe.json");
writeFileSync(unsafePacketPath, JSON.stringify({
  ...projectedPacketFixture(),
  networkRequired: true,
  cloudUrls: ["https://tiles.example.invalid/service"],
}), "utf8");
const unsafeSummary = verifyImageryEvidencePacket({ packetPath: unsafePacketPath });
assert.equal(unsafeSummary.ok, false);
assert.ok(unsafeSummary.blockerCodes.includes("invalid_evidence_boundary"));
assert.ok(unsafeSummary.blockerCodes.includes("cloud_url_dependency"));

const invalidJsonPath = join(root, "invalid.json");
writeFileSync(invalidJsonPath, "{", "utf8");
const invalidJsonSummary = verifyImageryEvidencePacket({ packetPath: invalidJsonPath });
assert.equal(invalidJsonSummary.ok, false);
assert.deepEqual(invalidJsonSummary.blockerCodes, ["invalid_packet_json"]);

assert.deepEqual(parseVerifyImageryEvidenceArgs([
  "--packet",
  "packet.json",
  "--json",
  "--require-calibrated-projected-candidate",
]), {
  packetPath: "packet.json",
  json: true,
  requireCalibratedProjectedCandidate: true,
});

console.log("imagery evidence packet verifier tests passed");

function projectedPacketFixture(): Record<string, unknown> {
  return packetFixture({
    calibrationStatus: "valid_projected_xy",
    calibration: {
      projectId: "fixture-project",
      projectCrs: "EPSG:32613",
      method: "operator truth label",
      status: "valid_projected_xy",
    },
    truthLabels: {
      TRUE_PIVOT_CENTER: {
        label: "operator approved pivot center",
        projectedPoint: { x: 500000, y: 4410000 },
        calibrationStatus: "valid_projected_xy",
        operatorApproved: true,
      },
    },
    candidateReports: [{
      id: "projected-candidate",
      kind: "pivot_center",
      projectCrs: "EPSG:32613",
      calibrationStatus: "valid_projected_xy",
      proposedGeometry: {
        projectCrs: "EPSG:32613",
        pivotCenter: { x: 500000, y: 4410000 },
      },
      truthLabelIds: ["TRUE_PIVOT_CENTER"],
      metadata: { scoreBreakdown: { operatorTruth: 1 }, hardFailures: [] },
      artifactIds: ["mapCanvasCrop"],
      evidenceOnly: true,
      appImportable: false,
      canonicalGeometryMutation: false,
      writesProjectDatabase: false,
    }],
  });
}

function packetFixture(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: "cplayout-imagery-evidence-v2",
    projectId: "fixture-project",
    projectCrs: "EPSG:32613",
    createdAt: "2026-06-06T00:00:00.000Z",
    calibrationStatus: "evidence_only",
    canonicalGeometryMutation: false,
    networkRequired: false,
    hiddenKeysAllowed: false,
    keyedService: false,
    evidenceOnly: true,
    appImportable: false,
    writesProjectDatabase: false,
    paidServiceRequired: false,
    cloudUrls: [],
    telemetryUpload: false,
    bulkPublicTileCaching: false,
    localProvenance: {
      canonicalGeometryMutation: false,
      networkRequired: false,
      hiddenKeysAllowed: false,
      keyedService: false,
      evidenceOnly: true,
      appImportable: false,
      writesProjectDatabase: false,
      paidServiceRequired: false,
      cloudUrls: [],
      telemetryUpload: false,
      bulkPublicTileCaching: false,
    },
    sourceArtifactHashes: {
      mapCanvasCrop: {
        type: "map_canvas_crop",
        path: "reports/imagery/map-canvas.png",
        sha256: "a".repeat(64),
        byteLength: 4096,
        attributionId: "operator-local",
      },
    },
    visualEvidence: [{
      id: "map-canvas-visual",
      artifactId: "mapCanvasCrop",
      widthPixels: 800,
      heightPixels: 600,
      nonBlankPixelRatio: 0.4,
      grayVariance: 120,
      mostlyBlack: false,
      nearUniform: false,
      attributionId: "operator-local",
    }],
    attribution: [{
      id: "operator-local",
      attribution: "Operator supplied local imagery.",
      licenseText: "Operator supplied local evidence for advisory review.",
      keyedService: false,
      offlineCopyAllowed: true,
    }],
    calibration: {
      projectId: "fixture-project",
      projectCrs: "EPSG:32613",
      method: "metadata review",
      status: "evidence_only",
    },
    truthLabels: {},
    evidenceRecords: [{
      id: "fixture-evidence",
      projectId: "fixture-project",
      sourceKind: "model_output",
      createdAt: "2026-06-06T00:00:00.000Z",
      projectCrs: "EPSG:32613",
      summary: "Standalone companion evidence only.",
    }],
    operatorDecisionNotes: [],
    warnings: [
      "Companion evidence is read-only and cannot apply, import, or mutate CPLayout project geometry.",
    ],
    nonGoals: [
      "No automatic canonical projected XY mutation from imagery evidence.",
    ],
    ...overrides,
  };
}
