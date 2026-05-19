import type { AppSettings, InfrastructurePoint, LayoutResult, ObstacleZone, PivotProject, SurveyPoint, XY } from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";

export interface MapSurfaceProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
  activeToolMode?: DrawingMode;
  activeLayer?: DrawingLayerType;
  draftVertices?: XY[];
  onCommitBoundaryDraft?: (vertices: XY[]) => void;
  onCommitObstacleDraft?: (vertices: XY[], kind: ObstacleZone["kind"]) => void;
  onMoveBoundaryVertex?: (vertexIndex: number, point: XY) => void;
  onDeleteBoundaryVertex?: (vertexIndex: number) => void;
  onMoveObstacleVertex?: (obstacleId: string, vertexIndex: number, point: XY) => void;
  onDeleteObstacleVertex?: (obstacleId: string, vertexIndex: number) => void;
  onPlacePivot?: (point: XY) => void;
  onMoveInfrastructurePoint?: (pointType: InfrastructurePoint, point: XY) => void;
  onAddSurveyPoint?: (point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string }) => void;
}
