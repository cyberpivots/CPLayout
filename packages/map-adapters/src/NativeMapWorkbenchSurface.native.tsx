import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPinned,
  MousePointer2,
  Satellite,
  Trash2,
  X,
} from "lucide-react-native";
import { Camera, Map as MapLibreMap } from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  resolveAerialReferenceImagerySource,
  resolveReferenceOverlaySource,
  type ObstacleZone,
  type ProjectMapFeatureKind,
  type XY,
} from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";
import { resolveDraftVertexIntent } from "@cplayout/geometry";
import {
  confidenceForImagery,
  mapClickToProjectedIntent,
  type MapClickIntent,
} from "./mapClickIntent";
import {
  defaultMapFeatureName,
  draftVerticesToFeatureGeometry,
  featureDraftMinimumVertices,
  featureOptionForKind,
} from "./mapTools";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import {
  buildWorkbenchStyle,
  rasterStyleSourceFromAerialReferenceResolution,
  type RasterImageryStyleSource,
} from "./mapWorkbenchStyle";
import {
  adjacentProjectVertexSelection,
  firstBoundaryVertexSelection,
  firstObstacleVertexSelection,
  hasObstacleVertexSelection,
  selectedProjectVertexPoint,
  selectedProjectVertexText,
  type SelectedProjectVertex,
} from "./projectVertexEditing";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

interface InteractionState {
  activeLayer: DrawingLayerType;
  featureGeometry: ReturnType<typeof featureOptionForKind>["geometry"];
  featureKind: ProjectMapFeatureKind;
  imageryEnabled: boolean;
  mode: DrawingMode;
  projectCrs: string;
  workflowMode: MapSurfaceProps["settings"]["mappingWorkflowMode"];
}

type NativeMapPressEvent = NativeSyntheticEvent<{
  features?: Array<{ properties?: Record<string, unknown> }>;
  lngLat: [number, number];
  point?: [number, number];
}>;

