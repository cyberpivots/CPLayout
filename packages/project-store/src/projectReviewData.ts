import {
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
  type LayoutDecisionRecord,
  type LayoutEvidenceRecord,
  type ModelRecommendation,
  type ModelRecommendationGeometry,
  type PivotProject,
  type XY,
} from "@cplayout/core";
import { projectRepository } from "./projectRepository";

const REVIEW_STORAGE_PREFIX = "center-pivot-layout-review-data-v1";
const MODEL_RECOMMENDATION_SCHEMA_VERSION = "cplayout-model-recommendations-v1";
const DESIGN_VISION_REVIEW_SCHEMA_VERSION = "cplayout-design-vision-review-v1";
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

interface RawProjectReviewImport {
  evidenceRecords: unknown[];
  modelRecommendations: unknown[];
  layoutDecisions: unknown[];
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

  const importedData = parseReviewImportInput(parsedInput);
  const evidenceRecords = importedData.evidenceRecords.map(parseLayoutEvidenceRecord);
  const layoutDecisions = importedData.layoutDecisions.map(parseLayoutDecisionRecord);
  const recommendations = importedData.modelRecommendations.map(parseModelRecommendation);
  for (const record of [...evidenceRecords, ...layoutDecisions]) {
    if (record.projectId !== projectId) {
      throw new Error(`Review record ${record.id} belongs to ${record.projectId}, not ${projectId}.`);
    }
  }
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
    validateRecommendationGeometryForProject(recommendation, project);
  }

  const data = await loadProjectReviewDataAsync(projectId);
  const evidenceById = new Map(data.evidenceRecords.map((record) => [record.id, record]));
  const byId = new Map(data.modelRecommendations.map((recommendation) => [recommendation.id, recommendation]));
  const decisionById = new Map(data.layoutDecisions.map((decision) => [decision.id, decision]));
  evidenceRecords.forEach((record) => evidenceById.set(record.id, record));
  recommendations.forEach((recommendation) => byId.set(recommendation.id, recommendation));
  layoutDecisions.forEach((decision) => decisionById.set(decision.id, decision));
  await saveProjectReviewDataAsync(projectId, {
    ...data,
    evidenceRecords: [...evidenceById.values()],
    modelRecommendations: [...byId.values()],
    layoutDecisions: [...decisionById.values()],
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

function parseReviewImportInput(input: unknown): RawProjectReviewImport {
  if (Array.isArray(input)) {
    return { evidenceRecords: [], modelRecommendations: input, layoutDecisions: [] };
  }
  const value = recordValue(input, "Review import must be a JSON array, visual-layout-review JSON, or GeoJSON FeatureCollection.");
  if (value.schemaVersion === DESIGN_VISION_REVIEW_SCHEMA_VERSION) {
    const artifacts = value.artifacts;
    const metrics = value.metrics;
    return {
      evidenceRecords: arrayValue(value.layoutEvidenceRecords).map((record) => withVisionReviewEvidence(record, artifacts, metrics)),
      modelRecommendations: arrayValue(value.modelRecommendations),
      layoutDecisions: arrayValue(value.layoutDecisionRecords),
    };
  }
  if (
    value.modelRecommendations !== undefined
    || value.evidenceRecords !== undefined
    || value.layoutEvidenceRecords !== undefined
    || value.layoutDecisions !== undefined
    || value.layoutDecisionRecords !== undefined
  ) {
    return {
      evidenceRecords: [
        ...arrayValue(value.evidenceRecords),
        ...arrayValue(value.layoutEvidenceRecords).map((record) => withVisionReviewEvidence(record, value.artifacts, value.metrics)),
      ],
      modelRecommendations: arrayValue(value.modelRecommendations),
      layoutDecisions: [
        ...arrayValue(value.layoutDecisions),
        ...arrayValue(value.layoutDecisionRecords),
      ],
    };
  }
  return { evidenceRecords: [], modelRecommendations: parseRecommendationGeoJson(value), layoutDecisions: [] };
}

function parseRecommendationGeoJson(input: Record<string, unknown>): unknown[] {
  const value = input;
  if (Array.isArray(input)) return input;
  if (value.type !== "FeatureCollection") {
    throw new Error("Model recommendation import must be a JSON array, visual-layout-review JSON, or GeoJSON FeatureCollection.");
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

function withVisionReviewEvidence(record: unknown, artifacts: unknown, metrics: unknown): unknown {
  const value = recordValue(record, "Layout evidence record must be an object.");
  return {
    ...value,
    ...(artifacts === undefined ? {} : { artifacts }),
    ...(metrics === undefined ? {} : { metrics }),
  };
}

function rejectUnsupportedSchemaVersion(input: unknown): void {
  if (Array.isArray(input)) return;
  if (!input || typeof input !== "object") return;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== MODEL_RECOMMENDATION_SCHEMA_VERSION && version !== DESIGN_VISION_REVIEW_SCHEMA_VERSION && version !== PROJECT_REVIEW_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported review import schema version: ${String(version)}.`);
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

function validateRecommendationGeometryForProject(recommendation: ModelRecommendation, project: PivotProject): void {
  const geometry = recommendation.proposedGeometry;
  const fieldBoundary = geometry.fieldBoundary ? validatedRing(geometry.fieldBoundary, `Recommendation ${recommendation.id} boundary`) : project.fieldBoundary;
  if (geometry.fieldBoundary) {
    validatedRing(geometry.fieldBoundary, `Recommendation ${recommendation.id} boundary`);
  }
  for (const [index, polygon] of (geometry.obstaclePolygons ?? []).entries()) {
    validatedRing(polygon, `Recommendation ${recommendation.id} obstacle ${index + 1}`);
  }
  if (geometry.pivotCenter) {
    assertPointInsideRing(geometry.pivotCenter, fieldBoundary, `Recommendation ${recommendation.id} pivot center`);
  } else if (geometry.fieldBoundary) {
    assertPointInsideRing(project.pivotCenter, fieldBoundary, `Current pivot center with recommendation ${recommendation.id} boundary`);
  }
}

function validatedRing(vertices: XY[], label: string): XY[] {
  const ring = removeClosingDuplicate(vertices);
  if (ring.length < 3) throw new Error(`${label} needs at least three vertices.`);
  if (ring.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y))) {
    throw new Error(`${label} contains a non-finite coordinate.`);
  }
  const seen = new Set<string>();
  for (const vertex of ring) {
    const key = `${vertex.x},${vertex.y}`;
    if (seen.has(key)) throw new Error(`${label} contains duplicate vertices.`);
    seen.add(key);
  }
  if (Math.abs(signedArea(ring)) < 0.000001) throw new Error(`${label} has degenerate area.`);
  if (hasSelfIntersection(ring)) throw new Error(`${label} must not self-intersect.`);
  return ring;
}

function removeClosingDuplicate(vertices: XY[]): XY[] {
  if (vertices.length < 2) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return first.x === last.x && first.y === last.y ? vertices.slice(0, -1) : vertices;
}

function signedArea(ring: XY[]): number {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function hasSelfIntersection(ring: XY[]): boolean {
  for (let leftIndex = 0; leftIndex < ring.length; leftIndex += 1) {
    const leftStart = ring[leftIndex];
    const leftEnd = ring[(leftIndex + 1) % ring.length];
    for (let rightIndex = leftIndex + 1; rightIndex < ring.length; rightIndex += 1) {
      if (Math.abs(leftIndex - rightIndex) <= 1) continue;
      if (leftIndex === 0 && rightIndex === ring.length - 1) continue;
      const rightStart = ring[rightIndex];
      const rightEnd = ring[(rightIndex + 1) % ring.length];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return abC !== abD && cdA !== cdB;
}

function orientation(a: XY, b: XY, c: XY): -1 | 0 | 1 {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : -1;
}

function assertPointInsideRing(point: XY, ring: XY[], label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} contains a non-finite coordinate.`);
  }
  if (!pointInRing(point, ring)) throw new Error(`${label} must be inside the field boundary.`);
}

function pointInRing(point: XY, ring: XY[]): boolean {
  if (ring.some((vertex) => distance(vertex, point) < 0.000001)) return true;
  let inside = false;
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: XY, start: XY, end: XY): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000001) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) return false;
  const segmentLengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= segmentLengthSquared;
}

function distance(left: XY, right: XY): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
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
