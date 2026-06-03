import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { UnzipFileInfo } from "fflate";
import { z } from "zod";

import {
  exportProjectGoogleEarthKml,
  exportProjectMapXml,
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
  ModelRecommendationGeometry,
  PivotProject,
  SurveyPoint,
  XY,
} from "@cplayout/core";

export const PROJECT_ARCHIVE_VERSION = "center-pivot-project-archive-v1";
export const PROJECT_JSON_FILENAME = "project.json";
export const PROJECT_MANIFEST_FILENAME = "manifest.json";
export const PROJECT_GEOJSON_FILENAME = "exports/scenario.geojson";
export const PROJECT_GOOGLE_EARTH_KML_FILENAME = "exports/google-earth.kml";
export const PROJECT_MAP_XML_FILENAME = "exports/map-data.xml";
export const SURVEY_CSV_FILENAME = "exports/survey-points.csv";
export const METRICS_CSV_FILENAME = "exports/scenario-metrics.csv";
export const MAP_PACKAGES_CSV_FILENAME = "exports/map-packages.csv";
export const LAYOUT_EVIDENCE_JSONL_FILENAME = "exports/layout-evidence.jsonl";
export const LAYOUT_DECISIONS_JSONL_FILENAME = "exports/layout-decisions.jsonl";
export const MODEL_RECOMMENDATIONS_GEOJSON_FILENAME = "exports/model-recommendations.geojson";
export const PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
export const PROJECT_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const PROJECT_ARCHIVE_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
export const PROJECT_ARCHIVE_MAX_FILE_COUNT = 16;

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

export interface ProjectArchiveImportResult {
  project: PivotProject;
  adjacentData: ProjectArchiveAdjacentData;
  manifest: ProjectArchiveManifest;
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
      PROJECT_MAP_XML_FILENAME,
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
      [PROJECT_MAP_XML_FILENAME]: exportProjectMapXml(project),
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
  return importProjectArchiveZipWithAdjacentData(data).project;
}

