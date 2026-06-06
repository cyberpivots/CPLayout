import { z } from "zod";

import { assertProjectedCrs } from "./units";

export const IMAGERY_EVIDENCE_SCHEMA_VERSION = "cplayout-imagery-evidence-v2";

export type ImageryEvidenceValidationStatus = "ready_for_read_only_report" | "blocked";
export type ImageryEvidenceIssueSeverity = "blocker" | "warning";
export type ImageryEvidenceCandidateReviewStatus = "metadata_only" | "blocked" | "calibrated_projected_xy";

export interface ImageryEvidenceValidationIssue {
  code: string;
  severity: ImageryEvidenceIssueSeverity;
  message: string;
  path: string;
}

export interface ImageryEvidenceValidationSummary {
  artifactCount: number;
  attributionCount: number;
  visualEvidenceCount: number;
  candidateCount: number;
  projectedCandidateCount: number;
  validProjectedCandidateCount: number;
  hardFailureCount: number;
}

export interface ImageryEvidenceCandidateReview {
  candidateId: string;
  status: ImageryEvidenceCandidateReviewStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  evidenceOnly: true;
  appImportable: false;
  writesProjectDatabase: false;
  projectedGeometryPresent: boolean;
  blockerCount: number;
  warningCount: number;
  blockers: ImageryEvidenceValidationIssue[];
  warnings: ImageryEvidenceValidationIssue[];
}

export interface ImageryEvidenceValidationResult {
  status: ImageryEvidenceValidationStatus;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  evidenceOnly: true;
  appImportable: false;
  writesProjectDatabase: false;
  networkRequired: false;
  blockerCount: number;
  warningCount: number;
  blockers: ImageryEvidenceValidationIssue[];
  warnings: ImageryEvidenceValidationIssue[];
  summary: ImageryEvidenceValidationSummary;
  candidateReviews: ImageryEvidenceCandidateReview[];
  packet: ImageryEvidencePacket | null;
}

const Sha256Schema = z.string().regex(/^[a-fA-F0-9]{64}$/);

const XySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const ArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  path: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  sha256: Sha256Schema.optional(),
  expectedSha256: Sha256Schema.optional(),
  observedSha256: Sha256Schema.optional(),
  byteLength: z.number().int().nonnegative().optional(),
  attributionId: z.string().min(1).optional(),
}).passthrough();

const AttributionSchema = z.object({
  id: z.string().min(1).optional(),
  providerName: z.string().min(1).optional(),
  sourceUrl: z.string().min(1).optional(),
  attribution: z.string().min(1).optional(),
  licenseText: z.string().min(1).optional(),
  keyedService: z.boolean().optional(),
  offlineCopyAllowed: z.boolean().optional(),
}).passthrough();

const CalibrationSchema = z.object({
  projectId: z.string().min(1),
  projectCrs: z.string().min(1),
  method: z.string().min(1),
  status: z.string().min(1),
  residualMeters: z.number().nonnegative().optional(),
  residualPixels: z.number().nonnegative().optional(),
  maxResidualMeters: z.number().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
}).passthrough();

const TruthLabelSchema = z.object({
  label: z.string().min(1).optional(),
  projectedPoint: XySchema.optional(),
  projectedXY: XySchema.optional(),
  projectedPolygon: z.array(XySchema).min(3).optional(),
  imagePoint: XySchema.optional(),
  calibrationStatus: z.string().min(1).optional(),
  operatorApproved: z.boolean().optional(),
}).passthrough();

const VisualEvidenceSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  sha256: Sha256Schema.optional(),
  status: z.string().min(1).optional(),
  blank: z.boolean().optional(),
  black: z.boolean().optional(),
  isBlank: z.boolean().optional(),
  isBlack: z.boolean().optional(),
  nonBlackRatio: z.number().min(0).max(1).optional(),
  nonBlankPixelRatio: z.number().min(0).max(1).optional(),
  grayVariance: z.number().nonnegative().optional(),
  widthPixels: z.number().int().positive().optional(),
  heightPixels: z.number().int().positive().optional(),
  mostlyBlack: z.boolean().optional(),
  nearUniform: z.boolean().optional(),
  attributionId: z.string().min(1).optional(),
}).passthrough();

const CandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).optional(),
  projectCrs: z.string().min(1).optional(),
  calibrationStatus: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  projectedPoint: XySchema.optional(),
  projectedPivotCenter: XySchema.optional(),
  projectedXY: XySchema.optional(),
  projectedPolygon: z.array(XySchema).min(3).optional(),
  projectedFieldBoundary: z.array(XySchema).min(3).optional(),
  projectedGeometry: z.record(z.string(), z.unknown()).optional(),
  proposedGeometry: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  feasible: z.boolean().optional(),
  truthLabelIds: z.array(z.string().min(1)).optional(),
  artifactIds: z.array(z.string().min(1)).optional(),
  hardFailures: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  evidenceOnly: z.boolean().optional(),
  appImportable: z.boolean().optional(),
  canonicalGeometryMutation: z.boolean().optional(),
  writesProjectDatabase: z.boolean().optional(),
}).passthrough();

