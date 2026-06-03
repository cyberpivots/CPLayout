import {
  Calculator,
  Download,
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

export type DrawingToolPaletteModal = "point" | "line" | "polygon" | "circle" | "pivot" | "obstacle" | "machine" | "endGun" | "cornerArm" | "calculate" | "layers" | null;

type ActiveTool = {
  activeLayer: DrawingLayerType;
  featureKind?: ProjectMapFeatureKind;
  mode: DrawingMode;
  requestId: number;
} | null;

type GroupId = "pan" | "draw" | "points" | "utilities" | "coverage" | "machine";

type PaletteOption =
  | {
    id: string;
    label: string;
    testID: string;
    legacyTestID?: string;
    kind: "activate";
    mode: DrawingMode;
    layer: DrawingLayerType;
    featureKind?: ProjectMapFeatureKind;
  }
  | {
    id: string;
    label: string;
    testID: string;
    legacyTestID?: string;
    kind: "modal";
    modal: Exclude<DrawingToolPaletteModal, null>;
  };

interface DrawingToolPaletteProps {
  activeModal: DrawingToolPaletteModal;
  activeTool: ActiveTool;
  dirty: boolean;
  onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  onCalculate: () => void;
  onOpenFiles: () => void;
  onOpenModal: (modal: DrawingToolPaletteModal) => void;
  onToggleLayers: () => void;
  settings: AppSettings;
}

export function DrawingToolPalette({
  activeModal,
  activeTool,
  dirty,
  onActivateTool,
  onCalculate,
  onOpenFiles,
  onOpenModal,
  onToggleLayers,
  settings,
}: DrawingToolPaletteProps): React.JSX.Element {
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);
  const designMode = settings.mappingWorkflowMode === "design";
  const groups = useMemo(() => paletteGroups(), []);
  const activeOptions = openGroup ? groups[openGroup] : [];

  function toggleGroup(groupId: GroupId): void {
    setOpenGroup((current) => current === groupId ? null : groupId);
  }

  function selectOption(option: PaletteOption): void {
    setOpenGroup(null);
    if (option.kind === "activate") {
      onActivateTool(option.mode, option.layer, option.featureKind);
      return;
    }
    onOpenModal(option.modal);
  }

  function runDirect(action: () => void): void {
    setOpenGroup(null);
    action();
  }

  return (
    <View style={styles.shell} testID="design-action-hud">
      {openGroup ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.optionScroll}
          contentContainerStyle={styles.optionRow}
          testID={`drawing-tool-menu-${openGroup}`}
        >
          {activeOptions.map((option) => (
            <View key={option.id} testID={option.testID}>
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="button"
                onPress={() => selectOption(option)}
                style={styles.optionButton}
                testID={option.legacyTestID}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.groupScroll}
        contentContainerStyle={styles.groupRow}
        testID="design-action-scroll"
      >
        <PaletteGroupButton
          active={activeTool?.mode === "pan"}
          groupTestID="drawing-tool-group-pan"
          icon={(color) => <MousePointer2 size={19} color={color} />}
          label="Pan"
          legacyTestID="design-action-pan"
          onPress={() => runDirect(() => onActivateTool("pan", "field_boundary"))}
        />
        <PaletteGroupButton
          active={activeModal === "polygon" || activeModal === "obstacle" || activeTool?.mode === "draw_boundary" || activeTool?.mode === "edit_vertices" || activeTool?.mode === "mark_obstacle"}
          groupTestID="drawing-tool-group-draw"
          icon={(color) => <Pentagon size={19} color={color} />}
          label="Draw"
          onPress={() => toggleGroup("draw")}
          open={openGroup === "draw"}
        />
        <PaletteGroupButton
          active={activeModal === "point" || activeModal === "pivot" || activeTool?.mode === "capture_point" || activeTool?.mode === "place_pivot"}
          groupTestID="drawing-tool-group-points"
          icon={(color) => <MapPin size={19} color={color} />}
          label="Points"
          onPress={() => toggleGroup("points")}
          open={openGroup === "points"}
        />
        <PaletteGroupButton
          active={activeModal === "line" || (activeTool?.mode === "measure" && !isCoverageFeature(activeTool.featureKind))}
          groupTestID="drawing-tool-group-utilities"
          icon={(color) => <UtilityPole size={19} color={color} />}
          label="Utilities"
          onPress={() => toggleGroup("utilities")}
          open={openGroup === "utilities"}
        />
        <PaletteGroupButton
          active={activeModal === "circle" || activeModal === "endGun" || activeModal === "cornerArm" || isCoverageFeature(activeTool?.featureKind)}
          groupTestID="drawing-tool-group-coverage"
          icon={(color) => <Ruler size={19} color={color} />}
          label="Coverage"
          onPress={() => toggleGroup("coverage")}
          open={openGroup === "coverage"}
        />
        <PaletteGroupButton
          active={activeModal === "machine"}
          groupTestID="drawing-tool-group-machine"
          icon={(color) => <Wrench size={19} color={color} />}
          label="Machine"
          onPress={() => toggleGroup("machine")}
          open={openGroup === "machine"}
        />
        <PaletteGroupButton
          active={activeModal === "layers"}
          groupTestID="drawing-tool-group-layers"
          icon={(color) => <Layers size={19} color={color} />}
          label="Layers"
          legacyTestID="design-action-layers"
          onPress={() => runDirect(onToggleLayers)}
        />
        <PaletteGroupButton
          active={activeModal === "calculate"}
          groupTestID="drawing-tool-group-calculate"
          icon={(color) => <Calculator size={19} color={color} />}
          label="Calculate"
          legacyTestID="design-action-calculate"
          onPress={() => runDirect(onCalculate)}
        />
        <PaletteGroupButton
          active={false}
          groupTestID="drawing-tool-group-files"
          icon={(color) => <Download size={19} color={color} />}
          label={dirty ? "Files *" : "Files"}
          legacyTestID="design-action-files"
          onPress={() => runDirect(onOpenFiles)}
        />
      </ScrollView>
      {!designMode ? (
        <Text style={styles.notice}>Layout mode is read-only for pointer edits.</Text>
      ) : null}
    </View>
  );
}

function PaletteGroupButton({
  active,
  groupTestID,
  icon,
  label,
  legacyTestID,
  onPress,
  open = false,
}: {
  active: boolean;
  groupTestID: string;
  icon: (color: string) => React.ReactNode;
  label: string;
  legacyTestID?: string;
  onPress: () => void;
  open?: boolean;
}): React.JSX.Element {
  const selected = active || open;
  const color = selected ? "#ffffff" : "#173428";
  return (
    <View testID={groupTestID}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        aria-pressed={selected}
        onPress={onPress}
        style={[styles.groupButton, selected && styles.groupButtonActive]}
        testID={legacyTestID}
      >
        {icon(color)}
        <Text style={[styles.groupText, selected && styles.groupTextActive]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function paletteGroups(): Record<GroupId, PaletteOption[]> {
  return {
    pan: [],
    draw: [
      { id: "boundary", label: "Boundary", testID: "drawing-tool-option-boundary", legacyTestID: "design-action-polygon", kind: "activate", mode: "draw_boundary", layer: "field_boundary" },
      { id: "edit-boundary", label: "Edit Vertices", testID: "drawing-tool-option-edit-boundary", kind: "activate", mode: "edit_vertices", layer: "field_boundary" },
      { id: "no-spray", label: "No-Spray", testID: "drawing-tool-option-no-spray", legacyTestID: "design-action-obstacles", kind: "activate", mode: "mark_obstacle", layer: "exclusion" },
      { id: "road", label: "Road", testID: "drawing-tool-option-road", kind: "activate", mode: "mark_obstacle", layer: "road" },
      { id: "building", label: "Building", testID: "drawing-tool-option-building", kind: "activate", mode: "mark_obstacle", layer: "building" },
      { id: "polygon-panel", label: "More Polygons", testID: "drawing-tool-option-polygon-panel", kind: "modal", modal: "polygon" },
    ],
    points: [
      { id: "pivot-panel", label: "Pivot GPS", testID: "drawing-tool-option-pivot-panel", legacyTestID: "design-action-pivot", kind: "modal", modal: "pivot" },
      { id: "pivot-click", label: "Pivot Click", testID: "drawing-tool-option-pivot-click", kind: "activate", mode: "place_pivot", layer: "pivot_center" },
      { id: "water", label: "Water", testID: "drawing-tool-option-water", kind: "activate", mode: "place_pivot", layer: "water_source" },
      { id: "power", label: "Power", testID: "drawing-tool-option-power", kind: "activate", mode: "place_pivot", layer: "power_source" },
      { id: "control", label: "Control", testID: "drawing-tool-option-control", kind: "activate", mode: "capture_point", layer: "control_point" },
      { id: "note", label: "Note", testID: "drawing-tool-option-note", kind: "activate", mode: "capture_point", layer: "note_point" },
      { id: "point-panel", label: "More Points", testID: "drawing-tool-option-point-panel", legacyTestID: "design-action-point", kind: "modal", modal: "point" },
    ],
    utilities: [
      { id: "pipeline", label: "Pipeline", testID: "drawing-tool-option-pipeline", legacyTestID: "design-action-line", kind: "activate", mode: "measure", layer: "control_point", featureKind: "underground_pipeline" },
      { id: "power-line", label: "Power Line", testID: "drawing-tool-option-power-line", kind: "activate", mode: "measure", layer: "control_point", featureKind: "power_line" },
      { id: "access-lane", label: "Access Lane", testID: "drawing-tool-option-access-lane", kind: "activate", mode: "measure", layer: "control_point", featureKind: "access_lane" },
      { id: "ditch", label: "Ditch", testID: "drawing-tool-option-ditch", kind: "activate", mode: "measure", layer: "control_point", featureKind: "ditch" },
      { id: "canal", label: "Canal", testID: "drawing-tool-option-canal", kind: "activate", mode: "measure", layer: "control_point", featureKind: "canal" },
      { id: "line-panel", label: "More Lines", testID: "drawing-tool-option-line-panel", kind: "modal", modal: "line" },
    ],
    coverage: [
      { id: "end-gun-circle", label: "End-Gun Circle", testID: "drawing-tool-option-end-gun-circle", legacyTestID: "design-action-circle", kind: "activate", mode: "measure", layer: "control_point", featureKind: "end_gun_arc" },
      { id: "corner-footprint", label: "Corner Footprint", testID: "drawing-tool-option-corner-footprint", kind: "activate", mode: "measure", layer: "control_point", featureKind: "corner_swing_limit" },
      { id: "end-gun-panel", label: "End Gun Settings", testID: "drawing-tool-option-end-gun-panel", legacyTestID: "design-action-end-gun", kind: "modal", modal: "endGun" },
      { id: "corner-panel", label: "Corner Arm Panel", testID: "drawing-tool-option-corner-panel", legacyTestID: "design-action-corner-arm", kind: "modal", modal: "cornerArm" },
      { id: "circle-panel", label: "Circle Tools", testID: "drawing-tool-option-circle-panel", kind: "modal", modal: "circle" },
    ],
    machine: [
      { id: "machine-settings", label: "Machine Settings", testID: "drawing-tool-option-machine-settings", legacyTestID: "design-action-machine", kind: "modal", modal: "machine" },
      { id: "end-gun-settings", label: "End Gun", testID: "drawing-tool-option-machine-end-gun", kind: "modal", modal: "endGun" },
      { id: "corner-arm-settings", label: "Corner Arm", testID: "drawing-tool-option-machine-corner-arm", kind: "modal", modal: "cornerArm" },
      { id: "calculate-settings", label: "Calculate", testID: "drawing-tool-option-machine-calculate", kind: "modal", modal: "calculate" },
    ],
  };
}

function isCoverageFeature(featureKind?: ProjectMapFeatureKind): boolean {
  return featureKind === "end_gun_arc" || featureKind === "corner_swing_limit";
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#fbfcf8",
    borderColor: "#c8d6cc",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    gap: 7,
    minHeight: 76,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  optionScroll: {
    flexGrow: 0,
    minWidth: 0,
  },
  optionRow: {
    alignItems: "center",
    gap: 7,
    paddingRight: 2,
  },
  optionButton: {
    alignItems: "center",
    backgroundColor: "#fffef8",
    borderColor: "#b9c8bd",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionText: {
    color: "#173428",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  groupScroll: {
    minWidth: 0,
  },
  groupRow: {
    alignItems: "center",
    gap: 7,
    paddingRight: 2,
  },
  groupButton: {
    alignItems: "center",
    backgroundColor: "#eef4ef",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    gap: 4,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 7,
    paddingVertical: 7,
    width: 82,
  },
  groupButtonActive: {
    backgroundColor: "#173428",
    borderColor: "#173428",
  },
  groupText: {
    color: "#173428",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  groupTextActive: {
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
