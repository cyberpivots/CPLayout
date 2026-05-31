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
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  resolveOnlineImageryProvider,
  type OnlineImageryProvider,
  type ObstacleZone,
  type ProjectMapFeatureKind,
  type XY,
} from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";
import {
  browserMapClickToProjectedIntent,
  confidenceForImagery,
  defaultMapFeatureName,
  type BrowserMapClickIntent,
  type UtilityFeatureGeometry,
} from "./browserMapInteraction";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

const UTILITY_FEATURE_OPTIONS: { kind: ProjectMapFeatureKind; label: string; geometry: UtilityFeatureGeometry }[] = [
  { kind: "underground_pipeline", label: "Pipe", geometry: "LineString" },
  { kind: "power_line", label: "Power", geometry: "LineString" },
  { kind: "fence", label: "Fence", geometry: "LineString" },
  { kind: "access_lane", label: "Lane", geometry: "LineString" },
  { kind: "ditch", label: "Ditch", geometry: "LineString" },
  { kind: "pump_location", label: "Pump", geometry: "Point" },
  { kind: "power_pole", label: "Pole", geometry: "Point" },
  { kind: "tree", label: "Tree", geometry: "Point" },
];

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
    project,
    result,
    settings,
    advisoryRecommendationPreview,
    onAddMapFeature,
    onAddSurveyPoint,
    onCommitBoundaryDraft,
    onCommitObstacleDraft,
    onMappingWorkflowModeChange,
    onMoveInfrastructurePoint,
    onPlacePivot,
    onSelectMapFeature,
  } = props;
  const { width } = useWindowDimensions();
  const compactLayout = width < 760;
  const designMode = settings.mappingWorkflowMode === "design";
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
  const [mapFeatureKind, setMapFeatureKind] = useState<ProjectMapFeatureKind>("underground_pipeline");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [status, setStatus] = useState("Imagery is a live reference. Project edits remain projected XY.");
  const mapFeatureOption = featureOptionForKind(mapFeatureKind);
  const provider = useMemo(() => {
    if (!settings.onlineImagery.enabled) return null;
    try {
      return resolveOnlineImageryProvider(settings.onlineImagery.providerId, settings.onlineImagery.customSource);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [settings.onlineImagery.customSource, settings.onlineImagery.enabled, settings.onlineImagery.providerId]);
  const projectionFrame = useMemo(() => {
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
  }, [project]);
  const overlayState = useMemo(() => {
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
  }, [draftVertices, project, result]);
  const projectionError = projectionFrame.error ?? overlayState.error;
  const activeProvider = provider instanceof Error ? null : provider;
  const providerError = provider instanceof Error ? provider.message : null;
  const providerKey = activeProvider
    ? `${activeProvider.id}:${activeProvider.tileUrlTemplate}:${activeProvider.tileScheme}:${activeProvider.minZoom}:${activeProvider.maxZoom}`
    : "no-live-imagery";
  const interactionRef = useRef<InteractionState>({
    activeLayer,
    featureGeometry: mapFeatureOption.geometry,
    featureKind: mapFeatureKind,
    imageryEnabled: settings.onlineImagery.enabled,
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
      imageryEnabled: settings.onlineImagery.enabled,
      mode,
      projectCrs: project.projectCrs,
      workflowMode: settings.mappingWorkflowMode,
    };
  }, [activeLayer, mapFeatureKind, mapFeatureOption.geometry, mode, project.projectCrs, settings.mappingWorkflowMode, settings.onlineImagery.enabled]);

  useEffect(() => {
    if (designMode) {
      setStatus("Edit Geometry mode: projected XY edits require Commit before they change the project.");
      return;
    }
    clearDraft("Review Layout is inspection only; projected XY geometry callbacks are blocked.");
    setMode("pan");
  }, [designMode]);

  useEffect(() => {
    if (!containerRef.current || projectionError) return undefined;
    setRuntimeError(null);
    const map = new maplibregl.Map({
      attributionControl: false,
      center: projectionFrame.center,
      container: containerRef.current,
      dragRotate: false,
      pitchWithRotate: false,
      style: buildWorkbenchStyle(activeProvider, overlayState.featureCollection),
      zoom: activeProvider ? Math.min(15, activeProvider.maxZoom) : 14,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const fitProject = () => fitBoundsToProject(map, projectionFrame.bounds, activeProvider);
    map.once("load", () => {
      fitProject();
      setTimeout(() => map.resize(), 0);
    });
    map.on("click", (event) => {
      const current = interactionRef.current;
      const selectedFeatureId = mapFeatureIdAtPoint(map, event.point);
      if (selectedFeatureId && (current.mode === "pan" || current.workflowMode === "layout")) {
        callbacksRef.current.onSelectMapFeature?.(selectedFeatureId);
        setStatus(`Selected map feature ${selectedFeatureId}. Project geometry is unchanged.`);
        return;
      }
      const intent = browserMapClickToProjectedIntent({
        ...current,
        lonLat: { longitude: event.lngLat.lng, latitude: event.lngLat.lat },
      });
      applyClickIntent(intent);
    });
    map.on("error", (event) => {
      const message = event.error?.message;
      if (message) setRuntimeError(message);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [activeProvider, providerKey, project.id, projectionError, projectionFrame.bounds, projectionFrame.center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || projectionError) return;
    const updateSource = () => syncLayoutSource(map, overlayState.featureCollection);
    if (map.isStyleLoaded()) updateSource();
    else map.once("load", updateSource);
  }, [projectionError, overlayState.featureCollection]);

  if (projectionError) {
    return (
      <View style={styles.fallbackShell}>
        <Text style={styles.fallbackText}>Browser imagery is unavailable for this project view: {projectionError}</Text>
        <SvgMapSurface {...props} />
      </View>
    );
  }

  function setTool(nextMode: DrawingMode, nextLayer?: DrawingLayerType): void {
    if (!designMode && nextMode !== "pan") return;
    setMode(nextMode);
    if (nextLayer) setActiveLayer(nextLayer);
    if (nextMode !== "draw_boundary" && nextMode !== "mark_obstacle" && nextMode !== "measure") {
      clearDraft(`${toolLabel(nextMode)} mode selected. No draft vertices are pending.`);
    }
  }

  function applyClickIntent(intent: BrowserMapClickIntent): void {
    if (intent.type === "none") {
      if (intent.reason === "review_layout_no_mutation") setStatus("Review Layout is read-only; switch to Edit Geometry before changing project geometry.");
      return;
    }
    if (intent.type === "draft_vertex") {
      setDraftVertices((current) => [...current, intent.vertex]);
      setStatus(`Added projected XY draft vertex ${intent.vertex.x.toFixed(2)}, ${intent.vertex.y.toFixed(2)}.`);
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
    setStatus(`Added ${intent.feature.kind.replaceAll("_", " ")} point in projected XY.`);
  }

  function commitDraft(): void {
    if (!designMode || draftVertices.length < 3) return;
    if (mode === "draw_boundary") {
      callbacksRef.current.onCommitBoundaryDraft?.(draftVertices);
      setStatus(`Committed field boundary with ${draftVertices.length} projected XY vertices.`);
    } else if (mode === "mark_obstacle") {
      callbacksRef.current.onCommitObstacleDraft?.(draftVertices, obstacleKindForLayer(activeLayer), confidenceForImagery(settings.onlineImagery.enabled));
      setStatus(`Committed ${obstacleKindForLayer(activeLayer)} obstacle with ${draftVertices.length} projected XY vertices.`);
    }
    clearDraft("Committed draft geometry into the projected XY project state.");
  }

  function saveMapFeatureLine(): void {
    if (!designMode || mode !== "measure" || mapFeatureOption.geometry !== "LineString" || draftVertices.length < 2) return;
    callbacksRef.current.onAddMapFeature?.({
      name: defaultMapFeatureName(mapFeatureKind, draftVertices.length),
      kind: mapFeatureKind,
      geometry: { type: "LineString", vertices: draftVertices },
      confidence: confidenceForImagery(settings.onlineImagery.enabled),
      notes: settings.onlineImagery.enabled ? "Traced from browser imagery; verify with field survey." : undefined,
    });
    setStatus(`Saved ${mapFeatureKind.replaceAll("_", " ")} line with ${draftVertices.length} projected XY vertices.`);
    clearDraft(`Saved ${mapFeatureKind.replaceAll("_", " ")} line as a projected XY map feature.`);
  }

  function clearDraft(nextStatus = "Draft cleared. Committed projected XY geometry is unchanged."): void {
    setDraftVertices([]);
    setStatus(nextStatus);
  }

  const canCommitDraft = designMode && draftVertices.length >= 3 && (mode === "draw_boundary" || mode === "mark_obstacle");
  const canSaveFeature = designMode && mode === "measure" && mapFeatureOption.geometry === "LineString" && draftVertices.length >= 2;

  return (
    <View style={styles.shell} testID="browser-map-workbench">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Imagery Workbench</Text>
          <Text style={styles.subtitle}>{project.projectCrs} canonical geometry · {activeProvider?.name ?? "offline overlay"} </Text>
        </View>
        <View style={styles.segmented}>
          <ModeSwitch
            active={settings.mappingWorkflowMode === "design"}
            label="Edit Geometry"
            onPress={() => onMappingWorkflowModeChange?.("design")}
            testID="browser-workflow-design"
          />
          <ModeSwitch
            active={settings.mappingWorkflowMode === "layout"}
            label="Review Layout"
            onPress={() => onMappingWorkflowModeChange?.("layout")}
            testID="browser-workflow-layout"
          />
        </View>
      </View>

      <View style={[styles.mapFrame, compactLayout && styles.mapFrameCompact]}>
        {React.createElement("div", {
          "aria-label": "CPLayout MapLibre imagery workbench",
          ref: containerRef,
          style: mapContainerStyle,
        })}
        <View style={[styles.toolHud, compactLayout && styles.toolHudCompact]}>
          <ToolButton active={mode === "pan"} icon={<Hand size={17} color={mode === "pan" ? "#ffffff" : "#173428"} />} label="Pan" onPress={() => setTool("pan")} testID="browser-tool-pan" />
          {designMode ? (
            <>
              <ToolButton active={mode === "draw_boundary"} icon={<Fence size={17} color={mode === "draw_boundary" ? "#ffffff" : "#173428"} />} label="Boundary" onPress={() => setTool("draw_boundary", "field_boundary")} testID="browser-tool-boundary" />
              <ToolButton active={mode === "mark_obstacle"} icon={<Layers size={17} color={mode === "mark_obstacle" ? "#ffffff" : "#173428"} />} label="Obstacle" onPress={() => setTool("mark_obstacle", "obstacle")} testID="browser-tool-obstacle" />
              <ToolButton active={mode === "place_pivot"} icon={<LocateFixed size={17} color={mode === "place_pivot" ? "#ffffff" : "#173428"} />} label="Pivot" onPress={() => setTool("place_pivot", "pivot_center")} testID="browser-tool-pivot" />
              <ToolButton active={mode === "capture_point"} icon={<Crosshair size={17} color={mode === "capture_point" ? "#ffffff" : "#173428"} />} label="Survey" onPress={() => setTool("capture_point", "control_point")} testID="browser-tool-survey" />
              <ToolButton active={mode === "measure"} icon={<UtilityPole size={17} color={mode === "measure" ? "#ffffff" : "#173428"} />} label="Utility" onPress={() => setTool("measure")} testID="browser-tool-utility" />
            </>
          ) : null}
        </View>

        {designMode && mode === "mark_obstacle" ? (
          <View style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["obstacle", "road", "ditch", "fence", "tree", "building", "canal", "exclusion"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {designMode && mode === "place_pivot" ? (
          <View style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["pivot_center", "water_source", "power_source"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {designMode && mode === "capture_point" ? (
          <View style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
            {(["control_point", "field_boundary", "obstacle", "note_point"] as DrawingLayerType[]).map((layer) => (
              <Chip key={layer} active={activeLayer === layer} label={layer.replaceAll("_", " ")} onPress={() => setActiveLayer(layer)} />
            ))}
          </View>
        ) : null}

        {designMode && mode === "measure" ? (
          <View style={[styles.optionHud, compactLayout && styles.optionHudCompact]}>
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

        <View style={[styles.statusHud, compactLayout && styles.statusHudCompact]} testID="browser-map-status-hud">
          <View style={styles.statusTextGroup}>
            <Text style={styles.statusText}>{status}</Text>
            <Text style={styles.statusMeta}>
              {mode.replaceAll("_", " ")} · {draftVertices.length} draft pts{advisoryRecommendationPreview ? " · advisory preview visible" : ""}
            </Text>
          </View>
          <View style={styles.hudActions}>
            <HudButton disabled={!canCommitDraft} icon={<Check size={15} color={canCommitDraft ? "#ffffff" : "#718077"} />} label="Commit" onPress={commitDraft} primary={canCommitDraft} testID="browser-action-commit" />
            <HudButton disabled={!canSaveFeature} icon={<Check size={15} color={canSaveFeature ? "#ffffff" : "#718077"} />} label="Save Feature" onPress={saveMapFeatureLine} primary={canSaveFeature} testID="browser-action-save-feature" />
            <HudButton disabled={draftVertices.length === 0} icon={<X size={15} color={draftVertices.length > 0 ? "#173428" : "#718077"} />} label="Clear" onPress={() => clearDraft()} testID="browser-action-clear" />
          </View>
        </View>

        {!designMode ? (
          <View style={[styles.reviewHud, compactLayout && styles.reviewHudCompact]} testID="browser-map-review-hud">
            <MapPinned size={17} color="#173428" />
            <Text style={styles.reviewHudText}>Review Layout: map gestures and inspection only. Geometry callbacks are blocked.</Text>
          </View>
        ) : null}

        <View style={[styles.attributionHud, compactLayout && styles.attributionHudCompact]} testID="browser-map-attribution-hud">
          <Satellite size={13} color="#173428" />
          <Text style={styles.attributionText}>
            {providerError ? providerError : `${activeProvider?.attribution ?? "No live imagery source enabled"} · ${activeProvider?.licenseText ?? "Offline overlay only"}`}
          </Text>
        </View>
        {runtimeError ? <Text style={styles.runtimeError}>{runtimeError}</Text> : null}
      </View>
    </View>
  );
}

function buildWorkbenchStyle(
  provider: OnlineImageryProvider | null,
  featureCollection: ReturnType<typeof projectLayoutToWgs84FeatureCollection>,
): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    layout: {
      type: "geojson",
      data: featureCollection,
    },
  };
  const layers: StyleSpecification["layers"] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": provider ? "#d8dfd5" : "#eef2ec" },
    },
  ];

  if (provider) {
    sources.imagery = {
      type: "raster",
      tiles: [toMapLibreTileTemplate(provider.tileUrlTemplate)],
      tileSize: provider.tileSize,
      minzoom: provider.minZoom,
      maxzoom: provider.maxZoom,
      scheme: provider.tileScheme,
      attribution: provider.attribution,
    };
    layers.push({
      id: "imagery",
      type: "raster",
      source: "imagery",
      paint: { "raster-opacity": 0.88 },
    });
  }

  layers.push(
    fillLayer("field-fill", "field_boundary", "#f4f1df", 0.18),
    fillLayer("allowed-fill", "allowed_coverage", "#2f8fc1", 0.34),
    fillLayer("end-gun-fill", "end_gun_coverage", "#33a79b", 0.28),
    fillLayer("outside-fill", "outside_field_coverage", "#d8893f", 0.28),
    fillLayer("obstacle-fill", "obstacle", "#b73f35", 0.5),
    lineLayer("field-line", "field_boundary", "#111c17", 3),
    lineLayer("obstacle-line", "obstacle", "#6d251f", 2),
    lineLayer("map-feature-line", "map_feature", "#7c5b14", 3, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "map_feature"]]),
    lineLayer("draft-line", "draft_vertices", "#ffffff", 5, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "draft_vertices"]]),
    lineLayer("draft-line-core", "draft_vertices", "#0f766e", 2, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "draft_vertices"]]),
    circleLayer("pivot-point", "pivot_center", "#111827", 7),
    circleLayer("water-point", "water_source", "#006a9f", 6),
    circleLayer("power-point", "power_source", "#a36500", 6),
    circleLayer("tower-point", "tower_location", "#49574f", 3),
    circleLayer("map-feature-point", "map_feature", "#7c5b14", 6),
    circleLayer("draft-point", "draft_vertices", "#0f766e", 7),
  );

  return {
    version: 8,
    sources,
    layers,
  };
}

function fillLayer(id: string, layerType: string, color: string, opacity: number): StyleSpecification["layers"][number] {
  return {
    id,
    type: "fill",
    source: "layout",
    filter: ["==", ["get", "layerType"], layerType],
    paint: {
      "fill-color": color,
      "fill-opacity": opacity,
    },
  };
}

function lineLayer(
  id: string,
  layerType: string,
  color: string,
  width: number,
  filter: unknown[] = ["==", ["get", "layerType"], layerType],
): StyleSpecification["layers"][number] {
  return {
    id,
    type: "line",
    source: "layout",
    filter: filter as never,
    paint: {
      "line-color": color,
      "line-width": width,
      "line-opacity": 0.95,
    },
  };
}

function circleLayer(id: string, layerType: string, color: string, radius: number): StyleSpecification["layers"][number] {
  return {
    id,
    type: "circle",
    source: "layout",
    filter: ["==", ["get", "layerType"], layerType],
    paint: {
      "circle-color": "#fffef8",
      "circle-radius": radius,
      "circle-stroke-color": color,
      "circle-stroke-width": 2,
    },
  };
}

function fitBoundsToProject(
  map: maplibregl.Map,
  bounds: [number, number, number, number],
  provider: OnlineImageryProvider | null,
): void {
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      duration: 0,
      maxZoom: provider ? Math.min(17, provider.maxZoom) : 17,
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
    layers: ["map-feature-line", "map-feature-point"],
  });
  const id = features.find((feature) => typeof feature.properties?.id === "string")?.properties?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function toMapLibreTileTemplate(template: string): string {
  return template
    .replace(/\{TileMatrix\}/gi, "{z}")
    .replace(/\{TileCol\}/gi, "{x}")
    .replace(/\{TileRow\}/gi, "{y}")
    .replace(/\{level\}/gi, "{z}")
    .replace(/\{column\}/gi, "{x}")
    .replace(/\{col\}/gi, "{x}")
    .replace(/\{row\}/gi, "{y}");
}

function featureOptionForKind(kind: ProjectMapFeatureKind): { kind: ProjectMapFeatureKind; label: string; geometry: UtilityFeatureGeometry } {
  return UTILITY_FEATURE_OPTIONS.find((option) => option.kind === kind) ?? UTILITY_FEATURE_OPTIONS[0];
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

function ModeSwitch({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.modeSwitch, active && styles.modeSwitchActive]} testID={testID}>
      <Text style={[styles.modeSwitchText, active && styles.modeSwitchTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToolButton({ active, icon, label, onPress, testID }: { active: boolean; icon: React.ReactNode; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.toolButton, active && styles.toolButtonActive]} testID={testID}>
      {icon}
      <Text style={[styles.toolButtonText, active && styles.toolButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HudButton({ disabled = false, icon, label, onPress, primary = false, testID }: { disabled?: boolean; icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean; testID?: string }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.hudButton, primary && styles.hudButtonPrimary, disabled && styles.hudButtonDisabled]} testID={testID}>
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
    alignSelf: "flex-start",
    backgroundColor: "#f7faf5",
    borderColor: "#ccd8cf",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 620,
    flexGrow: 1,
    flexShrink: 1,
    gap: 10,
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
    height: 620,
    minHeight: 500,
    overflow: "hidden",
    position: "relative",
  },
  mapFrameCompact: {
    height: 560,
    minHeight: 500,
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
    maxWidth: "78%",
    padding: 6,
    position: "absolute",
    top: 12,
  },
  toolHudCompact: {
    left: 8,
    maxWidth: "94%",
    top: 8,
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#edf4ed",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  toolButtonActive: {
    backgroundColor: "#173428",
    borderColor: "#173428",
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
  },
  optionHudCompact: {
    left: 8,
    maxWidth: "94%",
    top: 104,
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
  statusHud: {
    alignItems: "center",
    backgroundColor: "rgba(17,28,23,0.92)",
    borderRadius: 8,
    bottom: 72,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    left: 12,
    maxWidth: "92%",
    padding: 10,
    position: "absolute",
    right: 12,
  },
  statusHudCompact: {
    alignItems: "flex-start",
    bottom: 84,
    left: 8,
    right: 8,
  },
  statusTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 220,
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
  },
  hudButton: {
    alignItems: "center",
    backgroundColor: "#eef5ef",
    borderColor: "#c7d6ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 32,
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
  reviewHud: {
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
  reviewHudCompact: {
    left: 8,
    maxWidth: "94%",
    right: 8,
    top: 106,
  },
  reviewHudText: {
    color: "#553b09",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
  },
  attributionHud: {
    alignItems: "center",
    backgroundColor: "rgba(251,253,249,0.95)",
    borderRadius: 8,
    bottom: 8,
    flexDirection: "row",
    gap: 6,
    left: 12,
    maxWidth: "92%",
    paddingHorizontal: 9,
    paddingVertical: 7,
    position: "absolute",
  },
  attributionHudCompact: {
    left: 8,
    maxWidth: "94%",
    right: 8,
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