const ImageryEvidencePacketSchema = z.object({
  schemaVersion: z.string().min(1),
  projectId: z.string().min(1),
  projectCrs: z.string().min(1),
  createdAt: z.string().min(1),
  calibrationStatus: z.string().min(1),
  canonicalGeometryMutation: z.boolean(),
  networkRequired: z.boolean(),
  hiddenKeysAllowed: z.boolean(),
  keyedService: z.boolean(),
  evidenceOnly: z.boolean(),
  appImportable: z.boolean(),
  writesProjectDatabase: z.boolean(),
  paidServiceRequired: z.boolean(),
  cloudUrls: z.array(z.string()),
  telemetryUpload: z.boolean(),
  bulkPublicTileCaching: z.boolean(),
  localProvenance: z.record(z.string(), z.unknown()).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  sourceArtifacts: z.array(ArtifactSchema).optional(),
  sourceArtifactHashes: z.record(z.string(), z.unknown()),
  visualEvidence: z.array(VisualEvidenceSchema).optional(),
  attribution: z.array(AttributionSchema).optional(),
  sourceAttribution: z.array(AttributionSchema).optional(),
  provenance: AttributionSchema.optional(),
  calibration: CalibrationSchema.optional(),
  truthLabels: z.record(z.string(), TruthLabelSchema).optional(),
  candidates: z.array(CandidateSchema).optional(),
  detectorOutputs: z.array(CandidateSchema).optional(),
  modelCandidates: z.array(CandidateSchema).optional(),
  evidenceRecords: z.array(z.record(z.string(), z.unknown())),
  candidateReports: z.array(CandidateSchema),
  operatorDecisionNotes: z.array(z.string()),
  hardFailures: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).passthrough();

export type ImageryEvidencePacket = z.infer<typeof ImageryEvidencePacketSchema>;
type ImageryEvidenceArtifact = z.infer<typeof ArtifactSchema>;
type ImageryEvidenceAttribution = z.infer<typeof AttributionSchema>;
type ImageryEvidenceCandidate = z.infer<typeof CandidateSchema>;
type ImageryEvidenceCalibration = z.infer<typeof CalibrationSchema>;
type ImageryEvidenceTruthLabel = z.infer<typeof TruthLabelSchema>;

interface ImageryEvidenceCandidateEntry {
  candidate: ImageryEvidenceCandidate;
  path: string;
}

const VALID_PROJECTED_CALIBRATION_STATUS = "valid_projected_xy";
const ALLOWED_CALIBRATION_STATUSES = new Set([
  "evidence_only",
  "image_space_only",
  "valid_projected_xy",
  "invalid_projected_xy",
  "rejected_projected_xy",
]);
const MIN_NON_BLANK_PIXEL_RATIO = 0.08;
const MIN_GRAY_VARIANCE = 80;
const HIDDEN_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "accesstoken",
  "access_token",
  "secretkey",
  "secret_key",
  "bearertoken",
  "bearer_token",
  "clientsecret",
  "client_secret",
  "password",
  "token",
]);
const REMOTE_DEPENDENCY_KEYS = new Set([
  "apiurl",
  "api_url",
  "cloudurl",
  "cloud_url",
  "cloudurls",
  "cloud_urls",
  "dashboardurl",
  "dashboard_url",
  "endpoint",
  "hostedurl",
  "hosted_url",
  "serviceurl",
  "service_url",
  "tilejsonurl",
  "tile_json_url",
  "tileurl",
  "tile_url",
]);

export function parseImageryEvidencePacket(input: unknown): ImageryEvidencePacket {
  return ImageryEvidencePacketSchema.parse(input);
}

export function validateImageryEvidencePacket(input: unknown): ImageryEvidenceValidationResult {
  const issues: ImageryEvidenceValidationIssue[] = [
    ...findHiddenKeyIssues(input),
    ...findRemoteDependencyIssues(input),
  ];

  const parsed = ImageryEvidencePacketSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "invalid_packet_schema",
        severity: "blocker",
        message: issue.message,
        path: pathFor(issue.path),
      });
    }
    return validationResult(null, issues);
  }

  const packet = parsed.data;
  const artifacts = artifactEntries(packet);
  const attributions = attributionEntries(packet);
  const candidateEntriesList = candidateEntries(packet);
  const candidates = candidateEntriesList.map((entry) => entry.candidate);
  const truthLabels = packet.truthLabels ?? {};
  const calibration = packet.calibration ?? null;
  const projectedCandidateCount = candidates.filter(hasProjectedGeometry).length;

  issues.push(...validateBoundaryFlags(packet));
  issues.push(...validateProjectAndCalibration(packet, calibration, projectedCandidateCount > 0));
  issues.push(...validateArtifacts(packet, artifacts, attributions));
  issues.push(...validateAttribution(attributions));
  issues.push(...validateVisualEvidence(packet, artifacts, attributions));

  const candidateValidation = validateCandidates(packet, candidateEntriesList, truthLabels, calibration, artifacts);
  issues.push(...candidateValidation.issues);
  issues.push(...validateNoApplyStatement(packet));

  return validationResult(packet, issues, candidateValidation.reviews, {
    artifactCount: artifacts.length,
    attributionCount: attributions.length,
    visualEvidenceCount: packet.visualEvidence?.length ?? 0,
    candidateCount: candidates.length,
    projectedCandidateCount,
    validProjectedCandidateCount: candidateValidation.reviews.filter((review) => review.status === "calibrated_projected_xy").length,
    hardFailureCount: (packet.hardFailures?.length ?? 0)
      + candidates.reduce((count, candidate) => count + (candidate.hardFailures?.length ?? 0), 0),
  });
}

