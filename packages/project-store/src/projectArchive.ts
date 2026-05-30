import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import {
  exportProjectGoogleEarthKml,
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
  parseProjectDocument,
  PROJECT_DOCUMENT_VERSION,
  serializeProjectDocument,
} from "@cplayout/core";
import type {
  LayoutDecisionRecord,
  LayoutEvidenceRecord,
  LayoutResult,
  ModelRecommendation,
  PivotProject,
  SurveyPoint,
  XY,
} from "@cplayout/core";

export const PROJECT_ARCHIVE_VERSION = "center-pivot-project-archive-v1";
export const PROJECT_JSON_FILENAME = "project.json";
export const PROJECT_MANIFEST_FILENAME = "manifest.json";
export const PROJECT_GEOJSON_FILENAME = "exports/scenario.geojson";
export const PROJECT_GOOGLE_EARTH_KML_FILENAME = "exports/google-earth.kml";
export const SURVEY_CSV_FILENAME = "exports/survey-points.csv";
export const METRICS_CSV_FILENAME = "exports/scenario-metrics.csv";
export const MAP_PACKAGES_CSV_FILENAME = "exports/map-packages.csv";
export const LAYOUT_EVIDENCE_JSONL_FILENAME = "exports/layout-evidence.jsonl";
export const LAYOUT_DECISIONS_JSONL_FILENAME = "exports/layout-decisions.jsonl";
export const MODEL_RECOMMENDATIONS_GEOJSON_FILENAME = "exports/model-recommendations.geojson";

export interface ProjectArchiveManifest {
  archiveVersion: typeof PROJECT_ARCHIVE_VERSION;
  createdAt: string;
  projectId: string;
  projectName: string;
  projectCrs: string;
  files: string[];
  offlineFirst: true;
  paidServicesRequired: false;
  projectDocumentVersion: typeof PROJECT_DOCUMENT_VERSION;
}

export interface ProjectArchiveBundle {
  manifest: ProjectArchiveManifest;
  files: Record<string, string>;
}

export interface ProjectArchiveAdjacentData {
  evidenceRecords?: LayoutEvidenceRecord[];
  layoutDecisions?: LayoutDecisionRecord[];
  modelRecommendations?: ModelRecommendation[];
}

const ProjectArchiveManifestSchema = z.object({
  archiveVersion: z.literal(PROJECT_ARCHIVE_VERSION),
  createdAt: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  projectCrs: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
  offlineFirst: z.literal(true),
  paidServicesRequired: z.literal(false),
  projectDocumentVersion: z.literal(PROJECT_DOCUMENT_VERSION),
});

export function buildProjectArchiveBundle(
  project: PivotProject,
  result: LayoutResult,
  geoJson: object,
  createdAt = new Date().toISOString(),
  adjacentData: ProjectArchiveAdjacentData = {},
): ProjectArchiveBundle {
  const optionalFiles = projectAdjacentArchiveFiles(project.id, adjacentData);
  const manifest: ProjectArchiveManifest = {
    archiveVersion: PROJECT_ARCHIVE_VERSION,
    createdAt,
    projectId: project.id,
    projectName: project.name,
    projectCrs: project.projectCrs,
    files: [
      PROJECT_MANIFEST_FILENAME,
      PROJECT_JSON_FILENAME,
      PROJECT_GEOJSON_FILENAME,
      PROJECT_GOOGLE_EARTH_KML_FILENAME,
      SURVEY_CSV_FILENAME,
      METRICS_CSV_FILENAME,
      MAP_PACKAGES_CSV_FILENAME,
      ...Object.keys(optionalFiles),
    ],
    offlineFirst: true,
    paidServicesRequired: false,
    projectDocumentVersion: PROJECT_DOCUMENT_VERSION,
  };

  return {
    manifest,
    files: {
      [PROJECT_MANIFEST_FILENAME]: JSON.stringify(manifest, null, 2),
      [PROJECT_JSON_FILENAME]: serializeProjectDocument(project),
      [PROJECT_GEOJSON_FILENAME]: JSON.stringify(geoJson, null, 2),
      [PROJECT_GOOGLE_EARTH_KML_FILENAME]: exportProjectGoogleEarthKml(project, result).kml,
      [SURVEY_CSV_FILENAME]: surveyPointsToCsv(project.surveyPoints),
      [METRICS_CSV_FILENAME]: metricsToCsv(result),
      [MAP_PACKAGES_CSV_FILENAME]: mapPackagesToCsv(project),
      ...optionalFiles,
    },
  };
}

