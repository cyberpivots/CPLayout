import {
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
  type LayoutDecisionRecord,
  type LayoutEvidenceRecord,
  type ModelRecommendation,
  type ModelRecommendationGeometry,
} from "@cplayout/core";
import { projectRepository } from "./projectRepository";

const REVIEW_STORAGE_PREFIX = "center-pivot-layout-review-data-v1";
const MODEL_RECOMMENDATION_SCHEMA_VERSION = "cplayout-model-recommendations-v1";
export const PROJECT_REVIEW_DATA_SCHEMA_VERSION = "cplayout-project-review-data-v1";

export interface ProjectReviewData {
  evidenceRecords: LayoutEvidenceRecord[];
  modelRecommendations: ModelRecommendation[];
  layoutDecisions: LayoutDecisionRecord[];
}

interface ProjectReviewDataEnvelope extends ProjectReviewData {
  schemaVersion: typeof PROJECT_REVIEW_DATA_SCHEMA_VERSION;
  projectId: string;
}

type RecommendationImportInput = string | unknown;

export async function loadProjectReviewDataAsync(projectId: string): Promise<ProjectReviewData> {
  if (typeof localStorage === "undefined") return emptyReviewData();
  const raw = localStorage.getItem(reviewStorageKey(projectId));
  if (!raw) return emptyReviewData();
  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Stored project review data for ${projectId} is not valid JSON: ${errorMessage(error)}`);
  }
  try {
    return parseProjectReviewData(projectId, parsedInput);
  } catch (error) {
    throw new Error(`Stored project review data for ${projectId} is invalid: ${errorMessage(error)}`);
  }
}

export async function saveProjectReviewDataAsync(projectId: string, data: Partial<ProjectReviewData>): Promise<void> {
  const parsed = parseProjectReviewData(projectId, {
    evidenceRecords: data.evidenceRecords ?? [],
    modelRecommendations: data.modelRecommendations ?? [],
    layoutDecisions: data.layoutDecisions ?? [],
  });
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(reviewStorageKey(projectId), JSON.stringify(reviewDataEnvelope(projectId, parsed)));
}

export async function appendLayoutDecisionAsync(
  projectId: string,
  decision: LayoutDecisionRecord,
): Promise<ProjectReviewData> {
  const parsedDecision = parseLayoutDecisionRecord(decision);
  if (parsedDecision.projectId !== projectId) {
    throw new Error(`Layout decision ${parsedDecision.id} belongs to ${parsedDecision.projectId}, not ${projectId}.`);
  }
  const data = await loadProjectReviewDataAsync(projectId);
  const nextData: ProjectReviewData = {
    ...data,
    layoutDecisions: [...data.layoutDecisions, parsedDecision],
  };
  await saveProjectReviewDataAsync(projectId, nextData);
  return nextData;
}

export async function importModelRecommendationsAsync(
  projectId: string,
  input: RecommendationImportInput,
): Promise<ModelRecommendation[]> {
  const project = await projectRepository.loadProjectAsync(projectId);
  if (!project) throw new Error(`Project ${projectId} must be saved locally before model recommendations can be imported.`);
  const parsedInput = typeof input === "string" ? JSON.parse(input) : input;
  rejectHiddenKeyProvenance(parsedInput);
  rejectUnsupportedSchemaVersion(parsedInput);

  const recommendations = parseRecommendationInput(parsedInput).map(parseModelRecommendation);
  for (const recommendation of recommendations) {
    if (recommendation.projectId !== projectId) {
      throw new Error(`Model recommendation ${recommendation.id} belongs to ${recommendation.projectId}, not ${projectId}.`);
    }
    if (recommendation.projectCrs !== project.projectCrs) {
      throw new Error(`Model recommendation ${recommendation.id} uses ${recommendation.projectCrs}, not ${project.projectCrs}.`);
    }
    if (recommendation.proposedGeometry.projectCrs !== project.projectCrs) {
      throw new Error(`Model recommendation ${recommendation.id} proposed geometry uses ${recommendation.proposedGeometry.projectCrs}, not ${project.projectCrs}.`);
    }
  }

  const data = await loadProjectReviewDataAsync(projectId);
  const byId = new Map(data.modelRecommendations.map((recommendation) => [recommendation.id, recommendation]));
  recommendations.forEach((recommendation) => byId.set(recommendation.id, recommendation));
  await saveProjectReviewDataAsync(projectId, {
    ...data,
    modelRecommendations: [...byId.values()],
  });
  return recommendations;
}

function parseProjectReviewData(projectId: string, input: unknown): ProjectReviewData {
  const value = recordValue(input, "Project review data must be an object.");
  if (value.schemaVersion !== undefined) {
    if (value.schemaVersion !== PROJECT_REVIEW_DATA_SCHEMA_VERSION) {
      throw new Error(`Unsupported project review data schema version: ${String(value.schemaVersion)}.`);
    }
    if (value.projectId !== projectId) {
      throw new Error(`Project review data belongs to ${String(value.projectId)}, not ${projectId}.`);
    }
  }
  const data: ProjectReviewData = {
    evidenceRecords: arrayValue(value.evidenceRecords).map(parseLayoutEvidenceRecord),
    modelRecommendations: arrayValue(value.modelRecommendations).map(parseModelRecommendation),
    layoutDecisions: arrayValue(value.layoutDecisions).map(parseLayoutDecisionRecord),
  };
  for (const record of [...data.evidenceRecords, ...data.modelRecommendations, ...data.layoutDecisions]) {
    if (record.projectId !== projectId) {
      throw new Error(`Project review record ${record.id} belongs to ${record.projectId}, not ${projectId}.`);
    }
  }
  return data;
}

function parseRecommendationInput(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  const value = recordValue(input, "Model recommendation import must be a JSON array or GeoJSON FeatureCollection.");
  if (value.type !== "FeatureCollection") {
    throw new Error("Model recommendation import must be a JSON array or GeoJSON FeatureCollection.");
  }
  if (value.schemaVersion !== MODEL_RECOMMENDATION_SCHEMA_VERSION) {
    throw new Error(`Unsupported model recommendation schema version: ${String(value.schemaVersion)}.`);
  }
  if (value.coordinateReferenceSystem !== undefined && value.coordinateReferenceSystem !== "project_crs_xy") {
    throw new Error("Model recommendation GeoJSON must use project_crs_xy coordinates.");
  }
  if (value.canonicalGeometryMutation !== undefined && value.canonicalGeometryMutation !== false) {
    throw new Error("Model recommendation GeoJSON must not declare canonical geometry mutation.");
  }
  const features = arrayValue(value.features);
  const grouped = new Map<string, {
    base: Record<string, unknown>;
    geometry: ModelRecommendationGeometry;
    singletonRoles: Set<string>;
  }>();
  for (const featureInput of features) {
    const feature = recordValue(featureInput, "GeoJSON recommendation feature must be an object.");
    const properties = recordValue(feature.properties, "GeoJSON recommendation feature must include properties.");
    const id = stringValue(properties.id, "GeoJSON recommendation feature must include properties.id.");
    if (properties.coordinateReferenceSystem !== undefined && properties.coordinateReferenceSystem !== "project_crs_xy") {
      throw new Error(`GeoJSON recommendation feature ${id} must use project_crs_xy coordinates.`);
    }
    const group = grouped.get(id) ?? {
      base: properties,
      geometry: { projectCrs: stringValue(properties.projectCrs, "GeoJSON recommendation feature must include projectCrs.") },
      singletonRoles: new Set<string>(),
    };
    validateGroupedRecommendationProperties(id, group.base, properties);
    const geometryRole = properties.geometryRole;
    if (geometryRole === "pivot_center") {
      rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
      group.geometry.pivotCenter = pointFromFeature(feature, "pivot_center");
    } else if (geometryRole === "field_boundary") {
      rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
      group.geometry.fieldBoundary = polygonFromFeature(feature, "field_boundary");
    } else if (geometryRole === "obstacle_polygon") {
      group.geometry.obstaclePolygons = [...(group.geometry.obstaclePolygons ?? []), polygonFromFeature(feature, "obstacle_polygon")];
    } else if (geometryRole !== "metadata_only") {
      throw new Error(`Unsupported recommendation geometryRole: ${String(geometryRole)}.`);
    } else {
      rejectDuplicateSingletonRole(id, group.singletonRoles, geometryRole);
    }
    grouped.set(id, group);
  }
  return [...grouped.values()].map(({ base, geometry }) => ({
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
    warnings: arrayValue(base.warnings),
  }));
}

function rejectUnsupportedSchemaVersion(input: unknown): void {
  if (Array.isArray(input)) return;
  if (!input || typeof input !== "object") return;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== MODEL_RECOMMENDATION_SCHEMA_VERSION) {
    throw new Error(`Unsupported model recommendation schema version: ${String(version)}.`);
  }
}

function rejectHiddenKeyProvenance(input: unknown): void {
  if (!input || typeof input !== "object") return;
  if (Array.isArray(input)) {
    input.forEach(rejectHiddenKeyProvenance);
    return;
  }
  const value = input as Record<string, unknown>;
  if (value.keyedService === true || typeof value.apiKey === "string" || typeof value.accessToken === "string") {
    throw new Error("Model recommendation imports cannot contain hidden-key imagery provenance.");
  }
  Object.values(value).forEach(rejectHiddenKeyProvenance);
}

function reviewDataEnvelope(projectId: string, data: ProjectReviewData): ProjectReviewDataEnvelope {
  return {
    schemaVersion: PROJECT_REVIEW_DATA_SCHEMA_VERSION,
    projectId,
    ...data,
  };
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

function jsonEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function pointFromFeature(feature: Record<string, unknown>, role: string): { x: number; y: number } {
  const geometry = recordValue(feature.geometry, `GeoJSON ${role} feature must include geometry.`);
  if (geometry.type !== "Point") throw new Error(`GeoJSON ${role} feature must use Point geometry.`);
  const coordinates = arrayValue(geometry.coordinates);
  return { x: numberValue(coordinates[0], `${role} x coordinate is invalid.`), y: numberValue(coordinates[1], `${role} y coordinate is invalid.`) };
}

function polygonFromFeature(feature: Record<string, unknown>, role: string): { x: number; y: number }[] {
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

function emptyReviewData(): ProjectReviewData {
  return { evidenceRecords: [], modelRecommendations: [], layoutDecisions: [] };
}

function reviewStorageKey(projectId: string): string {
  return `${REVIEW_STORAGE_PREFIX}:${projectId}`;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
