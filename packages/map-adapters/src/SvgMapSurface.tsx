import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Fence,
  Hand,
  LocateFixed,
  Minus,
  PencilLine,
  Plus,
  RefreshCcw,
  Ruler,
  Satellite,
  UtilityPole,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Image as SvgImage, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { boundsForGeometry, createCirclePolygon, planOnlineImageryTiles, ringsToSvgPath, supportsSvgOnlineImageryOverlay } from "@cplayout/geometry";
import {
  createDrawingMapState,
  createInitialViewport,
  DrawingLayerType,
  DrawingMapAction,
  DrawingMapState,
  reduceDrawingMapState,
  resolveDraftVertexIntent,
  screenPointToWorld,
  snapPointToGeometry,
  viewportToSvgViewBox,
  visibleHeightMeters,
  visibleWidthMeters,
} from "@cplayout/geometry";
import type { InfrastructurePoint, MapStyle, MappingWorkflowMode, ObstacleZone, ProjectMapFeature, ProjectMapFeatureKind, SurveyPoint } from "@cplayout/core";
import { resolveReferenceOverlaySource } from "@cplayout/core";
import { XY } from "@cplayout/core";
import { MapLibreImageryPreview } from "./MapLibreImageryPreview";
import {
  defaultMapFeatureName,
  draftVerticesToFeatureGeometry,
  featureDraftMinimumVertices,
  featureOptionForKind,
  UTILITY_FEATURE_OPTIONS,
  type UtilityFeatureGeometry,
} from "./mapTools";
import type { MapSurfaceProps } from "./types";

type SelectedVertex =
  | { layer: "field_boundary"; vertexIndex: number }
  | { layer: "obstacle"; obstacleId: string; vertexIndex: number };

type MapPalette = ReturnType<typeof paletteForMapStyle>;

const CATALOG_HOME_BOUNDS = {
  minX: -168,
  minY: 15,
  maxX: -52,
  maxY: 72,
};

