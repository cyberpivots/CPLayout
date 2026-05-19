import { StatusBar } from "expo-status-bar";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  MapPinned,
  Ruler,
  Satellite,
  SlidersHorizontal,
  Settings2,
  WifiOff,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CoordinateFormatPanel } from "./src/components/CoordinateFormatPanel";
import { LayoutMap } from "./src/components/LayoutMap";
import { MetricTile } from "./src/components/MetricTile";
import { ProjectFilesPanel } from "./src/components/ProjectFilesPanel";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { COORDINATE_FORMAT_LABELS, formatCoordinate } from "./src/domain/coordinates";
import { evaluateLayout, exportScenarioGeoJson, machineRadiusMeters } from "./src/domain/geometry";
import { sampleProject } from "./src/domain/sampleProject";
import { AppSettings, mergeAppSettings, parseAppSettings, projectSettingsFromApp } from "./src/domain/settings";
import { LonLat, PivotProject, PivotSweep, XY } from "./src/domain/types";
import { formatAreaFromAcres, formatDistance } from "./src/domain/units";

type Tab = "layout" | "survey" | "equipment" | "settings" | "export";

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("layout");
  const [project, setProject] = useState<PivotProject>(sampleProject);
  const [settings, setSettings] = useState<AppSettings>(() => mergeAppSettings(sampleProject.settings));
  const result = useMemo(() => evaluateLayout(project), [project]);
  const machineRadius = machineRadiusMeters(project.machine);

  function updateSweep(sweep: PivotSweep): void {
    setProject((current) => ({
      ...current,
      machine: { ...current.machine, sweep },
    }));
  }

  function changeEndGun(delta: number): void {
    setProject((current) => ({
      ...current,
      machine: {
        ...current.machine,
        endGunThrowMeters: Math.max(0, current.machine.endGunThrowMeters + delta),
      },
    }));
  }

  function applyPivotCoordinate(coordinate: XY, wgs84?: LonLat): void {
    setProject((current) => ({
      ...current,
      pivotCenter: coordinate,
      surveyPoints: current.surveyPoints.map((point) => point.role === "pivot_center"
        ? { ...point, projected: coordinate, wgs84: wgs84 ?? point.wgs84 }
        : point),
    }));
  }

  function commitSettings(nextSettings: AppSettings): void {
    const parsed = parseAppSettings(nextSettings);
    setSettings(parsed);
    setProject((current) => ({
      ...current,
      unitSystem: parsed.unitSystem,
      settings: projectSettingsFromApp(parsed),
    }));
  }

  function loadProject(nextProject: PivotProject): void {
    setProject(nextProject);
    setSettings(mergeAppSettings(nextProject.settings));
    setTab("layout");
  }

  function formatProjectCoordinate(point: XY, wgs84?: LonLat): string {
    try {
      return formatCoordinate({ projected: point, projectCrs: project.projectCrs, wgs84 }, settings.coordinateDisplayFormat);
    } catch {
      return formatCoordinate({ projected: point, projectCrs: project.projectCrs }, "projected_local");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appTitle}>Center Pivot Layout</Text>
            <Text style={styles.appSubtitle}>{project.name}</Text>
          </View>
          <View style={styles.statusRow}>
            <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline" />
            <StatusPill icon={<Satellite size={15} color="#254234" />} label={`${settings.gpsQuality.minimumFixType.replaceAll("_", " ")} gate`} />
            <StatusPill icon={<Ruler size={15} color="#254234" />} label={project.projectCrs} />
            <StatusPill icon={<SlidersHorizontal size={15} color="#254234" />} label={COORDINATE_FORMAT_LABELS[settings.coordinateDisplayFormat]} />
          </View>
        </View>

        <View style={styles.nav}>
          <NavButton active={tab === "layout"} icon={<MapPinned size={18} />} label="Layout" onPress={() => setTab("layout")} />
          <NavButton active={tab === "survey"} icon={<Satellite size={18} />} label="Survey" onPress={() => setTab("survey")} />
          <NavButton active={tab === "equipment"} icon={<Settings2 size={18} />} label="Equipment" onPress={() => setTab("equipment")} />
          <NavButton active={tab === "settings"} icon={<SlidersHorizontal size={18} />} label="Settings" onPress={() => setTab("settings")} />
          <NavButton active={tab === "export"} icon={<Download size={18} />} label="Export" onPress={() => setTab("export")} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {tab === "layout" && (
            <View style={styles.layoutGrid}>
              <LayoutMap project={project} result={result} settings={settings} />
              <View style={styles.sidePanel}>
                <Text style={styles.sectionTitle}>Scenario Metrics</Text>
                <View style={styles.metricGrid}>
                  <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
                  <MetricTile label="Dry / non-irrigated" value={formatAreaFromAcres(result.metrics.nonIrrigatedAcres, settings.unitSystem)} tone="warn" />
                  <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} tone="neutral" />
                  <MetricTile label="End gun" value={formatAreaFromAcres(result.metrics.endGunAcres, settings.unitSystem)} tone="neutral" />
                  <MetricTile label="Outside field" value={formatAreaFromAcres(result.metrics.outsideFieldAcres, settings.unitSystem)} tone={result.metrics.outsideFieldAcres > 0 ? "danger" : "good"} />
                  <MetricTile label="Obstacle hits" value={`${result.metrics.obstacleConflictCount}`} tone={result.metrics.obstacleConflictCount > 0 ? "danger" : "good"} />
                </View>

                <CoordinateFormatPanel
                  coordinate={project.pivotCenter}
                  format={settings.coordinateDisplayFormat}
                  onApply={applyPivotCoordinate}
                  onFormatChange={(coordinateDisplayFormat) => commitSettings({ ...settings, coordinateDisplayFormat })}
                  projectCrs={project.projectCrs}
                />

                <Text style={styles.sectionTitle}>Mode Controls</Text>
                <View style={styles.controlRow}>
                  <ActionButton label="Full circle" selected={project.machine.sweep.mode === "full_circle"} onPress={() => updateSweep({ mode: "full_circle" })} />
                  <ActionButton
                    label="Part circle"
                    selected={project.machine.sweep.mode === "partial_circle"}
                    onPress={() => updateSweep({ mode: "partial_circle", startAngleDegrees: 210, stopAngleDegrees: 35, direction: "counterclockwise" })}
                  />
                </View>
                <View style={styles.controlRow}>
                  <ActionButton label="- End gun" onPress={() => changeEndGun(-6)} />
                  <ActionButton label="+ End gun" onPress={() => changeEndGun(6)} />
                </View>

                <Text style={styles.sectionTitle}>Validation</Text>
                <View style={styles.warningList}>
                  {result.warnings.map((warning) => (
                    <View key={warning} style={styles.warningItem}>
                      <AlertTriangle size={17} color="#9a4c1c" />
                      <Text style={styles.warningText}>{warning}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {tab === "survey" && (
            <Section title="Survey Capture Readiness" icon={<Satellite size={20} color="#254234" />}>
              <View style={styles.metricGrid}>
                <MetricTile label="Survey points" value={`${project.surveyPoints.length}`} />
                <MetricTile label="RTK fixed points" value={`${project.surveyPoints.filter((point) => point.confidence === "rtk_fixed").length}`} tone="good" />
                <MetricTile label="Draft inputs" value={`${project.surveyPoints.filter((point) => point.confidence !== "rtk_fixed").length}`} tone="warn" />
              </View>
              {project.surveyPoints.map((point) => (
                <View key={point.id} style={styles.listRow}>
                  <View>
                    <Text style={styles.rowTitle}>{point.label}</Text>
                    <Text style={styles.rowMeta}>{point.role} · {point.source} · {point.confidence}</Text>
                  </View>
                  <Text style={styles.coordinate}>{formatProjectCoordinate(point.projected, point.wgs84)}</Text>
                </View>
              ))}
            </Section>
          )}

          {tab === "equipment" && (
            <Section title="Machine Configuration" icon={<Settings2 size={20} color="#254234" />}>
              <View style={styles.metricGrid}>
                <MetricTile label="Machine radius" value={formatDistance(machineRadius, settings.unitSystem)} />
                <MetricTile label="End gun throw" value={formatDistance(project.machine.endGunThrowMeters, settings.unitSystem)} />
                <MetricTile label="Tower count" value={`${project.machine.spanLengthsMeters.length}`} />
                <MetricTile label="Sweep" value={project.machine.sweep.mode === "full_circle" ? "Full" : "Part"} />
              </View>
              {project.machine.spanLengthsMeters.map((span, index) => (
                <View key={`${span}-${index}`} style={styles.listRow}>
                  <View>
                    <Text style={styles.rowTitle}>Span {index + 1}</Text>
                    <Text style={styles.rowMeta}>Cumulative tower radius {formatDistance(project.machine.spanLengthsMeters.slice(0, index + 1).reduce((sum, value) => sum + value, 0), settings.unitSystem)}</Text>
                  </View>
                  <Text style={styles.coordinate}>{formatDistance(span, settings.unitSystem)}</Text>
                </View>
              ))}
            </Section>
          )}

          {tab === "settings" && (
            <SettingsPanel settings={settings} onChange={commitSettings} />
          )}

          {tab === "export" && (
            <Section title="Local Export Package" icon={<ClipboardList size={20} color="#254234" />}>
              <ProjectFilesPanel project={project} result={result} onProjectLoaded={loadProject} />
              <View style={styles.metricGrid}>
                <MetricTile label="Project file" value="JSON" />
                <MetricTile label="Geometry" value="GeoJSON" />
                <MetricTile label="Metrics" value="CSV-ready" />
                <MetricTile label="Cloud required" value="No" tone="good" />
              </View>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText} numberOfLines={16}>
                  {JSON.stringify(exportScenarioGeoJson(project, result), null, 2)}
                </Text>
              </View>
            </Section>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatusPill({ icon, label }: { icon: React.ReactNode; label: string }): React.JSX.Element {
  return (
    <View style={styles.statusPill}>
      {icon}
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function NavButton({ active, icon, label, onPress }: { active: boolean; icon: React.ReactNode; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      {icon}
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, selected && styles.actionButtonSelected]}>
      <Text style={[styles.actionText, selected && styles.actionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#edf1eb",
    flex: 1,
  },
  app: {
    backgroundColor: "#edf1eb",
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#f9fbf6",
    borderBottomColor: "#d6ded3",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  appTitle: {
    color: "#132017",
    fontSize: 24,
    fontWeight: "900",
  },
  appSubtitle: {
    color: "#526257",
    fontSize: 13,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: "#e6eee5",
    borderColor: "#c9d7ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "800",
  },
  nav: {
    backgroundColor: "#f9fbf6",
    borderBottomColor: "#d6ded3",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  navButton: {
    alignItems: "center",
    borderColor: "#d1dcd0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  navButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  navLabel: {
    color: "#34463a",
    fontSize: 14,
    fontWeight: "800",
  },
  navLabelActive: {
    color: "#ffffff",
  },
  content: {
    padding: 18,
  },
  layoutGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  sidePanel: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 360,
    flexGrow: 1,
    gap: 14,
    padding: 16,
  },
  section: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  sectionTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonSelected: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  actionText: {
    color: "#314339",
    fontSize: 13,
    fontWeight: "900",
  },
  actionTextSelected: {
    color: "#ffffff",
  },
  warningList: {
    gap: 9,
  },
  warningItem: {
    alignItems: "flex-start",
    backgroundColor: "#fff7e6",
    borderColor: "#e0c074",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  warningText: {
    color: "#674017",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  listRow: {
    alignItems: "center",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 13,
  },
  rowTitle: {
    color: "#1d2c22",
    fontSize: 15,
    fontWeight: "900",
  },
  rowMeta: {
    color: "#5b6b61",
    fontSize: 12,
    fontWeight: "700",
  },
  coordinate: {
    color: "#273d2e",
    fontSize: 13,
    fontWeight: "900",
  },
  codeBlock: {
    backgroundColor: "#18221c",
    borderRadius: 8,
    padding: 14,
  },
  codeText: {
    color: "#e5f0e8",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 17,
  },
});
