import { z } from "zod";

import { assertProjectedCrs } from "./units";
import type { LonLat, PivotMachine, XY } from "./types";

export type EvidenceSourceKind =
  | "imagery"
  | "survey"
  | "import"
  | "operator_note"
  | "model_output"
  | "layout_score";

export type EvidenceReviewStatus = "unreviewed" | "accepted" | "rejected" | "superseded";

export interface ImageryProvenance {
  providerId: string;
  providerName: string;
  sourceUrl?: string;
  captureDate?: string;
  accessedAt: string;
  attribution: string;
  licenseText: string;
  offlineCopyAllowed: boolean;
  keyedService: false;
}

export interface LayoutEvidenceRecord {
  id: string;
  projectId: string;
  sourceKind: EvidenceSourceKind;
  createdAt: string;
  collectedAt?: string;
  projectCrs: string;
  summary: string;
  geometry?: XY[];
  displayWgs84?: LonLat[];
  imagery?: ImageryProvenance;
  confidence: number;
  reviewStatus: EvidenceReviewStatus;
  notes?: string;
}

export interface LayoutDecisionRecord {
  id: string;
  projectId: string;
  createdAt: string;
  decidedBy: "operator" | "import" | "test_fixture";
  decision: "accepted" | "rejected" | "deferred";
  recommendationId?: string;
  evidenceIds: string[];
  reason: string;
}

export interface ModelRecommendationGeometry {
  projectCrs: string;
  pivotCenter?: XY;
  fieldBoundary?: XY[];
  machine?: PivotMachine;
  obstaclePolygons?: XY[][];
  displayWgs84?: LonLat[];
}

export interface ModelRecommendation {
  id: string;
  projectId: string;
  modelName: string;
  modelVersion: string;
  createdAt: string;
  projectCrs: string;
  summary: string;
  proposedGeometry: ModelRecommendationGeometry;
  confidence: number;
  evidenceIds: string[];
  reviewStatus: EvidenceReviewStatus;
  score?: number;
  warnings: string[];
}

export type ModelRecommendationReviewState = EvidenceReviewStatus | LayoutDecisionRecord["decision"];

const XySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const LonLatSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

export const ImageryProvenanceSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  captureDate: z.string().min(1).optional(),
  accessedAt: z.string().min(1),
  attribution: z.string().min(1),
  licenseText: z.string().min(1),
  offlineCopyAllowed: z.boolean(),
  keyedService: z.literal(false),
});

const EvidenceReviewStatusSchema = z.enum(["unreviewed", "accepted", "rejected", "superseded"]);

export const LayoutEvidenceRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceKind: z.enum(["imagery", "survey", "import", "operator_note", "model_output", "layout_score"]),
  createdAt: z.string().min(1),
  collectedAt: z.string().min(1).optional(),
  projectCrs: z.string().min(1),
  summary: z.string().min(1),
  geometry: z.array(XySchema).optional(),
  displayWgs84: z.array(LonLatSchema).optional(),
  imagery: ImageryProvenanceSchema.optional(),
  confidence: z.number().min(0).max(1),
  reviewStatus: EvidenceReviewStatusSchema,
  notes: z.string().optional(),
}).superRefine((record, context) => {
  refineProjectedCrs(record.projectCrs, context, ["projectCrs"]);
});

export const LayoutDecisionRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.string().min(1),
  decidedBy: z.enum(["operator", "import", "test_fixture"]),
  decision: z.enum(["accepted", "rejected", "deferred"]),
  recommendationId: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)),
  reason: z.string().min(1),
});

const PivotMachineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spanLengthsMeters: z.array(z.number().positive()).min(1),
  overhangMeters: z.number().min(0),
  endGunThrowMeters: z.number().min(0),
  towerClearanceBufferMeters: z.number().min(0),
  machineClearanceBufferMeters: z.number().min(0),
  sweep: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("full_circle") }),
    z.object({
      mode: z.literal("partial_circle"),
      startAngleDegrees: z.number().finite(),
      stopAngleDegrees: z.number().finite(),
      direction: z.enum(["clockwise", "counterclockwise"]),
    }),
  ]),
});

export const ModelRecommendationGeometrySchema = z.object({
  projectCrs: z.string().min(1),
  pivotCenter: XySchema.optional(),
  fieldBoundary: z.array(XySchema).min(3).optional(),
  machine: PivotMachineSchema.optional(),
  obstaclePolygons: z.array(z.array(XySchema).min(3)).optional(),
  displayWgs84: z.array(LonLatSchema).optional(),
}).superRefine((geometry, context) => {
  refineProjectedCrs(geometry.projectCrs, context, ["projectCrs"]);
});

export const ModelRecommendationSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  modelName: z.string().min(1),
  modelVersion: z.string().min(1),
  createdAt: z.string().min(1),
  projectCrs: z.string().min(1),
  summary: z.string().min(1),
  proposedGeometry: ModelRecommendationGeometrySchema,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)),
  reviewStatus: EvidenceReviewStatusSchema,
  score: z.number().finite().optional(),
  warnings: z.array(z.string()),
}).superRefine((recommendation, context) => {
  refineProjectedCrs(recommendation.projectCrs, context, ["projectCrs"]);
  if (recommendation.projectCrs !== recommendation.proposedGeometry.projectCrs) {
    context.addIssue({
      code: "custom",
      message: "Recommendation projectCrs must match proposedGeometry.projectCrs.",
      path: ["proposedGeometry", "projectCrs"],
    });
  }
});

export function parseLayoutEvidenceRecord(input: unknown): LayoutEvidenceRecord {
  return LayoutEvidenceRecordSchema.parse(input);
}

export function parseLayoutDecisionRecord(input: unknown): LayoutDecisionRecord {
  return LayoutDecisionRecordSchema.parse(input);
}

export function parseModelRecommendation(input: unknown): ModelRecommendation {
  return ModelRecommendationSchema.parse(input);
}

export function deriveRecommendationReviewState(
  recommendation: ModelRecommendation,
  decisions: LayoutDecisionRecord[],
): ModelRecommendationReviewState {
  const latestDecision = decisions
    .filter((decision) => decision.projectId === recommendation.projectId && decision.recommendationId === recommendation.id)
    .at(-1);
  return latestDecision?.decision ?? recommendation.reviewStatus;
}

function refineProjectedCrs(projectCrs: string, context: z.RefinementCtx, path: (string | number)[]): void {
  try {
    assertProjectedCrs(projectCrs);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Projected CRS required.",
      path,
    });
  }
}
