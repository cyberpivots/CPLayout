import assert from "node:assert/strict";

import {
  IMAGERY_EVIDENCE_SCHEMA_VERSION,
  validateImageryEvidencePacket,
} from "./imageryEvidence";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

type MutablePacket = Record<string, any>;

function basePacket(): MutablePacket {
  return {
    schemaVersion: IMAGERY_EVIDENCE_SCHEMA_VERSION,
    projectId: "will-rhea-jason-harmelink",
    projectCrs: "EPSG:26913",
    createdAt: "2026-06-06T12:00:00.000Z",
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
      telemetryUpload: false,
      bulkPublicTileCaching: false,
      cloudUrls: [],
    },
    sourceArtifactHashes: {
      localScreenshot: {
        type: "visual_screenshot",
        path: "reports/imagery/local-screenshot.png",
        sha256: SHA_A,
        expectedSha256: SHA_A,
        observedSha256: SHA_A,
        byteLength: 4096,
        attributionId: "operator-local",
      },
    },
    visualEvidence: [{
      id: "map-canvas-crop",
      artifactId: "localScreenshot",
      widthPixels: 1280,
      heightPixels: 720,
      nonBlankPixelRatio: 0.31,
      grayVariance: 142,
      mostlyBlack: false,
      nearUniform: false,
      attributionId: "operator-local",
    }],
    attribution: [{
      id: "operator-local",
      providerName: "Operator supplied local imagery",
      attribution: "Operator supplied local imagery for CPLayout advisory review.",
      licenseText: "Operator supplied local evidence; not a hosted or keyed imagery service.",
      keyedService: false,
      offlineCopyAllowed: true,
    }],
    calibration: {
      projectId: "will-rhea-jason-harmelink",
      projectCrs: "EPSG:26913",
      method: "operator control points",
      status: "evidence_only",
      residualMeters: 0,
      maxResidualMeters: 0.25,
    },
    truthLabels: {},
    evidenceRecords: [{
      id: "local-evidence-record",
      evidenceOnly: true,
      canonicalGeometryMutation: false,
      appImportable: false,
      writesProjectDatabase: false,
    }],
    candidateReports: [{
      id: "image-space-candidate",
      kind: "pivot_center",
      metadata: {
        imagePoint: { x: 242, y: 128 },
        scoreBreakdown: { circleCue: 0.82 },
      },
      artifactIds: ["localScreenshot"],
      evidenceOnly: true,
      canonicalGeometryMutation: false,
      appImportable: false,
      writesProjectDatabase: false,
    }],
    operatorDecisionNotes: [],
    nonGoals: [
      "No automatic canonical projected XY mutation or app import from companion evidence.",
    ],
  };
}

function packetWith(mutator: (packet: MutablePacket) => void): MutablePacket {
  const packet = JSON.parse(JSON.stringify(basePacket())) as MutablePacket;
  mutator(packet);
  return packet;
}

function issueCodes(result: ReturnType<typeof validateImageryEvidencePacket>): string[] {
  return [...result.blockers, ...result.warnings].map((issue) => issue.code);
}

function expectBlocked(packet: MutablePacket, code: string): void {
  const result = validateImageryEvidencePacket(packet);
  assert.equal(result.status, "blocked");
  assert.ok(issueCodes(result).includes(code), `Expected ${code}; got ${issueCodes(result).join(", ")}`);
}

const metadataOnly = validateImageryEvidencePacket(basePacket());
assert.equal(metadataOnly.status, "ready_for_read_only_report");
assert.equal(metadataOnly.blockerCount, 0);
assert.equal(metadataOnly.summary.projectedCandidateCount, 0);
assert.equal(metadataOnly.candidateReviews[0]?.status, "metadata_only");
assert.ok(issueCodes(metadataOnly).includes("metadata_only_candidate"));

const projectedPivot = validateImageryEvidencePacket(packetWith((packet) => {
  packet.calibrationStatus = "valid_projected_xy";
  packet.calibration.status = "valid_projected_xy";
  packet.truthLabels = {
    TRUE_PIVOT_CENTER: {
      label: "operator approved pivot center",
      projectedPoint: { x: 512345.25, y: 4567890.75 },
      calibrationStatus: "valid_projected_xy",
      operatorApproved: true,
    },
  };
  packet.candidateReports = [{
    id: "projected-pivot-center",
    kind: "pivot_center",
    projectCrs: "EPSG:26913",
    calibrationStatus: "valid_projected_xy",
    projectedPivotCenter: { x: 512345.25, y: 4567890.75 },
    truthLabelIds: ["TRUE_PIVOT_CENTER"],
    metadata: { scoreBreakdown: { circleCue: 0.91, radialCue: 0.88 } },
    artifactIds: ["localScreenshot"],
    evidenceOnly: true,
    canonicalGeometryMutation: false,
    appImportable: false,
    writesProjectDatabase: false,
  }];
}));
assert.equal(projectedPivot.status, "ready_for_read_only_report");
assert.equal(projectedPivot.summary.projectedCandidateCount, 1);
assert.equal(projectedPivot.summary.validProjectedCandidateCount, 1);
assert.equal(projectedPivot.candidateReviews[0]?.status, "calibrated_projected_xy");

