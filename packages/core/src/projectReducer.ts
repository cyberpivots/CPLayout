import { importProjectedGeoJsonToProject, importSurveyCsvToProject } from "./projectImports";
import { modelRecommendationHardFailures, type ModelRecommendation } from "./layoutEvidence";
import { PivotProjectSchema } from "./projectDocument";
import type { ProjectSettings } from "./settings";
import type { LonLat, ObstacleZone, PivotMachine, PivotProject, ProjectMapFeature, SourceConfidence, SurveyPoint, UnitSystem, XY } from "./types";

export interface ProjectEditorState {
  project: PivotProject;
  past: PivotProject[];
  future: PivotProject[];
  lastError: string | null;
  revision: number;
}

export type InfrastructurePoint = "pivot_center" | "water_source" | "power_source";

export type ProjectEditorAction =
  | { type: "load_project"; project: PivotProject }
  | { type: "commit_boundary_draft"; vertices: XY[] }
  | { type: "commit_obstacle_draft"; vertices: XY[]; kind?: ObstacleZone["kind"]; name?: string; id?: string; confidence?: SourceConfidence }
  | { type: "move_boundary_vertex"; vertexIndex: number; point: XY }
  | { type: "delete_boundary_vertex"; vertexIndex: number }
  | { type: "move_obstacle_vertex"; obstacleId: string; vertexIndex: number; point: XY }
  | { type: "delete_obstacle_vertex"; obstacleId: string; vertexIndex: number }
  | { type: "place_pivot"; point: XY; wgs84?: LonLat }
  | { type: "move_infrastructure"; pointType: InfrastructurePoint; point: XY; wgs84?: LonLat }
  | { type: "add_survey_point"; point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string } }
  | { type: "update_survey_point"; point: SurveyPoint }
  | { type: "delete_survey_point"; id: string }
  | { type: "add_map_feature"; feature: ProjectMapFeature }
  | { type: "update_map_feature"; feature: ProjectMapFeature }
  | { type: "delete_map_feature"; id: string }
  | { type: "promote_survey_point"; id: string; target: InfrastructurePoint }
  | { type: "update_machine"; machine: PivotMachine }
  | { type: "apply_model_recommendation"; recommendation: ModelRecommendation }
  | { type: "update_project_settings"; unitSystem: UnitSystem; settings: ProjectSettings }
  | { type: "import_projected_geojson"; geoJson: string | unknown }
  | { type: "import_survey_csv"; csv: string }
  | { type: "apply_project_import"; project: PivotProject }
  | { type: "cancel_draft" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear_error" };

export function createProjectEditorState(project: PivotProject): ProjectEditorState {
  return {
    project: PivotProjectSchema.parse(project),
    past: [],
    future: [],
    lastError: null,
    revision: 0,
  };
}

export function reduceProjectEditorState(state: ProjectEditorState, action: ProjectEditorAction): ProjectEditorState {
  try {
    switch (action.type) {
      case "load_project":
        return createProjectEditorState(action.project);
      case "commit_boundary_draft":
        return applyProjectChange(state, {
          ...state.project,
          fieldBoundary: validatedRing(action.vertices, "Boundary draft"),
        });
      case "commit_obstacle_draft":
        return applyProjectChange(state, {
          ...state.project,
          obstacles: [
            ...state.project.obstacles,
            obstacleFromDraft(state.project, action.vertices, action.kind ?? "exclusion", action.name, action.id, action.confidence),
          ],
        });
      case "move_boundary_vertex":
        return moveBoundaryVertex(state, action.vertexIndex, action.point);
      case "delete_boundary_vertex":
        return deleteBoundaryVertex(state, action.vertexIndex);
      case "move_obstacle_vertex":
        return moveObstacleVertex(state, action.obstacleId, action.vertexIndex, action.point);
      case "delete_obstacle_vertex":
        return deleteObstacleVertex(state, action.obstacleId, action.vertexIndex);
      case "place_pivot":
        return moveInfrastructurePoint(state, "pivot_center", action.point, action.wgs84);
      case "move_infrastructure":
        return moveInfrastructurePoint(state, action.pointType, action.point, action.wgs84);
      case "add_survey_point":
        return addSurveyPoint(state, action.point);
      case "update_survey_point":
        return updateSurveyPoint(state, action.point);
      case "delete_survey_point":
        return deleteSurveyPoint(state, action.id);
      case "add_map_feature":
        return addMapFeature(state, action.feature);
      case "update_map_feature":
        return updateMapFeature(state, action.feature);
      case "delete_map_feature":
        return deleteMapFeature(state, action.id);
      case "promote_survey_point":
        return promoteSurveyPoint(state, action.id, action.target);
      case "update_machine":
        return applyProjectChange(state, { ...state.project, machine: action.machine });
      case "apply_model_recommendation":
        return applyModelRecommendation(state, action.recommendation);
      case "update_project_settings":
        if (state.project.unitSystem === action.unitSystem && projectSettingsEqual(state.project.settings, action.settings)) return state;
        return applyProjectChange(state, {
          ...state.project,
          unitSystem: action.unitSystem,
          settings: action.settings,
        });
      case "import_projected_geojson":
        return applyProjectChange(state, importProjectedGeoJsonToProject(state.project, action.geoJson).project);
      case "import_survey_csv":
        return applyProjectChange(state, importSurveyCsvToProject(state.project, action.csv).project);
      case "apply_project_import":
        return applyProjectChange(state, action.project);
      case "cancel_draft":
        return { ...state, lastError: null };
      case "undo":
        return undo(state);
      case "redo":
        return redo(state);
      case "clear_error":
        return { ...state, lastError: null };
    }
  } catch (error) {
    return { ...state, lastError: error instanceof Error ? error.message : String(error) };
  }
}

function applyProjectChange(state: ProjectEditorState, nextProject: PivotProject): ProjectEditorState {
  const parsedProject = PivotProjectSchema.parse(nextProject);
  return {
    project: parsedProject,
    past: [...state.past, state.project],
    future: [],
    lastError: null,
    revision: state.revision + 1,
  };
}

function projectSettingsEqual(current: ProjectSettings | undefined, next: ProjectSettings): boolean {
  return JSON.stringify(current ?? null) === JSON.stringify(next);
}

function undo(state: ProjectEditorState): ProjectEditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    project: previous,
    past: state.past.slice(0, -1),
    future: [state.project, ...state.future],
    lastError: null,
    revision: state.revision + 1,
  };
}

