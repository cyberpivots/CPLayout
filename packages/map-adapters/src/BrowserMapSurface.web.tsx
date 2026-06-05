import {
  Check,
  Crosshair,
  Fence,
  Hand,
  Layers,
  LocateFixed,
  MapPinned,
  MousePointer2,
  Satellite,
  UtilityPole,
  X,
} from "lucide-react-native";
import maplibregl from "maplibre-gl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { resolveDraftVertexIntent } from "@cplayout/geometry";
import {
  resolveAerialReferenceImagerySource,
  resolveReferenceOverlaySource,
  type ObstacleZone,
  type ProjectMapFeatureKind,
  type ReferenceOverlayLayerKey,
  type XY,
} from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";
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
  UTILITY_FEATURE_OPTIONS,
  type UtilityFeatureGeometry,
} from "./mapTools";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import {
  buildWorkbenchStyle,
  formatReferenceOverlayStatus,
  rasterStyleSourceFromAerialReferenceResolution,
  toMapLibreTileTemplate,
  type RasterImageryStyleSource,
} from "./mapWorkbenchStyle";
import { registerPmtilesProtocolOnce } from "./pmtilesProtocol.web";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

interface InteractionState {
  activeLayer: DrawingLayerType;
  featureGeometry: UtilityFeatureGeometry;
  featureKind: ProjectMapFeatureKind;
  imageryEnabled: boolean;
  mode: DrawingMode;
  projectCrs: string;
  workflowMode: MapSurfaceProps["settings"]["mappingWorkflowMode"];
}