export function SvgMapSurface({
  activeLayer: externalActiveLayer,
  activeMapFeatureKind,
  activeToolMode,
  activeToolRequestId,
  bottomOverlay,
  homeView = false,
  project,
  result,
  settings,
  selectedMapFeatureId,
  onMappingWorkflowModeChange,
  onCommitBoundaryDraft,
  onCommitObstacleDraft,
  onMoveBoundaryVertex,
  onDeleteBoundaryVertex,
  onMoveObstacleVertex,
  onDeleteObstacleVertex,
  onPlacePivot,
  onMoveInfrastructurePoint,
  onAddSurveyPoint,
  onAddMapFeature,
  onSelectMapFeature,
}: MapSurfaceProps): React.JSX.Element {
  const { width: windowWidth } = useWindowDimensions();
  const compactLayout = windowWidth < 760;
  const catalogHomeView = homeView === true;
  const designMode = settings.mappingWorkflowMode === "design" && !catalogHomeView;
  const showProjectGeometry = !catalogHomeView;
  const mapFeatures = project.mapFeatures ?? [];
  const allRings = showProjectGeometry
    ? [
      project.fieldBoundary,
      ...result.allowedCoverage.flat(),
      ...result.outsideFieldCoverage.flat(),
      ...result.endGunCoverage.flat(),
      ...project.obstacles.map((obstacle) => obstacle.polygon),
      ...mapFeatures.flatMap(mapFeatureRings),
    ]
    : [];
  const bounds = showProjectGeometry ? boundsForGeometry(allRings) : CATALOG_HOME_BOUNDS;
  const margin = showProjectGeometry ? 80 : 0;
  const initialViewport = useMemo(
    () => createInitialViewport({
      minX: bounds.minX - margin,
      minY: bounds.minY - margin,
      maxX: bounds.maxX + margin,
      maxY: bounds.maxY + margin,
    }, settings.defaultZoomLevel),
    [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, settings.defaultZoomLevel],
  );
  const [mapState, setMapState] = useState<DrawingMapState>(() => createDrawingMapState(initialViewport));
  const [mapPixelWidth, setMapPixelWidth] = useState(900);
  const [mapPixelHeight, setMapPixelHeight] = useState(440);
  const [selectedVertex, setSelectedVertex] = useState<SelectedVertex | null>(null);
  const [localSelectedMapFeatureId, setLocalSelectedMapFeatureId] = useState<string | null>(null);
  const [mapFeatureKind, setMapFeatureKind] = useState<ProjectMapFeatureKind>("underground_pipeline");
  const [lastSnap, setLastSnap] = useState<{ point: XY; kind: "vertex" | "feature" } | null>(null);
  const lastSvgPressAt = useRef(0);
  const pressStartPoint = useRef<{ x: number; y: number } | null>(null);
  const palette = paletteForMapStyle(settings.mapStyle);
  const mapFeatureOption = featureOptionForKind(mapFeatureKind);
  const activeSelectedMapFeatureId = selectedMapFeatureId ?? localSelectedMapFeatureId;
  const viewWidth = visibleWidthMeters(mapState.viewport);
  const viewHeight = visibleHeightMeters(mapState.viewport);
  const minX = mapState.viewport.center.x - viewWidth / 2;
  const maxX = mapState.viewport.center.x + viewWidth / 2;
  const minY = -mapState.viewport.center.y - viewHeight / 2;
  const maxY = -mapState.viewport.center.y + viewHeight / 2;
  const fieldPath = showProjectGeometry ? ringsToSvgPath([[project.fieldBoundary]]) : "";
  const imageryPlan = useMemo(
    () => !catalogHomeView && settings.onlineImagery.enabled
      ? planOnlineImageryTiles({
        viewport: mapState.viewport,
        projectCrs: project.projectCrs,
        providerId: settings.onlineImagery.providerId,
        customSource: settings.onlineImagery.customSource,
        maxTiles: settings.onlineImagery.maxTilesPerView,
      })
      : null,
    [
      catalogHomeView,
      mapState.viewport,
      project.projectCrs,
      settings.onlineImagery.enabled,
      settings.onlineImagery.customSource,
      settings.onlineImagery.maxTilesPerView,
      settings.onlineImagery.providerId,
    ],
  );
  const shouldShowMapLibrePreview = !catalogHomeView && settings.onlineImagery.enabled && !supportsSvgOnlineImageryOverlay(project.projectCrs);
  const referenceOverlayNotice = useMemo(
    () => settings.referenceOverlay.mode !== "off"
      ? resolveReferenceOverlaySource({
        preferences: settings.referenceOverlay,
        mapPackages: project.mapPackages ?? [],
        target: Platform.OS === "web" ? "svg_mvp" : "native_maplibre_rn",
      })
      : null,
    [project.mapPackages, settings.referenceOverlay],
  );

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
      onPanResponderRelease: (_event, gesture) => {
        dispatch({
          type: "pan_screen",
          dxPixels: gesture.dx,
          dyPixels: gesture.dy,
          screenWidthPixels: mapPixelWidth,
          screenHeightPixels: mapPixelHeight,
        });
      },
    }),
    [mapPixelHeight, mapPixelWidth, mapState.mode, mapState.viewport],
  );
  const panHandlers = panResponder.panHandlers;
  const svgInteractionProps = Platform.OS === "web"
    ? { onClick: addDraftVertexFromWebClick, onDoubleClick: closeDraftFromWebDoubleClick, onPress: addDraftVertexFromPress }
    : { onPress: addDraftVertexFromPress };
  const mapClickLayerProps = Platform.OS === "web" ? { onClick: addDraftVertexFromWebClick, onDoubleClick: closeDraftFromWebDoubleClick } : {};
  const canCommitCurrentDraft = designMode && canCommitDraft(mapState);
  const canSaveCurrentMapFeature = designMode && canSaveMapFeature(mapState, mapFeatureOption.geometry);
  const mapClickLayerActive = designMode && mapState.mode !== "pan" && mapState.mode !== "edit_vertices";

  useEffect(() => {
    if (designMode) return;
    setSelectedVertex(null);
    setMapState((current) => {
      let next = current;
      if (next.mode !== "pan") next = reduceDrawingMapState(next, { type: "set_mode", mode: "pan" });
      if (next.draftVertices.length > 0) next = reduceDrawingMapState(next, { type: "clear_draft" });
      return next;
    });
  }, [designMode]);

  useEffect(() => {
    if (!designMode) return;
    if (activeMapFeatureKind) setMapFeatureKind(activeMapFeatureKind);
    setMapState((current) => {
      let next = current;
      if (externalActiveLayer && externalActiveLayer !== next.activeLayer) {
        next = reduceDrawingMapState(next, { type: "set_active_layer", activeLayer: externalActiveLayer });
      }
      if (activeToolMode && activeToolMode !== next.mode) {
        next = reduceDrawingMapState(next, { type: "set_mode", mode: activeToolMode });
      }
      return next;
    });
  }, [activeMapFeatureKind, activeToolMode, activeToolRequestId, designMode, externalActiveLayer]);

  function dispatch(action: DrawingMapAction): void {
    setMapState((current) => reduceDrawingMapState(current, action));
  }

  function addDraftVertexFromPress(event: GestureResponderEvent): void {
    if (!Number.isFinite(event.nativeEvent.locationX) || !Number.isFinite(event.nativeEvent.locationY)) return;
    lastSvgPressAt.current = Date.now();
    addDraftVertexAtScreenPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
  }

  function startPressGesture(event: GestureResponderEvent): void {
    pressStartPoint.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  }

  function updatePressGesture(event: GestureResponderEvent): void {
    const start = pressStartPoint.current;
    if (!start) return;
    const next = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
    if (Math.hypot(next.x - start.x, next.y - start.y) > 10) pressStartPoint.current = null;
  }

  function releasePressGesture(event: GestureResponderEvent): void {
    const start = pressStartPoint.current;
    pressStartPoint.current = null;
    if (!start) return;
    const next = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
    if (Math.hypot(next.x - start.x, next.y - start.y) > 10) return;
    addDraftVertexFromPress(event);
  }

  function addDraftVertexFromWebClick(event: { nativeEvent?: { offsetX?: number; offsetY?: number }; currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } }; clientX?: number; clientY?: number }): void {
    if (Date.now() - lastSvgPressAt.current < 80) return;
    const bounds = event.currentTarget?.getBoundingClientRect?.();
    const xPixels = event.nativeEvent?.offsetX ?? (bounds ? (event.clientX ?? 0) - bounds.left : 0);
    const yPixels = event.nativeEvent?.offsetY ?? (bounds ? (event.clientY ?? 0) - bounds.top : 0);
    addDraftVertexAtScreenPoint(xPixels, yPixels);
  }

  function closeDraftFromWebDoubleClick(event: { preventDefault?: () => void; stopPropagation?: () => void; nativeEvent?: { offsetX?: number; offsetY?: number }; currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } }; clientX?: number; clientY?: number }): void {
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!designMode) return;
    const bounds = event.currentTarget?.getBoundingClientRect?.();
    const xPixels = event.nativeEvent?.offsetX ?? (bounds ? (event.clientX ?? 0) - bounds.left : 0);
    const yPixels = event.nativeEvent?.offsetY ?? (bounds ? (event.clientY ?? 0) - bounds.top : 0);
    if (!Number.isFinite(xPixels) || !Number.isFinite(yPixels)) return;
    const rawVertex = screenPointToWorld(
      mapState.viewport,
      { xPixels, yPixels },
      { widthPixels: mapPixelWidth, heightPixels: mapPixelHeight },
    );
    const vertex = snapWorldPoint(rawVertex);
    handleDraftVertexIntent(vertex, true);
  }

  function addDraftVertexAtScreenPoint(xPixels: number, yPixels: number): void {
    if (!designMode) return;
    if (!Number.isFinite(xPixels) || !Number.isFinite(yPixels)) return;
    const rawVertex = screenPointToWorld(
      mapState.viewport,
      { xPixels, yPixels },
      {
        widthPixels: mapPixelWidth,
        heightPixels: mapPixelHeight,
      },
    );
    const vertex = snapWorldPoint(rawVertex);
    if (mapState.mode === "place_pivot") {
      if (mapState.activeLayer === "water_source" || mapState.activeLayer === "power_source") onMoveInfrastructurePoint?.(mapState.activeLayer, vertex);
      else onPlacePivot?.(vertex);
      return;
    }
    if (mapState.mode === "capture_point") {
      captureSurveyPoint(vertex);
      return;
    }
    if (mapState.mode === "measure" && mapFeatureOption.geometry === "Point") {
      commitMapFeaturePoint(vertex);
      return;
    }
    if (mapState.mode === "edit_vertices" && selectedVertex) {
      if (selectedVertex.layer === "field_boundary") {
        onMoveBoundaryVertex?.(selectedVertex.vertexIndex, vertex);
      } else {
        onMoveObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex, vertex);
      }
      return;
    }
    if (!canAddDraftVertex(mapState.mode)) return;
    handleDraftVertexIntent(vertex, false);
  }

  function addDraftVertexAtViewCenter(): void {
    if (!designMode) return;
    const vertex = snapWorldPoint(mapState.viewport.center);
    if (mapState.mode === "capture_point") {
      captureSurveyPoint(vertex);
      return;
    }
    if (!canAddDraftVertex(mapState.mode)) return;
    dispatch({ type: "add_draft_vertex", vertex });
  }

  function commitDraft(): void {
    commitDraftVertices(mapState.draftVertices);
  }

  function commitDraftVertices(vertices: XY[]): void {
    if (!designMode) return;
    if (vertices.length < 3) return;
    let committed = false;
    if (mapState.mode === "draw_boundary") {
      committed = onCommitBoundaryDraft?.(vertices) !== false;
    } else if (mapState.mode === "mark_obstacle") {
      committed = onCommitObstacleDraft?.(vertices, obstacleKindForLayer(mapState.activeLayer)) !== false;
    } else {
      return;
    }
    if (committed) dispatch({ type: "clear_draft" });
  }

  function handleDraftVertexIntent(vertex: XY, closeRequested: boolean): void {
    const intent = resolveDraftVertexIntent({
      closeRequested,
      currentVertices: mapState.draftVertices,
      mode: mapState.mode,
      vertex,
      vertexSnapToleranceMeters: settings.drawing.vertexSnapToleranceMeters,
    });
    if (intent.type === "commit") {
      commitDraftVertices(intent.vertices);
      return;
    }
    dispatch({ type: "add_draft_vertex", vertex: intent.vertex });
  }

  function setToolMode(mode: DrawingMapState["mode"], layer?: DrawingLayerType): void {
    if (!designMode && mode !== "pan") {
      dispatch({ type: "set_mode", mode: "pan" });
      return;
    }
    const nextLayer = setToolLayerForMode(mode, layer);
    if (nextLayer) dispatch({ type: "set_active_layer", activeLayer: nextLayer });
    dispatch({ type: "set_mode", mode });
    if (mode !== "edit_vertices") setSelectedVertex(null);
  }

  function selectVertex(nextSelectedVertex: SelectedVertex): void {
    if (!designMode) return;
    setSelectedVertex(nextSelectedVertex);
    dispatch({ type: "set_mode", mode: "edit_vertices" });
  }

  function deleteSelectedVertex(): void {
    if (!designMode) return;
    if (!selectedVertex) return;
    if (selectedVertex.layer === "field_boundary") {
      onDeleteBoundaryVertex?.(selectedVertex.vertexIndex);
    } else {
      onDeleteObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex);
    }
    setSelectedVertex(null);
  }

  function selectFirstBoundaryVertex(): void {
    if (!designMode) return;
    if (project.fieldBoundary.length === 0) return;
    selectVertex({ layer: "field_boundary", vertexIndex: 0 });
  }

  function nudgeSelectedVertex(delta: XY): void {
    if (!designMode) return;
    if (!selectedVertex) return;
    const currentPoint = selectedVertexPoint(selectedVertex);
    if (!currentPoint) return;
    const nextPoint = { x: currentPoint.x + delta.x, y: currentPoint.y + delta.y };
    if (selectedVertex.layer === "field_boundary") {
      onMoveBoundaryVertex?.(selectedVertex.vertexIndex, nextPoint);
    } else {
      onMoveObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex, nextPoint);
    }
  }

  function selectedVertexPoint(vertex: SelectedVertex): XY | null {
    if (vertex.layer === "field_boundary") return project.fieldBoundary[vertex.vertexIndex] ?? null;
    return project.obstacles.find((obstacle) => obstacle.id === vertex.obstacleId)?.polygon[vertex.vertexIndex] ?? null;
  }

  function snapWorldPoint(point: XY): XY {
    const snap = snapPointToGeometry(
      point,
      {
        vertices: [
          project.pivotCenter,
          project.waterSource,
          project.powerSource,
          ...mapFeatures.flatMap((feature) => {
            if (feature.geometry.type === "Point") return [feature.geometry.point];
            if (feature.geometry.type === "Circle") return [feature.geometry.center];
            return [];
          }),
        ],
        rings: [
          project.fieldBoundary,
          ...project.obstacles.map((obstacle) => obstacle.polygon),
          ...mapFeatures.flatMap(mapFeatureRings),
          mapState.draftVertices,
        ],
      },
      settings.drawing,
    );
    setLastSnap(snap ? { point: snap.point, kind: snap.kind } : null);
    return snap?.point ?? point;
  }

  function captureSurveyPoint(point: XY): void {
    if (!designMode) return;
    onAddSurveyPoint?.({
      label: `${surveyRoleForLayer(mapState.activeLayer).replaceAll("_", " ")} point ${project.surveyPoints.length + 1}`,
      role: surveyRoleForLayer(mapState.activeLayer),
      projected: point,
      source: "manual",
      confidence: settings.onlineImagery.enabled ? "imagery_digitized" : "user_estimated",
      notes: settings.onlineImagery.enabled ? "Captured from online imagery preview; verify by field survey." : undefined,
    });
  }

  function commitMapFeaturePoint(point: XY): void {
    if (!designMode) return;
    onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, mapFeatureOption.geometry, 1),
      kind: mapFeatureKind,
      geometry: { type: "Point", point },
      confidence: settings.onlineImagery.enabled ? "imagery_digitized" : "user_estimated",
      notes: settings.onlineImagery.enabled ? "Captured from online imagery preview; verify by field survey." : undefined,
    });
  }

  function commitMapFeatureFromDraft(): void {
    if (!designMode) return;
    if (mapFeatureOption.geometry === "Point") return;
    if (mapState.draftVertices.length < featureDraftMinimumVertices(mapFeatureOption.geometry)) return;
    onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, mapFeatureOption.geometry, mapState.draftVertices.length),
      kind: mapFeatureKind,
      geometry: draftVerticesToFeatureGeometry(mapFeatureOption.geometry, mapState.draftVertices),
      confidence: settings.onlineImagery.enabled ? "imagery_digitized" : "user_estimated",
      notes: settings.onlineImagery.enabled ? "Traced from online imagery preview; verify by field survey." : undefined,
    });
    dispatch({ type: "clear_draft" });
  }

  function saveMapFeatureFromHud(): void {
    if (!designMode) return;
    if (mapFeatureOption.geometry === "Point") {
      commitMapFeaturePoint(snapWorldPoint(mapState.viewport.center));
    } else {
      commitMapFeatureFromDraft();
    }
  }

  function selectMapFeature(featureId: string): void {
    const nextId = activeSelectedMapFeatureId === featureId ? null : featureId;
    setLocalSelectedMapFeatureId(nextId);
    onSelectMapFeature?.(nextId);
    dispatch({ type: "select_feature", featureId: nextId });
  }

  return (
    <View style={[styles.shell, compactLayout && styles.shellCompact]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Map Workspace</Text>
          <Text style={styles.subtitle}>
            {catalogHomeView
              ? "North America project catalog · no project geometry loaded"
              : `${project.projectCrs} · ${workflowModeLabel(settings.mappingWorkflowMode)} · ${mapState.mode.replaceAll("_", " ")} · zoom ${mapState.viewport.zoomLevel.toFixed(2)}x`}
          </Text>
        </View>
        <WorkflowSegmentedControl
          mode={settings.mappingWorkflowMode}
          onChange={(mode) => onMappingWorkflowModeChange?.(mode)}
        />
        <View style={[styles.modeRow, compactLayout && styles.modeRowCompact]}>
          <ToolButton active={mapState.mode === "pan"} icon={<Hand size={18} />} label="Pan" onPress={() => setToolMode("pan")} />
          {designMode ? (
            <>
              <ToolButton active={mapState.mode === "draw_boundary"} icon={<PencilLine size={18} />} label="Boundary" onPress={() => setToolMode("draw_boundary", "field_boundary")} />
              <ToolButton active={mapState.mode === "mark_obstacle"} icon={<Crosshair size={18} />} label="Obstacle" onPress={() => setToolMode("mark_obstacle", "obstacle")} />
              <ToolButton active={mapState.mode === "edit_vertices"} icon={<Crosshair size={18} />} label="Edit" onPress={() => dispatch({ type: "set_mode", mode: "edit_vertices" })} />
              <ToolButton active={mapState.mode === "capture_point"} icon={<Satellite size={18} />} label="Survey" onPress={() => setToolMode("capture_point", "control_point")} />
              <ToolButton active={mapState.mode === "measure"} icon={<Ruler size={18} />} label="Measure" onPress={() => setToolMode("measure")} />
              <ToolButton active={mapState.mode === "place_pivot"} icon={<LocateFixed size={18} />} label="Pivot" onPress={() => setToolMode("place_pivot", "pivot_center")} />
            </>
          ) : null}
        </View>
      </View>

      <View
        accessibilityLabel="Layout map drawing surface"
        style={[styles.mapSurface, { backgroundColor: palette.background }]}
        testID="layout-map-drawing-surface"
        onLayout={(event) => {
          setMapPixelWidth(Math.max(1, event.nativeEvent.layout.width));
          setMapPixelHeight(Math.max(1, event.nativeEvent.layout.height));
        }}
        {...panHandlers}
      >
        <Svg
          viewBox={viewportToSvgViewBox(mapState.viewport)}
          style={[styles.svg, compactLayout && styles.svgCompact]}
          testID="layout-map-svg"
          {...svgInteractionProps}
        >
          <Rect
            x={minX}
            y={minY}
            width={viewWidth}
            height={viewHeight}
            fill={palette.background}
          />
          {imageryPlan?.tiles.map((tile) => (
            <SvgImage
              key={tile.key}
              href={{ uri: tile.href }}
              opacity={0.66}
              preserveAspectRatio="none"
              x={tile.projectedBounds.minX}
              y={-tile.projectedBounds.maxY}
              width={tile.projectedBounds.maxX - tile.projectedBounds.minX}
              height={tile.projectedBounds.maxY - tile.projectedBounds.minY}
            />
          ))}
          <MapBackground minX={minX} maxX={maxX} minY={minY} maxY={maxY} styleName={settings.mapStyle} />
          <Grid minX={minX} maxX={maxX} minY={minY} maxY={maxY} stroke={palette.grid} />
          {catalogHomeView ? (
            <CatalogHomeOverlay minX={minX} maxX={maxX} minY={minY} maxY={maxY} palette={palette} />
          ) : (
            <>
              <Path d={ringsToSvgPath(result.outsideFieldCoverage)} fill={palette.outside} opacity={0.28} />
              <Path d={ringsToSvgPath(result.endGunCoverage)} fill={palette.endGun} opacity={0.25} />
              <Path d={ringsToSvgPath(result.allowedCoverage)} fill={palette.allowed} opacity={0.54} />
              <Path d={fieldPath} fill="none" stroke={palette.fieldStroke} strokeWidth={7} strokeLinejoin="round" />
              <Path d={ringsToSvgPath(result.obstacles)} fill={palette.obstacle} opacity={0.78} stroke={palette.obstacleStroke} strokeWidth={3} />
              <EditableRing
                color={palette.fieldStroke}
                layerLabel="Boundary"
                selected={selectedVertex?.layer === "field_boundary" ? selectedVertex.vertexIndex : null}
                vertices={project.fieldBoundary}
                onSelect={designMode ? (vertexIndex) => selectVertex({ layer: "field_boundary", vertexIndex }) : undefined}
              />
              {project.obstacles.map((obstacle) => (
                <React.Fragment key={obstacle.id}>
                  <ObstacleSymbol obstacle={obstacle} color={palette.obstacleStroke} />
                  <EditableRing
                    color={palette.obstacleStroke}
                    layerLabel={`${obstacle.name} obstacle`}
                    selected={selectedVertex?.layer === "obstacle" && selectedVertex.obstacleId === obstacle.id ? selectedVertex.vertexIndex : null}
                    vertices={obstacle.polygon}
                    onSelect={designMode ? (vertexIndex) => selectVertex({ layer: "obstacle", obstacleId: obstacle.id, vertexIndex }) : undefined}
                  />
                </React.Fragment>
              ))}
              {mapFeatures.map((feature) => (
                <MapFeatureSymbol
                  key={feature.id}
                  feature={feature}
                  palette={palette}
                  selected={activeSelectedMapFeatureId === feature.id}
                  onSelect={() => selectMapFeature(feature.id)}
                />
              ))}
              <DraftVertices vertices={mapState.draftVertices} color={palette.draft} />
              {lastSnap ? <SnapMarker point={lastSnap.point} color={palette.snap} label={lastSnap.kind} /> : null}
              <InfrastructureSymbol point={project.pivotCenter} color={palette.pivot} kind="pivot_center" label="Pivot" />
              <InfrastructureSymbol point={project.waterSource} color={palette.water} kind="water_source" label="Water" />
              <InfrastructureSymbol point={project.powerSource} color={palette.power} kind="power_source" label="Power" />
              {project.surveyPoints.map((point) => (
                <SurveyPointSymbol key={point.id} point={point} color={palette.survey} />
              ))}
              {result.towers.map((tower) => (
                <React.Fragment key={tower.towerIndex}>
                  <Line
                    x1={project.pivotCenter.x}
                    y1={-project.pivotCenter.y}
                    x2={tower.point.x}
                    y2={-tower.point.y}
                    stroke={palette.tower}
                    strokeDasharray="7 8"
                    strokeWidth={1.8}
                  />
                  <Circle cx={tower.point.x} cy={-tower.point.y} r={8} fill={palette.markerFill} stroke={palette.fieldStroke} strokeWidth={4} />
                  <SvgText x={tower.point.x + 12} y={-tower.point.y - 10} fill={palette.fieldStroke} fontSize={24} fontWeight="700">
                    T{tower.towerIndex}
                  </SvgText>
                </React.Fragment>
              ))}
            </>
          )}
        </Svg>
        {mapClickLayerActive ? (
          <View
            accessibilityLabel="Map drawing click layer"
            onResponderGrant={startPressGesture}
            onResponderMove={updatePressGesture}
            onResponderRelease={releasePressGesture}
            onStartShouldSetResponder={() => true}
            style={[styles.mapClickLayer, compactLayout && styles.mapClickLayerCompact]}
            testID="layout-map-click-layer"
            {...mapClickLayerProps}
          />
        ) : null}

        <View style={styles.zoomControls}>
          <IconControl icon={<Plus size={22} />} label="Zoom in" onPress={() => dispatch({ type: "zoom", factor: settings.drawing.zoomStepFactor })} />
          <IconControl icon={<Minus size={22} />} label="Zoom out" onPress={() => dispatch({ type: "zoom", factor: 1 / settings.drawing.zoomStepFactor })} />
          <IconControl icon={<RefreshCcw size={20} />} label="Reset view" onPress={() => setMapState(createDrawingMapState(initialViewport))} />
        </View>

        <View style={styles.panControls}>
          <IconControl icon={<ArrowUp size={20} />} label="Pan north" onPress={() => dispatch({ type: "pan", delta: { x: 0, y: settings.drawing.panStepMeters } })} />
          <View style={styles.panMiddle}>
            <IconControl icon={<ArrowLeft size={20} />} label="Pan west" onPress={() => dispatch({ type: "pan", delta: { x: -settings.drawing.panStepMeters, y: 0 } })} />
            <IconControl icon={<ArrowRight size={20} />} label="Pan east" onPress={() => dispatch({ type: "pan", delta: { x: settings.drawing.panStepMeters, y: 0 } })} />
          </View>
          <IconControl icon={<ArrowDown size={20} />} label="Pan south" onPress={() => dispatch({ type: "pan", delta: { x: 0, y: -settings.drawing.panStepMeters } })} />
        </View>
        {designMode ? (
        <View style={styles.draftHud}>
          <Text style={styles.draftHudText}>
            {mapState.activeLayer.replaceAll("_", " ")} · {mapState.draftVertices.length} pts{measureText(mapState.draftVertices)}{selectedVertex ? ` · ${selectedVertexText(selectedVertex)}` : ""}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Add draft vertex at view center" disabled={!designMode} onPress={addDraftVertexAtViewCenter} style={[styles.clearDraftButton, !designMode && styles.disabledDraftButton]}>
            <Text style={styles.clearDraftText}>{mapState.mode === "capture_point" ? "Capture Center" : "Add Center"}</Text>
          </Pressable>
          {mapState.mode === "edit_vertices" ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Select first boundary vertex" disabled={!designMode} onPress={selectFirstBoundaryVertex} style={[styles.clearDraftButton, !designMode && styles.disabledDraftButton]}>
                <Text style={styles.clearDraftText}>First Vertex</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Move selected vertex east" disabled={!selectedVertex || !designMode} onPress={() => nudgeSelectedVertex({ x: Math.max(1, settings.drawing.panStepMeters / 4), y: 0 })} style={[styles.clearDraftButton, (!selectedVertex || !designMode) && styles.disabledDraftButton]}>
                <Text style={styles.clearDraftText}>Nudge E</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Commit draft geometry" disabled={!canCommitCurrentDraft} onPress={commitDraft} style={[styles.clearDraftButton, canCommitCurrentDraft && styles.commitDraftButton, !canCommitCurrentDraft && styles.disabledDraftButton]}>
            <Text style={[styles.clearDraftText, canCommitCurrentDraft && styles.commitDraftText]}>{mapState.mode === "measure" ? "Measure Only" : "Commit"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Save utility map feature" disabled={!canSaveCurrentMapFeature} onPress={saveMapFeatureFromHud} style={[styles.clearDraftButton, canSaveCurrentMapFeature && styles.commitDraftButton, !canSaveCurrentMapFeature && styles.disabledDraftButton]}>
            <Text style={[styles.clearDraftText, canSaveCurrentMapFeature && styles.commitDraftText]}>{mapFeatureOption.geometry === "Point" ? "Save Center Feature" : "Save Feature"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete selected vertex" disabled={!selectedVertex || !designMode} onPress={deleteSelectedVertex} style={[styles.clearDraftButton, (!selectedVertex || !designMode) && styles.disabledDraftButton]}>
            <Text style={styles.clearDraftText}>Delete Vertex</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear draft vertices" onPress={() => dispatch({ type: "clear_draft" })} style={styles.clearDraftButton}>
            <Text style={styles.clearDraftText}>Clear</Text>
          </Pressable>
        </View>
        ) : (
          <View style={styles.draftHud}>
            <Text style={styles.draftHudText}>{catalogHomeView ? "Catalog view · open a saved design to edit projected XY geometry" : "Layout · RTK-only mutation · pointer editing controls hidden"}</Text>
          </View>
        )}
        {imageryPlan ? (
          <View style={styles.imageryBadge}>
            <Text style={styles.imageryBadgeText}>
              {imageryPlan.error ? `Imagery unavailable: ${imageryPlan.error}` : `${imageryPlan.provider.name} · z${imageryPlan.tiles[0]?.z ?? "-"} · ${imageryPlan.tiles.length} tiles${imageryPlan.capped ? " capped" : ""}`}
            </Text>
            {!imageryPlan.error ? (
              <Text style={styles.imageryBadgeSubtext}>
                {imageryPlan.provider.attribution} · {imageryPlan.provider.licenseText}
              </Text>
            ) : (
              <Text style={styles.imageryBadgeSubtext}>
                {imageryPlan.provider.attribution} · {imageryPlan.provider.licenseText}
              </Text>
            )}
          </View>
        ) : null}
        {referenceOverlayNotice ? (
          <View style={styles.referenceOverlayBadge} testID="svg-reference-overlay-unavailable">
            <Text style={styles.imageryBadgeText}>Reference overlays unavailable</Text>
            <Text style={styles.imageryBadgeSubtext}>{referenceOverlayNotice.reason}</Text>
          </View>
        ) : null}
        {bottomOverlay ? (
          <View pointerEvents="box-none" style={styles.bottomOverlaySlot}>
            {bottomOverlay}
          </View>
        ) : null}
      </View>

      <MapLibreImageryPreview
        project={project}
        result={result}
        settings={settings}
        visible={shouldShowMapLibrePreview}
      />

      {designMode ? (
      <View style={styles.layerRow}>
        {UTILITY_FEATURE_OPTIONS.map((option) => (
          <FeatureKindButton
            key={option.kind}
            active={mapFeatureKind === option.kind}
            disabled={!designMode}
            label={option.label}
            onPress={() => {
              setMapFeatureKind(option.kind);
              setToolMode("measure");
            }}
          />
        ))}
      </View>
      ) : null}

      {designMode ? (
      <View style={styles.layerRow}>
        <LayerButton active={mapState.activeLayer === "field_boundary"} disabled={!designMode} label="Boundary" layer="field_boundary" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "obstacle"} disabled={!designMode} label="Obstacle" layer="obstacle" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "road"} disabled={!designMode} label="Road" layer="road" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "ditch"} disabled={!designMode} label="Ditch" layer="ditch" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "fence"} disabled={!designMode} label="Fence" layer="fence" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "exclusion"} disabled={!designMode} label="Exclusion" layer="exclusion" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "pivot_center"} disabled={!designMode} label="Pivot" layer="pivot_center" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "water_source"} disabled={!designMode} label="Water" layer="water_source" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "power_source"} disabled={!designMode} label="Power" layer="power_source" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "control_point"} disabled={!designMode} label="Control" layer="control_point" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "note_point"} disabled={!designMode} label="Note" layer="note_point" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
      </View>
      ) : null}

      {!catalogHomeView ? (
        <View style={styles.legend}>
          <LegendSwatch color="#6cb6df" label="Allowed wet area" />
          <LegendSwatch color="#63c7cf" label="End gun" />
          <LegendSwatch color="#e68b58" label="Outside field" />
          <LegendSwatch color="#c64f43" label="Obstacle/no-spray" />
          <LegendSwatch color={palette.survey} label="Survey/object point" />
          <LegendSwatch color={palette.utility} label="Utility map feature" />
        </View>
      ) : null}
    </View>
  );
}