function validateBoundaryFlags(packet: ImageryEvidencePacket): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  if (packet.schemaVersion !== IMAGERY_EVIDENCE_SCHEMA_VERSION) {
    issues.push(blocker("invalid_schema_version", `Expected schemaVersion ${IMAGERY_EVIDENCE_SCHEMA_VERSION}.`, "schemaVersion"));
  }
  for (const [path, actual, expected] of [
    ["canonicalGeometryMutation", packet.canonicalGeometryMutation, false],
    ["networkRequired", packet.networkRequired, false],
    ["hiddenKeysAllowed", packet.hiddenKeysAllowed, false],
    ["keyedService", packet.keyedService, false],
    ["evidenceOnly", packet.evidenceOnly, true],
    ["appImportable", packet.appImportable, false],
    ["writesProjectDatabase", packet.writesProjectDatabase, false],
    ["paidServiceRequired", packet.paidServiceRequired, false],
    ["telemetryUpload", packet.telemetryUpload, false],
    ["bulkPublicTileCaching", packet.bulkPublicTileCaching, false],
  ] as const) {
    if (actual !== expected) {
      issues.push(blocker("invalid_evidence_boundary", `${path} must be ${String(expected)} for companion-only imagery evidence.`, path));
    }
  }
  if (packet.cloudUrls.length > 0) {
    issues.push(blocker("cloud_url_dependency", "cloudUrls must be empty for local-only companion evidence.", "cloudUrls"));
  }
  issues.push(...validateLocalProvenanceFlags(packet.localProvenance));
  return issues;
}

function validateLocalProvenanceFlags(localProvenance: Record<string, unknown> | undefined): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  for (const [path, expected] of [
    ["canonicalGeometryMutation", false],
    ["networkRequired", false],
    ["hiddenKeysAllowed", false],
    ["keyedService", false],
    ["evidenceOnly", true],
    ["appImportable", false],
    ["writesProjectDatabase", false],
    ["paidServiceRequired", false],
    ["telemetryUpload", false],
    ["bulkPublicTileCaching", false],
  ] as const) {
    const actual = flagValue(localProvenance, path);
    if (actual !== undefined && actual !== expected) {
      issues.push(blocker("invalid_local_provenance_boundary", `localProvenance.${path} must be ${String(expected)}.`, `localProvenance.${path}`));
    }
  }
  const cloudUrls = isRecord(localProvenance) ? localProvenance.cloudUrls : undefined;
  if (Array.isArray(cloudUrls) && cloudUrls.length > 0) {
    issues.push(blocker("cloud_url_dependency", "localProvenance.cloudUrls must be empty.", "localProvenance.cloudUrls"));
  }
  return issues;
}

function validateProjectAndCalibration(
  packet: ImageryEvidencePacket,
  calibration: ImageryEvidenceCalibration | null,
  projectedGeometryPresent: boolean,
): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  try {
    assertProjectedCrs(packet.projectCrs);
  } catch (error) {
    issues.push(blocker("invalid_project_crs", error instanceof Error ? error.message : "Project CRS is not projected.", "projectCrs"));
  }
  if (!isAllowedCalibrationStatus(packet.calibrationStatus)) {
    issues.push(blocker("invalid_calibration_status", "Packet calibrationStatus must use the v2 status taxonomy.", "calibrationStatus"));
  }
  if (!calibration) {
    issues.push(blocker("missing_calibration", "Calibration metadata is required for companion imagery evidence review.", "calibration"));
    return issues;
  }
  if (calibration.projectId !== packet.projectId) {
    issues.push(blocker("calibration_project_mismatch", "Calibration projectId must match the packet projectId.", "calibration.projectId"));
  }
  if (calibration.projectCrs !== packet.projectCrs) {
    issues.push(blocker("calibration_crs_mismatch", "Calibration projectCrs must match the packet projectCrs.", "calibration.projectCrs"));
  }
  try {
    assertProjectedCrs(calibration.projectCrs);
  } catch (error) {
    issues.push(blocker("invalid_calibration_crs", error instanceof Error ? error.message : "Calibration CRS is not projected.", "calibration.projectCrs"));
  }
  if (!isAllowedCalibrationStatus(calibration.status)) {
    issues.push(blocker("invalid_calibration_status", "Calibration status must use the v2 status taxonomy.", "calibration.status"));
  }
  if (calibration.status !== packet.calibrationStatus) {
    issues.push(blocker("calibration_status_mismatch", "Calibration status must match the packet calibrationStatus.", "calibration.status"));
  }
  if (projectedGeometryPresent && !isValidProjectedCalibrationStatus(calibration.status)) {
    issues.push(blocker("invalid_calibration_status", "Projected geometry requires calibrationStatus valid_projected_xy.", "calibration.status"));
  }
  if (projectedGeometryPresent && !isValidProjectedCalibrationStatus(packet.calibrationStatus)) {
    issues.push(blocker("invalid_packet_calibration_status", "Projected geometry requires packet calibrationStatus valid_projected_xy.", "calibrationStatus"));
  }
  if (calibration.maxResidualMeters !== undefined && calibration.residualMeters !== undefined && calibration.residualMeters > calibration.maxResidualMeters) {
    issues.push(blocker("calibration_residual_exceeds_limit", "Calibration residualMeters exceeds maxResidualMeters.", "calibration.residualMeters"));
  }
  return issues;
}