export function exportProjectArchiveZip(bundle: ProjectArchiveBundle): Uint8Array {
  const files = Object.fromEntries(
    Object.entries(bundle.files).map(([path, contents]) => [path, strToU8(contents)]),
  );
  return zipSync(files);
}

export function importProjectArchiveZip(data: Uint8Array): PivotProject {
  const unzipped = unzipSync(data);
  const manifestBytes = unzipped[PROJECT_MANIFEST_FILENAME];
  const projectBytes = unzipped[PROJECT_JSON_FILENAME];
  if (!manifestBytes || !projectBytes) {
    throw new Error("Project archive must contain manifest.json and project.json.");
  }

  const manifest = ProjectArchiveManifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  for (const requiredFile of [PROJECT_MANIFEST_FILENAME, PROJECT_JSON_FILENAME]) {
    if (!manifest.files.includes(requiredFile)) throw new Error(`Project archive manifest must list ${requiredFile}.`);
  }

  const project = parseProjectDocument(strFromU8(projectBytes));
  if (manifest.projectId !== project.id) throw new Error("Project archive manifest projectId does not match project.json.");
  if (manifest.projectCrs !== project.projectCrs) throw new Error("Project archive manifest projectCrs does not match project.json.");
  return project;
}

export function surveyPointsToCsv(points: SurveyPoint[]): string {
  const rows = [
    ["id", "label", "role", "x", "y", "longitude", "latitude", "observedAt", "source", "confidence", "notes"],
    ...points.map((point) => [
      point.id,
      point.label,
      point.role,
      point.projected.x,
      point.projected.y,
      point.wgs84?.longitude ?? "",
      point.wgs84?.latitude ?? "",
      point.observedAt,
      point.source,
      point.confidence,
      point.notes ?? "",
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function metricsToCsv(result: LayoutResult): string {
  const rows = [
    ["metric", "value"],
    ...Object.entries(result.metrics).map(([metric, value]) => [metric, value]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function mapPackagesToCsv(project: PivotProject): string {
  const rows = [
    [
      "id",
      "name",
      "packageType",
      "tileContentType",
      "uri",
      "minZoom",
      "maxZoom",
      "tileScheme",
      "minLongitude",
      "minLatitude",
      "maxLongitude",
      "maxLatitude",
      "tileJsonUrl",
      "tileUrlTemplates",
      "checksumSha256",
      "installStatus",
      "attribution",
      "licenseText",
      "bytes",
      "importedAt",
    ],
    ...(project.mapPackages ?? []).map((mapPackage) => [
      mapPackage.id,
      mapPackage.name,
      mapPackage.packageType,
      mapPackage.tileContentType,
      mapPackage.uri,
      mapPackage.minZoom,
      mapPackage.maxZoom,
      mapPackage.tileScheme,
      mapPackage.boundsWgs84.minLongitude,
      mapPackage.boundsWgs84.minLatitude,
      mapPackage.boundsWgs84.maxLongitude,
      mapPackage.boundsWgs84.maxLatitude,
      mapPackage.tileJsonUrl ?? "",
      (mapPackage.tileUrlTemplates ?? []).join(" "),
      mapPackage.checksumSha256 ?? "",
      mapPackage.installStatus ?? "metadata_only",
      mapPackage.attribution,
      mapPackage.licenseText,
      mapPackage.bytes ?? "",
      mapPackage.importedAt,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function layoutEvidenceToJsonl(records: LayoutEvidenceRecord[]): string {
  return records.map((record) => JSON.stringify(parseLayoutEvidenceRecord(record))).join("\n") + (records.length > 0 ? "\n" : "");
}

export function layoutDecisionsToJsonl(records: LayoutDecisionRecord[]): string {
  return records.map((record) => JSON.stringify(parseLayoutDecisionRecord(record))).join("\n") + (records.length > 0 ? "\n" : "");
}

export function modelRecommendationsToProjectedGeoJson(recommendations: ModelRecommendation[]): object {
  const parsedRecommendations = recommendations.map(parseModelRecommendation);
  return {
    type: "FeatureCollection",
    schemaVersion: "cplayout-model-recommendations-v1",
    name: "cplayout-model-recommendations",
    coordinateReferenceSystem: "project_crs_xy",
    canonicalGeometryMutation: false,
    features: parsedRecommendations.flatMap(modelRecommendationFeatures),
  };
}

function csvCell(value: unknown): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function projectAdjacentArchiveFiles(
  projectId: string,
  adjacentData: ProjectArchiveAdjacentData,
): Record<string, string> {
  const evidenceRecords = (adjacentData.evidenceRecords ?? []).map(parseLayoutEvidenceRecord);
  const layoutDecisions = (adjacentData.layoutDecisions ?? []).map(parseLayoutDecisionRecord);
  const modelRecommendations = (adjacentData.modelRecommendations ?? []).map(parseModelRecommendation);
  for (const record of [...evidenceRecords, ...layoutDecisions, ...modelRecommendations]) {
    if (record.projectId !== projectId) {
      throw new Error(`Archive adjacent record ${record.id} belongs to ${record.projectId}, not ${projectId}.`);
    }
  }

  const files: Record<string, string> = {};
  if (evidenceRecords.length > 0) files[LAYOUT_EVIDENCE_JSONL_FILENAME] = layoutEvidenceToJsonl(evidenceRecords);
  if (layoutDecisions.length > 0) files[LAYOUT_DECISIONS_JSONL_FILENAME] = layoutDecisionsToJsonl(layoutDecisions);
  if (modelRecommendations.length > 0) {
    files[MODEL_RECOMMENDATIONS_GEOJSON_FILENAME] = JSON.stringify(
      modelRecommendationsToProjectedGeoJson(modelRecommendations),
      null,
      2,
    );
  }
  return files;
}

function modelRecommendationFeatures(recommendation: ModelRecommendation): object[] {
  const baseProperties = {
    id: recommendation.id,
    projectId: recommendation.projectId,
    projectCrs: recommendation.projectCrs,
    coordinateReferenceSystem: "project_crs_xy",
    createdAt: recommendation.createdAt,
    modelName: recommendation.modelName,
    modelVersion: recommendation.modelVersion,
    confidence: recommendation.confidence,
    reviewStatus: recommendation.reviewStatus,
    score: recommendation.score ?? null,
    scoreBreakdown: recommendation.scoreBreakdown ?? null,
    metadata: recommendation.metadata ?? null,
    summary: recommendation.summary,
    warnings: recommendation.warnings,
    evidenceIds: recommendation.evidenceIds,
    displayWgs84: recommendation.proposedGeometry.displayWgs84 ?? null,
  };
  const features: object[] = [];
  if (recommendation.proposedGeometry.pivotCenter) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: xyToCoordinates(recommendation.proposedGeometry.pivotCenter),
      },
      properties: { ...baseProperties, geometryRole: "pivot_center" },
    });
  }
  if (recommendation.proposedGeometry.fieldBoundary) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [closedRingCoordinates(recommendation.proposedGeometry.fieldBoundary)],
      },
      properties: { ...baseProperties, geometryRole: "field_boundary" },
    });
  }
  recommendation.proposedGeometry.obstaclePolygons?.forEach((polygon, index) => {
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [closedRingCoordinates(polygon)],
      },
      properties: { ...baseProperties, geometryRole: "obstacle_polygon", obstacleIndex: index },
    });
  });
  if (features.length === 0) {
    features.push({
      type: "Feature",
      geometry: null,
      properties: { ...baseProperties, geometryRole: "metadata_only" },
    });
  }
  return features;
}

function closedRingCoordinates(points: XY[]): number[][] {
  const coordinates = points.map(xyToCoordinates);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coordinates.push([...first]);
  return coordinates;
}

function xyToCoordinates(point: XY): number[] {
  return [point.x, point.y];
}