export const LayoutMap = SvgMapSurface;

function canAddDraftVertex(mode: DrawingMapState["mode"]): boolean {
  return mode === "draw_boundary" || mode === "mark_obstacle" || mode === "measure";
}

function canCommitDraft(mapState: DrawingMapState): boolean {
  return mapState.draftVertices.length >= 3 && (mapState.mode === "draw_boundary" || mapState.mode === "mark_obstacle");
}

function canSaveMapFeature(mapState: DrawingMapState, geometry: UtilityFeatureGeometry): boolean {
  return mapState.mode === "measure" && (geometry === "Point" || mapState.draftVertices.length >= featureDraftMinimumVertices(geometry));
}

function mapFeatureRings(feature: ProjectMapFeature): XY[][] {
  if (feature.geometry.type === "Point") return [];
  if (feature.geometry.type === "LineString") return [feature.geometry.vertices];
  if (feature.geometry.type === "Polygon") return [feature.geometry.vertices];
  return [createCirclePolygon(feature.geometry.center, feature.geometry.radiusMeters, 72)];
}

function setToolLayerForMode(mode: DrawingMapState["mode"], layer?: DrawingLayerType): DrawingLayerType | null {
  if (layer) return layer;
  if (mode === "draw_boundary") return "field_boundary";
  if (mode === "mark_obstacle") return "obstacle";
  if (mode === "capture_point") return "control_point";
  if (mode === "place_pivot") return "pivot_center";
  return null;
}