function validateArtifacts(
  packet: ImageryEvidencePacket,
  artifacts: ImageryEvidenceArtifact[],
  attributions: ImageryEvidenceAttribution[],
): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  if (artifacts.length === 0) {
    return [blocker("missing_artifacts", "At least one hashed local artifact is required.", "artifacts")];
  }
  const attributionIds = new Set(attributions.map((attribution) => attribution.id).filter((id): id is string => typeof id === "string"));
  artifacts.forEach((artifact, index) => {
    const path = artifact.path ?? artifact.uri;
    const basePath = `artifacts[${index}]`;
    if (!path) issues.push(blocker("missing_artifact_path", `Artifact ${artifact.id} must include a local path or URI.`, `${basePath}.path`));
    if (!artifact.sha256) {
      issues.push(blocker("missing_artifact_hash", `Artifact ${artifact.id} must include sha256.`, `${basePath}.sha256`));
    }
    if (artifact.expectedSha256 && artifact.sha256 && artifact.expectedSha256.toLowerCase() !== artifact.sha256.toLowerCase()) {
      issues.push(blocker("artifact_hash_mismatch", `Artifact ${artifact.id} sha256 does not match expectedSha256.`, `${basePath}.sha256`));
    }
    if (artifact.observedSha256 && artifact.sha256 && artifact.observedSha256.toLowerCase() !== artifact.sha256.toLowerCase()) {
      issues.push(blocker("artifact_hash_mismatch", `Artifact ${artifact.id} sha256 does not match observedSha256.`, `${basePath}.sha256`));
    }
    if (artifact.byteLength === 0) {
      issues.push(blocker("empty_artifact", `Artifact ${artifact.id} has zero bytes.`, `${basePath}.byteLength`));
    } else if (artifact.byteLength === undefined) {
      issues.push(warning("missing_artifact_byte_length", `Artifact ${artifact.id} does not include byteLength.`, `${basePath}.byteLength`));
    }
    if (artifact.attributionId && attributionIds.size > 0 && !attributionIds.has(artifact.attributionId)) {
      issues.push(blocker("artifact_attribution_missing", `Artifact ${artifact.id} references unknown attribution ${artifact.attributionId}.`, `${basePath}.attributionId`));
    }
    if (path && looksLikeAbsolutePath(path)) {
      issues.push(warning("absolute_artifact_path", `Artifact ${artifact.id} includes an absolute local path; keep path leakage out of app/session display.`, `${basePath}.path`));
    }
  });
  for (const visual of packet.visualEvidence ?? []) {
    if (visual.artifactId && !artifacts.some((artifact) => artifact.id === visual.artifactId)) {
      issues.push(blocker("visual_artifact_missing", `Visual evidence ${visual.id} references unknown artifact ${visual.artifactId}.`, `visualEvidence.${visual.id}.artifactId`));
    }
  }
  return issues;
}

function validateAttribution(attributions: ImageryEvidenceAttribution[]): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  if (attributions.length === 0) {
    return [blocker("missing_attribution", "At least one attribution/license record is required.", "attribution")];
  }
  attributions.forEach((attribution, index) => {
    if (attribution.keyedService === true) {
      issues.push(blocker("keyed_service", "Attribution/provenance must not declare keyedService: true.", `attribution[${index}].keyedService`));
    }
    if (!attribution.attribution?.trim()) {
      issues.push(blocker("missing_attribution_text", "Attribution record must include attribution text.", `attribution[${index}].attribution`));
    }
    if (!attribution.licenseText?.trim()) {
      issues.push(blocker("missing_license_text", "Attribution record must include licenseText.", `attribution[${index}].licenseText`));
    }
  });
  return issues;
}