function redo(state: ProjectEditorState): ProjectEditorState {
  const next = state.future[0];
  if (!next) return state;
  return {
    project: next,
    past: [...state.past, state.project],
    future: state.future.slice(1),
    lastError: null,
    revision: state.revision + 1,
  };
}

function moveInfrastructurePoint(state: ProjectEditorState, pointType: InfrastructurePoint, point: XY, wgs84?: LonLat): ProjectEditorState {
  const project = state.project;
  if (pointType === "pivot_center") {
    return applyProjectChange(state, {
      ...project,
      pivotCenter: point,
      surveyPoints: project.surveyPoints.map((surveyPoint) => surveyPoint.role === "pivot_center"
        ? { ...surveyPoint, projected: point, wgs84: wgs84 ?? surveyPoint.wgs84 }
        : surveyPoint),
    });
  }
  if (pointType === "water_source") return applyProjectChange(state, { ...project, waterSource: point });
  return applyProjectChange(state, { ...project, powerSource: point });
}

function addSurveyPoint(
  state: ProjectEditorState,
  point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string },
): ProjectEditorState {
  const nextPoint: SurveyPoint = {
    ...point,
    id: point.id ?? `survey-${state.project.surveyPoints.length + 1}-${Date.now()}`,
    observedAt: point.observedAt ?? new Date().toISOString(),
  };
  return applyProjectChange(state, {
    ...state.project,
    surveyPoints: [...state.project.surveyPoints, nextPoint],
  });
}

function updateSurveyPoint(state: ProjectEditorState, point: SurveyPoint): ProjectEditorState {
  if (!state.project.surveyPoints.some((surveyPoint) => surveyPoint.id === point.id)) {
    throw new Error(`Survey point ${point.id} was not found.`);
  }
  return applyProjectChange(state, {
    ...state.project,
    surveyPoints: state.project.surveyPoints.map((surveyPoint) => surveyPoint.id === point.id ? point : surveyPoint),
  });
}

function deleteSurveyPoint(state: ProjectEditorState, id: string): ProjectEditorState {
  if (!state.project.surveyPoints.some((surveyPoint) => surveyPoint.id === id)) {
    throw new Error(`Survey point ${id} was not found.`);
  }
  return applyProjectChange(state, {
    ...state.project,
    surveyPoints: state.project.surveyPoints.filter((surveyPoint) => surveyPoint.id !== id),
  });
}