function obstacleKindForLayer(layer: DrawingLayerType): ObstacleZone["kind"] {
  if (layer === "road" || layer === "ditch" || layer === "fence" || layer === "building" || layer === "canal" || layer === "tree" || layer === "exclusion") {
    return layer;
  }
  return "exclusion";
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

function measureText(vertices: XY[]): string {
  if (vertices.length < 2) return "";
  const distance = vertices.slice(1).reduce((sum, vertex, index) => sum + Math.hypot(vertex.x - vertices[index].x, vertex.y - vertices[index].y), 0);
  return ` · ${distance.toFixed(1)} m`;
}

function selectedVertexText(vertex: SelectedVertex): string {
  if (vertex.layer === "field_boundary") return `selected boundary vertex ${vertex.vertexIndex + 1}`;
  return `selected obstacle vertex ${vertex.vertexIndex + 1}`;
}

function Grid({ minX, maxX, minY, maxY, stroke }: { minX: number; maxX: number; minY: number; maxY: number; stroke: string }): React.JSX.Element {
  const spacing = 100;
  const verticals: number[] = [];
  const horizontals: number[] = [];
  for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) verticals.push(x);
  for (let y = Math.ceil(minY / spacing) * spacing; y <= maxY; y += spacing) horizontals.push(y);

  return (
    <>
      {verticals.map((x) => <Line key={`v-${x}`} x1={x} y1={minY} x2={x} y2={maxY} stroke={stroke} strokeWidth={1.2} />)}
      {horizontals.map((y) => <Line key={`h-${y}`} x1={minX} y1={y} x2={maxX} y2={y} stroke={stroke} strokeWidth={1.2} />)}
    </>
  );
}