function validateVisualEvidence(
  packet: ImageryEvidencePacket,
  artifacts: ImageryEvidenceArtifact[],
  attributions: ImageryEvidenceAttribution[],
): ImageryEvidenceValidationIssue[] {
  const issues: ImageryEvidenceValidationIssue[] = [];
  const visualEvidence = packet.visualEvidence ?? [];
  if (visualEvidence.length === 0) {
    return [blocker("missing_visual_evidence", "At least one local screenshot, crop, or raster visual-evidence record is required.", "visualEvidence")];
  }
  const attributionIds = new Set(attributions.map((attribution) => attribution.id).filter((id): id is string => typeof id === "string"));
  for (const visual of visualEvidence) {
    const artifact = visual.artifactId ? artifacts.find((candidate) => candidate.id === visual.artifactId) : null;
    const path = `visualEvidence.${visual.id}`;
    if (!visual.artifactId && !visual.path) {
      issues.push(blocker("missing_visual_artifact", `Visual evidence ${visual.id} must reference an artifact or local path.`, path));
    }
    if (visual.artifactId && artifact?.sha256 === undefined) {
      issues.push(blocker("visual_artifact_unhashed", `Visual evidence ${visual.id} artifact ${visual.artifactId} is not hashed.`, path));
    }
    if (!visual.artifactId && !visual.sha256) {
      issues.push(blocker("missing_visual_hash", `Visual evidence ${visual.id} must include sha256 when it does not reference a hashed artifact.`, `${path}.sha256`));
    }
    if (visual.widthPixels === undefined || visual.heightPixels === undefined) {
      issues.push(blocker("missing_visual_dimensions", `Visual evidence ${visual.id} must include widthPixels and heightPixels.`, path));
    }
    if (visual.status?.toLowerCase() === "blank" || visual.blank === true || visual.isBlank === true) {
      issues.push(blocker("blank_visual_evidence", `Visual evidence ${visual.id} is marked blank.`, path));
    }
    if (visual.status?.toLowerCase() === "black" || visual.black === true || visual.isBlack === true) {
      issues.push(blocker("black_visual_evidence", `Visual evidence ${visual.id} is marked black.`, path));
    }
    const nonBlankPixelRatio = visual.nonBlankPixelRatio ?? visual.nonBlackRatio;
    if (nonBlankPixelRatio === undefined || nonBlankPixelRatio < MIN_NON_BLANK_PIXEL_RATIO) {
      issues.push(blocker("black_visual_evidence", `Visual evidence ${visual.id} must have nonBlankPixelRatio at least ${MIN_NON_BLANK_PIXEL_RATIO}.`, `${path}.nonBlankPixelRatio`));
    }
    if (visual.grayVariance === undefined || visual.grayVariance < MIN_GRAY_VARIANCE) {
      issues.push(blocker("blank_visual_evidence", `Visual evidence ${visual.id} must have grayVariance at least ${MIN_GRAY_VARIANCE}.`, `${path}.grayVariance`));
    }
    if (visual.mostlyBlack !== false) {
      issues.push(blocker("black_visual_evidence", `Visual evidence ${visual.id} must declare mostlyBlack: false.`, `${path}.mostlyBlack`));
    }
    if (visual.nearUniform !== false) {
      issues.push(blocker("blank_visual_evidence", `Visual evidence ${visual.id} must declare nearUniform: false.`, `${path}.nearUniform`));
    }
    const linkedAttributionId = visual.attributionId ?? artifact?.attributionId;
    if (!linkedAttributionId && attributions.length !== 1) {
      issues.push(blocker("missing_visual_attribution", `Visual evidence ${visual.id} must link to attribution or have one unambiguous attribution record.`, `${path}.attributionId`));
    }
    if (linkedAttributionId && attributionIds.size > 0 && !attributionIds.has(linkedAttributionId)) {
      issues.push(blocker("visual_attribution_missing", `Visual evidence ${visual.id} references unknown attribution ${linkedAttributionId}.`, `${path}.attributionId`));
    }
  }
  return issues;
}

function validateCandidates(
  packet: ImageryEvidencePacket,
  candidateEntriesList: ImageryEvidenceCandidateEntry[],
  truthLabels: Record<string, ImageryEvidenceTruthLabel>,
  calibration: ImageryEvidenceCalibration | null,
  artifacts: ImageryEvidenceArtifact[],
): { issues: ImageryEvidenceValidationIssue[]; reviews: ImageryEvidenceCandidateReview[] } {
  const issues: ImageryEvidenceValidationIssue[] = [];
  const topLevelHardFailures = packet.hardFailures ?? [];
  if (candidateEntriesList.length === 0 && topLevelHardFailures.length === 0) {
    issues.push(blocker("missing_detector_outputs", "At least one detector output, candidate, or hard failure is required.", "candidateReports"));
  }
  topLevelHardFailures.forEach((failure, index) => {
    issues.push(blocker("packet_hard_failure", failure, `hardFailures[${index}]`));
  });

  const reviews = candidateEntriesList.map((entry) => reviewCandidate(packet, entry, truthLabels, calibration, artifacts));
  for (const review of reviews) {
    issues.push(...review.blockers, ...review.warnings);
  }
  return { issues, reviews };
}

