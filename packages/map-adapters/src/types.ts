import type { AppSettings, LayoutResult, ObstacleZone, PivotProject, XY } from "@cplayout/core";
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
  onPlacePivot?: (point: XY) => void;
}
