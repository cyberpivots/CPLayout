import type { AppSettings, InfrastructurePoint, LayoutResult, LonLat, MappingWorkflowMode, ModelRecommendation, ObstacleZone, PivotProject, ProjectMapFeature, SourceConfidence, SurveyPoint, XY } from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";

export interface MapSurfaceProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
  activeToolMode?: DrawingMode;
  activeLayer?: DrawingLayerType;
  draftVertices?: XY[];
  homeView?: boolean;
  selectedMapFeatureId?: string | null;
  advisoryRecommendationPreview?: ModelRecommendation | null;
  onMappingWorkflowModeChange?: (mode: MappingWorkflowMode) => void;
  onCommitBoundaryDraft?: (vertices: XY[]) => void;
  onCommitObstacleDraft?: (vertices: XY[], kind: ObstacleZone["kind"], confidence?: SourceConfidence) => void;
  onMoveBoundaryVertex?: (vertexIndex: number, point: XY) => void;
  onDeleteBoundaryVertex?: (vertexIndex: number) => void;
  onMoveObstacleVertex?: (obstacleId: string, vertexIndex: number, point: XY) => void;
  onDeleteObstacleVertex?: (obstacleId: string, vertexIndex: number) => void;
  onPlacePivot?: (point: XY, wgs84?: LonLat) => void;
  onMoveInfrastructurePoint?: (pointType: InfrastructurePoint, point: XY, wgs84?: LonLat) => void;
  onAddSurveyPoint?: (point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string }) => void;
  onAddMapFeature?: (feature: Omit<ProjectMapFeature, "id"> & { id?: string }) => void;
  onSelectMapFeature?: (featureId: string | null) => void;
}