function reviewCandidate(
  packet: ImageryEvidencePacket,
  entry: ImageryEvidenceCandidateEntry,
  truthLabels: Record<string, ImageryEvidenceTruthLabel>,
  calibration: ImageryEvidenceCalibration | null,
  artifacts: ImageryEvidenceArtifact[],
): ImageryEvidenceCandidateReview {
  const { candidate, path } = entry;
  const issues: ImageryEvidenceValidationIssue[] = [];

  const candidateBoundaryChecks: Array<[keyof Pick<
    ImageryEvidenceCandidate,
    "canonicalGeometryMutation" | "evidenceOnly" | "appImportable" | "writesProjectDatabase"
  >, boolean]> = [
    ["canonicalGeometryMutation", false],
    ["evidenceOnly", true],
    ["appImportable", false],
    ["writesProjectDatabase", false],
  ];
  for (const [flag, expected] of candidateBoundaryChecks) {
    const actual = candidate[flag];
    if (actual !== undefined && actual !== expected) {
      issues.push(blocker("invalid_candidate_boundary", `Candidate ${candidate.id} ${flag} must be ${String(expected)}.`, `${path}.${flag}`));
    }
  }

  for (const failure of candidate.hardFailures ?? []) {
    issues.push(blocker("candidate_hard_failure", `Candidate ${candidate.id}: ${failure}`, `${path}.hardFailures`));
  }
  if (candidate.feasible === true && (candidate.hardFailures?.length ?? 0) > 0) {
    issues.push(blocker("candidate_feasible_with_hard_failures", `Candidate ${candidate.id} cannot be feasible while hardFailures are present.`, `${path}.feasible`));
  }
  for (const artifactId of candidate.artifactIds ?? []) {
    if (!artifacts.some((artifact) => artifact.id === artifactId)) {
      issues.push(blocker("candidate_artifact_missing", `Candidate ${candidate.id} references unknown artifact ${artifactId}.`, `${path}.artifactIds`));
    }
  }
  if (candidate.projectCrs && candidate.projectCrs !== packet.projectCrs) {
    issues.push(blocker("candidate_crs_mismatch", `Candidate ${candidate.id} projectCrs does not match packet projectCrs.`, `${path}.projectCrs`));
  }
  if (hasWgs84DisplayGeometry(candidate)) {
    issues.push(warning("wgs84_display_geometry_only", `Candidate ${candidate.id} includes WGS84/display coordinates; they are not canonical geometry.`, path));
  }
  if (hasKmlStyleOnlyGeometry(candidate)) {
    issues.push(warning("kml_style_visual_only", `Candidate ${candidate.id} includes KML style metadata; style does not count as geometry.`, path));
  }
  if (!hasScoreBreakdown(candidate)) {
    issues.push(warning("missing_score_breakdown", `Candidate ${candidate.id} does not include an optional score breakdown.`, `${path}.metadata`));
  }

  const projectedGeometryPresent = hasProjectedGeometry(candidate);
  if (!projectedGeometryPresent) {
    issues.push(warning("metadata_only_candidate", `Candidate ${candidate.id} has no validated projected-XY geometry and is metadata/image-space only.`, path));
    return candidateReview(candidate.id, "metadata_only", projectedGeometryPresent, issues);
  }

  if (!candidate.projectCrs) {
    issues.push(blocker("candidate_crs_missing", `Candidate ${candidate.id} projected geometry must declare projectCrs.`, `${path}.projectCrs`));
  }
  if (!calibration || !isValidProjectedCalibrationStatus(calibration.status)) {
    issues.push(blocker("projected_candidate_without_valid_calibration", `Candidate ${candidate.id} includes projected geometry without valid projected-XY calibration.`, path));
  }
  if (!isValidProjectedCalibrationStatus(packet.calibrationStatus)) {
    issues.push(blocker("projected_candidate_without_valid_packet_calibration", `Candidate ${candidate.id} requires packet calibrationStatus valid_projected_xy.`, "calibrationStatus"));
  }
  const candidateStatus = candidate.calibrationStatus ?? calibration?.status;
  if (!candidateStatus || !isValidProjectedCalibrationStatus(candidateStatus)) {
    issues.push(blocker("projected_candidate_without_valid_calibration", `Candidate ${candidate.id} does not carry a valid projected-XY calibration status.`, `${path}.calibrationStatus`));
  }
  if (!hasProjectedTruthForCandidate(candidate, truthLabels)) {
    issues.push(blocker("projected_candidate_without_truth", `Candidate ${candidate.id} includes projected geometry without matching projected truth labels.`, path));
  }
  if (!candidateProjectedGeometryIsFinite(candidate)) {
    issues.push(blocker("invalid_projected_geometry", `Candidate ${candidate.id} projected geometry must contain finite projected XY coordinates.`, path));
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  return candidateReview(candidate.id, blockers.length > 0 ? "blocked" : "calibrated_projected_xy", projectedGeometryPresent, issues);
}

function validateNoApplyStatement(packet: ImageryEvidencePacket): ImageryEvidenceValidationIssue[] {
  const text = [
    packet.notes ?? "",
    ...(packet.nonGoals ?? []),
    ...(packet.warnings ?? []),
  ].join(" ").toLowerCase();
  if (!/(no|not|without).{0,40}(apply|import|mutat|project geometry|canonical)/.test(text)) {
    return [warning("missing_no_apply_statement", "Packet should include a no-apply/no-import statement in notes, warnings, or nonGoals.", "nonGoals")];
  }
  return [];
}

function validationResult(
  packet: ImageryEvidencePacket | null,
  issues: ImageryEvidenceValidationIssue[],
  candidateReviews: ImageryEvidenceCandidateReview[] = [],
  summary: ImageryEvidenceValidationSummary = {
    artifactCount: 0,
    attributionCount: 0,
    visualEvidenceCount: 0,
    candidateCount: 0,
    projectedCandidateCount: 0,
    validProjectedCandidateCount: 0,
    hardFailureCount: 0,
  },
): ImageryEvidenceValidationResult {
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    status: blockers.length > 0 ? "blocked" : "ready_for_read_only_report",
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    evidenceOnly: true,
    appImportable: false,
    writesProjectDatabase: false,
    networkRequired: false,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    summary,
    candidateReviews,
    packet,
  };
}

function candidateReview(
  candidateId: string,
  status: ImageryEvidenceCandidateReviewStatus,
  projectedGeometryPresent: boolean,
  issues: ImageryEvidenceValidationIssue[],
): ImageryEvidenceCandidateReview {
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    candidateId,
    status: blockers.length > 0 ? "blocked" : status,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    evidenceOnly: true,
    appImportable: false,
    writesProjectDatabase: false,
    projectedGeometryPresent,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
  };
}