function MapBackground({ minX, maxX, minY, maxY, styleName }: { minX: number; maxX: number; minY: number; maxY: number; styleName: MapStyle }): React.JSX.Element {
  if (styleName !== "imagery_package" && styleName !== "topographic") return <></>;

  const blocks: React.JSX.Element[] = [];
  const size = styleName === "imagery_package" ? 180 : 140;
  let index = 0;
  for (let x = Math.floor(minX / size) * size; x <= maxX; x += size) {
    for (let y = Math.floor(minY / size) * size; y <= maxY; y += size) {
      const even = (Math.round(x / size) + Math.round(y / size)) % 2 === 0;
      if (styleName === "imagery_package") {
        blocks.push(
          <Rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={size}
            height={size}
            fill={even ? "#dfe4d2" : "#cfd9c3"}
            opacity={0.55}
          />,
        );
      } else if (index % 2 === 0) {
        blocks.push(<Line key={`contour-${x}-${y}`} x1={x} y1={y + size / 2} x2={x + size} y2={y + size / 4} stroke="#b6a66d" strokeWidth={1.4} opacity={0.6} />);
      }
      index += 1;
    }
  }
  return <>{blocks}</>;
}

function InfrastructureSymbol({ color, kind, label, point }: { color: string; kind: InfrastructurePoint; label: string; point: XY }): React.JSX.Element {
  const y = -point.y;
  return (
    <>
      {kind === "pivot_center" ? (
        <>
          <Circle cx={point.x} cy={y} r={18} fill="#fffef8" stroke={color} strokeWidth={5} />
          <Circle cx={point.x} cy={y} r={6} fill={color} />
          <Line x1={point.x - 25} y1={y} x2={point.x + 25} y2={y} stroke={color} strokeWidth={4} />
          <Line x1={point.x} y1={y - 25} x2={point.x} y2={y + 25} stroke={color} strokeWidth={4} />
        </>
      ) : null}
      {kind === "water_source" ? (
        <Path d={`M ${point.x} ${y - 24} C ${point.x + 20} ${y - 2}, ${point.x + 16} ${y + 19}, ${point.x} ${y + 21} C ${point.x - 16} ${y + 19}, ${point.x - 20} ${y - 2}, ${point.x} ${y - 24} Z`} fill="#fffef8" stroke={color} strokeWidth={5} />
      ) : null}
      {kind === "power_source" ? (
        <Path d={`M ${point.x - 5} ${y - 25} L ${point.x + 18} ${y - 25} L ${point.x + 4} ${y - 3} L ${point.x + 20} ${y - 3} L ${point.x - 9} ${y + 26} L ${point.x - 1} ${y + 5} L ${point.x - 19} ${y + 5} Z`} fill="#fffef8" stroke={color} strokeWidth={5} />
      ) : null}
      <SvgText x={point.x + 28} y={y + 8} fill={color} fontSize={27} fontWeight="800">
        {label}
      </SvgText>
    </>
  );
}

