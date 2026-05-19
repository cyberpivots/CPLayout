import { importProjectedGeoJsonToProject, importSurveyCsvToProject } from "./projectImports";
import { PivotProjectSchema } from "./projectDocument";
import type { ProjectSettings } from "./settings";
import type { LonLat, ObstacleZone, PivotMachine, PivotProject, SurveyPoint, UnitSystem, XY } from "./types";

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
  | { type: "commit_obstacle_draft"; vertices: XY[]; kind?: ObstacleZone["kind"]; name?: string; id?: string }
  | { type: "move_boundary_vertex"; vertexIndex: number; point: XY }
  | { type: "delete_boundary_vertex"; vertexIndex: number }
  | { type: "move_obstacle_vertex"; obstacleId: string; vertexIndex: number; point: XY }
  | { type: "delete_obstacle_vertex"; obstacleId: string; vertexIndex: number }
  | { type: "place_pivot"; point: XY; wgs84?: LonLat }
  | { type: "move_infrastructure"; pointType: InfrastructurePoint; point: XY; wgs84?: LonLat }
  | { type: "add_survey_point"; point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string } }
  | { type: "update_survey_point"; point: SurveyPoint }
  | { type: "delete_survey_point"; id: string }
  | { type: "promote_survey_point"; id: string; target: InfrastructurePoint }
  | { type: "update_machine"; machine: PivotMachine }
  | { type: "update_project_settings"; unitSystem: UnitSystem; settings: ProjectSettings }
  | { type: "import_projected_geojson"; geoJson: string | unknown }
  | { type: "import_survey_csv"; csv: string }
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
            obstacleFromDraft(state.project, action.vertices, action.kind ?? "exclusion", action.name, action.id),
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
      case "promote_survey_point":
        return promoteSurveyPoint(state, action.id, action.target);
      case "update_machine":
        return applyProjectChange(state, { ...state.project, machine: action.machine });
      case "update_project_settings":
        return applyProjectChange(state, {
          ...state.project,
          unitSystem: action.unitSystem,
          settings: action.settings,
        });
      case "import_projected_geojson":
        return applyProjectChange(state, importProjectedGeoJsonToProject(state.project, action.geoJson).project);
      case "import_survey_csv":
        return applyProjectChange(state, importSurveyCsvToProject(state.project, action.csv).project);
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

function promoteSurveyPoint(state: ProjectEditorState, id: string, target: InfrastructurePoint): ProjectEditorState {
  const surveyPoint = state.project.surveyPoints.find((candidate) => candidate.id === id);
  if (!surveyPoint) throw new Error(`Survey point ${id} was not found.`);
  return moveInfrastructurePoint(state, target, surveyPoint.projected, surveyPoint.wgs84);
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
    confidence: "user_estimated",
  };
}

function validatedRing(vertices: XY[], label: string): XY[] {
  const ring = removeClosingDuplicate(vertices);
  if (ring.length < 3) throw new Error(`${label} needs at least three vertices before commit.`);
  if (ring.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y))) {
    throw new Error(`${label} contains a non-finite coordinate.`);
  }
  return ring;
}

function removeClosingDuplicate(vertices: XY[]): XY[] {
  if (vertices.length < 2) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return first.x === last.x && first.y === last.y ? vertices.slice(0, -1) : vertices;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