function artifactEntries(packet: ImageryEvidencePacket): ImageryEvidenceArtifact[] {
  const artifacts = [...(packet.artifacts ?? []), ...(packet.sourceArtifacts ?? [])];
  for (const [id, value] of Object.entries(packet.sourceArtifactHashes ?? {})) {
    const objectValue = isRecord(value) ? value : {};
    const sha256 = typeof value === "string"
      ? value
      : typeof objectValue.sha256 === "string"
        ? objectValue.sha256
        : undefined;
    const expectedSha256 = typeof objectValue.expectedSha256 === "string" ? objectValue.expectedSha256 : undefined;
    const observedSha256 = typeof objectValue.observedSha256 === "string" ? objectValue.observedSha256 : undefined;
    const path = typeof objectValue.path === "string"
      ? objectValue.path
      : typeof objectValue.uri === "string"
        ? objectValue.uri
        : typeof objectValue.resolvedPath === "string"
          ? objectValue.resolvedPath
          : id;
    const byteLength = typeof objectValue.byteLength === "number" ? objectValue.byteLength : undefined;
    const attributionId = typeof objectValue.attributionId === "string" ? objectValue.attributionId : undefined;
    const type = typeof objectValue.type === "string" ? objectValue.type : "source_artifact";
    const parsed = ArtifactSchema.safeParse({
      id,
      type,
      path,
      sha256,
      expectedSha256,
      observedSha256,
      byteLength,
      attributionId,
    });
    if (parsed.success) artifacts.push(parsed.data);
  }
  return artifacts;
}

function attributionEntries(packet: ImageryEvidencePacket): ImageryEvidenceAttribution[] {
  return [
    ...(packet.attribution ?? []),
    ...(packet.sourceAttribution ?? []),
    ...(packet.provenance ? [packet.provenance] : []),
  ];
}

function candidateEntries(packet: ImageryEvidencePacket): ImageryEvidenceCandidateEntry[] {
  return [
    ...entriesFromCandidateArray(packet.candidates, "candidates"),
    ...entriesFromCandidateArray(packet.detectorOutputs, "detectorOutputs"),
    ...entriesFromCandidateArray(packet.modelCandidates, "modelCandidates"),
    ...entriesFromCandidateArray(packet.candidateReports, "candidateReports"),
  ];
}

function entriesFromCandidateArray(
  candidates: ImageryEvidenceCandidate[] | undefined,
  path: string,
): ImageryEvidenceCandidateEntry[] {
  return (candidates ?? []).map((candidate, index) => ({ candidate, path: `${path}[${index}]` }));
}

function hasProjectedGeometry(candidate: ImageryEvidenceCandidate): boolean {
  return Boolean(
    candidate.projectedPoint
    || candidate.projectedPivotCenter
    || candidate.projectedXY
    || candidate.projectedPolygon
    || candidate.projectedFieldBoundary
    || hasProjectedGeometryRecord(candidate.projectedGeometry)
    || hasProjectedGeometryRecord(candidate.proposedGeometry),
  );
}

function candidateProjectedGeometryIsFinite(candidate: ImageryEvidenceCandidate): boolean {
  if (candidate.projectedPoint && !isXyRecord(candidate.projectedPoint)) return false;
  if (candidate.projectedPivotCenter && !isXyRecord(candidate.projectedPivotCenter)) return false;
  if (candidate.projectedXY && !isXyRecord(candidate.projectedXY)) return false;
  if (candidate.projectedPolygon && !isXyArray(candidate.projectedPolygon)) return false;
  if (candidate.projectedFieldBoundary && !isXyArray(candidate.projectedFieldBoundary)) return false;
  if (candidate.projectedGeometry && !projectedGeometryRecordIsFinite(candidate.projectedGeometry)) return false;
  if (candidate.proposedGeometry && !projectedGeometryRecordIsFinite(candidate.proposedGeometry)) return false;
  return true;
}

function hasProjectedGeometryRecord(value: Record<string, unknown> | undefined): boolean {
  if (!value) return false;
  return Boolean(
    isXyRecord(value.point)
    || isXyRecord(value.pivotCenter)
    || isXyRecord(value.projectedPoint)
    || isXyRecord(value.projectedPivotCenter)
    || isXyArray(value.polygon)
    || isXyArray(value.boundary)
    || isXyArray(value.fieldBoundary)
    || isXyArray(value.projectedFieldBoundary)
    || isXyPolygonArray(value.obstaclePolygons),
  );
}

function projectedGeometryRecordIsFinite(value: Record<string, unknown>): boolean {
  for (const key of ["point", "pivotCenter", "projectedPoint", "projectedPivotCenter"]) {
    if (value[key] !== undefined && !isXyRecord(value[key])) return false;
  }
  for (const key of ["polygon", "boundary", "fieldBoundary", "projectedFieldBoundary"]) {
    if (value[key] !== undefined && !isXyArray(value[key])) return false;
  }
  if (value.obstaclePolygons !== undefined && !isXyPolygonArray(value.obstaclePolygons)) return false;
  return hasProjectedGeometryRecord(value);
}