const boundaryPacket = validateImageryEvidencePacket(packetWith((packet) => {
  const boundary = [
    { x: 512000, y: 4567000 },
    { x: 513000, y: 4567000 },
    { x: 513000, y: 4568000 },
    { x: 512000, y: 4568000 },
  ];
  packet.calibrationStatus = "valid_projected_xy";
  packet.calibration.status = "valid_projected_xy";
  packet.truthLabels = {
    TARGET_FIELD_BOUNDARY: {
      label: "operator approved field boundary",
      projectedPolygon: boundary,
      calibrationStatus: "valid_projected_xy",
      operatorApproved: true,
    },
  };
  packet.candidateReports = [{
    id: "projected-boundary",
    kind: "field_boundary",
    projectCrs: "EPSG:26913",
    calibrationStatus: "valid_projected_xy",
    projectedGeometry: {
      fieldBoundary: boundary,
      obstaclePolygons: [[
        { x: 512100, y: 4567100 },
        { x: 512200, y: 4567100 },
        { x: 512200, y: 4567200 },
      ]],
    },
    truthLabelIds: ["TARGET_FIELD_BOUNDARY"],
    metadata: { scoreBreakdown: { boundaryCue: 0.77 } },
    artifactIds: ["localScreenshot"],
    evidenceOnly: true,
    canonicalGeometryMutation: false,
    appImportable: false,
    writesProjectDatabase: false,
  }];
}));
assert.equal(boundaryPacket.status, "ready_for_read_only_report");
assert.equal(boundaryPacket.candidateReviews[0]?.status, "calibrated_projected_xy");

expectBlocked(packetWith((packet) => {
  packet.schemaVersion = "cplayout-imagery-evidence-v1";
}), "invalid_schema_version");

expectBlocked(packetWith((packet) => {
  packet.networkRequired = true;
}), "invalid_evidence_boundary");

expectBlocked(packetWith((packet) => {
  packet.projectCrs = "EPSG:4326";
  packet.calibration.projectCrs = "EPSG:4326";
}), "invalid_project_crs");

expectBlocked(packetWith((packet) => {
  packet.apiKey = "hidden";
}), "hidden_key");

expectBlocked(packetWith((packet) => {
  packet.paidServiceRequired = true;
  packet.cloudUrls = ["https://tiles.example.invalid/service"];
}), "paid_service_required");

expectBlocked(packetWith((packet) => {
  packet.attribution = [];
}), "missing_attribution");

expectBlocked(packetWith((packet) => {
  packet.sourceArtifactHashes.localScreenshot.expectedSha256 = SHA_B;
}), "artifact_hash_mismatch");

expectBlocked(packetWith((packet) => {
  delete packet.sourceArtifactHashes.localScreenshot.sha256;
}), "missing_artifact_hash");

expectBlocked(packetWith((packet) => {
  packet.visualEvidence[0].nonBlankPixelRatio = 0.02;
  packet.visualEvidence[0].grayVariance = 12;
  packet.visualEvidence[0].mostlyBlack = true;
}), "black_visual_evidence");

expectBlocked(packetWith((packet) => {
  packet.candidateReports = [{
    id: "projected-without-calibration",
    kind: "pivot_center",
    projectCrs: "EPSG:26913",
    calibrationStatus: "evidence_only",
    projectedPivotCenter: { x: 512345.25, y: 4567890.75 },
    metadata: { scoreBreakdown: { circleCue: 0.91 } },
    artifactIds: ["localScreenshot"],
    evidenceOnly: true,
    canonicalGeometryMutation: false,
    appImportable: false,
    writesProjectDatabase: false,
  }];
}), "invalid_calibration_status");

expectBlocked(packetWith((packet) => {
  packet.candidateReports[0].feasible = true;
  packet.candidateReports[0].hardFailures = ["operator rejected false positive"];
}), "candidate_feasible_with_hard_failures");

const kmlStyleOnly = validateImageryEvidencePacket(packetWith((packet) => {
  packet.candidateReports = [{
    id: "kml-style-only",
    kind: "visual_overlay",
    metadata: {
      styleUrl: "#pivotStyle",
      kmlStyle: { lineStyle: { color: "ff00ffff" } },
      scoreBreakdown: { visualCue: 0.2 },
    },
    artifactIds: ["localScreenshot"],
    evidenceOnly: true,
    canonicalGeometryMutation: false,
    appImportable: false,
    writesProjectDatabase: false,
  }];
}));
assert.equal(kmlStyleOnly.status, "ready_for_read_only_report");
assert.equal(kmlStyleOnly.summary.projectedCandidateCount, 0);
assert.equal(kmlStyleOnly.candidateReviews[0]?.status, "metadata_only");
assert.ok(issueCodes(kmlStyleOnly).includes("kml_style_visual_only"));

const wgs84DisplayOnly = validateImageryEvidencePacket(packetWith((packet) => {
  packet.candidateReports[0].metadata.displayWgs84 = { latitude: 40.1, longitude: -105.2 };
}));
assert.equal(wgs84DisplayOnly.status, "ready_for_read_only_report");
assert.ok(issueCodes(wgs84DisplayOnly).includes("wgs84_display_geometry_only"));

console.log("imagery evidence tests passed");
