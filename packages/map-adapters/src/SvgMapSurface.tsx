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
import React, { useMemo, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Image as SvgImage, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { boundsForGeometry, planOnlineImageryTiles, ringsToSvgPath, supportsSvgOnlineImageryOverlay } from "@cplayout/geometry";
import {
  createDrawingMapState,
  createInitialViewport,
  DrawingLayerType,
  DrawingMapAction,
  DrawingMapState,
  reduceDrawingMapState,
  screenPointToWorld,
  snapPointToGeometry,
  viewportToSvgViewBox,
  visibleHeightMeters,
  visibleWidthMeters,
} from "@cplayout/geometry";
import type { InfrastructurePoint, MapStyle, ObstacleZone, ProjectMapFeature, ProjectMapFeatureKind, SurveyPoint } from "@cplayout/core";
import { XY } from "@cplayout/core";
import { MapLibreImageryPreview } from "./MapLibreImageryPreview";
import type { MapSurfaceProps } from "./types";

type SelectedVertex =
  | { layer: "field_boundary"; vertexIndex: number }
  | { layer: "obstacle"; obstacleId: string; vertexIndex: number };

type UtilityFeatureGeometry = ProjectMapFeature["geometry"]["type"];
type MapPalette = ReturnType<typeof paletteForMapStyle>;

const UTILITY_FEATURE_OPTIONS: { kind: ProjectMapFeatureKind; label: string; geometry: UtilityFeatureGeometry }[] = [
  { kind: "underground_pipeline", label: "Pipe", geometry: "LineString" },
  { kind: "power_line", label: "Power line", geometry: "LineString" },
  { kind: "fence", label: "Fence", geometry: "LineString" },
  { kind: "access_lane", label: "Lane", geometry: "LineString" },
  { kind: "ditch", label: "Ditch", geometry: "LineString" },
  { kind: "pump_location", label: "Pump", geometry: "Point" },
  { kind: "power_pole", label: "Pole", geometry: "Point" },
  { kind: "tree", label: "Tree", geometry: "Point" },
  { kind: "end_gun_mark", label: "End gun", geometry: "Point" },
];

export function SvgMapSurface({
  project,
  result,
  settings,
  selectedMapFeatureId,
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
  const mapFeatures = project.mapFeatures ?? [];
  const allRings = [
    project.fieldBoundary,
    ...result.allowedCoverage.flat(),
    ...result.outsideFieldCoverage.flat(),
    ...result.endGunCoverage.flat(),
    ...project.obstacles.map((obstacle) => obstacle.polygon),
    ...mapFeatures.flatMap((feature) => feature.geometry.type === "LineString" ? [feature.geometry.vertices] : []),
  ];
  const bounds = boundsForGeometry(allRings);
  const margin = 80;
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
  const palette = paletteForMapStyle(settings.mapStyle);
  const mapFeatureOption = featureOptionForKind(mapFeatureKind);
  const activeSelectedMapFeatureId = selectedMapFeatureId ?? localSelectedMapFeatureId;
  const viewWidth = visibleWidthMeters(mapState.viewport);
  const viewHeight = visibleHeightMeters(mapState.viewport);
  const minX = mapState.viewport.center.x - viewWidth / 2;
  const maxX = mapState.viewport.center.x + viewWidth / 2;
  const minY = -mapState.viewport.center.y - viewHeight / 2;
  const maxY = -mapState.viewport.center.y + viewHeight / 2;
  const fieldPath = ringsToSvgPath([[project.fieldBoundary]]);
  const imageryPlan = useMemo(
    () => settings.onlineImagery.enabled
      ? planOnlineImageryTiles({
        viewport: mapState.viewport,
        projectCrs: project.projectCrs,
        providerId: settings.onlineImagery.providerId,
        customSource: settings.onlineImagery.customSource,
        maxTiles: settings.onlineImagery.maxTilesPerView,
      })
      : null,
    [
      mapState.viewport,
      project.projectCrs,
      settings.onlineImagery.enabled,
      settings.onlineImagery.customSource,
      settings.onlineImagery.maxTilesPerView,
      settings.onlineImagery.providerId,
    ],
  );
  const shouldShowMapLibrePreview = settings.onlineImagery.enabled && !supportsSvgOnlineImageryOverlay(project.projectCrs);

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
    ? { onClick: addDraftVertexFromWebClick }
    : { onPress: addDraftVertexFromPress };

  function dispatch(action: DrawingMapAction): void {
    setMapState((current) => reduceDrawingMapState(current, action));
  }

  function addDraftVertexFromPress(event: GestureResponderEvent): void {
    addDraftVertexAtScreenPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
  }

  function addDraftVertexFromWebClick(event: { nativeEvent?: { offsetX?: number; offsetY?: number }; currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } }; clientX?: number; clientY?: number }): void {
    const bounds = event.currentTarget?.getBoundingClientRect?.();
    const xPixels = event.nativeEvent?.offsetX ?? (bounds ? (event.clientX ?? 0) - bounds.left : 0);
    const yPixels = event.nativeEvent?.offsetY ?? (bounds ? (event.clientY ?? 0) - bounds.top : 0);
    addDraftVertexAtScreenPoint(xPixels, yPixels);
  }

  function addDraftVertexAtScreenPoint(xPixels: number, yPixels: number): void {
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
    dispatch({ type: "add_draft_vertex", vertex });
  }

  function addDraftVertexAtViewCenter(): void {
    const vertex = snapWorldPoint(mapState.viewport.center);
    if (mapState.mode === "capture_point") {
      captureSurveyPoint(vertex);
      return;
    }
    if (!canAddDraftVertex(mapState.mode)) return;
    dispatch({ type: "add_draft_vertex", vertex });
  }

  function commitDraft(): void {
    if (mapState.draftVertices.length < 3) return;
    if (mapState.mode === "draw_boundary") {
      onCommitBoundaryDraft?.(mapState.draftVertices);
    } else if (mapState.mode === "mark_obstacle") {
      onCommitObstacleDraft?.(mapState.draftVertices, obstacleKindForLayer(mapState.activeLayer));
    } else {
      return;
    }
    dispatch({ type: "clear_draft" });
  }

  function setToolMode(mode: DrawingMapState["mode"], layer?: DrawingLayerType): void {
    const nextLayer = setToolLayerForMode(mode, layer);
    if (nextLayer) dispatch({ type: "set_active_layer", activeLayer: nextLayer });
    dispatch({ type: "set_mode", mode });
    if (mode !== "edit_vertices") setSelectedVertex(null);
  }

  function selectVertex(nextSelectedVertex: SelectedVertex): void {
    setSelectedVertex(nextSelectedVertex);
    dispatch({ type: "set_mode", mode: "edit_vertices" });
  }

  function deleteSelectedVertex(): void {
    if (!selectedVertex) return;
    if (selectedVertex.layer === "field_boundary") {
      onDeleteBoundaryVertex?.(selectedVertex.vertexIndex);
    } else {
      onDeleteObstacleVertex?.(selectedVertex.obstacleId, selectedVertex.vertexIndex);
    }
    setSelectedVertex(null);
  }

  function selectFirstBoundaryVertex(): void {
    if (project.fieldBoundary.length === 0) return;
    selectVertex({ layer: "field_boundary", vertexIndex: 0 });
  }

  function nudgeSelectedVertex(delta: XY): void {
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
          ...mapFeatures.flatMap((feature) => feature.geometry.type === "Point" ? [feature.geometry.point] : []),
        ],
        rings: [
          project.fieldBoundary,
          ...project.obstacles.map((obstacle) => obstacle.polygon),
          ...mapFeatures.flatMap((feature) => feature.geometry.type === "LineString" ? [feature.geometry.vertices] : []),
          mapState.draftVertices,
        ],
      },
      settings.drawing,
    );
    setLastSnap(snap ? { point: snap.point, kind: snap.kind } : null);
    return snap?.point ?? point;
  }

  function captureSurveyPoint(point: XY): void {
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
    onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, 1),
      kind: mapFeatureKind,
      geometry: { type: "Point", point },
      confidence: settings.onlineImagery.enabled ? "imagery_digitized" : "user_estimated",
      notes: settings.onlineImagery.enabled ? "Captured from online imagery preview; verify by field survey." : undefined,
    });
  }

  function commitMapFeatureLine(): void {
    if (mapState.draftVertices.length < 2 || mapFeatureOption.geometry !== "LineString") return;
    onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, mapState.draftVertices.length),
      kind: mapFeatureKind,
      geometry: { type: "LineString", vertices: mapState.draftVertices },
      confidence: settings.onlineImagery.enabled ? "imagery_digitized" : "user_estimated",
      notes: settings.onlineImagery.enabled ? "Traced from online imagery preview; verify by field survey." : undefined,
    });
    dispatch({ type: "clear_draft" });
  }

  function saveMapFeatureFromHud(): void {
    if (mapFeatureOption.geometry === "Point") {
      commitMapFeaturePoint(snapWorldPoint(mapState.viewport.center));
    } else {
      commitMapFeatureLine();
    }
  }

  function selectMapFeature(featureId: string): void {
    const nextId = activeSelectedMapFeatureId === featureId ? null : featureId;
    setLocalSelectedMapFeatureId(nextId);
    onSelectMapFeature?.(nextId);
    dispatch({ type: "select_feature", featureId: nextId });
  }

  return (
    <View style={styles.shell}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Layout Workspace</Text>
          <Text style={styles.subtitle}>
            {project.projectCrs} · {mapState.mode.replaceAll("_", " ")} · zoom {mapState.viewport.zoomLevel.toFixed(2)}x
          </Text>
        </View>
        <View style={styles.modeRow}>
          <ToolButton active={mapState.mode === "pan"} icon={<Hand size={18} />} label="Pan" onPress={() => setToolMode("pan")} />
          <ToolButton active={mapState.mode === "draw_boundary"} icon={<PencilLine size={18} />} label="Draw" onPress={() => setToolMode("draw_boundary", "field_boundary")} />
          <ToolButton active={mapState.mode === "mark_obstacle"} icon={<Crosshair size={18} />} label="Obstacle" onPress={() => setToolMode("mark_obstacle", "obstacle")} />
          <ToolButton active={mapState.mode === "edit_vertices"} icon={<Crosshair size={18} />} label="Edit" onPress={() => dispatch({ type: "set_mode", mode: "edit_vertices" })} />
          <ToolButton active={mapState.mode === "capture_point"} icon={<Satellite size={18} />} label="Survey" onPress={() => setToolMode("capture_point", "control_point")} />
          <ToolButton active={mapState.mode === "measure"} icon={<Ruler size={18} />} label="Measure" onPress={() => setToolMode("measure")} />
          <ToolButton active={mapState.mode === "place_pivot"} icon={<LocateFixed size={18} />} label="Pivot" onPress={() => setToolMode("place_pivot", "pivot_center")} />
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
          style={styles.svg}
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
            onSelect={(vertexIndex) => selectVertex({ layer: "field_boundary", vertexIndex })}
          />
          {project.obstacles.map((obstacle) => (
            <React.Fragment key={obstacle.id}>
              <ObstacleSymbol obstacle={obstacle} color={palette.obstacleStroke} />
              <EditableRing
                color={palette.obstacleStroke}
                layerLabel={`${obstacle.name} obstacle`}
                selected={selectedVertex?.layer === "obstacle" && selectedVertex.obstacleId === obstacle.id ? selectedVertex.vertexIndex : null}
                vertices={obstacle.polygon}
                onSelect={(vertexIndex) => selectVertex({ layer: "obstacle", obstacleId: obstacle.id, vertexIndex })}
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
        </Svg>

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
        <View style={styles.draftHud}>
          <Text style={styles.draftHudText}>
            {mapState.activeLayer.replaceAll("_", " ")} · {mapState.draftVertices.length} pts{measureText(mapState.draftVertices)}{selectedVertex ? ` · ${selectedVertexText(selectedVertex)}` : ""}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Add draft vertex at view center" onPress={addDraftVertexAtViewCenter} style={styles.clearDraftButton}>
            <Text style={styles.clearDraftText}>{mapState.mode === "capture_point" ? "Capture Center" : "Add Center"}</Text>
          </Pressable>
          {mapState.mode === "edit_vertices" ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Select first boundary vertex" onPress={selectFirstBoundaryVertex} style={styles.clearDraftButton}>
                <Text style={styles.clearDraftText}>First Vertex</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Move selected vertex east" disabled={!selectedVertex} onPress={() => nudgeSelectedVertex({ x: Math.max(1, settings.drawing.panStepMeters / 4), y: 0 })} style={[styles.clearDraftButton, !selectedVertex && styles.disabledDraftButton]}>
                <Text style={styles.clearDraftText}>Nudge E</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Commit draft geometry" disabled={!canCommitDraft(mapState)} onPress={commitDraft} style={[styles.clearDraftButton, canCommitDraft(mapState) && styles.commitDraftButton, !canCommitDraft(mapState) && styles.disabledDraftButton]}>
            <Text style={[styles.clearDraftText, canCommitDraft(mapState) && styles.commitDraftText]}>{mapState.mode === "measure" ? "Measure Only" : "Commit"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Save utility map feature" disabled={!canSaveMapFeature(mapState, mapFeatureOption.geometry)} onPress={saveMapFeatureFromHud} style={[styles.clearDraftButton, canSaveMapFeature(mapState, mapFeatureOption.geometry) && styles.commitDraftButton, !canSaveMapFeature(mapState, mapFeatureOption.geometry) && styles.disabledDraftButton]}>
            <Text style={[styles.clearDraftText, canSaveMapFeature(mapState, mapFeatureOption.geometry) && styles.commitDraftText]}>{mapFeatureOption.geometry === "Point" ? "Save Center Feature" : "Save Feature"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete selected vertex" disabled={!selectedVertex} onPress={deleteSelectedVertex} style={[styles.clearDraftButton, !selectedVertex && styles.disabledDraftButton]}>
            <Text style={styles.clearDraftText}>Delete Vertex</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear draft vertices" onPress={() => dispatch({ type: "clear_draft" })} style={styles.clearDraftButton}>
            <Text style={styles.clearDraftText}>Clear</Text>
          </Pressable>
        </View>
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
      </View>

      <MapLibreImageryPreview
        project={project}
        result={result}
        settings={settings}
        visible={shouldShowMapLibrePreview}
      />

      <View style={styles.layerRow}>
        {UTILITY_FEATURE_OPTIONS.map((option) => (
          <FeatureKindButton
            key={option.kind}
            active={mapFeatureKind === option.kind}
            label={option.label}
            onPress={() => {
              setMapFeatureKind(option.kind);
              setToolMode("measure");
            }}
          />
        ))}
      </View>

      <View style={styles.layerRow}>
        <LayerButton active={mapState.activeLayer === "field_boundary"} label="Boundary" layer="field_boundary" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "obstacle"} label="Obstacle" layer="obstacle" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "road"} label="Road" layer="road" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "ditch"} label="Ditch" layer="ditch" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "fence"} label="Fence" layer="fence" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "exclusion"} label="Exclusion" layer="exclusion" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "pivot_center"} label="Pivot" layer="pivot_center" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "water_source"} label="Water" layer="water_source" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "power_source"} label="Power" layer="power_source" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "control_point"} label="Control" layer="control_point" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "note_point"} label="Note" layer="note_point" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
      </View>

      <View style={styles.legend}>
        <LegendSwatch color="#6cb6df" label="Allowed wet area" />
        <LegendSwatch color="#63c7cf" label="End gun" />
        <LegendSwatch color="#e68b58" label="Outside field" />
        <LegendSwatch color="#c64f43" label="Obstacle/no-spray" />
        <LegendSwatch color={palette.survey} label="Survey/object point" />
        <LegendSwatch color={palette.utility} label="Utility map feature" />
      </View>
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
  return mapState.mode === "measure" && (geometry === "Point" || mapState.draftVertices.length >= 2);
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

