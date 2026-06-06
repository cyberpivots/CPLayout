import type { ReactNode } from "react";
import type { AppSettings, InfrastructurePoint, LayoutResult, LonLat, MappingWorkflowMode, ObstacleZone, PivotProject, ProjectMapFeature, ProjectMapFeatureKind, SourceConfidence, SurveyPoint, XY } from "@cplayout/core";
import type { AdvisoryFieldPivotPlan, DrawingLayerType, DrawingMode } from "@cplayout/geometry";

export interface MapSurfaceProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
  activeToolMode?: DrawingMode;
  activeLayer?: DrawingLayerType;
  activeMapFeatureKind?: ProjectMapFeatureKind;
  activeToolRequestId?: number;
  advisoryFieldPivotPlan?: AdvisoryFieldPivotPlan;
  bottomOverlay?: ReactNode;
  draftVertices?: XY[];
  homeView?: boolean;
  selectedMapFeatureId?: string | null;
  onSettingsChange?: (settings: AppSettings) => void;
  onMappingWorkflowModeChange?: (mode: MappingWorkflowMode) => void;
  onCommitBoundaryDraft?: (vertices: XY[]) => boolean | void;
  onCommitObstacleDraft?: (vertices: XY[], kind: ObstacleZone["kind"], confidence?: SourceConfidence) => boolean | void;
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