export function BrowserMapSurface(props: MapSurfaceProps): React.JSX.Element {
  const {
    activeLayer: externalActiveLayer,
    activeMapFeatureKind,
    activeToolMode,
    activeToolRequestId,
    bottomOverlay,
    project,
    result,
    settings,
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onMappingWorkflowModeChange,
    onMoveInfrastructurePoint,
    onPlacePivot,
    onSelectMapFeature,
    onSettingsChange,
  } = props;
  const homeView = props.homeView === true;
  const { width } = useWindowDimensions();
  const compactLayout = width < 760;
  const designMode = settings.mappingWorkflowMode === "design";
  const canEditOnMap = designMode && !homeView;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const callbacksRef = useRef({
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onMoveInfrastructurePoint,
    onPlacePivot,
    onSelectMapFeature,
  });
  const [mode, setMode] = useState<DrawingMode>("pan");
  const [activeLayer, setActiveLayer] = useState<DrawingLayerType>("field_boundary");
  const [draftVertices, setDraftVertices] = useState<XY[]>([]);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [mapFeatureKind, setMapFeatureKind] = useState<ProjectMapFeatureKind>("underground_pipeline");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [status, setStatus] = useState("Imagery is a live reference. Project edits remain projected XY.");
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
      target: "web_maplibre_gl_js",
    }),
    [project.mapPackages, settings.aerialImagery, settings.onlineImagery],
  );
  const activeImagery = useMemo(
    () => rasterStyleSourceFromAerialReferenceResolution(aerialImagery),
    [aerialImagery],
  );
  const imageryKey = activeImagery
    ? `${activeImagery.id}:${activeImagery.url ?? ""}:${activeImagery.tiles?.join("|") ?? ""}:${activeImagery.minzoom}:${activeImagery.maxzoom}`
    : "no-aerial-imagery";
  const providerKey = aerialImagery.onlineProvider
    ? `${aerialImagery.onlineProvider.id}:${aerialImagery.onlineProvider.tileUrlTemplate}:${aerialImagery.onlineProvider.tileScheme}:${aerialImagery.onlineProvider.minZoom}:${aerialImagery.onlineProvider.maxZoom}`
    : "no-live-imagery";
  const referenceOverlay = useMemo(
    () => resolveReferenceOverlaySource({
      allowPublicNetwork: settings.onlineImagery.enabled || aerialImagery.sourceKind === "online_provider",
      preferences: settings.referenceOverlay,
      mapPackages: project.mapPackages ?? [],
      target: "web_maplibre_gl_js",
    }),
    [aerialImagery.sourceKind, project.mapPackages, settings.onlineImagery.enabled, settings.referenceOverlay],
  );
  const referenceOverlayKey = [
    referenceOverlay.status,
    referenceOverlay.sourceKind,
    referenceOverlay.packageId ?? "",
    referenceOverlay.source?.url ?? "",
    referenceOverlay.source?.tiles?.join("|") ?? "",
    referenceOverlay.rasterSources?.flatMap((source) => source.tiles).join("|") ?? "",
    settings.referenceOverlay.mode,
    settings.referenceOverlay.roads,
    settings.referenceOverlay.borders,
    settings.referenceOverlay.labels,
    settings.referenceOverlay.schema,
  ].join(":");
  const referenceOverlayPanelStatus = referenceOverlay;
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
      onMoveInfrastructurePoint,
      onPlacePivot,
      onSelectMapFeature,
    };
  }, [onAddMapFeature, onAddSurveyPoint, onCommitBoundaryDraft, onCommitObstacleDraft, onMoveInfrastructurePoint, onPlacePivot, onSelectMapFeature]);

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
      clearDraft("Select or create a field map/design from the project tree before editing projected XY geometry.");
      setMode("pan");
      return;
    }
    if (designMode) {
      setStatus("Design mode: projected XY edits require Commit before they change the project.");
      return;
    }
    clearDraft("Layout mode is RTK-only; pointer gestures inspect and do not mutate projected XY geometry.");
    setMode("pan");
  }, [designMode, homeView]);

  useEffect(() => {
    if (!containerRef.current || projectionError) return undefined;
    setRuntimeError(null);
    registerPmtilesProtocolOnce();
    const map = new maplibregl.Map({
      attributionControl: false,
      center: projectionFrame.center,
      container: containerRef.current,
      dragRotate: false,
      pitchWithRotate: false,
      style: buildWorkbenchStyle(activeImagery, overlayState.featureCollection, referenceOverlay, settings.referenceOverlay),
      zoom: activeImagery ? Math.min(15, activeImagery.maxzoom) : 14,
    });
    mapRef.current = map;
    map.doubleClickZoom.disable();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const fitProject = () => fitBoundsToProject(map, projectionFrame.bounds, activeImagery);
    map.once("load", () => {
      fitProject();
      setTimeout(() => map.resize(), 0);
    });
    let lastTouchHandledAt = 0;
    let touchStartPoint: { x: number; y: number } | null = null;
    const applyMapEvent = (
      point: maplibregl.PointLike,
      lngLat: { lng: number; lat: number },
      closeRequested: boolean,
    ): void => {
      const current = interactionRef.current;
      if (homeView) {
        setStatus("North America map is a catalog view. Open a field map or design before editing projected XY geometry.");
        return;
      }
      const selectedFeatureId = mapFeatureIdAtPoint(map, point);
      if (selectedFeatureId && (current.mode === "pan" || current.workflowMode === "layout")) {
        callbacksRef.current.onSelectMapFeature?.(selectedFeatureId);
        setStatus(`Selected map feature ${selectedFeatureId}. Project geometry is unchanged.`);
        return;
      }
      const intent = mapClickToProjectedIntent({
        ...current,
        lonLat: { longitude: lngLat.lng, latitude: lngLat.lat },
      });
      applyClickIntent(intent, closeRequested);
    };
    map.on("click", (event) => {
      if (Date.now() - lastTouchHandledAt < 350) return;
      applyMapEvent(event.point, event.lngLat, false);
    });
    map.on("touchstart", (event) => {
      const originalEvent = event.originalEvent;
      if (originalEvent.touches.length !== 1) {
        touchStartPoint = null;
        return;
      }
      touchStartPoint = pointLikeToXY(event.point);
    });
    map.on("touchmove", (event) => {
      if (!touchStartPoint) return;
      const point = pointLikeToXY(event.point);
      if (distanceBetweenPoints(touchStartPoint, point) > 10) touchStartPoint = null;
    });
    map.on("touchend", (event) => {
      const originalEvent = event.originalEvent;
      const startPoint = touchStartPoint;
      touchStartPoint = null;
      if (!startPoint) return;
      if (originalEvent.changedTouches.length !== 1 || originalEvent.touches.length > 0) return;
      if (distanceBetweenPoints(startPoint, pointLikeToXY(event.point)) > 10) return;
      event.preventDefault();
      lastTouchHandledAt = Date.now();
      applyMapEvent(event.point, event.lngLat, false);
    });
    map.on("dblclick", (event) => {
      event.preventDefault();
      const current = interactionRef.current;
      if (homeView || current.workflowMode !== "design") return;
      const intent = mapClickToProjectedIntent({
        ...current,
        lonLat: { longitude: event.lngLat.lng, latitude: event.lngLat.lat },
      });
      applyClickIntent(intent, true);
    });
    map.on("error", (event) => {
      const message = event.error?.message;
      if (message) setRuntimeError(message);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [activeImagery, homeView, imageryKey, project.id, projectionError, projectionFrame.bounds, projectionFrame.center, providerKey, referenceOverlayKey, settings.referenceOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || projectionError) return;
    const updateSource = () => syncLayoutSource(map, overlayState.featureCollection);
    if (map.isStyleLoaded()) updateSource();
    else map.once("load", updateSource);
  }, [projectionError, overlayState.featureCollection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (projectionError) {
    return (
      <View style={styles.fallbackShell}>
        <Text style={styles.fallbackText}>Browser imagery is unavailable for this project view: {projectionError}</Text>
        <SvgMapSurface {...props} />
      </View>
    );
  }

  function setTool(nextMode: DrawingMode, nextLayer?: DrawingLayerType): void {
    if ((!designMode || homeView) && nextMode !== "pan") return;
    setMode(nextMode);
    if (nextLayer) setActiveLayer(nextLayer);
    if (nextMode !== "draw_boundary" && nextMode !== "mark_obstacle" && nextMode !== "measure") {
      clearDraft(`${toolLabel(nextMode)} mode selected. No draft vertices are pending.`);
    }
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
      committed = callbacksRef.current.onCommitObstacleDraft?.(vertices, obstacleKindForLayer(activeLayer), confidenceForImagery(settings.onlineImagery.enabled)) !== false;
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
      confidence: confidenceForImagery(settings.onlineImagery.enabled),
      notes: settings.onlineImagery.enabled ? "Traced from browser imagery; verify with field survey." : undefined,
    });
    clearDraft(`Saved ${mapFeatureKind.replaceAll("_", " ")} ${mapFeatureStatusLabel(mapFeatureOption.geometry, draftVertices.length)} as a map feature.`);
  }

  function clearDraft(nextStatus = "Draft cleared. Committed projected XY geometry is unchanged."): void {
    setDraftVertices([]);
    setStatus(nextStatus);
  }

  function toggleReferenceLayer(layer: ReferenceOverlayLayerKey): void {
    if (!onSettingsChange || !referenceOverlay.canRender) return;
    const nextReferenceOverlay = {
      ...settings.referenceOverlay,
      [layer]: !settings.referenceOverlay[layer],
    };
    onSettingsChange({ ...settings, referenceOverlay: nextReferenceOverlay });
  }

  const canCommitDraft = canEditOnMap && draftVertices.length >= 3 && (mode === "draw_boundary" || mode === "mark_obstacle");
  const canSaveFeature = canEditOnMap
    && mode === "measure"
    && mapFeatureOption.geometry !== "Point"
    && draftVertices.length >= featureDraftMinimumVertices(mapFeatureOption.geometry);
  const canToggleReferenceOverlay = Boolean(onSettingsChange && referenceOverlay.canRender);
  const statusMetaText = `${mode.replaceAll("_", " ")} · ${draftVertices.length} draft pts${utilitySaveHint(mode, mapFeatureOption.geometry)}`;

  return (
    <View style={styles.shell} testID="browser-map-workbench">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{homeView ? "North America Map" : "Imagery Workbench"}</Text>
          <Text style={styles.subtitle}>{homeView ? "Client/project catalog view" : `${project.projectCrs} canonical geometry`} · {activeImagery?.name ?? "offline overlay"} </Text>
        </View>
        <View style={styles.segmented}>
          <ModeSwitch
            active={settings.mappingWorkflowMode === "design"}
            label="Design"
            onPress={() => onMappingWorkflowModeChange?.("design")}
            testID="browser-workflow-design"
          />
          <ModeSwitch
            active={settings.mappingWorkflowMode === "layout"}
            label="Layout"
            onPress={() => onMappingWorkflowModeChange?.("layout")}
            testID="browser-workflow-layout"
          />
        </View>
      </View>

      <View style={[styles.mapFrame, compactLayout && styles.mapFrameCompact]} testID="browser-map-frame">
        {React.createElement("div", {
          "aria-label": "CPLayout MapLibre imagery workbench",
          ref: containerRef,
          style: mapContainerStyle,
        })}
        <View style={[styles.toolHud, compactLayout && styles.toolHudCompact]}>
          <ToolButton active={mode === "pan"} compact={compactLayout} icon={<Hand size={17} color={mode === "pan" ? "#ffffff" : "#173428"} />} label="Pan" onPress={() => setTool("pan")} testID="browser-tool-pan" />
          <ToolButton active={layersPanelOpen} compact={compactLayout} icon={<Layers size={17} color={layersPanelOpen ? "#ffffff" : "#173428"} />} label="Layers" onPress={() => setLayersPanelOpen((open) => !open)} testID="browser-reference-layers-button" />
          {canEditOnMap ? (
            <>
              <ToolButton active={mode === "measure"} compact={compactLayout} icon={<UtilityPole size={17} color={mode === "measure" ? "#ffffff" : "#173428"} />} label="Utility" onPress={() => setTool("measure")} testID="browser-tool-utility" />
              <ToolButton active={mode === "draw_boundary"} compact={compactLayout} icon={<Fence size={17} color={mode === "draw_boundary" ? "#ffffff" : "#173428"} />} label="Boundary" onPress={() => setTool("draw_boundary", "field_boundary")} testID="browser-tool-boundary" />
              <ToolButton active={mode === "mark_obstacle"} compact={compactLayout} icon={<Layers size={17} color={mode === "mark_obstacle" ? "#ffffff" : "#173428"} />} label="Obstacle" onPress={() => setTool("mark_obstacle", "obstacle")} testID="browser-tool-obstacle" />
              <ToolButton active={mode === "place_pivot"} compact={compactLayout} icon={<LocateFixed size={17} color={mode === "place_pivot" ? "#ffffff" : "#173428"} />} label="Pivot" onPress={() => setTool("place_pivot", "pivot_center")} testID="browser-tool-pivot" />
              <ToolButton active={mode === "capture_point"} compact={compactLayout} icon={<Crosshair size={17} color={mode === "capture_point" ? "#ffffff" : "#173428"} />} label="Survey" onPress={() => setTool("capture_point", "control_point")} testID="browser-tool-survey" />
            </>
          ) : null}
        </View>

        {canEditOnMap && mode === "mark_obstacle" ? (
          <View pointerEvents="box-none" style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["obstacle", "road", "ditch", "fence", "tree", "building", "canal", "exclusion"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {layersPanelOpen ? (
          <View style={[styles.referenceLayerHud, compactLayout && styles.referenceLayerHudCompact]} testID="browser-reference-layers-panel">
            <Text style={styles.referenceLayerTitle}>Reference Layers</Text>
            <Text style={styles.referenceLayerMeta}>
              {referenceOverlay.canRender
                ? formatReferenceOverlayStatus(referenceOverlay)
                : referenceOverlayPanelStatus.reason}
            </Text>
            <View style={styles.referenceLayerActions}>
              <LayerToggle
                active={referenceOverlay.canRender && settings.referenceOverlay.roads}
                disabled={!canToggleReferenceOverlay}
                label="Roads"
                onPress={() => toggleReferenceLayer("roads")}
                testID="reference-layer-roads"
              />
              <LayerToggle
                active={referenceOverlay.canRender && settings.referenceOverlay.borders}
                disabled={!canToggleReferenceOverlay}
                label="Borders"
                onPress={() => toggleReferenceLayer("borders")}
                testID="reference-layer-borders"
              />
              <LayerToggle
                active={referenceOverlay.canRender && settings.referenceOverlay.labels}
                disabled={!canToggleReferenceOverlay}
                label="Labels"
                onPress={() => toggleReferenceLayer("labels")}
                testID="reference-layer-labels"
              />
            </View>
            <Text style={styles.referenceLayerAttribution}>
              {referenceOverlayPanelStatus.attribution
                ? `${referenceOverlayPanelStatus.attribution} · ${referenceOverlayPanelStatus.licenseText ?? "License metadata required"}`
                : "Local vector overlays only; no public OSM raster tiles or hosted basemap APIs are requested."}
            </Text>
          </View>
        ) : null}

        {canEditOnMap && mode === "place_pivot" ? (
          <View pointerEvents="box-none" style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["pivot_center", "water_source", "power_source"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {canEditOnMap && mode === "capture_point" ? (
          <View pointerEvents="box-none" style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["control_point", "field_boundary", "obstacle", "note_point"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {canEditOnMap && mode === "measure" ? (
          <View pointerEvents="box-none" style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {UTILITY_FEATURE_OPTIONS.map((option) => (
              <Chip
                key={option.kind}
                active={mapFeatureKind === option.kind}
                label={option.label}
                onPress={() => setMapFeatureKind(option.kind)}
              />
            ))}
          </View>
        ) : null}

        {!canEditOnMap ? (
          <View style={[styles.layoutHud, compactLayout && styles.layoutHudCompact]} testID="browser-map-layout-hud">
            <MapPinned size={17} color="#173428" />
            <Text style={styles.layoutHudText}>{homeView ? "Catalog map: open a field map or design before editing." : "Layout mode: RTK-only geometry changes; pointer gestures inspect only."}</Text>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={[styles.bottomDock, compactLayout && styles.bottomDockCompact]} testID="browser-map-bottom-dock">
          <View pointerEvents="none" style={[styles.attributionHud, compactLayout && styles.attributionHudCompact]} testID="browser-map-attribution-hud">
            <Satellite size={13} color="#173428" />
            <Text numberOfLines={compactLayout ? 1 : undefined} style={styles.attributionText}>
              {activeImagery ? `${activeImagery.attribution} · ${activeImagery.licenseText}` : aerialImagery.reason}
            </Text>
          </View>
          <View pointerEvents={compactLayout && !canCommitDraft && !canSaveFeature ? "none" : "box-none"} style={[styles.statusHud, compactLayout && styles.statusHudCompact]} testID="browser-map-status-hud">
            <View pointerEvents="none" style={styles.statusTextGroup}>
              <Text style={styles.statusText}>{status}</Text>
              <Text style={styles.statusMeta}>{statusMetaText}</Text>
            </View>
            <View pointerEvents="box-none" style={styles.hudActions} testID="browser-map-hud-actions">
              <HudButton disabled={!canCommitDraft} icon={<Check size={15} color={canCommitDraft ? "#ffffff" : "#718077"} />} label="Commit" onPress={commitDraft} primary={canCommitDraft} testID="browser-action-commit" />
              <HudButton disabled={!canSaveFeature} icon={<Check size={15} color={canSaveFeature ? "#ffffff" : "#718077"} />} label="Save Feature" onPress={saveMapFeatureFromDraft} primary={canSaveFeature} testID="browser-action-save-feature" />
              <HudButton disabled={draftVertices.length === 0} icon={<X size={15} color={draftVertices.length > 0 ? "#173428" : "#718077"} />} label="Clear" onPress={() => clearDraft()} testID="browser-action-clear" />
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
    </View>
  );
}

function fitBoundsToProject(
  map: maplibregl.Map,
  bounds: [number, number, number, number],
  imagery: RasterImageryStyleSource | null,
): void {
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      duration: 0,
      maxZoom: imagery ? Math.min(17, imagery.maxzoom) : 17,
      padding: 48,
    },
  );
}

function syncLayoutSource(
  map: maplibregl.Map,
  featureCollection: ReturnType<typeof projectLayoutToWgs84FeatureCollection>,
): void {
  const source = map.getSource("layout");
  if (source && "setData" in source) {
    (source as { setData: (data: unknown) => void }).setData(featureCollection);
  }
}

function mapFeatureIdAtPoint(map: maplibregl.Map, point: maplibregl.PointLike): string | null {
  const features = map.queryRenderedFeatures(point, {
    layers: ["map-feature-polygon", "map-feature-line", "map-feature-point"],
  });
  const id = features.find((feature) => typeof feature.properties?.id === "string")?.properties?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function obstacleKindForLayer(layer: DrawingLayerType): ObstacleZone["kind"] {
  if (layer === "road" || layer === "ditch" || layer === "fence" || layer === "building" || layer === "canal" || layer === "tree" || layer === "exclusion") {
    return layer;
  }
  return "exclusion";
}

function toolLabel(mode: DrawingMode): string {
  return mode.replaceAll("_", " ");
}

function utilitySaveHint(mode: DrawingMode, geometry: UtilityFeatureGeometry): string {
  if (mode !== "measure") return "";
  if (geometry === "Point") return " · point saves on map click";
  if (geometry === "Circle") return " · circle needs center + radius";
  if (geometry === "Polygon") return " · polygon needs 3 pts";
  return " · line needs 2 pts";
}

function mapFeatureStatusLabel(geometry: UtilityFeatureGeometry, vertexCount: number): string {
  if (geometry === "LineString") return `line with ${vertexCount} projected XY vertices`;
  if (geometry === "Polygon") return `polygon with ${vertexCount} projected XY vertices`;
  if (geometry === "Circle") return "circle with projected XY center and radius points";
  return "point in projected XY";
}

function pointLikeToXY(point: maplibregl.PointLike): { x: number; y: number } {
  if (Array.isArray(point)) return { x: point[0], y: point[1] };
  return { x: point.x, y: point.y };
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function ModeSwitch({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} aria-pressed={active} onPress={onPress} style={[styles.modeSwitch, active && styles.modeSwitchActive]} testID={testID}>
      <Text style={[styles.modeSwitchText, active && styles.modeSwitchTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToolButton({ active, compact = false, icon, label, onPress, testID }: { active: boolean; compact?: boolean; icon: React.ReactNode; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected: active }} aria-pressed={active} onPress={onPress} style={[styles.toolButton, compact && styles.toolButtonCompact, active && styles.toolButtonActive]} testID={testID}>
      {icon}
      {!compact ? <Text style={[styles.toolButtonText, active && styles.toolButtonTextActive]}>{label}</Text> : null}
    </Pressable>
  );
}

function LayerToggle({ active, disabled, label, onPress, testID }: { active: boolean; disabled: boolean; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: active, disabled }}
      aria-disabled={disabled}
      aria-pressed={active}
      disabled={disabled}
      onPress={onPress}
      style={[styles.layerToggle, active && styles.layerToggleActive, disabled && styles.layerToggleDisabled]}
      testID={testID}
    >
      <Text style={[styles.layerToggleText, active && styles.layerToggleTextActive, disabled && styles.layerToggleTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} aria-pressed={active} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HudButton({ disabled = false, icon, label, onPress, primary = false, testID }: { disabled?: boolean; icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={[styles.hudButton, primary && styles.hudButtonPrimary, disabled && styles.hudButtonDisabled]} testID={testID}>
      {icon}
      <Text style={[styles.hudButtonText, primary && styles.hudButtonTextPrimary, disabled && styles.hudButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const mapContainerStyle: React.CSSProperties = {
  bottom: 0,
  left: 0,
  position: "absolute",
  right: 0,
  top: 0,
};

const styles = StyleSheet.create({
  shell: {
    alignSelf: "stretch",
    backgroundColor: "#f7faf5",
    borderColor: "#ccd8cf",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  headerRow: {
    alignItems: "center",
    backgroundColor: "#fbfdf9",
    borderBottomColor: "#d7e0d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    color: "#111c17",
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: "#506259",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  segmented: {
    backgroundColor: "#e8efe8",
    borderColor: "#c9d6cb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  modeSwitch: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modeSwitchActive: {
    backgroundColor: "#173428",
  },
  modeSwitchText: {
    color: "#173428",
    fontSize: 12,
    fontWeight: "900",
  },
  modeSwitchTextActive: {
    color: "#ffffff",
  },
  mapFrame: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
  mapFrameCompact: {
    minHeight: 420,
  },
  toolHud: {
    backgroundColor: "rgba(251,253,249,0.95)",
    borderColor: "#c9d6cb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    left: 12,
    maxWidth: "92%",
    padding: 6,
    position: "absolute",
    top: 12,
    zIndex: 3,
  },
  toolHudCompact: {
    flexDirection: "column",
    flexWrap: "nowrap",
    left: 8,
    maxWidth: 58,
    top: 72,
    width: 58,
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#edf4ed",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 74,
    flexGrow: 0,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  toolButtonActive: {
    backgroundColor: "#173428",
    borderColor: "#173428",
  },
  toolButtonCompact: {
    flexBasis: 44,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 44,
  },
  toolButtonText: {
    color: "#173428",
    fontSize: 12,
    fontWeight: "900",
  },
  toolButtonTextActive: {
    color: "#ffffff",
  },
  optionHud: {
    backgroundColor: "rgba(251,253,249,0.95)",
    borderColor: "#c9d6cb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    left: 12,
    maxWidth: "78%",
    padding: 6,
    position: "absolute",
    top: 70,
    zIndex: 5,
  },
  optionHudCompact: {
    left: 74,
    maxWidth: "72%",
    top: 72,
  },
  referenceLayerHud: {
    backgroundColor: "rgba(251,253,249,0.97)",
    borderColor: "#c9d6cb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    left: 12,
    maxWidth: 340,
    padding: 10,
    position: "absolute",
    top: 70,
  },
  referenceLayerHudCompact: {
    left: 74,
    maxWidth: "72%",
    right: 8,
    top: 72,
  },
  referenceLayerTitle: {
    color: "#173428",
    fontSize: 13,
    fontWeight: "900",
  },
  referenceLayerMeta: {
    color: "#47584d",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  referenceLayerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  referenceLayerAttribution: {
    color: "#57675e",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
  layerToggle: {
    backgroundColor: "#f5f8f2",
    borderColor: "#d2ded4",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  layerToggleActive: {
    backgroundColor: "#173428",
    borderColor: "#173428",
  },
  layerToggleDisabled: {
    opacity: 0.56,
  },
  layerToggleText: {
    color: "#173428",
    fontSize: 11,
    fontWeight: "900",
  },
  layerToggleTextActive: {
    color: "#ffffff",
  },
  layerToggleTextDisabled: {
    color: "#66776d",
  },
  chip: {
    backgroundColor: "#f5f8f2",
    borderColor: "#d2ded4",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: "#dcece6",
    borderColor: "#59937e",
  },
  chipText: {
    color: "#365044",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#173428",
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
    bottom: 8,
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
    top: 70,
  },
  layoutHudCompact: {
    left: 74,
    maxWidth: "72%",
    right: 8,
    top: 72,
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
    maxHeight: 30,
    maxWidth: "100%",
    overflow: "hidden",
    paddingVertical: 5,
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