function addMapFeature(state: ProjectEditorState, feature: ProjectMapFeature): ProjectEditorState {
  if ((state.project.mapFeatures ?? []).some((mapFeature) => mapFeature.id === feature.id)) {
    throw new Error(`Map feature ${feature.id} already exists.`);
  }
  return applyProjectChange(state, {
    ...state.project,
    mapFeatures: [...(state.project.mapFeatures ?? []), feature],
  });
}

function updateMapFeature(state: ProjectEditorState, feature: ProjectMapFeature): ProjectEditorState {
  if (!(state.project.mapFeatures ?? []).some((mapFeature) => mapFeature.id === feature.id)) {
    throw new Error(`Map feature ${feature.id} was not found.`);
  }
  return applyProjectChange(state, {
    ...state.project,
    mapFeatures: (state.project.mapFeatures ?? []).map((mapFeature) => mapFeature.id === feature.id ? feature : mapFeature),
  });
}

function deleteMapFeature(state: ProjectEditorState, id: string): ProjectEditorState {
  if (!(state.project.mapFeatures ?? []).some((mapFeature) => mapFeature.id === id)) {
    throw new Error(`Map feature ${id} was not found.`);
  }
  return applyProjectChange(state, {
    ...state.project,
    mapFeatures: (state.project.mapFeatures ?? []).filter((mapFeature) => mapFeature.id !== id),
  });
}

function promoteSurveyPoint(state: ProjectEditorState, id: string, target: InfrastructurePoint): ProjectEditorState {
  const surveyPoint = state.project.surveyPoints.find((candidate) => candidate.id === id);
  if (!surveyPoint) throw new Error(`Survey point ${id} was not found.`);
  return moveInfrastructurePoint(state, target, surveyPoint.projected, surveyPoint.wgs84);
}

function applyModelRecommendation(state: ProjectEditorState, recommendation: ModelRecommendation): ProjectEditorState {
  const geometry = recommendation.proposedGeometry;
  const hardFailures = modelRecommendationHardFailures(recommendation);
  if (hardFailures.length > 0) {
    throw new Error(`Recommendation ${recommendation.id} is hard infeasible: ${hardFailures.join("; ")}`);
  }
  if (recommendation.projectId !== state.project.id) {
    throw new Error(`Recommendation ${recommendation.id} belongs to ${recommendation.projectId}, not ${state.project.id}.`);
  }
  if (recommendation.projectCrs !== state.project.projectCrs || geometry.projectCrs !== state.project.projectCrs) {
    throw new Error(`Recommendation ${recommendation.id} does not match project CRS ${state.project.projectCrs}.`);
  }

  let changed = false;
  let nextProject: PivotProject = state.project;
  if (geometry.fieldBoundary) {
    nextProject = {
      ...nextProject,
      fieldBoundary: validatedRing(geometry.fieldBoundary, "Recommendation boundary"),
    };
    changed = true;
  }
  if (geometry.pivotCenter) {
    assertPointInsideRing(geometry.pivotCenter, nextProject.fieldBoundary, `Recommendation ${recommendation.id} pivot center`);
    nextProject = {
      ...nextProject,
      pivotCenter: geometry.pivotCenter,
      surveyPoints: nextProject.surveyPoints.map((surveyPoint) => surveyPoint.role === "pivot_center"
        ? { ...surveyPoint, projected: geometry.pivotCenter as XY }
        : surveyPoint),
    };
    changed = true;
  }
  if (geometry.fieldBoundary && !geometry.pivotCenter) {
    assertPointInsideRing(nextProject.pivotCenter, nextProject.fieldBoundary, `Current pivot center after applying recommendation ${recommendation.id}`);
  }
  if (geometry.machine) {
    nextProject = { ...nextProject, machine: geometry.machine };
    changed = true;
  }
  if (geometry.obstaclePolygons) {
    nextProject = {
      ...nextProject,
      obstacles: [
        ...nextProject.obstacles,
        ...geometry.obstaclePolygons.map((polygon, index) => obstacleFromDraft(
          nextProject,
          polygon,
          "exclusion",
          `Recommendation Obstacle ${nextProject.obstacles.length + index + 1}`,
          `${recommendation.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-obstacle-${index + 1}`,
        )),
      ],
    };
    changed = true;
  }

  if (!changed) {
    throw new Error(`Recommendation ${recommendation.id} does not include projected geometry to apply.`);
  }
  return applyProjectChange(state, nextProject);
}

function moveBoundaryVertex(state: ProjectEditorState, vertexIndex: number, point: XY): ProjectEditorState {
  const fieldBoundary = replaceVertex(state.project.fieldBoundary, vertexIndex, point, "Boundary vertex");
  return applyProjectChange(state, { ...state.project, fieldBoundary: validatedRing(fieldBoundary, "Boundary") });
}

