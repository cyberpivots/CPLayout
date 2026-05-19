import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Hand,
  LocateFixed,
  Minus,
  PencilLine,
  Plus,
  RefreshCcw,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { boundsForGeometry, ringsToSvgPath } from "../domain/geometry";
import {
  createDrawingMapState,
  createInitialViewport,
  DrawingLayerType,
  DrawingMapAction,
  DrawingMapState,
  reduceDrawingMapState,
  screenPointToWorld,
  viewportToSvgViewBox,
  visibleHeightMeters,
  visibleWidthMeters,
} from "../domain/mapInteraction";
import type { AppSettings, MapStyle } from "../domain/settings";
import { LayoutResult, PivotProject, XY } from "../domain/types";

interface LayoutMapProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
}

export function LayoutMap({ project, result, settings }: LayoutMapProps): React.JSX.Element {
  const allRings = [
    project.fieldBoundary,
    ...result.allowedCoverage.flat(),
    ...result.outsideFieldCoverage.flat(),
    ...result.endGunCoverage.flat(),
    ...project.obstacles.map((obstacle) => obstacle.polygon),
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
  const palette = paletteForMapStyle(settings.mapStyle);
  const viewWidth = visibleWidthMeters(mapState.viewport);
  const viewHeight = visibleHeightMeters(mapState.viewport);
  const minX = mapState.viewport.center.x - viewWidth / 2;
  const maxX = mapState.viewport.center.x + viewWidth / 2;
  const minY = -mapState.viewport.center.y - viewHeight / 2;
  const maxY = -mapState.viewport.center.y + viewHeight / 2;
  const fieldPath = ringsToSvgPath([[project.fieldBoundary]]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 6,
      onPanResponderRelease: (_event, gesture) => {
        dispatch({
          type: "pan_screen",
          dxPixels: gesture.dx,
          dyPixels: gesture.dy,
          screenWidthPixels: mapPixelWidth,
        });
      },
    }),
    [mapPixelHeight, mapPixelWidth, mapState.mode, mapState.viewport],
  );

  function dispatch(action: DrawingMapAction): void {
    setMapState((current) => reduceDrawingMapState(current, action));
  }

  function addDraftVertexFromPress(event: GestureResponderEvent): void {
    if (!canAddDraftVertex(mapState.mode)) return;
    dispatch({
      type: "add_draft_vertex",
      vertex: screenPointToWorld(
        mapState.viewport,
        {
          xPixels: event.nativeEvent.locationX,
          yPixels: event.nativeEvent.locationY,
        },
        {
          widthPixels: mapPixelWidth,
          heightPixels: mapPixelHeight,
        },
      ),
    });
  }

  function addDraftVertexAtViewCenter(): void {
    if (!canAddDraftVertex(mapState.mode)) return;
    dispatch({ type: "add_draft_vertex", vertex: mapState.viewport.center });
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
          <ToolButton active={mapState.mode === "pan"} icon={<Hand size={18} />} label="Pan" onPress={() => dispatch({ type: "set_mode", mode: "pan" })} />
          <ToolButton active={mapState.mode === "draw_boundary"} icon={<PencilLine size={18} />} label="Draw" onPress={() => dispatch({ type: "set_mode", mode: "draw_boundary" })} />
          <ToolButton active={mapState.mode === "edit_vertices"} icon={<Crosshair size={18} />} label="Edit" onPress={() => dispatch({ type: "set_mode", mode: "edit_vertices" })} />
          <ToolButton active={mapState.mode === "place_pivot"} icon={<LocateFixed size={18} />} label="Pivot" onPress={() => dispatch({ type: "set_mode", mode: "place_pivot" })} />
        </View>
      </View>

      <View
        style={[styles.mapSurface, { backgroundColor: palette.background }]}
        onLayout={(event) => {
          setMapPixelWidth(Math.max(1, event.nativeEvent.layout.width));
          setMapPixelHeight(Math.max(1, event.nativeEvent.layout.height));
        }}
      >
        <Svg
          onPress={addDraftVertexFromPress}
          viewBox={viewportToSvgViewBox(mapState.viewport)}
          style={styles.svg}
          {...panResponder.panHandlers}
        >
          <Rect
            x={minX}
            y={minY}
            width={viewWidth}
            height={viewHeight}
            fill={palette.background}
            onPress={addDraftVertexFromPress}
          />
          <MapBackground minX={minX} maxX={maxX} minY={minY} maxY={maxY} styleName={settings.mapStyle} />
          <Grid minX={minX} maxX={maxX} minY={minY} maxY={maxY} stroke={palette.grid} />
          <Path d={ringsToSvgPath(result.outsideFieldCoverage)} fill={palette.outside} opacity={0.28} />
          <Path d={ringsToSvgPath(result.endGunCoverage)} fill={palette.endGun} opacity={0.25} />
          <Path d={ringsToSvgPath(result.allowedCoverage)} fill={palette.allowed} opacity={0.54} />
          <Path d={fieldPath} fill="none" stroke={palette.fieldStroke} strokeWidth={7} strokeLinejoin="round" />
          <Path d={ringsToSvgPath(result.obstacles)} fill={palette.obstacle} opacity={0.78} stroke={palette.obstacleStroke} strokeWidth={3} />
          <DraftVertices vertices={mapState.draftVertices} color={palette.draft} />
          <PointMarker point={project.pivotCenter} color={palette.pivot} label="Pivot" />
          <PointMarker point={project.waterSource} color={palette.water} label="Water" />
          <PointMarker point={project.powerSource} color={palette.power} label="Power" />
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
          <Text style={styles.draftHudText}>{mapState.activeLayer.replaceAll("_", " ")} draft · {mapState.draftVertices.length} pts</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Add draft vertex at view center" onPress={addDraftVertexAtViewCenter} style={styles.clearDraftButton}>
            <Text style={styles.clearDraftText}>Add Center</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear draft vertices" onPress={() => dispatch({ type: "clear_draft" })} style={styles.clearDraftButton}>
            <Text style={styles.clearDraftText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.layerRow}>
        <LayerButton active={mapState.activeLayer === "field_boundary"} label="Boundary" layer="field_boundary" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "obstacle"} label="Obstacle" layer="obstacle" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "road"} label="Road" layer="road" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "ditch"} label="Ditch" layer="ditch" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "fence"} label="Fence" layer="fence" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
        <LayerButton active={mapState.activeLayer === "exclusion"} label="Exclusion" layer="exclusion" onPress={(layer) => dispatch({ type: "set_active_layer", activeLayer: layer })} />
      </View>

      <View style={styles.legend}>
        <LegendSwatch color="#6cb6df" label="Allowed wet area" />
        <LegendSwatch color="#63c7cf" label="End gun" />
        <LegendSwatch color="#e68b58" label="Outside field" />
        <LegendSwatch color="#c64f43" label="Obstacle/no-spray" />
      </View>
    </View>
  );
}

function canAddDraftVertex(mode: DrawingMapState["mode"]): boolean {
  return mode === "draw_boundary" || mode === "mark_obstacle" || mode === "edit_vertices";
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

function PointMarker({ point, color, label }: { point: XY; color: string; label: string }): React.JSX.Element {
  return (
    <>
      <Circle cx={point.x} cy={-point.y} r={12} fill="#fffef8" stroke={color} strokeWidth={6} />
      <SvgText x={point.x + 18} y={-point.y + 6} fill={color} fontSize={27} fontWeight="800">
        {label}
      </SvgText>
    </>
  );
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

function LegendSwatch({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
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
  };
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 520,
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
    height: 440,
    width: "100%",
  },
  mapSurface: {
    minHeight: 440,
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
    gap: 8,
    left: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
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
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
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
