import { z } from "zod";

import { MapPackageManifestSchema } from "./mapTilePackages";
import { ProjectSettingsSchema } from "./settings";
import type { LonLat, PivotProject, ProjectMapFeatureGeometry, ProjectWgs84Companion, XY } from "./types";
import { assertProjectedCrs } from "./units";
import { projectXyToLonLat } from "./coordinates";

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

const PivotAngleRangeSchema = z.object({
  startAngleDegrees: z.number().finite(),
  stopAngleDegrees: z.number().finite(),
  direction: z.enum(["clockwise", "counterclockwise"]),
});

const AdvisorySourceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
  guideId: z.string().min(1).optional(),
  page: z.number().int().positive().optional(),
  lineRange: z.string().min(1).optional(),
  checkedAt: z.string().min(1).optional(),
  limit: z.string().min(1),
});

const AdvisoryCornerArmConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  advisoryOnly: z.literal(true),
  lengthMeters: z.number().positive(),
  guidanceType: z.enum(["gps_guidance", "below_ground_guidance", "operator_supplied", "unknown"]),
  sequencingType: z.enum(["electronic", "mechanical", "operator_supplied", "unknown"]),
  orientation: z.enum(["leading", "trailing", "operator_supplied", "unknown"]),
  confidence: z.enum(["rtk_fixed", "rtk_float", "dgps", "autonomous_gps", "imagery_digitized", "imported_cad", "user_estimated", "optimized"]),
  sourceRefs: z.array(AdvisorySourceReferenceSchema).min(1),
  operatorConfirmedAt: z.string().min(1).optional(),
  notes: z.string().optional(),
});

const PivotMachineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spanLengthsMeters: z.array(z.number().positive()).min(1),
  overhangMeters: z.number().min(0),
  endGunThrowMeters: z.number().min(0),
  endGunAngleRanges: z.array(PivotAngleRangeSchema).optional().default([]),
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
  catalogSelection: z.object({
    catalogId: z.string().min(1),
    manufacturer: z.string().min(1),
    model: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceAccessedAt: z.string().min(1),
    advisoryOnly: z.literal(true),
  }).optional(),
  cornerArm: AdvisoryCornerArmConfigSchema.optional(),
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

const ProjectMapFeatureKindSchema = z.enum([
  "pump_location",
  "underground_pipeline",
  "power_pole",
  "power_line",
  "tree",
  "road",
  "access_lane",
  "ditch",
  "canal",
  "fence",
  "end_gun_mark",
  "end_gun_arc",
  "corner_swing_limit",
]);

const ProjectMapFeatureGeometrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Point"),
    point: XySchema,
  }),
  z.object({
    type: z.literal("LineString"),
    vertices: z.array(XySchema).min(2),
  }),
  z.object({
    type: z.literal("Polygon"),
    vertices: z.array(XySchema).min(3),
  }),
  z.object({
    type: z.literal("Circle"),
    center: XySchema,
    radiusMeters: z.number().positive(),
  }),
]);

const ProjectMapFeatureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ProjectMapFeatureKindSchema,
  geometry: ProjectMapFeatureGeometrySchema,
  confidence: z.enum(["rtk_fixed", "rtk_float", "dgps", "autonomous_gps", "imagery_digitized", "imported_cad", "user_estimated", "optimized"]),
  notes: z.string().optional(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const ProjectMapFeatureWgs84GeometrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Point"),
    point: LonLatSchema,
  }),
  z.object({
    type: z.literal("LineString"),
    vertices: z.array(LonLatSchema).min(2),
  }),
  z.object({
    type: z.literal("Polygon"),
    vertices: z.array(LonLatSchema).min(3),
  }),
  z.object({
    type: z.literal("Circle"),
    center: LonLatSchema,
    radiusMeters: z.number().positive(),
  }),
]);

const ProjectWgs84CompanionSchema = z.object({
  status: z.enum(["projected", "unavailable"]),
  source: z.literal("derived_from_project_xy"),
  coordinateSystem: z.literal("decimal_degrees"),
  projectCrs: z.string().min(1),
  error: z.string().optional(),
  fieldBoundary: z.array(LonLatSchema).optional(),
  pivotCenter: LonLatSchema.optional(),
  waterSource: LonLatSchema.optional(),
  powerSource: LonLatSchema.optional(),
  obstacles: z.array(z.object({ id: z.string().min(1), polygon: z.array(LonLatSchema).min(3) })).optional(),
  mapFeatures: z.array(z.object({ id: z.string().min(1), geometry: ProjectMapFeatureWgs84GeometrySchema })).optional(),
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
  mapFeatures: z.array(ProjectMapFeatureSchema).optional().default([]),
  wgs84Companion: ProjectWgs84CompanionSchema.optional(),
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
  const parsedProject = PivotProjectSchema.parse(project);
  return JSON.stringify({
    documentVersion: PROJECT_DOCUMENT_VERSION,
    project: withWgs84Companion(parsedProject),
  }, null, 2);
}

export function parseProjectDocument(input: string | unknown): PivotProject {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (isRecord(raw) && raw.documentVersion === PROJECT_DOCUMENT_VERSION) {
    return withWgs84Companion(ProjectDocumentSchema.parse(raw).project);
  }
  return withWgs84Companion(PivotProjectSchema.parse(raw));
}

export function withWgs84Companion(project: PivotProject): PivotProject {
  return {
    ...project,
    wgs84Companion: deriveWgs84Companion(project),
  };
}

export function deriveWgs84Companion(project: PivotProject): ProjectWgs84Companion {
  try {
    const projectPoint = (point: XY): LonLat => projectXyToLonLat(point, project.projectCrs);
    const mapFeatureGeometry = (geometry: ProjectMapFeatureGeometry) => {
      switch (geometry.type) {
        case "Point":
          return { type: "Point" as const, point: projectPoint(geometry.point) };
        case "LineString":
          return { type: "LineString" as const, vertices: geometry.vertices.map(projectPoint) };
        case "Polygon":
          return { type: "Polygon" as const, vertices: geometry.vertices.map(projectPoint) };
        case "Circle":
          return { type: "Circle" as const, center: projectPoint(geometry.center), radiusMeters: geometry.radiusMeters };
      }
    };
    return {
      status: "projected",
      source: "derived_from_project_xy",
      coordinateSystem: "decimal_degrees",
      projectCrs: project.projectCrs,
      fieldBoundary: project.fieldBoundary.map(projectPoint),
      pivotCenter: projectPoint(project.pivotCenter),
      waterSource: projectPoint(project.waterSource),
      powerSource: projectPoint(project.powerSource),
      obstacles: project.obstacles.map((obstacle) => ({ id: obstacle.id, polygon: obstacle.polygon.map(projectPoint) })),
      mapFeatures: (project.mapFeatures ?? []).map((feature) => ({ id: feature.id, geometry: mapFeatureGeometry(feature.geometry) })),
    };
  } catch (error) {
    return {
      status: "unavailable",
      source: "derived_from_project_xy",
      coordinateSystem: "decimal_degrees",
      projectCrs: project.projectCrs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