function featureOptionForKind(kind: ProjectMapFeatureKind): { kind: ProjectMapFeatureKind; label: string; geometry: UtilityFeatureGeometry } {
  return UTILITY_FEATURE_OPTIONS.find((option) => option.kind === kind) ?? UTILITY_FEATURE_OPTIONS[0];
}

function defaultMapFeatureName(kind: ProjectMapFeatureKind, vertexCount: number): string {
  return `${kind.replaceAll("_", " ")} ${vertexCount > 1 ? "line" : "point"}`;
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

function EditableRing({
  color,
  layerLabel,
  onSelect,
  selected,
  vertices,
}: {
  color: string;
  layerLabel: string;
  onSelect: (vertexIndex: number) => void;
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
          {...svgElementInteractionProps(() => onSelect(index))}
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

function ToolButton({ active, icon, label, onPress }: { active: boolean; icon: React.ReactNode; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.toolButton, active && styles.toolButtonActive]}>
      {icon}
      <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>{label}</Text>
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

function LayerButton({ active, label, layer, onPress }: { active: boolean; label: string; layer: DrawingLayerType; onPress: (layer: DrawingLayerType) => void }): React.JSX.Element {
  return (
    <Pressable onPress={() => onPress(layer)} style={[styles.layerButton, active && styles.layerButtonActive]}>
      <Text style={[styles.layerLabel, active && styles.layerLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function FeatureKindButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.layerButton, active && styles.layerButtonActive]}>
      {label === "Power line" || label === "Pole" ? <UtilityPole size={15} color={active ? "#ffffff" : "#314339"} /> : null}
      {label === "Fence" ? <Fence size={15} color={active ? "#ffffff" : "#314339"} /> : null}
      <Text style={[styles.layerLabel, active && styles.layerLabelActive]}>{label}</Text>
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
  if (kind === "underground_pipeline" || kind === "pump_location") return palette.water;
  if (kind === "tree") return palette.survey;
  return palette.utility;
}

function dashForMapFeature(kind: ProjectMapFeatureKind): string | undefined {
  if (kind === "underground_pipeline") return "12 8";
  if (kind === "fence") return "5 5";
  if (kind === "ditch" || kind === "canal") return "14 7 4 7";
  return undefined;
}

function shortMapFeatureLabel(kind: ProjectMapFeatureKind): string {
  switch (kind) {
    case "pump_location":
      return "Pump";
    case "power_pole":
      return "Pole";
    case "tree":
      return "Tree";
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
    flexBasis: 760,
    flex: 1,
    flexGrow: 3,
    minHeight: 720,
    overflow: "hidden",
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
    height: 640,
    width: "100%",
  },
  mapSurface: {
    minHeight: 640,
    position: "relative",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#eef3ea",
    borderColor: "#c7d4c5",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  toolLabel: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  toolLabelActive: {
    color: "#ffffff",
  },
  zoomControls: {
    gap: 8,
    position: "absolute",
    right: 12,
    top: 12,
  },
  panControls: {
    alignItems: "center",
    bottom: 12,
    gap: 6,
    position: "absolute",
    right: 12,
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
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    left: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
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
    top: 12,
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
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  layerButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  layerLabel: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  layerLabelActive: {
    color: "#ffffff",
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
