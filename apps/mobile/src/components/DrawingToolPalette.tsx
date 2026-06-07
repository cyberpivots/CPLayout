import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Layers,
  MapPin,
  MousePointer2,
  Pentagon,
  Ruler,
  UtilityPole,
  Wrench,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AppSettings, ProjectMapFeatureKind } from "@cplayout/core";
import type { DrawingLayerType, DrawingMode } from "@cplayout/geometry";
import { MAP_TOOL_CATALOG, type MapToolCatalogItem, type MapToolId } from "@cplayout/map-adapters";

export type DrawingToolPaletteModal = "point" | "line" | "polygon" | "circle" | "pivot" | "obstacle" | "machine" | "endGun" | "cornerArm" | "calculate" | "layers" | null;

type ActiveTool = {
  activeLayer: DrawingLayerType;
  featureKind?: ProjectMapFeatureKind;
  mode: DrawingMode;
  requestId: number;
} | null;

interface DrawingToolPaletteProps {
  activeModal: DrawingToolPaletteModal;
  activeTool: ActiveTool;
  onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  onCalculate: () => void;
  onOpenModal: (modal: DrawingToolPaletteModal) => void;
  onToggleLayers: () => void;
  settings: AppSettings;
}

export function DrawingToolPalette({
  activeModal,
  activeTool,
  onActivateTool,
  onCalculate,
  onOpenModal,
  onToggleLayers,
  settings,
}: DrawingToolPaletteProps): React.JSX.Element {
  const [expandedHud, setExpandedHud] = useState(false);
  const designMode = settings.mappingWorkflowMode === "design";
  const activeToolId = useMemo(() => activeMapToolId(activeModal, activeTool), [activeModal, activeTool]);
  const statusText = activeToolStatus(activeModal, activeTool, designMode);

  function runTool(tool: MapToolCatalogItem): void {
    const action = tool.action;
    if (action.type === "activate") {
      onActivateTool(action.mode, action.layer, action.featureKind);
      return;
    }
    if (action.type === "open_panel") {
      onOpenModal(action.panel);
      return;
    }
    if (action.command === "calculate") {
      onCalculate();
      return;
    }
    onToggleLayers();
  }

  return (
    <View style={styles.bottomHud} testID="map-bottom-hud">
      <View style={styles.shell} testID="design-action-hud">
        <View style={styles.statusRow}>
          <Pressable
            accessibilityLabel={expandedHud ? "Collapse map HUD" : "Expand map HUD"}
            accessibilityRole="button"
            accessibilityState={{ expanded: expandedHud }}
            onPress={() => setExpandedHud((expanded) => !expanded)}
            style={styles.hudToggleButton}
            testID="map-bottom-hud-toggle"
          >
            {expandedHud ? <ChevronDown size={18} color="#173428" /> : <ChevronUp size={18} color="#173428" />}
          </Pressable>
          <View style={styles.activeChip} testID="map-hud-active-tool-chip">
            <Text numberOfLines={1} style={styles.activeChipText}>{statusText}</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={expandedHud}
          style={styles.toolScroll}
          contentContainerStyle={styles.toolRow}
          testID="design-action-scroll"
        >
          {MAP_TOOL_CATALOG.map((tool) => (
            <ToolButton
              key={tool.id}
              active={activeToolId === tool.id}
              expanded={expandedHud}
              icon={toolIcon(tool.id, activeToolId === tool.id)}
              legacyTestID={legacyTestId(tool.id)}
              onPress={() => runTool(tool)}
              testID={groupTestId(tool.id)}
              tool={tool}
            />
          ))}
        </ScrollView>
        {!designMode && expandedHud ? (
          <Text style={styles.notice}>Layout mode is read-only for pointer edits.</Text>
        ) : null}
      </View>
    </View>
  );
}

function ToolButton({
  active,
  expanded,
  icon,
  legacyTestID,
  onPress,
  testID,
  tool,
}: {
  active: boolean;
  expanded: boolean;
  icon: React.ReactNode;
  legacyTestID?: string;
  onPress: () => void;
  testID: string;
  tool: MapToolCatalogItem;
}): React.JSX.Element {
  return (
    <View testID={testID}>
      <Pressable
        accessibilityLabel={tool.label}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        aria-pressed={active}
        onPress={onPress}
        style={[styles.toolButton, expanded && styles.toolButtonExpanded, active && styles.toolButtonActive]}
        testID={legacyTestID}
      >
        {icon}
        {expanded ? <Text style={[styles.toolText, active && styles.toolTextActive]}>{tool.shortLabel}</Text> : null}
      </Pressable>
    </View>
  );
}