function SurveyPointSymbol({ color, point }: { color: string; point: SurveyPoint }): React.JSX.Element {
  const x = point.projected.x;
  const y = -point.projected.y;
  if (point.role === "note") {
    return (
      <>
        <Rect x={x - 13} y={y - 13} width={26} height={26} rx={4} fill="#fffef8" stroke={color} strokeWidth={4} />
        <SvgText x={x + 18} y={y + 7} fill={color} fontSize={20} fontWeight="900">Note</SvgText>
      </>
    );
  }
  return (
    <>
      <Circle cx={x} cy={y} r={10} fill="#fffef8" stroke={color} strokeWidth={4} />
      <SvgText x={x + 14} y={y + 6} fill={color} fontSize={18} fontWeight="900">
        {shortSurveyLabel(point.role)}
      </SvgText>
    </>
  );
}

function ObstacleSymbol({ color, obstacle }: { color: string; obstacle: ObstacleZone }): React.JSX.Element {
  const center = centroid(obstacle.polygon);
  const x = center.x;
  const y = -center.y;
  if (obstacle.kind === "road") {
    return (
      <>
        <Line x1={x - 28} y1={y} x2={x + 28} y2={y} stroke="#fffef8" strokeWidth={14} />
        <Line x1={x - 28} y1={y} x2={x + 28} y2={y} stroke={color} strokeWidth={5} strokeDasharray="10 7" />
      </>
    );
  }
  if (obstacle.kind === "ditch" || obstacle.kind === "canal") {
    return <Path d={`M ${x - 28} ${y + 8} C ${x - 10} ${y - 14}, ${x + 10} ${y + 26}, ${x + 28} ${y - 2}`} fill="none" stroke={color} strokeWidth={6} />;
  }
  if (obstacle.kind === "fence") {
    return (
      <>
        <Line x1={x - 28} y1={y} x2={x + 28} y2={y} stroke={color} strokeWidth={4} strokeDasharray="5 5" />
        {[-20, 0, 20].map((offset) => <Line key={offset} x1={x + offset} y1={y - 14} x2={x + offset} y2={y + 14} stroke={color} strokeWidth={4} />)}
      </>
    );
  }
  if (obstacle.kind === "tree") {
    return (
      <>
        <Circle cx={x} cy={y - 8} r={16} fill="#fffef8" stroke={color} strokeWidth={5} />
        <Line x1={x} y1={y + 8} x2={x} y2={y + 26} stroke={color} strokeWidth={5} />
      </>
    );
  }
  if (obstacle.kind === "building") {
    return <Rect x={x - 18} y={y - 18} width={36} height={36} fill="#fffef8" stroke={color} strokeWidth={5} />;
  }
  return (
    <>
      <Path d={`M ${x} ${y - 24} L ${x + 24} ${y + 20} L ${x - 24} ${y + 20} Z`} fill="#fffef8" stroke={color} strokeWidth={5} />
      <Line x1={x} y1={y - 8} x2={x} y2={y + 8} stroke={color} strokeWidth={5} />
      <Circle cx={x} cy={y + 15} r={3} fill={color} />
    </>
  );
}