export function importProjectArchiveZipWithAdjacentData(data: Uint8Array): ProjectArchiveImportResult {
  if (data.byteLength > PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES) {
    throw new Error(`Project archive compressed size exceeds ${PROJECT_ARCHIVE_MAX_COMPRESSED_BYTES} bytes.`);
  }

  const archiveState = { fileCount: 0, totalUncompressedBytes: 0 };
  const unzipped = unzipSync(data, {
    filter: (file) => {
      validateProjectArchiveEntry(file, archiveState);
      return true;
    },
  });
  const manifestBytes = unzipped[PROJECT_MANIFEST_FILENAME];
  const projectBytes = unzipped[PROJECT_JSON_FILENAME];
  if (!manifestBytes || !projectBytes) {
    throw new Error("Project archive must contain manifest.json and project.json.");
  }

  const manifest = ProjectArchiveManifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  for (const requiredFile of [PROJECT_MANIFEST_FILENAME, PROJECT_JSON_FILENAME]) {
    if (!manifest.files.includes(requiredFile)) throw new Error(`Project archive manifest must list ${requiredFile}.`);
  }
  validateProjectArchiveManifestFiles(manifest, Object.keys(unzipped));

  const project = parseProjectDocument(strFromU8(projectBytes));
  if (manifest.projectId !== project.id) throw new Error("Project archive manifest projectId does not match project.json.");
  if (manifest.projectCrs !== project.projectCrs) throw new Error("Project archive manifest projectCrs does not match project.json.");
  return {
    project,
    adjacentData: parseProjectArchiveAdjacentData(project, unzipped),
    manifest,
  };
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
      "vectorOverlay",
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
      mapPackage.vectorOverlay ? JSON.stringify(mapPackage.vectorOverlay) : "",
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

const PROJECT_ARCHIVE_ALLOWED_FILENAMES = new Set([
  PROJECT_MANIFEST_FILENAME,
  PROJECT_JSON_FILENAME,
  PROJECT_GEOJSON_FILENAME,
  PROJECT_GOOGLE_EARTH_KML_FILENAME,
  PROJECT_MAP_XML_FILENAME,
  SURVEY_CSV_FILENAME,
  METRICS_CSV_FILENAME,
  MAP_PACKAGES_CSV_FILENAME,
  LAYOUT_EVIDENCE_JSONL_FILENAME,
  LAYOUT_DECISIONS_JSONL_FILENAME,
  MODEL_RECOMMENDATIONS_GEOJSON_FILENAME,
]);

function validateProjectArchiveEntry(
  file: UnzipFileInfo,
  state: { fileCount: number; totalUncompressedBytes: number },
): void {
  validateProjectArchivePath(file.name);
  if (!PROJECT_ARCHIVE_ALLOWED_FILENAMES.has(file.name)) {
    throw new Error(`Project archive contains unsupported file: ${file.name}.`);
  }
  state.fileCount += 1;
  if (state.fileCount > PROJECT_ARCHIVE_MAX_FILE_COUNT) {
    throw new Error(`Project archive contains more than ${PROJECT_ARCHIVE_MAX_FILE_COUNT} files.`);
  }
  if (file.originalSize > PROJECT_ARCHIVE_MAX_ENTRY_BYTES) {
    throw new Error(`Project archive entry ${file.name} exceeds ${PROJECT_ARCHIVE_MAX_ENTRY_BYTES} uncompressed bytes.`);
  }
  state.totalUncompressedBytes += file.originalSize;
  if (state.totalUncompressedBytes > PROJECT_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
    throw new Error(`Project archive uncompressed size exceeds ${PROJECT_ARCHIVE_MAX_UNCOMPRESSED_BYTES} bytes.`);
  }
}

function validateProjectArchiveManifestFiles(manifest: ProjectArchiveManifest, archiveFilenames: string[]): void {
  const manifestFiles = new Set(manifest.files);
  const archiveFiles = new Set(archiveFilenames);
  for (const filename of manifest.files) {
    validateProjectArchivePath(filename);
    if (!PROJECT_ARCHIVE_ALLOWED_FILENAMES.has(filename)) {
      throw new Error(`Project archive manifest lists unsupported file: ${filename}.`);
    }
    if (!archiveFiles.has(filename)) {
      throw new Error(`Project archive manifest lists ${filename}, but the archive does not contain it.`);
    }
  }
  for (const filename of archiveFilenames) {
    if (!manifestFiles.has(filename)) {
      throw new Error(`Project archive contains ${filename}, but manifest.json does not list it.`);
    }
  }
}

function validateProjectArchivePath(filename: string): void {
  if (filename.length === 0 || filename.length > 180) {
    throw new Error(`Project archive contains unsafe path length: ${filename}.`);
  }
  if (filename.startsWith("/") || filename.startsWith("\\") || /^[A-Za-z]:/.test(filename) || filename.includes("\\")) {
    throw new Error(`Project archive contains unsafe path: ${filename}.`);
  }
  const parts = filename.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Project archive contains unsafe path: ${filename}.`);
  }
}

function parseProjectArchiveAdjacentData(
  project: PivotProject,
  files: Record<string, Uint8Array>,
): ProjectArchiveAdjacentData {
  const evidenceRecords = parseJsonlArchiveRecords(
    files[LAYOUT_EVIDENCE_JSONL_FILENAME],
    LAYOUT_EVIDENCE_JSONL_FILENAME,
    parseLayoutEvidenceRecord,
  );
  const layoutDecisions = parseJsonlArchiveRecords(
    files[LAYOUT_DECISIONS_JSONL_FILENAME],
    LAYOUT_DECISIONS_JSONL_FILENAME,
    parseLayoutDecisionRecord,
  );
  const modelRecommendations = files[MODEL_RECOMMENDATIONS_GEOJSON_FILENAME]
    ? parseModelRecommendationsArchiveGeoJson(files[MODEL_RECOMMENDATIONS_GEOJSON_FILENAME])
    : [];

  evidenceRecords.forEach((record) => validateAdjacentProjectRecord(project, record, "Layout evidence record"));
  layoutDecisions.forEach((record) => validateAdjacentProjectRecord(project, record, "Layout decision record"));
  modelRecommendations.forEach((recommendation) => {
    validateAdjacentProjectRecord(project, recommendation, "Model recommendation");
    if (recommendation.projectCrs !== project.projectCrs) {
      throw new Error(`Model recommendation ${recommendation.id} uses ${recommendation.projectCrs}, not ${project.projectCrs}.`);
    }
    if (recommendation.proposedGeometry.projectCrs !== project.projectCrs) {
      throw new Error(`Model recommendation ${recommendation.id} proposed geometry uses ${recommendation.proposedGeometry.projectCrs}, not ${project.projectCrs}.`);
    }
  });

  const adjacentData: ProjectArchiveAdjacentData = {};
  if (evidenceRecords.length > 0) adjacentData.evidenceRecords = evidenceRecords;
  if (layoutDecisions.length > 0) adjacentData.layoutDecisions = layoutDecisions;
  if (modelRecommendations.length > 0) adjacentData.modelRecommendations = modelRecommendations;
  return adjacentData;
}

function parseJsonlArchiveRecords<T>(
  bytes: Uint8Array | undefined,
  filename: string,
  parseRecord: (input: unknown) => T,
): T[] {
  if (!bytes) return [];
  const text = strFromU8(bytes);
  if (text.trim().length === 0) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(`${filename} line ${index + 1} is not valid JSON: ${errorMessage(error)}`);
      }
      try {
        return parseRecord(parsed);
      } catch (error) {
        throw new Error(`${filename} line ${index + 1} is invalid: ${errorMessage(error)}`);
      }
    });
}

function parseModelRecommendationsArchiveGeoJson(bytes: Uint8Array): ModelRecommendation[] {
  let input: unknown;
  try {
    input = JSON.parse(strFromU8(bytes));
  } catch (error) {
    throw new Error(`${MODEL_RECOMMENDATIONS_GEOJSON_FILENAME} is not valid JSON: ${errorMessage(error)}`);
  }
  const value = recordValue(input, "Model recommendation archive import must be a GeoJSON FeatureCollection.");
  if (value.type !== "FeatureCollection") {
    throw new Error("Model recommendation archive import must be a GeoJSON FeatureCollection.");
  }
  if (value.schemaVersion !== "cplayout-model-recommendations-v1") {
    throw new Error(`Unsupported model recommendation schema version: ${String(value.schemaVersion)}.`);
  }
  if (value.coordinateReferenceSystem !== "project_crs_xy") {
    throw new Error("Model recommendation GeoJSON must use project_crs_xy coordinates.");
  }
  if (value.canonicalGeometryMutation !== false) {
    throw new Error("Model recommendation GeoJSON must declare canonicalGeometryMutation: false.");
  }

  const grouped = new Map<string, {
    base: Record<string, unknown>;
    geometry: ModelRecommendationGeometry;
    singletonRoles: Set<string>;
  }>();
  for (const featureInput of arrayValue(value.features)) {
    const feature = recordValue(featureInput, "GeoJSON recommendation feature must be an object.");
    const properties = recordValue(feature.properties, "GeoJSON recommendation feature must include properties.");
    const id = stringValue(properties.id, "GeoJSON recommendation feature must include properties.id.");
    if (properties.coordinateReferenceSystem !== "project_crs_xy") {
      throw new Error(`GeoJSON recommendation feature ${id} must use project_crs_xy coordinates.`);
    }
    const group = grouped.get(id) ?? {
      base: properties,
      geometry: { projectCrs: stringValue(properties.projectCrs, "GeoJSON recommendation feature must include projectCrs.") },
      singletonRoles: new Set<string>(),
    };
    validateGroupedRecommendationProperties(id, group.base, properties);
    applyArchiveRecommendationFeatureGeometry(id, group, feature, properties.geometryRole);
    grouped.set(id, group);
  }

  return [...grouped.values()].map(({ base, geometry }) => parseModelRecommendation({
    id: base.id,
    projectId: base.projectId,
    modelName: base.modelName,
    modelVersion: base.modelVersion,
    createdAt: base.createdAt,
    projectCrs: base.projectCrs,
    summary: base.summary,
    proposedGeometry: recommendationGeometryWithDisplayWgs84(geometry, base.displayWgs84),
    confidence: base.confidence,
    evidenceIds: arrayValue(base.evidenceIds),
    reviewStatus: base.reviewStatus,
    score: base.score === null ? undefined : base.score,
    scoreBreakdown: base.scoreBreakdown === null ? undefined : base.scoreBreakdown,
    metadata: base.metadata === null ? undefined : base.metadata,
    warnings: arrayValue(base.warnings),
  }));
}

function applyArchiveRecommendationFeatureGeometry(
  id: string,
  group: {
    base: Record<string, unknown>;
    geometry: ModelRecommendationGeometry;
    singletonRoles: Set<string>;
  },
  feature: Record<string, unknown>,
  geometryRole: unknown,
): void {
  if (geometryRole === "pivot_center") {
    rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
    group.geometry.pivotCenter = pointFromFeature(feature, "pivot_center");
    return;
  }
  if (geometryRole === "field_boundary") {
    rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
    group.geometry.fieldBoundary = polygonFromFeature(feature, "field_boundary");
    return;
  }
  if (geometryRole === "obstacle_polygon") {
    group.geometry.obstaclePolygons = [...(group.geometry.obstaclePolygons ?? []), polygonFromFeature(feature, "obstacle_polygon")];
    return;
  }
  if (geometryRole === "metadata_only") {
    rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
    if (feature.geometry !== null) {
      throw new Error(`GeoJSON recommendation ${id} metadata_only feature must have null geometry.`);
    }
    return;
  }
  throw new Error(`Unsupported recommendation geometryRole: ${String(geometryRole)}.`);
}

function validateAdjacentProjectRecord(
  project: PivotProject,
  record: { id: string; projectId: string; projectCrs?: string },
  label: string,
): void {
  if (record.projectId !== project.id) {
    throw new Error(`${label} ${record.id} belongs to ${record.projectId}, not ${project.id}.`);
  }
  if (record.projectCrs !== undefined && record.projectCrs !== project.projectCrs) {
    throw new Error(`${label} ${record.id} uses ${record.projectCrs}, not ${project.projectCrs}.`);
  }
}

function recommendationGeometryWithDisplayWgs84(
  geometry: ModelRecommendationGeometry,
  displayWgs84: unknown,
): ModelRecommendationGeometry {
  if (displayWgs84 === undefined || displayWgs84 === null) return geometry;
  return { ...geometry, displayWgs84: arrayValue(displayWgs84) as ModelRecommendationGeometry["displayWgs84"] };
}

function validateGroupedRecommendationProperties(
  id: string,
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
): void {
  const keys = [
    "id",
    "projectId",
    "projectCrs",
    "coordinateReferenceSystem",
    "createdAt",
    "modelName",
    "modelVersion",
    "confidence",
    "reviewStatus",
    "score",
    "summary",
    "warnings",
    "evidenceIds",
    "metadata",
    "scoreBreakdown",
    "displayWgs84",
  ];
  for (const key of keys) {
    if (!jsonEquivalent(base[key], candidate[key])) {
      throw new Error(`GeoJSON recommendation feature group ${id} has mismatched ${key}.`);
    }
  }
}

function rejectDuplicateSingletonRole(id: string, roles: Set<string>, role: string): void {
  if (roles.has(role)) throw new Error(`GeoJSON recommendation ${id} contains duplicate ${role} geometry.`);
  roles.add(role);
}

function pointFromFeature(feature: Record<string, unknown>, role: string): XY {
  const geometry = recordValue(feature.geometry, `GeoJSON ${role} feature must include geometry.`);
  if (geometry.type !== "Point") throw new Error(`GeoJSON ${role} feature must use Point geometry.`);
  const coordinates = arrayValue(geometry.coordinates);
  return { x: numberValue(coordinates[0], `${role} x coordinate is invalid.`), y: numberValue(coordinates[1], `${role} y coordinate is invalid.`) };
}

function polygonFromFeature(feature: Record<string, unknown>, role: string): XY[] {
  const geometry = recordValue(feature.geometry, `GeoJSON ${role} feature must include geometry.`);
  if (geometry.type !== "Polygon") throw new Error(`GeoJSON ${role} feature must use Polygon geometry.`);
  const rings = arrayValue(geometry.coordinates);
  const outerRing = arrayValue(rings[0]);
  const points = outerRing.map((coordinate) => {
    const pair = arrayValue(coordinate);
    return { x: numberValue(pair[0], `${role} x coordinate is invalid.`), y: numberValue(pair[1], `${role} y coordinate is invalid.`) };
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) points.pop();
  return points;
}

function recordValue(input: unknown, message: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(message);
  return input as Record<string, unknown>;
}

function arrayValue(input: unknown): unknown[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error("Expected an array.");
  return input;
}

function stringValue(input: unknown, message: string): string {
  if (typeof input !== "string" || input.length === 0) throw new Error(message);
  return input;
}

function numberValue(input: unknown, message: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) throw new Error(message);
  return input;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
