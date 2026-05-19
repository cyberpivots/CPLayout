import type { XY } from "./types";

export const DRAWING_MODES = [
  "pan",
  "capture_point",
  "draw_boundary",
  "edit_vertices",
  "mark_obstacle",
  "place_pivot",
] as const;

export type DrawingMode = typeof DRAWING_MODES[number];

export const DRAWING_LAYER_TYPES = [
  "field_boundary",
  "obstacle",
  "road",
  "ditch",
  "fence",
  "tree",
  "canal",
  "building",
  "exclusion",
  "pivot_center",
] as const;

export type DrawingLayerType = typeof DRAWING_LAYER_TYPES[number];

export interface MapViewport {
  center: XY;
  baseWidthMeters: number;
  baseHeightMeters: number;
  zoomLevel: number;
}

export interface DrawingMapState {
  viewport: MapViewport;
  mode: DrawingMode;
  activeLayer: DrawingLayerType;
  draftVertices: XY[];
  selectedFeatureId: string | null;
  geometryRevision: number;
}

export type DrawingMapAction =
  | { type: "pan"; delta: XY }
  | { type: "pan_screen"; dxPixels: number; dyPixels: number; screenWidthPixels: number }
  | { type: "zoom"; factor: number }
  | { type: "set_mode"; mode: DrawingMode }
  | { type: "set_active_layer"; activeLayer: DrawingLayerType }
  | { type: "add_draft_vertex"; vertex: XY }
  | { type: "clear_draft" }
  | { type: "select_feature"; featureId: string | null };

export function createInitialViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  zoomLevel: number,
): MapViewport {
  const width = finitePositive(bounds.maxX - bounds.minX, 1000);
  const height = finitePositive(bounds.maxY - bounds.minY, 1000);
  return {
    center: {
      x: Number.isFinite(bounds.minX + width / 2) ? bounds.minX + width / 2 : 0,
      y: Number.isFinite(bounds.minY + height / 2) ? bounds.minY + height / 2 : 0,
    },
    baseWidthMeters: Math.max(width, 100),
    baseHeightMeters: Math.max(height, 100),
    zoomLevel: clampZoom(zoomLevel),
  };
}

export function reduceDrawingMapState(state: DrawingMapState, action: DrawingMapAction): DrawingMapState {
  switch (action.type) {
    case "pan":
      return { ...state, viewport: panViewport(state.viewport, action.delta) };
    case "pan_screen":
      return {
        ...state,
        viewport: panViewportByScreenDelta(
          state.viewport,
          action.dxPixels,
          action.dyPixels,
          action.screenWidthPixels,
        ),
      };
    case "zoom":
      return { ...state, viewport: zoomViewport(state.viewport, action.factor) };
    case "set_mode":
      return { ...state, mode: action.mode, selectedFeatureId: action.mode === "pan" ? null : state.selectedFeatureId };
    case "set_active_layer":
      return { ...state, activeLayer: action.activeLayer };
    case "add_draft_vertex":
      return {
        ...state,
        draftVertices: [...state.draftVertices, action.vertex],
        geometryRevision: state.geometryRevision + 1,
      };
    case "clear_draft":
      return { ...state, draftVertices: [], geometryRevision: state.geometryRevision + 1 };
    case "select_feature":
      return { ...state, selectedFeatureId: action.featureId };
  }
}

export function panViewport(viewport: MapViewport, delta: XY): MapViewport {
  return {
    ...viewport,
    center: {
      x: viewport.center.x + delta.x,
      y: viewport.center.y + delta.y,
    },
  };
}

export function panViewportByScreenDelta(
  viewport: MapViewport,
  dxPixels: number,
  dyPixels: number,
  screenWidthPixels: number,
): MapViewport {
  const metersPerPixel = visibleWidthMeters(viewport) / Math.max(1, screenWidthPixels);
  return panViewport(viewport, {
    x: -dxPixels * metersPerPixel,
    y: dyPixels * metersPerPixel,
  });
}

export function screenPointToWorld(
  viewport: MapViewport,
  point: { xPixels: number; yPixels: number },
  screen: { widthPixels: number; heightPixels: number },
): XY {
  const widthMeters = visibleWidthMeters(viewport);
  const heightMeters = visibleHeightMeters(viewport);
  const minX = viewport.center.x - widthMeters / 2;
  const minSvgY = -viewport.center.y - heightMeters / 2;
  const xRatio = point.xPixels / Math.max(1, screen.widthPixels);
  const yRatio = point.yPixels / Math.max(1, screen.heightPixels);
  return {
    x: minX + xRatio * widthMeters,
    y: -(minSvgY + yRatio * heightMeters),
  };
}

export function zoomViewport(viewport: MapViewport, factor: number): MapViewport {
  return {
    ...viewport,
    zoomLevel: clampZoom(viewport.zoomLevel * factor),
  };
}

export function visibleWidthMeters(viewport: MapViewport): number {
  return viewport.baseWidthMeters / viewport.zoomLevel;
}

export function visibleHeightMeters(viewport: MapViewport): number {
  return viewport.baseHeightMeters / viewport.zoomLevel;
}

export function viewportToSvgViewBox(viewport: MapViewport): string {
  const width = visibleWidthMeters(viewport);
  const height = visibleHeightMeters(viewport);
  const minX = viewport.center.x - width / 2;
  const minY = -viewport.center.y - height / 2;
  return `${minX} ${minY} ${width} ${height}`;
}

export function createDrawingMapState(viewport: MapViewport): DrawingMapState {
  return {
    viewport,
    mode: "pan",
    activeLayer: "field_boundary",
    draftVertices: [],
    selectedFeatureId: null,
    geometryRevision: 0,
  };
}

function clampZoom(zoomLevel: number): number {
  if (!Number.isFinite(zoomLevel)) return 1;
  return Math.min(12, Math.max(0.25, zoomLevel));
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