function MapFeatureSymbol({
  feature,
  onSelect,
  palette,
  selected,
}: {
  feature: ProjectMapFeature;
  onSelect: () => void;
  palette: MapPalette;
  selected: boolean;
}): React.JSX.Element {
  const color = colorForMapFeature(feature.kind, palette);
  const strokeWidth = selected ? 7 : 4;
  if (feature.geometry.type === "LineString") {
    const vertices = feature.geometry.vertices;
    if (vertices.length < 2) return <></>;
    const path = `M ${vertices.map((vertex) => `${vertex.x} ${-vertex.y}`).join(" L ")}`;
    const mid = vertices[Math.floor(vertices.length / 2)];
    return (
      <>
        <Path
          d={path}
          fill="none"
          stroke={color}
          strokeDasharray={dashForMapFeature(feature.kind)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          {...svgElementInteractionProps(onSelect)}
        />
        <SvgText x={mid.x + 12} y={-mid.y - 10} fill={color} fontSize={18} fontWeight="900">
          {feature.name}
        </SvgText>
      </>
    );
  }
  if (feature.geometry.type === "Polygon") {
    const vertices = feature.geometry.vertices;
    if (vertices.length < 3) return <></>;
    const path = ringsToSvgPath([[vertices]]);
    const mid = centroid(vertices);
    return (
      <>
        <Path
          d={path}
          fill={color}
          opacity={selected ? 0.24 : 0.14}
          stroke={color}
          strokeDasharray={dashForMapFeature(feature.kind)}
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          {...svgElementInteractionProps(onSelect)}
        />
        <SvgText x={mid.x + 12} y={-mid.y - 10} fill={color} fontSize={18} fontWeight="900">
          {feature.name}
        </SvgText>
      </>
    );
  }
  if (feature.geometry.type === "Circle") {
    const point = feature.geometry.center;
    const y = -point.y;
    return (
      <>
        <Circle
          cx={point.x}
          cy={y}
          fill={color}
          opacity={selected ? 0.2 : 0.12}
          r={feature.geometry.radiusMeters}
          stroke={color}
          strokeDasharray={dashForMapFeature(feature.kind)}
          strokeWidth={strokeWidth}
          {...svgElementInteractionProps(onSelect)}
        />
        <Circle cx={point.x} cy={y} fill="#fffef8" r={selected ? 10 : 7} stroke={color} strokeWidth={4} />
        <SvgText x={point.x + feature.geometry.radiusMeters + 10} y={y + 6} fill={color} fontSize={18} fontWeight="900">
          {feature.name}
        </SvgText>
      </>
    );
  }
  const point = feature.geometry.point;
  const y = -point.y;
  return (
    <>
      <Circle
        cx={point.x}
        cy={y}
        fill={selected ? color : "#fffef8"}
        r={selected ? 13 : 10}
        stroke={color}
        strokeWidth={4}
        {...svgElementInteractionProps(onSelect)}
      />
      <SvgText x={point.x + 15} y={y + 6} fill={color} fontSize={18} fontWeight="900">
        {shortMapFeatureLabel(feature.kind)}
      </SvgText>
    </>
  );
}

function shortSurveyLabel(role: SurveyPoint["role"]): string {
  switch (role) {
    case "pivot_center":
      return "P";
    case "water_source":
      return "W";
    case "power_source":
      return "E";
    case "boundary":
      return "B";
    case "obstacle":
      return "O";
    case "control":
      return "C";
    case "note":
      return "N";
  }
}

function centroid(vertices: XY[]): XY {
  const sum = vertices.reduce((accumulator, vertex) => ({ x: accumulator.x + vertex.x, y: accumulator.y + vertex.y }), { x: 0, y: 0 });
  return { x: sum.x / Math.max(1, vertices.length), y: sum.y / Math.max(1, vertices.length) };
}

function DraftVertices({ vertices, color }: { vertices: XY[]; color: string }): React.JSX.Element {
  if (vertices.length === 0) return <></>;
  const path = vertices.length >= 2 ? `M ${vertices.map((vertex) => `${vertex.x} ${-vertex.y}`).join(" L ")}` : "";
  return (
    <>
      {path ? <Path d={path} fill="none" stroke={color} strokeDasharray="10 8" strokeWidth={5} /> : null}
      {vertices.map((vertex, index) => (
        <React.Fragment key={`${vertex.x}-${vertex.y}-${index}`}>
          <Circle cx={vertex.x} cy={-vertex.y} r={10} fill="#ffffff" stroke={color} strokeWidth={5} />
          <SvgText x={vertex.x + 12} y={-vertex.y - 10} fill={color} fontSize={22} fontWeight="900">
            {index + 1}
          </SvgText>
        </React.Fragment>
      ))}
    </>
  );
}

function CatalogHomeOverlay({
  minX,
  maxX,
  minY,
  maxY,
  palette,
}: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  palette: MapPalette;
}): React.JSX.Element {
  const labelX = minX + (maxX - minX) * 0.08;
  const labelY = minY + (maxY - minY) * 0.14;
  return (
    <>
      <Path
        d="M -166 -66 L -150 -70 L -136 -63 L -124 -50 L -118 -34 L -106 -24 L -96 -18 L -82 -25 L -77 -39 L -66 -47 L -55 -54 L -69 -60 L -88 -57 L -104 -60 L -123 -64 L -144 -61 Z"
        fill={palette.allowed}
        opacity={0.16}
        stroke={palette.fieldStroke}
        strokeOpacity={0.42}
        strokeWidth={1.8}
      />
      <Path
        d="M -142 -30 L -128 -29 L -114 -23 L -103 -18 L -92 -17 L -88 -22 L -97 -28 L -112 -32 L -129 -34 Z"
        fill={palette.endGun}
        opacity={0.16}
        stroke={palette.fieldStroke}
        strokeOpacity={0.28}
        strokeWidth={1.4}
      />
      <SvgText x={labelX} y={labelY} fill={palette.fieldStroke} fontSize={5.6} fontWeight="700">
        North America project catalog
      </SvgText>
    </>
  );
}

function EditableRing({
  color,
  layerLabel,
  onSelect,
  selected,
  vertices,
}: {
  color: string;
  layerLabel: string;
  onSelect?: (vertexIndex: number) => void;
  selected: number | null;
  vertices: XY[];
}): React.JSX.Element {
  return (
    <>
      {vertices.map((vertex, index) => (
        <Circle
          key={`${vertex.x}-${vertex.y}-${index}`}
          accessibilityLabel={`${layerLabel} vertex ${index + 1}`}
          cx={vertex.x}
          cy={-vertex.y}
          fill={selected === index ? color : "#fffef8"}
          r={selected === index ? 11 : 7}
          stroke={color}
          strokeWidth={4}
          {...(onSelect ? svgElementInteractionProps(() => onSelect(index)) : {})}
        />
      ))}
    </>
  );
}

function svgElementInteractionProps(onActivate: () => void): object {
  if (Platform.OS === "web") {
    return {
      onClick: (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        onActivate();
      },
    };
  }
  return { onPress: onActivate };
}

function SnapMarker({ point, color, label }: { point: XY; color: string; label: string }): React.JSX.Element {
  return (
    <>
      <Circle cx={point.x} cy={-point.y} r={16} fill="none" stroke={color} strokeDasharray="6 5" strokeWidth={4} />
      <SvgText x={point.x + 18} y={-point.y - 14} fill={color} fontSize={20} fontWeight="900">
        Snap {label}
      </SvgText>
    </>
  );
}