function activeMapToolId(activeModal: DrawingToolPaletteModal, activeTool: ActiveTool): MapToolId {
  if (activeModal === "point" || activeModal === "pivot") return "point";
  if (activeModal === "line") return "line";
  if (activeModal === "polygon" || activeModal === "obstacle") return "polygon";
  if (activeModal === "circle" || activeModal === "endGun" || activeModal === "cornerArm") return "circle";
  if (activeModal === "machine") return "machine";
  if (activeModal === "layers") return "layers";
  if (activeModal === "calculate") return "calculate";
  if (activeTool?.mode === "pan") return "pan";
  if (activeTool?.mode === "edit_vertices") return "edit";
  if (activeTool?.mode === "place_pivot" || activeTool?.mode === "capture_point") return "point";
  if (activeTool?.featureKind === "end_gun_arc") return "circle";
  if (activeTool?.featureKind === "corner_swing_limit") return "polygon";
  if (activeTool?.mode === "measure") {
    const kind = activeTool.featureKind ?? "";
    if (kind.includes("line") || kind.includes("pipeline") || kind.includes("wire") || kind === "ditch" || kind === "canal" || kind === "fence" || kind === "road" || kind === "access_lane") return "line";
    if (kind.includes("boundary") || kind.includes("zone")) return "polygon";
    return "point";
  }
  if (activeTool?.mode === "draw_boundary" || activeTool?.mode === "mark_obstacle") return "polygon";
  return "pan";
}

function activeToolStatus(activeModal: DrawingToolPaletteModal, activeTool: ActiveTool, designMode: boolean): string {
  if (!designMode) return "Layout: inspect";
  if (activeModal) return `${activeModal.replaceAll("_", " ")} sheet`;
  if (!activeTool) return "Pan";
  const layer = activeTool.featureKind ?? activeTool.activeLayer;
  return `${activeTool.mode.replaceAll("_", " ")} · ${layer.replaceAll("_", " ")}`;
}

function groupTestId(id: MapToolId): string {
  switch (id) {
    case "pan":
      return "drawing-tool-group-pan";
    case "edit":
      return "drawing-tool-group-edit";
    case "point":
      return "drawing-tool-group-points";
    case "line":
      return "drawing-tool-group-utilities";
    case "polygon":
      return "drawing-tool-group-draw";
    case "circle":
      return "drawing-tool-group-coverage";
    case "machine":
      return "drawing-tool-group-machine";
    case "layers":
      return "drawing-tool-group-layers";
    case "calculate":
      return "drawing-tool-group-calculate";
  }
}

function legacyTestId(id: MapToolId): string | undefined {
  switch (id) {
    case "pan":
      return "design-action-pan";
    case "line":
      return "design-action-line";
    case "polygon":
      return "design-action-polygon";
    case "point":
      return "design-action-point";
    case "circle":
      return "design-action-circle";
    case "machine":
      return "design-action-machine";
    case "layers":
      return "design-action-layers";
    case "calculate":
      return "design-action-calculate";
    case "edit":
      return "design-action-edit";
  }
}

function toolIcon(id: MapToolId, active: boolean): React.ReactNode {
  const color = active ? "#ffffff" : "#173428";
  switch (id) {
    case "pan":
      return <MousePointer2 size={19} color={color} />;
    case "edit":
      return <MousePointer2 size={19} color={color} />;
    case "point":
      return <MapPin size={19} color={color} />;
    case "line":
      return <UtilityPole size={19} color={color} />;
    case "polygon":
      return <Pentagon size={19} color={color} />;
    case "circle":
      return <Ruler size={19} color={color} />;
    case "machine":
      return <Wrench size={19} color={color} />;
    case "layers":
      return <Layers size={19} color={color} />;
    case "calculate":
      return <Calculator size={19} color={color} />;
  }
}

const styles = StyleSheet.create({
  bottomHud: {
    alignSelf: "center",
    maxWidth: "100%",
    width: "100%",
  },
  shell: {
    backgroundColor: "rgba(251,252,248,0.96)",
    borderColor: "#c8d6cc",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    gap: 7,
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    minWidth: 0,
  },
  hudToggleButton: {
    alignItems: "center",
    backgroundColor: "#fffef8",
    borderColor: "#b9c8bd",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 42,
  },
  activeChip: {
    backgroundColor: "#edf4ef",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  activeChipText: {
    color: "#173428",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  toolScroll: {
    minWidth: 0,
  },
  toolRow: {
    alignItems: "center",
    gap: 7,
    paddingRight: 2,
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#eef4ef",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    gap: 4,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 7,
    paddingVertical: 7,
    width: 44,
  },
  toolButtonExpanded: {
    minWidth: 72,
    width: "auto",
  },
  toolButtonActive: {
    backgroundColor: "#173428",
    borderColor: "#173428",
  },
  toolText: {
    color: "#173428",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  toolTextActive: {
    color: "#ffffff",
  },
  notice: {
    color: "#7a4a12",
    flexBasis: "100%",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center",
  },
});