function hasProjectedTruthForCandidate(
  candidate: ImageryEvidenceCandidate,
  truthLabels: Record<string, ImageryEvidenceTruthLabel>,
): boolean {
  const requestedIds = candidate.truthLabelIds ?? [];
  if (requestedIds.length > 0) {
    return requestedIds.some((id) => truthLabelHasProjectedGeometry(truthLabels[id]));
  }
  const kind = (candidate.kind ?? "").toLowerCase();
  const preferredIds = kind.includes("boundary")
    ? ["TARGET_FIELD_BOUNDARY", "targetFieldBoundary"]
    : kind.includes("obstacle")
      ? ["OBSTACLE_POLYGON", "obstaclePolygon", "TARGET_FIELD_BOUNDARY"]
      : ["TRUE_PIVOT_CENTER", "truePivotCenter"];
  return preferredIds.some((id) => truthLabelHasProjectedGeometry(truthLabels[id]))
    || Object.values(truthLabels).some(truthLabelHasProjectedGeometry);
}

function truthLabelHasProjectedGeometry(label: ImageryEvidenceTruthLabel | undefined): boolean {
  if (!label) return false;
  return isValidProjectedCalibrationStatus(label.calibrationStatus ?? "")
    && Boolean(label.projectedPoint || label.projectedXY || label.projectedPolygon);
}

function isValidProjectedCalibrationStatus(status: string): boolean {
  return status.trim().toLowerCase() === VALID_PROJECTED_CALIBRATION_STATUS;
}

function isAllowedCalibrationStatus(status: string): boolean {
  return ALLOWED_CALIBRATION_STATUSES.has(status.trim().toLowerCase());
}

function hasWgs84DisplayGeometry(candidate: ImageryEvidenceCandidate): boolean {
  return containsKeyFragment(candidate, ["wgs84", "latlon", "longitude", "latitude", "displaycoordinate", "displaycoordinates", "lookat"]);
}

function hasKmlStyleOnlyGeometry(candidate: ImageryEvidenceCandidate): boolean {
  return containsKeyFragment(candidate, ["styleurl", "kmlstyle", "linestyle", "polystyle", "iconstyle", "labelstyle", "lookat"]);
}

function hasScoreBreakdown(candidate: ImageryEvidenceCandidate): boolean {
  return Boolean(
    isRecord(candidate.metadata) && (
      isRecord(candidate.metadata.scoreBreakdown)
      || isRecord(candidate.metadata.score)
      || isRecord(candidate.metadata.metrics)
    ),
  );
}

function findHiddenKeyIssues(value: unknown, path = "root"): ImageryEvidenceValidationIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findHiddenKeyIssues(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const issues: ImageryEvidenceValidationIssue[] = [];
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (normalized === "keyedservice" && item === true) {
      issues.push(blocker("keyed_service", `${path}.${key} declares keyedService: true.`, `${path}.${key}`));
    }
    if (HIDDEN_KEY_NAMES.has(normalized) && typeof item === "string" && item.length > 0) {
      issues.push(blocker("hidden_key", `${path}.${key} contains a hidden key or token.`, `${path}.${key}`));
    }
    issues.push(...findHiddenKeyIssues(item, `${path}.${key}`));
  }
  return issues;
}

function findRemoteDependencyIssues(value: unknown, path = "root"): ImageryEvidenceValidationIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findRemoteDependencyIssues(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const issues: ImageryEvidenceValidationIssue[] = [];
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (normalized === "paidservicerequired" && item === true) {
      issues.push(blocker("paid_service_required", `${path}.${key} declares a paid service dependency.`, `${path}.${key}`));
    }
    if (REMOTE_DEPENDENCY_KEYS.has(normalized) && typeof item === "string" && /^https?:\/\//i.test(item)) {
      issues.push(blocker("remote_service_dependency", `${path}.${key} declares a remote service URL.`, `${path}.${key}`));
    }
    if (REMOTE_DEPENDENCY_KEYS.has(normalized) && Array.isArray(item) && item.some((entry) => typeof entry === "string" && /^https?:\/\//i.test(entry))) {
      issues.push(blocker("remote_service_dependency", `${path}.${key} declares remote service URLs.`, `${path}.${key}`));
    }
    issues.push(...findRemoteDependencyIssues(item, `${path}.${key}`));
  }
  return issues;
}

function containsKeyFragment(value: unknown, fragments: string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKeyFragment(item, fragments));
  if (!isRecord(value)) return false;
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (fragments.some((fragment) => normalized.includes(fragment))) return true;
    if (containsKeyFragment(item, fragments)) return true;
  }
  return false;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function flagValue(value: unknown, key: string): boolean | undefined {
  return isRecord(value) && typeof value[key] === "boolean" ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isXyRecord(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}

function isXyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 3 && value.every(isXyRecord);
}

function isXyPolygonArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isXyArray);
}

function looksLikeAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-z]:[\\/]/i.test(path);
}

function blocker(code: string, message: string, path: string): ImageryEvidenceValidationIssue {
  return { code, severity: "blocker", message, path };
}

function warning(code: string, message: string, path: string): ImageryEvidenceValidationIssue {
  return { code, severity: "warning", message, path };
}

function pathFor(path: Array<string | number | symbol>): string {
  return path.length === 0 ? "root" : path.map((part) => String(part)).join(".");
}