function WorkflowSegmentedControl({ mode, onChange }: { mode: MappingWorkflowMode; onChange: (mode: MappingWorkflowMode) => void }): React.JSX.Element {
  return (
    <View accessibilityLabel="Mapping workflow mode" style={styles.workflowSegment}>
      {(["design", "layout"] as const).map((option) => {
        const active = mode === option;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option}
            onPress={() => onChange(option)}
            style={[styles.workflowSegmentButton, active && styles.workflowSegmentButtonActive]}
            testID={`workflow-${option}-mode`}
          >
            <Text style={[styles.workflowSegmentText, active && styles.workflowSegmentTextActive]}>{workflowModeLabel(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function workflowModeLabel(mode: MappingWorkflowMode): string {
  return mode === "design" ? "Design" : "Layout";
}

function ToolButton({ active, disabled = false, icon, label, onPress }: { active: boolean; disabled?: boolean; icon: React.ReactNode; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.toolButton, active && styles.toolButtonActive, disabled && styles.toolButtonDisabled]}>
      {icon}
      <Text style={[styles.toolLabel, active && styles.toolLabelActive, disabled && styles.toolLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function IconControl({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconControl}>
      {icon}
    </Pressable>
  );
}

function LayerButton({ active, disabled = false, label, layer, onPress }: { active: boolean; disabled?: boolean; label: string; layer: DrawingLayerType; onPress: (layer: DrawingLayerType) => void }): React.JSX.Element {
  return (
    <Pressable disabled={disabled} onPress={() => onPress(layer)} style={[styles.layerButton, active && styles.layerButtonActive, disabled && styles.layerButtonDisabled]}>
      <Text style={[styles.layerLabel, active && styles.layerLabelActive, disabled && styles.layerLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function FeatureKindButton({ active, disabled = false, label, onPress }: { active: boolean; disabled?: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.layerButton, active && styles.layerButtonActive, disabled && styles.layerButtonDisabled]}>
      {label === "Power line" || label === "Pole" ? <UtilityPole size={15} color={active ? "#ffffff" : "#314339"} /> : null}
      {label === "Fence" ? <Fence size={15} color={active ? "#ffffff" : "#314339"} /> : null}
      <Text style={[styles.layerLabel, active && styles.layerLabelActive, disabled && styles.layerLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function colorForMapFeature(kind: ProjectMapFeatureKind, palette: MapPalette): string {
  if (kind === "power_line" || kind === "power_pole") return palette.power;
  if (kind === "underground_wire") return palette.power;
  if (kind === "underground_pipeline" || kind === "pump_location" || kind === "well_location") return palette.water;
  if (kind === "planning_boundary" || kind === "machine_zone" || kind === "measurement_line") return palette.fieldStroke;
  if (kind === "tree") return palette.survey;
  return palette.utility;
}

function dashForMapFeature(kind: ProjectMapFeatureKind): string | undefined {
  if (kind === "underground_pipeline" || kind === "underground_wire") return "12 8";
  if (kind === "planning_boundary" || kind === "machine_zone") return "18 8";
  if (kind === "measurement_line") return "4 6";
  if (kind === "fence") return "5 5";
  if (kind === "ditch" || kind === "canal") return "14 7 4 7";
  return undefined;
}

function shortMapFeatureLabel(kind: ProjectMapFeatureKind): string {
  switch (kind) {
    case "pump_location":
      return "Pump";
    case "well_location":
      return "Well";
    case "power_pole":
      return "Pole";
    case "tree":
      return "Tree";
    case "planning_boundary":
      return "Plan";
    case "machine_zone":
      return "Zone";
    case "measurement_line":
      return "Measure";
    case "end_gun_mark":
      return "EG";
    default:
      return kind.replaceAll("_", " ");
  }
}

function paletteForMapStyle(style: MapStyle): {
  background: string;
  grid: string;
  outside: string;
  endGun: string;
  allowed: string;
  fieldStroke: string;
  obstacle: string;
  obstacleStroke: string;
  pivot: string;
  water: string;
  power: string;
  tower: string;
  markerFill: string;
  draft: string;
  snap: string;
  survey: string;
  utility: string;
} {
  if (style === "high_contrast") {
    return {
      background: "#f9f9f2",
      grid: "#a5a99f",
      outside: "#b84b2f",
      endGun: "#007d86",
      allowed: "#006bb0",
      fieldStroke: "#0b160f",
      obstacle: "#b00020",
      obstacleStroke: "#3b0008",
      pivot: "#000000",
      water: "#004e8a",
      power: "#7a4a00",
      tower: "#1a1f1c",
      markerFill: "#ffffff",
      draft: "#8b1e18",
      snap: "#005f52",
      survey: "#5f2e00",
      utility: "#4d276f",
    };
  }

  if (style === "imagery_package") {
    return {
      background: "#dfe6d0",
      grid: "#b8c0ad",
      outside: "#d77b46",
      endGun: "#4ab4bd",
      allowed: "#458fc4",
      fieldStroke: "#203526",
      obstacle: "#bb4b42",
      obstacleStroke: "#70271f",
      pivot: "#101722",
      water: "#006a9f",
      power: "#a36500",
      tower: "#4f5a50",
      markerFill: "#fffef8",
      draft: "#7b1f5a",
      snap: "#005f52",
      survey: "#6b3e00",
      utility: "#673f8f",
    };
  }

  if (style === "topographic") {
    return {
      background: "#f6f2df",
      grid: "#d0c390",
      outside: "#db844d",
      endGun: "#52aeb8",
      allowed: "#5e9dcc",
      fieldStroke: "#2b3c24",
      obstacle: "#c4513f",
      obstacleStroke: "#71301e",
      pivot: "#151c2a",
      water: "#006a9f",
      power: "#946500",
      tower: "#5b624e",
      markerFill: "#fffef8",
      draft: "#7b1f5a",
      snap: "#005f52",
      survey: "#744200",
      utility: "#5b3b87",
    };
  }

  return {
    background: "#f4f2e8",
    grid: "#d7d2bf",
    outside: "#e68b58",
    endGun: "#63c7cf",
    allowed: "#6cb6df",
    fieldStroke: "#253f2f",
    obstacle: "#c64f43",
    obstacleStroke: "#70271f",
    pivot: "#151c2a",
    water: "#006a9f",
    power: "#c78500",
    tower: "#54645a",
    markerFill: "#fffdf5",
    draft: "#7b1f5a",
    snap: "#005f52",
    survey: "#6f3f00",
    utility: "#62418f",
  };
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  shellCompact: {
    flexBasis: "100%",
    minHeight: 0,
    width: "100%",
  },
  headerRow: {
    alignItems: "center",
    borderBottomColor: "#dde3da",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: "#15241b",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "#607067",
    fontSize: 12,
    fontWeight: "600",
  },
  svg: {
    flex: 1,
    width: "100%",
  },
  svgCompact: {
    flex: 1,
  },
  mapSurface: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  mapClickLayer: {
    backgroundColor: "transparent",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  mapClickLayerCompact: {
    bottom: 0,
  },
  bottomOverlaySlot: {
    bottom: 8,
    left: 12,
    maxWidth: "100%",
    position: "absolute",
    right: 12,
    zIndex: 3,
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    gap: 8,
    maxWidth: "100%",
  },
  modeRowCompact: {
    width: "100%",
  },
  workflowSegment: {
    alignItems: "center",
    backgroundColor: "#edf3eb",
    borderColor: "#c9d6c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
  },
  workflowSegmentButton: {
    borderRadius: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  workflowSegmentButtonActive: {
    backgroundColor: "#254234",
  },
  workflowSegmentText: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  workflowSegmentTextActive: {
    color: "#ffffff",
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#eef3ea",
    borderColor: "#c7d4c5",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    flexShrink: 1,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  toolButtonDisabled: {
    opacity: 0.45,
  },
  toolLabel: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  toolLabelActive: {
    color: "#ffffff",
  },
  toolLabelDisabled: {
    color: "#5f6f64",
  },
  zoomControls: {
    gap: 8,
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 2,
  },
  panControls: {
    alignItems: "center",
    gap: 6,
    position: "absolute",
    right: 12,
    top: 174,
    zIndex: 2,
  },
  panMiddle: {
    flexDirection: "row",
    gap: 44,
  },
  draftHud: {
    alignItems: "center",
    backgroundColor: "#fffef8",
    borderColor: "#b9c5b6",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 84,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    left: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
    right: 12,
    zIndex: 2,
  },
  imageryBadge: {
    backgroundColor: "rgba(255, 254, 248, 0.92)",
    borderColor: "#b9c5b6",
    borderRadius: 8,
    borderWidth: 1,
    left: 12,
    maxWidth: 560,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 2,
  },
  referenceOverlayBadge: {
    backgroundColor: "rgba(255, 250, 235, 0.95)",
    borderColor: "#dfc77f",
    borderRadius: 8,
    borderWidth: 1,
    left: 12,
    maxWidth: 560,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    right: 12,
    top: 74,
    zIndex: 2,
  },
  imageryBadgeText: {
    color: "#26392f",
    fontSize: 12,
    fontWeight: "900",
  },
  imageryBadgeSubtext: {
    color: "#405448",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  draftHudText: {
    color: "#26392f",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  clearDraftButton: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  clearDraftText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  commitDraftButton: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  commitDraftText: {
    color: "#ffffff",
  },
  disabledDraftButton: {
    opacity: 0.45,
  },
  iconControl: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#aebbae",
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  layerRow: {
    borderTopColor: "#dde3da",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  layerButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  layerButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  layerButtonDisabled: {
    opacity: 0.45,
  },
  layerLabel: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  layerLabelActive: {
    color: "#ffffff",
  },
  layerLabelDisabled: {
    color: "#5f6f64",
  },
  legend: {
    borderTopColor: "#dde3da",
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 12,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  swatch: {
    borderColor: "#2f3f35",
    borderRadius: 2,
    borderWidth: 1,
    height: 14,
    width: 14,
  },
  legendLabel: {
    color: "#4e5e55",
    fontSize: 12,
    fontWeight: "700",
  },
});
