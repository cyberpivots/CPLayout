import {
  projectLonLatToXy,
  type InfrastructurePoint,
  type LonLat,
  type MappingWorkflowMode,
  type ProjectMapFeature,
  type ProjectMapFeatureKind,
  type SourceConfidence,
  type SurveyPoint,
  type XY,
} from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";
import { defaultMapFeatureName, type UtilityFeatureGeometry } from "./mapTools";

export type BrowserMapClickIntent =
  | { type: "none"; reason: "pan" | "edit_vertices" | "review_layout_no_mutation" }
  | { type: "draft_vertex"; vertex: XY }
  | { type: "place_pivot"; point: XY; wgs84: LonLat }
  | { type: "move_infrastructure"; pointType: InfrastructurePoint; point: XY; wgs84: LonLat }
  | { type: "add_survey_point"; point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string } }
  | { type: "add_map_feature_point"; feature: Omit<ProjectMapFeature, "id"> & { id?: string } };

export interface BrowserMapClickIntentParams {
  activeLayer: DrawingLayerType;
  featureGeometry: UtilityFeatureGeometry;
  featureKind: ProjectMapFeatureKind;
  imageryEnabled: boolean;
  lonLat: LonLat;
  mode: DrawingMode;
  projectCrs: string;
  workflowMode: MappingWorkflowMode;
}

export function browserMapClickToProjectedIntent(params: BrowserMapClickIntentParams): BrowserMapClickIntent {
  if (params.workflowMode !== "design") return { type: "none", reason: "review_layout_no_mutation" };
  if (params.mode === "pan") return { type: "none", reason: "pan" };
  if (params.mode === "edit_vertices") return { type: "none", reason: "edit_vertices" };

  const point = projectLonLatToXy(params.lonLat, params.projectCrs);
  const confidence = confidenceForImagery(params.imageryEnabled);

  if (params.mode === "place_pivot") {
    if (params.activeLayer === "water_source" || params.activeLayer === "power_source") {
      return { type: "move_infrastructure", pointType: params.activeLayer, point, wgs84: params.lonLat };
    }
    return { type: "place_pivot", point, wgs84: params.lonLat };
  }

  if (params.mode === "capture_point") {
    return {
      type: "add_survey_point",
      point: {
        label: surveyLabelForLayer(params.activeLayer),
        role: surveyRoleForLayer(params.activeLayer),
        projected: point,
        wgs84: params.lonLat,
        source: "manual",
        confidence,
        notes: params.imageryEnabled ? "Captured from browser imagery; verify with field survey." : undefined,
      },
    };
  }

  if (params.mode === "measure" && params.featureGeometry === "Point") {
    return {
      type: "add_map_feature_point",
      feature: {
        name: defaultMapFeatureName(params.featureKind, params.featureGeometry, 1),
        kind: params.featureKind,
        geometry: { type: "Point", point },
        confidence,
        notes: params.imageryEnabled ? "Captured from browser imagery; verify with field survey." : undefined,
      },
    };
  }

  return { type: "draft_vertex", vertex: point };
}

export function confidenceForImagery(imageryEnabled: boolean): SourceConfidence {
  return imageryEnabled ? "imagery_digitized" : "user_estimated";
}

function surveyRoleForLayer(layer: DrawingLayerType): SurveyPoint["role"] {
  if (layer === "field_boundary") return "boundary";
  if (layer === "pivot_center") return "pivot_center";
  if (layer === "water_source") return "water_source";
  if (layer === "power_source") return "power_source";
  if (layer === "control_point") return "control";
  if (layer === "note_point") return "note";
  return "obstacle";
}

function surveyLabelForLayer(layer: DrawingLayerType): string {
  return `${surveyRoleForLayer(layer).replaceAll("_", " ")} point`;
}
