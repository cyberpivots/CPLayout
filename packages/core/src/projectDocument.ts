import { z } from "zod";

import { MapPackageManifestSchema } from "./mapTilePackages";
import { ProjectSettingsSchema } from "./settings";
import type { PivotProject } from "./types";
import { assertProjectedCrs } from "./units";

export const PROJECT_DOCUMENT_VERSION = "pivot-project-v1";

const XySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const LonLatSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

const RtkQualitySchema = z.object({
  fixType: z.enum(["invalid", "autonomous", "dgps", "rtk_float", "rtk_fixed", "ppp", "unknown"]),
  satellites: z.number().int().nullable(),
  hdop: z.number().nullable(),
  vdop: z.number().nullable(),
  pdop: z.number().nullable(),
  correctionAgeSeconds: z.number().nullable(),
  horizontalAccuracyMeters: z.number().nullable(),
  verticalAccuracyMeters: z.number().nullable(),
  baseStationId: z.string().optional(),
  roverId: z.string().optional(),
  nmeaQualityCode: z.number().optional(),
});

const SurveyPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.enum(["boundary", "pivot_center", "water_source", "power_source", "obstacle", "control", "note"]),
  projected: XySchema,
  wgs84: LonLatSchema.optional(),
  observedAt: z.string().min(1),
  source: z.enum(["device_gps", "external_gnss", "imported", "manual"]),
  confidence: z.enum(["rtk_fixed", "rtk_float", "dgps", "autonomous_gps", "imagery_digitized", "imported_cad", "user_estimated", "optimized"]),
  rtk: RtkQualitySchema.optional(),
  notes: z.string().optional(),
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

const ObstacleZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["road", "ditch", "fence", "building", "canal", "tree", "exclusion"]),
  polygon: z.array(XySchema).min(3),
  bufferMeters: z.number().min(0),
  hardConflict: z.boolean(),
  noSpray: z.boolean(),
  confidence: z.enum(["rtk_fixed", "rtk_float", "dgps", "autonomous_gps", "imagery_digitized", "imported_cad", "user_estimated", "optimized"]),
});

export const PivotProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  projectCrs: z.string().min(1),
  unitSystem: z.enum(["metric", "us_survey_feet"]),
  settings: ProjectSettingsSchema.optional(),
  fieldBoundary: z.array(XySchema).min(3),
  pivotCenter: XySchema,
  waterSource: XySchema,
  powerSource: XySchema,
  machine: PivotMachineSchema,
  obstacles: z.array(ObstacleZoneSchema),
  surveyPoints: z.array(SurveyPointSchema),
  mapPackages: z.array(MapPackageManifestSchema).optional(),
}).superRefine((project, context) => {
  try {
    assertProjectedCrs(project.projectCrs);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Projected CRS required.",
      path: ["projectCrs"],
    });
  }
});

const ProjectDocumentSchema = z.object({
  documentVersion: z.literal(PROJECT_DOCUMENT_VERSION),
  project: PivotProjectSchema,
});

export function serializeProjectDocument(project: PivotProject): string {
  return JSON.stringify({
    documentVersion: PROJECT_DOCUMENT_VERSION,
    project: PivotProjectSchema.parse(project),
  }, null, 2);
}

export function parseProjectDocument(input: string | unknown): PivotProject {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (isRecord(raw) && raw.documentVersion === PROJECT_DOCUMENT_VERSION) {
    return ProjectDocumentSchema.parse(raw).project;
  }
  return PivotProjectSchema.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