export function NativeMapWorkbenchSurface(props: MapSurfaceProps): React.JSX.Element {
  const {
    activeLayer: externalActiveLayer,
    activeMapFeatureKind,
    activeToolMode,
    activeToolRequestId,
    bottomOverlay,
    homeView = false,
    project,
    result,
    settings,
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onDeleteBoundaryVertex,
    onDeleteObstacleVertex,
    onMappingWorkflowModeChange,
    onMoveBoundaryVertex,
    onMoveInfrastructurePoint,
    onMoveObstacleVertex,
    onPlacePivot,
    onSelectMapFeature,
  } = props;
  const { width } = useWindowDimensions();
  const compactLayout = width < 760;
  const designMode = settings.mappingWorkflowMode === "design";
  const canEditOnMap = designMode && !homeView;
  const callbacksRef = useRef({
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onDeleteBoundaryVertex,
    onDeleteObstacleVertex,
    onMoveBoundaryVertex,
    onMoveInfrastructurePoint,
    onMoveObstacleVertex,
    onPlacePivot,
    onSelectMapFeature,
  });
  const [mode, setMode] = useState<DrawingMode>("pan");
  const [activeLayer, setActiveLayer] = useState<DrawingLayerType>("field_boundary");
  const [draftVertices, setDraftVertices] = useState<XY[]>([]);
  const [mapFeatureKind, setMapFeatureKind] = useState<ProjectMapFeatureKind>("underground_pipeline");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<SelectedProjectVertex | null>(null);
  const [status, setStatus] = useState("Native imagery is reference-only until projected XY edits are committed.");
  const mapFeatureOption = featureOptionForKind(mapFeatureKind);
  const projectionFrame = useMemo(() => {
    if (homeView) {
      return {
        center: [-98, 49] as [number, number],
        bounds: [-168, 15, -52, 72] as [number, number, number, number],
        error: null as string | null,
      };
    }
    try {
      return {
        center: projectWgs84Center(project),
        bounds: projectWgs84Bounds(project),
        error: null as string | null,
      };
    } catch (error) {
      return {
        center: [0, 0] as [number, number],
        bounds: [-1, -1, 1, 1] as [number, number, number, number],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [homeView, project]);
  const overlayState = useMemo(() => {
    if (homeView) {
      return {
        featureCollection: { type: "FeatureCollection" as const, features: [] },
        error: null as string | null,
      };
    }
    try {
      return {
        featureCollection: projectLayoutToWgs84FeatureCollection(project, result, draftVertices),
        error: null as string | null,
      };
    } catch (error) {
      return {
        featureCollection: { type: "FeatureCollection" as const, features: [] },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [draftVertices, homeView, project, result]);
  const projectionError = projectionFrame.error ?? overlayState.error;
  const aerialImagery = useMemo(
    () => resolveAerialReferenceImagerySource({
      preferences: settings.aerialImagery,
      onlineImagery: settings.onlineImagery,
      mapPackages: project.mapPackages ?? [],
      target: "android_maplibre_rn",
    }),
    [project.mapPackages, settings.aerialImagery, settings.onlineImagery],
  );
  const activeImagery = useMemo(
    () => rasterStyleSourceFromAerialReferenceResolution(aerialImagery),
    [aerialImagery],
  );
  const referenceOverlay = useMemo(
    () => resolveReferenceOverlaySource({
      allowPublicNetwork: settings.onlineImagery.enabled || aerialImagery.sourceKind === "online_provider",
      preferences: settings.referenceOverlay,
      mapPackages: project.mapPackages ?? [],
      target: "android_maplibre_rn",
    }),
    [aerialImagery.sourceKind, project.mapPackages, settings.onlineImagery.enabled, settings.referenceOverlay],
  );
  const workbenchStyle = useMemo(
    () => buildWorkbenchStyle(activeImagery, overlayState.featureCollection, referenceOverlay, settings.referenceOverlay),
    [activeImagery, overlayState.featureCollection, referenceOverlay, settings.referenceOverlay],
  );
  const interactionRef = useRef<InteractionState>({
    activeLayer,
    featureGeometry: mapFeatureOption.geometry,
    featureKind: mapFeatureKind,
    imageryEnabled: Boolean(activeImagery),
    mode,
    projectCrs: project.projectCrs,
    workflowMode: settings.mappingWorkflowMode,
  });

  useEffect(() => {
    callbacksRef.current = {
      onAddMapFeature,
      onAddSurveyPoint,
      onCommitBoundaryDraft,
      onCommitObstacleDraft,
      onDeleteBoundaryVertex,
      onDeleteObstacleVertex,
      onMoveBoundaryVertex,
      onMoveInfrastructurePoint,
      onMoveObstacleVertex,
      onPlacePivot,
      onSelectMapFeature,
    };
  }, [
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onDeleteBoundaryVertex,
    onDeleteObstacleVertex,
    onMoveBoundaryVertex,
    onMoveInfrastructurePoint,
    onMoveObstacleVertex,
    onPlacePivot,
    onSelectMapFeature,
  ]);

  useEffect(() => {
    interactionRef.current = {
      activeLayer,
      featureGeometry: mapFeatureOption.geometry,
      featureKind: mapFeatureKind,
      imageryEnabled: Boolean(activeImagery),
      mode,
      projectCrs: project.projectCrs,
      workflowMode: settings.mappingWorkflowMode,
    };
  }, [activeImagery, activeLayer, mapFeatureKind, mapFeatureOption.geometry, mode, project.projectCrs, settings.mappingWorkflowMode]);

  useEffect(() => {
    if (!canEditOnMap) return;
    if (activeMapFeatureKind) setMapFeatureKind(activeMapFeatureKind);
    if (activeToolMode) setTool(activeToolMode, externalActiveLayer);
    else if (externalActiveLayer) setActiveLayer(externalActiveLayer);
  }, [activeMapFeatureKind, activeToolMode, activeToolRequestId, canEditOnMap, externalActiveLayer]);

  useEffect(() => {
    if (homeView) {
      clearDraft("Catalog map: open a field map or design before editing projected XY geometry.");
      setMode("pan");
      return;
    }
    if (designMode) {
      setStatus("Design mode: native taps convert WGS84 display coordinates back to projected XY.");
      return;
    }
    clearDraft("Layout mode is RTK-only; native map taps inspect and do not mutate projected XY geometry.");
    setMode("pan");
  }, [designMode, homeView]);

  if (projectionError) {
    return (
      <View style={styles.fallbackShell} testID="native-map-workbench-fallback">
        <Text style={styles.fallbackText}>Native imagery is unavailable for this project view: {projectionError}</Text>
        <SvgMapSurface {...props} />
      </View>
    );
  }

  function setTool(nextMode: DrawingMode, nextLayer?: DrawingLayerType): void {
    if ((!designMode || homeView) && nextMode !== "pan") return;
    setMode(nextMode);
    if (nextLayer) setActiveLayer(nextLayer);
    if (nextMode !== "edit_vertices") setSelectedVertex(null);
    if (nextMode !== "draw_boundary" && nextMode !== "mark_obstacle" && nextMode !== "measure") {
      clearDraft(`${nextMode.replaceAll("_", " ")} mode selected. No draft vertices are pending.`);
    }
  }

  function handleMapPress(event: NativeMapPressEvent, closeRequested: boolean): void {
    const nativeEvent = event.nativeEvent;
    const selectedFeatureId = nativeFeatureId(nativeEvent.features);
    const current = interactionRef.current;
    if (homeView) {
      setStatus("Catalog map is read-only. Open a field map or design before editing projected XY geometry.");
      return;
    }
    if (selectedFeatureId && (current.mode === "pan" || current.workflowMode === "layout")) {
      callbacksRef.current.onSelectMapFeature?.(selectedFeatureId);
      setStatus(`Selected map feature ${selectedFeatureId}. Project geometry is unchanged.`);
      return;
    }
    const [longitude, latitude] = nativeEvent.lngLat;
    const intent = mapClickToProjectedIntent({
      ...current,
      lonLat: { longitude, latitude },
    });
    applyClickIntent(intent, closeRequested);
  }

  function applyClickIntent(intent: MapClickIntent, closeRequested: boolean): void {
    if (intent.type === "none") {
      if (intent.reason === "layout_mode_no_mutation") setStatus("Layout mode is RTK-only; switch to Design for pointer-based geometry edits.");
      return;
    }
    if (intent.type === "draft_vertex") {
      handleDraftVertexIntent(intent.vertex, closeRequested);
      return;
    }
    if (intent.type === "place_pivot") {
      callbacksRef.current.onPlacePivot?.(intent.point, intent.wgs84);
      setStatus(`Placed pivot at projected XY ${intent.point.x.toFixed(2)}, ${intent.point.y.toFixed(2)}.`);
      return;
    }
    if (intent.type === "move_infrastructure") {
      callbacksRef.current.onMoveInfrastructurePoint?.(intent.pointType, intent.point, intent.wgs84);
      setStatus(`Moved ${intent.pointType.replaceAll("_", " ")} in projected XY.`);
      return;
    }
    if (intent.type === "add_survey_point") {
      callbacksRef.current.onAddSurveyPoint?.(intent.point);
      setStatus(`Captured ${intent.point.role.replaceAll("_", " ")} survey point in projected XY.`);
      return;
    }
    callbacksRef.current.onAddMapFeature?.(intent.feature);
    setStatus(`Saved ${intent.feature.kind.replaceAll("_", " ")} point in projected XY as a map feature.`);
  }

  function commitDraft(): void {
    commitDraftVertices(draftVertices);
  }

  function commitDraftVertices(vertices: XY[]): void {
    if (!canEditOnMap || vertices.length < 3) return;
    let committedStatus: string | null = null;
    let committed = false;
    if (mode === "draw_boundary") {
      committed = callbacksRef.current.onCommitBoundaryDraft?.(vertices) !== false;
      committedStatus = `Committed field boundary with ${vertices.length} projected XY vertices.`;
    } else if (mode === "mark_obstacle") {
      committed = callbacksRef.current.onCommitObstacleDraft?.(vertices, obstacleKindForLayer(activeLayer), confidenceForImagery(Boolean(activeImagery))) !== false;
      committedStatus = `Committed ${obstacleKindForLayer(activeLayer)} obstacle with ${vertices.length} projected XY vertices.`;
    }
    if (committed && committedStatus) clearDraft(committedStatus);
    if (!committed && committedStatus) setStatus("Draft validation failed. Fix the projected XY vertices before clearing or committing.");
  }

  function handleDraftVertexIntent(vertex: XY, closeRequested: boolean): void {
    const intent = resolveDraftVertexIntent({
      closeRequested,
      currentVertices: draftVertices,
      mode,
      vertex,
      vertexSnapToleranceMeters: settings.drawing.vertexSnapToleranceMeters,
    });
    if (intent.type === "commit") {
      commitDraftVertices(intent.vertices);
      return;
    }
    setDraftVertices((current) => [...current, intent.vertex]);
    setStatus(`Added projected XY draft vertex ${intent.vertex.x.toFixed(2)}, ${intent.vertex.y.toFixed(2)}.`);
  }

  function saveMapFeatureFromDraft(): void {
    if (!canEditOnMap || mode !== "measure") return;
    const minimumVertices = featureDraftMinimumVertices(mapFeatureOption.geometry);
    if (minimumVertices === 0 || draftVertices.length < minimumVertices) return;
    const geometry = draftVerticesToFeatureGeometry(mapFeatureOption.geometry, draftVertices);
    callbacksRef.current.onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, mapFeatureOption.geometry, draftVertices.length),
      kind: mapFeatureKind,
      geometry,
      confidence: confidenceForImagery(Boolean(activeImagery)),
      notes: activeImagery ? "Traced from native imagery; verify with field survey." : undefined,
    });
    clearDraft(`Saved ${mapFeatureKind.replaceAll("_", " ")} feature with projected XY geometry.`);
  }

  function clearDraft(nextStatus = "Draft cleared. Committed projected XY geometry is unchanged."): void {
    setDraftVertices([]);
    setStatus(nextStatus);
  }

  function selectVertex(nextVertex: SelectedProjectVertex | null, fallbackStatus: string): void {
    if (!canEditOnMap) return;
    if (!nextVertex) {
      setStatus(fallbackStatus);
      return;
    }
    setSelectedVertex(nextVertex);
    setMode("edit_vertices");
    clearDraft(`Selected ${selectedProjectVertexText(project, nextVertex)} for projected XY editing.`);
  }

  function selectFirstBoundaryVertex(): void {
    selectVertex(
      firstBoundaryVertexSelection(project),
      "No boundary vertices are available for editing.",
    );
  }

  function selectFirstObstacleVertex(): void {
    selectVertex(
      firstObstacleVertexSelection(project),
      "No obstacle vertices are available for editing.",
    );
  }

  function selectAdjacentVertex(direction: -1 | 1): void {
    selectVertex(
      adjacentProjectVertexSelection(project, selectedVertex, direction),
      "No project vertices are available for editing.",
    );
  }

  function nudgeSelectedVertex(delta: XY): void {
    if (!canEditOnMap || !selectedVertex) return;
    const point = selectedProjectVertexPoint(project, selectedVertex);
    if (!point) {
      setSelectedVertex(null);
      setStatus("Selected vertex is no longer available.");
      return;
    }
    const nextPoint = { x: point.x + delta.x, y: point.y + delta.y };
    if (selectedVertex.layer === "field_boundary") {
      callbacksRef.current.onMoveBoundaryVertex?.(selectedVertex.vertexIndex, nextPoint);
    } else {
      callbacksRef.current.onMoveObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex, nextPoint);
    }
    setStatus(`Moved ${selectedProjectVertexText(project, selectedVertex)} in projected XY. Save Local to persist.`);
  }

  function deleteSelectedVertex(): void {
    if (!canEditOnMap || !selectedVertex) return;
    const selectedText = selectedProjectVertexText(project, selectedVertex);
    if (selectedVertex.layer === "field_boundary") {
      callbacksRef.current.onDeleteBoundaryVertex?.(selectedVertex.vertexIndex);
    } else {
      callbacksRef.current.onDeleteObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex);
    }
    setSelectedVertex(null);
    setStatus(`Deleted ${selectedText} through reducer validation. Save Local to persist.`);
  }

  const canCommitDraft = canEditOnMap && draftVertices.length >= 3 && (mode === "draw_boundary" || mode === "mark_obstacle");
  const canSaveFeature = canEditOnMap
    && mode === "measure"
    && mapFeatureOption.geometry !== "Point"
    && draftVertices.length >= featureDraftMinimumVertices(mapFeatureOption.geometry);
  const selectedVertexPoint = selectedVertex ? selectedProjectVertexPoint(project, selectedVertex) : null;
  const canEditSelectedVertex = canEditOnMap && mode === "edit_vertices" && selectedVertexPoint !== null;
  const editStepMeters = Math.max(1, settings.drawing.panStepMeters / 4);
  const selectedVertexStatus = selectedVertex ? ` · ${selectedProjectVertexText(project, selectedVertex)}` : "";
  const statusMetaText = `${mode.replaceAll("_", " ")} · ${draftVertices.length} draft pts${selectedVertexStatus}`;
  const imageryStatus = imageryStatusText(activeImagery, aerialImagery.reason, aerialImagery.sourceKind);

  return (
    <View style={styles.shell} testID="native-map-workbench">
      <MapLibreMap
        androidView="surface"
        attribution={false}
        compass={false}
        logo={false}
        mapStyle={workbenchStyle as never}
        onLongPress={(event) => handleMapPress(event as NativeMapPressEvent, true)}
        onDidFailLoadingMap={() => setRuntimeError("Native MapLibre did not finish loading this imagery style.")}
        onDidFinishLoadingMap={() => setRuntimeError(null)}
        onPress={(event) => handleMapPress(event as NativeMapPressEvent, false)}
        scaleBar={false}
        style={styles.map}
        testID="native-map-workbench-map"
      >
        <Camera
          key={`${project.id}:${homeView ? "catalog" : "project"}`}
          initialViewState={{
            bounds: projectionFrame.bounds,
            padding: {
              top: compactLayout ? 86 : 72,
              right: 32,
              bottom: compactLayout ? 188 : 164,
              left: 32,
            },
          }}
          maxZoom={activeImagery ? Math.min(18, activeImagery.maxzoom) : 18}
        />
      </MapLibreMap>

      {!canEditOnMap ? (
        <View style={[styles.layoutHud, compactLayout && styles.layoutHudCompact]} testID="native-map-layout-hud">
          <MapPinned size={17} color="#173428" />
          <Text style={styles.layoutHudText}>{homeView ? "Catalog map: open a field map or design before editing." : "Layout mode: RTK-only geometry changes; pointer gestures inspect only."}</Text>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.bottomDock, compactLayout && styles.bottomDockCompact]} testID="native-map-bottom-dock">
        <View pointerEvents="none" style={[styles.attributionHud, compactLayout && styles.attributionHudCompact]} testID="native-map-attribution-hud">
          <Satellite size={13} color="#173428" />
          <Text style={styles.attributionText}>{imageryStatus}</Text>
        </View>
        <View pointerEvents="box-none" style={[styles.statusHud, compactLayout && styles.statusHudCompact]} testID="native-map-status-hud">
          <View pointerEvents="none" style={styles.statusTextGroup}>
            <Text style={styles.statusText}>{status}</Text>
            <Text style={styles.statusMeta}>{statusMetaText}</Text>
          </View>
          <View pointerEvents="box-none" style={styles.hudActions} testID="native-map-hud-actions">
            <HudButton disabled={!canCommitDraft} icon={<Check size={15} color={canCommitDraft ? "#ffffff" : "#718077"} />} label="Commit" onPress={commitDraft} primary={canCommitDraft} testID="native-action-commit" />
            <HudButton disabled={!canSaveFeature} icon={<Check size={15} color={canSaveFeature ? "#ffffff" : "#718077"} />} label="Save Feature" onPress={saveMapFeatureFromDraft} primary={canSaveFeature} testID="native-action-save-feature" />
            {canEditOnMap && mode === "edit_vertices" ? (
              <>
                <HudButton disabled={project.fieldBoundary.length === 0} icon={<MousePointer2 size={15} color={project.fieldBoundary.length > 0 ? "#173428" : "#718077"} />} label="Boundary" onPress={selectFirstBoundaryVertex} testID="native-edit-select-boundary" />
                <HudButton disabled={!hasObstacleVertexSelection(project)} icon={<MousePointer2 size={15} color={hasObstacleVertexSelection(project) ? "#173428" : "#718077"} />} label="Obstacle" onPress={selectFirstObstacleVertex} testID="native-edit-select-obstacle" />
                <HudButton disabled={!selectedVertex} icon={<ArrowLeft size={15} color={selectedVertex ? "#173428" : "#718077"} />} label="Prev" onPress={() => selectAdjacentVertex(-1)} testID="native-edit-previous-vertex" />
                <HudButton disabled={!selectedVertex} icon={<ArrowRight size={15} color={selectedVertex ? "#173428" : "#718077"} />} label="Next" onPress={() => selectAdjacentVertex(1)} testID="native-edit-next-vertex" />
                <HudButton disabled={!canEditSelectedVertex} icon={<ArrowRight size={15} color={canEditSelectedVertex ? "#173428" : "#718077"} />} label="Nudge E" onPress={() => nudgeSelectedVertex({ x: editStepMeters, y: 0 })} testID="native-edit-nudge-east" />
                <HudButton disabled={!canEditSelectedVertex} icon={<Trash2 size={15} color={canEditSelectedVertex ? "#173428" : "#718077"} />} label="Delete" onPress={deleteSelectedVertex} testID="native-edit-delete-vertex" />
              </>
            ) : null}
            <HudButton disabled={draftVertices.length === 0} icon={<X size={15} color={draftVertices.length > 0 ? "#173428" : "#718077"} />} label="Clear" onPress={() => clearDraft()} testID="native-action-clear" />
          </View>
        </View>
        {bottomOverlay ? (
          <View pointerEvents="box-none" style={styles.bottomOverlaySlot}>
            {bottomOverlay}
          </View>
        ) : null}
      </View>
      {runtimeError ? <Text style={styles.runtimeError}>{runtimeError}</Text> : null}
    </View>
  );
}

function nativeFeatureId(features: Array<{ properties?: Record<string, unknown> }> | undefined): string | null {
  const id = features?.find((feature) => typeof feature.properties?.id === "string")?.properties?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function imageryStatusText(
  raster: RasterImageryStyleSource | null,
  fallbackReason: string,
  sourceKind: ReturnType<typeof resolveAerialReferenceImagerySource>["sourceKind"],
): string {
  if (!raster) return fallbackReason;
  const mode = sourceKind === "local_raster" ? "local raster package" : "connected preview only";
  return `${raster.attribution} · ${raster.licenseText} · ${mode}`;
}

function obstacleKindForLayer(layer: DrawingLayerType): ObstacleZone["kind"] {
  if (layer === "road" || layer === "ditch" || layer === "fence" || layer === "building" || layer === "canal" || layer === "tree" || layer === "exclusion") {
    return layer;
  }
  return "exclusion";
}

function HudButton({ disabled = false, icon, label, onPress, primary = false, testID }: { disabled?: boolean; icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={[styles.hudButton, primary && styles.hudButtonPrimary, disabled && styles.hudButtonDisabled]} testID={testID}>
      {icon}
      <Text style={[styles.hudButtonText, primary && styles.hudButtonTextPrimary, disabled && styles.hudButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: "stretch",
    backgroundColor: "#eef2ec",
    borderColor: "#ccd8cf",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
  },
  map: {
    flex: 1,
  },
  bottomDock: {
    bottom: 8,
    gap: 8,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 5,
  },
  bottomDockCompact: {
    left: 8,
    right: 8,
  },
  bottomOverlaySlot: {
    maxWidth: "100%",
    width: "100%",
  },
  statusHud: {
    alignItems: "center",
    backgroundColor: "rgba(17,28,23,0.92)",
    borderRadius: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    maxWidth: "92%",
    padding: 10,
    width: "100%",
  },
  statusHudCompact: {
    alignItems: "flex-start",
    maxWidth: "100%",
  },
  statusTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  statusText: {
    color: "#f8fbf6",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  statusMeta: {
    color: "#c9d8d0",
    fontSize: 11,
    fontWeight: "800",
  },
  hudActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "100%",
  },
  hudButton: {
    alignItems: "center",
    backgroundColor: "#eef5ef",
    borderColor: "#c7d6ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  hudButtonPrimary: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  hudButtonDisabled: {
    opacity: 0.58,
  },
  hudButtonText: {
    color: "#173428",
    fontSize: 11,
    fontWeight: "900",
  },
  hudButtonTextPrimary: {
    color: "#ffffff",
  },
  hudButtonTextDisabled: {
    color: "#718077",
  },
  layoutHud: {
    alignItems: "center",
    backgroundColor: "rgba(255,250,235,0.96)",
    borderColor: "#dfc77f",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    left: 12,
    maxWidth: "90%",
    padding: 10,
    position: "absolute",
    top: 12,
    zIndex: 3,
  },
  layoutHudCompact: {
    left: 8,
    maxWidth: "94%",
    right: 8,
  },
  layoutHudText: {
    color: "#553b09",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
  },
  attributionHud: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(251,253,249,0.95)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    maxWidth: "92%",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  attributionHudCompact: {
    maxWidth: "100%",
  },
  attributionText: {
    color: "#173428",
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
  runtimeError: {
    backgroundColor: "#fff2df",
    borderColor: "#e4b56d",
    borderRadius: 8,
    borderWidth: 1,
    color: "#7a3d10",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    padding: 8,
    position: "absolute",
    right: 12,
    top: 76,
  },
  fallbackShell: {
    flex: 1,
    gap: 10,
  },
  fallbackText: {
    backgroundColor: "#fff2df",
    borderColor: "#e4b56d",
    borderRadius: 8,
    borderWidth: 1,
    color: "#7a3d10",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    padding: 10,
  },
});