function deleteBoundaryVertex(state: ProjectEditorState, vertexIndex: number): ProjectEditorState {
  const fieldBoundary = removeVertex(state.project.fieldBoundary, vertexIndex, "Boundary vertex");
  return applyProjectChange(state, { ...state.project, fieldBoundary: validatedRing(fieldBoundary, "Boundary") });
}

function moveObstacleVertex(state: ProjectEditorState, obstacleId: string, vertexIndex: number, point: XY): ProjectEditorState {
  const obstacles = state.project.obstacles.map((obstacle) => {
    if (obstacle.id !== obstacleId) return obstacle;
    const polygon = replaceVertex(obstacle.polygon, vertexIndex, point, "Obstacle vertex");
    return { ...obstacle, polygon: validatedRing(polygon, "Obstacle") };
  });
  if (obstacles === state.project.obstacles || !state.project.obstacles.some((obstacle) => obstacle.id === obstacleId)) {
    throw new Error(`Obstacle ${obstacleId} was not found.`);
  }
  return applyProjectChange(state, { ...state.project, obstacles });
}

function deleteObstacleVertex(state: ProjectEditorState, obstacleId: string, vertexIndex: number): ProjectEditorState {
  const obstacles = state.project.obstacles.map((obstacle) => {
    if (obstacle.id !== obstacleId) return obstacle;
    const polygon = removeVertex(obstacle.polygon, vertexIndex, "Obstacle vertex");
    return { ...obstacle, polygon: validatedRing(polygon, "Obstacle") };
  });
  if (!state.project.obstacles.some((obstacle) => obstacle.id === obstacleId)) {
    throw new Error(`Obstacle ${obstacleId} was not found.`);
  }
  return applyProjectChange(state, { ...state.project, obstacles });
}

function replaceVertex(vertices: XY[], vertexIndex: number, point: XY, label: string): XY[] {
  assertVertexIndex(vertices, vertexIndex, label);
  return vertices.map((vertex, index) => index === vertexIndex ? point : vertex);
}

function removeVertex(vertices: XY[], vertexIndex: number, label: string): XY[] {
  assertVertexIndex(vertices, vertexIndex, label);
  return vertices.filter((_vertex, index) => index !== vertexIndex);
}

function assertVertexIndex(vertices: XY[], vertexIndex: number, label: string): void {
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertices.length) {
    throw new Error(`${label} index ${vertexIndex} is outside the editable ring.`);
  }
}

function obstacleFromDraft(
  project: PivotProject,
  vertices: XY[],
  kind: ObstacleZone["kind"],
  name?: string,
  id?: string,
  confidence: SourceConfidence = "user_estimated",
): ObstacleZone {
  const ring = validatedRing(vertices, "Obstacle draft");
  const obstacleNumber = project.obstacles.length + 1;
  return {
    id: id ?? `${kind}-${obstacleNumber}`,
    name: name ?? `${titleCase(kind)} ${obstacleNumber}`,
    kind,
    polygon: ring,
    bufferMeters: 0,
    hardConflict: true,
    noSpray: true,
    confidence,
  };
}

function validatedRing(vertices: XY[], label: string): XY[] {
  const ring = removeClosingDuplicate(vertices);
  if (ring.length < 3) throw new Error(`${label} needs at least three vertices before commit.`);
  if (ring.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y))) {
    throw new Error(`${label} contains a non-finite coordinate.`);
  }
  assertNoDuplicateVertices(ring, label);
  if (Math.abs(signedArea(ring)) < 0.000001) {
    throw new Error(`${label} has degenerate area.`);
  }
  if (hasSelfIntersection(ring)) {
    throw new Error(`${label} must not self-intersect.`);
  }
  return ring;
}

function removeClosingDuplicate(vertices: XY[]): XY[] {
  if (vertices.length < 2) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return first.x === last.x && first.y === last.y ? vertices.slice(0, -1) : vertices;
}

function assertNoDuplicateVertices(ring: XY[], label: string): void {
  const seen = new Set<string>();
  for (const vertex of ring) {
    const key = `${vertex.x},${vertex.y}`;
    if (seen.has(key)) throw new Error(`${label} contains duplicate vertices.`);
    seen.add(key);
  }
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
  if (!pointInRing(point, ring)) {
    throw new Error(`${label} must be inside the field boundary.`);
  }
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

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
