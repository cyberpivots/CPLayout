import { StatusBar } from "expo-status-bar";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  MapPinned,
  Ruler,
  Save,
  Satellite,
  SlidersHorizontal,
  Settings2,
  WifiOff,
} from "lucide-react-native";
import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CoordinateFormatPanel } from "./src/components/CoordinateFormatPanel";
import { ExpertReviewPanel } from "./src/components/ExpertReviewPanel";
import { MapSurface } from "@cplayout/map-adapters";
import { MetricTile } from "./src/components/MetricTile";
import { ProjectFilesPanel } from "./src/components/ProjectFilesPanel";
import { ProjectStartPanel } from "./src/components/ProjectStartPanel";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { useProjectRepository } from "./src/hooks/useProjectRepository";
import {
  COORDINATE_FORMAT_LABELS,
  createProjectEditorState,
  formatCoordinate,
  mergeAppSettings,
  parseAppSettings,
  projectSettingsFromApp,
  reduceProjectEditorState,
  importGoogleEarthKmlToProject,
  importProjectedGeoJsonToProject,
  importSurveyCsvToProject,
  realCenterPivotProofProject,
  sampleProject,
  type AppSettings,
  type GoogleEarthKmlImportResult,
  type LonLat,
  type ModelRecommendation,
  type PivotMachine,
  type PivotProject,
  type ProjectMapFeature,
  type PivotSweep,
  type XY,
} from "@cplayout/core";
import { evaluateLayout, exportScenarioGeoJson, machineRadiusMeters } from "@cplayout/geometry";
import { formatAreaFromAcres, formatDistance } from "@cplayout/core";

type Tab = "layout" | "survey" | "equipment" | "settings" | "review" | "export";
type Screen = "projects" | "workspace";

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("projects");
  const [tab, setTab] = useState<Tab>("layout");
  const [editor, dispatchProject] = useReducer(reduceProjectEditorState, sampleProject, createProjectEditorState);
  const project = editor.project;
  const [savedRevision, setSavedRevision] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(() => mergeAppSettings(sampleProject.settings));
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const repository = useProjectRepository();
  const result = useMemo(() => evaluateLayout(project), [project]);
  const machineRadius = machineRadiusMeters(project.machine);
  const isDirty = editor.revision !== savedRevision;
  const selectedMapFeature = useMemo(
    () => (project.mapFeatures ?? []).find((feature) => feature.id === selectedMapFeatureId) ?? null,
    [project.mapFeatures, selectedMapFeatureId],
  );

  useEffect(() => {
    if (selectedMapFeatureId && !(project.mapFeatures ?? []).some((feature) => feature.id === selectedMapFeatureId)) {
      setSelectedMapFeatureId(null);
    }
  }, [project.mapFeatures, selectedMapFeatureId]);

  function updateSweep(sweep: PivotSweep): void {
    dispatchProject({ type: "update_machine", machine: { ...project.machine, sweep } });
  }

  function changeEndGun(delta: number): void {
    dispatchProject({
      type: "update_machine",
      machine: {
        ...project.machine,
        endGunThrowMeters: Math.max(0, project.machine.endGunThrowMeters + delta),
      },
    });
  }

  function applyPivotCoordinate(coordinate: XY, wgs84?: LonLat): void {
    dispatchProject({ type: "place_pivot", point: coordinate, wgs84 });
  }

  function applyModelRecommendation(recommendation: ModelRecommendation): void {
    dispatchProject({ type: "apply_model_recommendation", recommendation });
  }

  function commitSettings(nextSettings: AppSettings): void {
    const parsed = parseAppSettings(nextSettings);
    setSettings(parsed);
    dispatchProject({ type: "update_project_settings", unitSystem: parsed.unitSystem, settings: projectSettingsFromApp(parsed) });
  }

  function loadProject(nextProject: PivotProject): void {
    dispatchProject({ type: "load_project", project: nextProject });
    setSavedRevision(0);
    setSettings(mergeAppSettings(nextProject.settings));
    setSelectedMapFeatureId(null);
    setTab("layout");
    setScreen("workspace");
  }

  async function saveCurrentProject(): Promise<void> {
    const saved = await repository.saveProject(project, result);
    if (saved) setSavedRevision(editor.revision);
  }

  async function openSavedProject(projectId: string): Promise<void> {
    const loaded = await repository.openProject(projectId);
    if (loaded) loadProject(loaded);
  }

  function importProjectedGeoJson(geoJson: string): string {
    const imported = importProjectedGeoJsonToProject(project, geoJson);
    dispatchProject({ type: "import_projected_geojson", geoJson });
    const parts = [];
    if (imported.importedBoundary) parts.push("boundary");
    if (imported.importedObstacleCount > 0) parts.push(`${imported.importedObstacleCount} obstacle${imported.importedObstacleCount === 1 ? "" : "s"}`);
    return `Imported projected GeoJSON ${parts.length > 0 ? parts.join(" and ") : "features"} into the current project.`;
  }

  function importSurveyCsv(csv: string): string {
    const imported = importSurveyCsvToProject(project, csv);
    dispatchProject({ type: "import_survey_csv", csv });
    return `Imported ${imported.importedPointCount} survey point${imported.importedPointCount === 1 ? "" : "s"} into the current project.`;
  }

  function previewGoogleEarthKml(kmlText: string, selectedItemIds?: string[]): GoogleEarthKmlImportResult {
    return importGoogleEarthKmlToProject(project, kmlText, { selectedItemIds });
  }

  function applyGoogleEarthKmlImport(nextProject: PivotProject): void {
    dispatchProject({ type: "apply_project_import", project: nextProject });
  }

  function addMapFeature(feature: Omit<ProjectMapFeature, "id"> & { id?: string }): void {
    const id = feature.id ?? `map-feature-${Date.now().toString(36)}-${(project.mapFeatures ?? []).length + 1}`;
    dispatchProject({ type: "add_map_feature", feature: { ...feature, id } });
    setSelectedMapFeatureId(id);
  }

  function updateMapFeatureName(feature: ProjectMapFeature, name: string): void {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === feature.name) return;
    dispatchProject({ type: "update_map_feature", feature: { ...feature, name: trimmedName } });
  }

  function deleteMapFeature(featureId: string): void {
    dispatchProject({ type: "delete_map_feature", id: featureId });
    setSelectedMapFeatureId(null);
  }

  function createNewProject(): void {
    const createdAt = new Date().toISOString();
    loadProject({
      ...sampleProject,
      id: `field-layout-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
      name: "Untitled Field Layout",
      surveyPoints: sampleProject.surveyPoints.map((point) => ({ ...point, observedAt: createdAt })),
    });
  }

  if (screen === "projects") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.app}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.appTitle}>Center Pivot Layout</Text>
              <Text style={styles.appSubtitle}>Offline project workspace</Text>
            </View>
            <View style={styles.statusRow}>
              <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline storage" />
              <StatusPill icon={<Ruler size={15} color="#254234" />} label="Projected XY canonical" />
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <ProjectStartPanel
              onCreate={createNewProject}
              onOpenProject={openSavedProject}
              onOpenRealProof={() => loadProject(realCenterPivotProofProject)}
              onOpenSample={() => loadProject(sampleProject)}
              repository={repository}
            />
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  function formatProjectCoordinate(point: XY): string {
    try {
      return formatCoordinate({ projected: point, projectCrs: project.projectCrs }, settings.coordinateDisplayFormat);
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
            <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline storage" />
            {settings.onlineImagery.enabled ? <StatusPill icon={<Satellite size={15} color="#254234" />} label="Live imagery preview" /> : null}
            <StatusPill icon={<Satellite size={15} color="#254234" />} label={`${settings.gpsQuality.minimumFixType.replaceAll("_", " ")} gate`} />
            <StatusPill icon={<Ruler size={15} color="#254234" />} label={project.projectCrs} />
            <StatusPill icon={<SlidersHorizontal size={15} color="#254234" />} label={COORDINATE_FORMAT_LABELS[settings.coordinateDisplayFormat]} />
            <StatusPill icon={<ClipboardList size={15} color="#254234" />} label={isDirty ? "Unsaved edits" : "Saved"} />
          </View>
          <View style={styles.projectActionRow}>
            <SmallActionButton label={isDirty ? "Save *" : "Save"} onPress={saveCurrentProject} />
            <SmallActionButton label="Projects" onPress={() => setScreen("projects")} />
            <SmallActionButton label="Undo" disabled={editor.past.length === 0} onPress={() => dispatchProject({ type: "undo" })} />
            <SmallActionButton label="Redo" disabled={editor.future.length === 0} onPress={() => dispatchProject({ type: "redo" })} />
          </View>
        </View>

        <View style={styles.nav}>
          <NavButton active={tab === "layout"} icon={<MapPinned size={18} />} label="Layout" onPress={() => setTab("layout")} />
          <NavButton active={tab === "survey"} icon={<Satellite size={18} />} label="Survey" onPress={() => setTab("survey")} />
          <NavButton active={tab === "equipment"} icon={<Settings2 size={18} />} label="Equipment" onPress={() => setTab("equipment")} />
          <NavButton active={tab === "settings"} icon={<SlidersHorizontal size={18} />} label="Settings" onPress={() => setTab("settings")} />
          <NavButton active={tab === "review"} icon={<ClipboardList size={18} />} label="Review" onPress={() => setTab("review")} />
          <NavButton active={tab === "export"} icon={<Download size={18} />} label="Export" onPress={() => setTab("export")} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {tab === "layout" && (
            <View style={styles.layoutGrid}>
              <MapSurface
                project={project}
                result={result}
                settings={settings}
                selectedMapFeatureId={selectedMapFeatureId}
                onCommitBoundaryDraft={(vertices) => dispatchProject({ type: "commit_boundary_draft", vertices })}
                onCommitObstacleDraft={(vertices, kind) => dispatchProject({ type: "commit_obstacle_draft", vertices, kind })}
                onMoveBoundaryVertex={(vertexIndex, point) => dispatchProject({ type: "move_boundary_vertex", vertexIndex, point })}
                onDeleteBoundaryVertex={(vertexIndex) => dispatchProject({ type: "delete_boundary_vertex", vertexIndex })}
                onMoveObstacleVertex={(obstacleId, vertexIndex, point) => dispatchProject({ type: "move_obstacle_vertex", obstacleId, vertexIndex, point })}
                onDeleteObstacleVertex={(obstacleId, vertexIndex) => dispatchProject({ type: "delete_obstacle_vertex", obstacleId, vertexIndex })}
                onPlacePivot={(point) => dispatchProject({ type: "place_pivot", point })}
                onMoveInfrastructurePoint={(pointType, point) => dispatchProject({ type: "move_infrastructure", pointType, point })}
                onAddSurveyPoint={(point) => dispatchProject({ type: "add_survey_point", point })}
                onAddMapFeature={addMapFeature}
                onSelectMapFeature={setSelectedMapFeatureId}
              />
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

                <MapFeatureEditor
                  feature={selectedMapFeature}
                  onDelete={deleteMapFeature}
                  onRename={updateMapFeatureName}
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
                  {editor.lastError ? (
                    <View style={styles.warningItem}>
                      <AlertTriangle size={17} color="#9a4c1c" />
                      <Text style={styles.warningText}>{editor.lastError}</Text>
                    </View>
                  ) : null}
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
                    <View style={styles.inlineActions}>
                      {point.role === "pivot_center" ? <SmallActionButton label="Set Pivot" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "pivot_center" })} /> : null}
                      {point.role === "water_source" ? <SmallActionButton label="Set Water" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "water_source" })} /> : null}
                      {point.role === "power_source" ? <SmallActionButton label="Set Power" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "power_source" })} /> : null}
                      <SmallActionButton label="Delete" onPress={() => dispatchProject({ type: "delete_survey_point", id: point.id })} />
                    </View>
                  </View>
                  <Text style={styles.coordinate}>{formatProjectCoordinate(point.projected)}</Text>
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
              <MachineSettingsForm
                machine={project.machine}
                onChange={(machine) => dispatchProject({ type: "update_machine", machine })}
              />
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

          {tab === "review" && (
            <ExpertReviewPanel
              onApplyRecommendation={applyModelRecommendation}
              project={project}
              result={result}
              settings={settings}
            />
          )}

          {tab === "export" && (
            <Section title="Files and GIS Exchange" icon={<ClipboardList size={20} color="#254234" />}>
              <ProjectFilesPanel
                dirty={isDirty}
                onApplyGoogleEarthKmlImport={applyGoogleEarthKmlImport}
                onDeleteProject={repository.deleteProject}
                onImportProjectedGeoJson={importProjectedGeoJson}
                onImportSurveyCsv={importSurveyCsv}
                onOpenProject={openSavedProject}
                onPreviewGoogleEarthKml={previewGoogleEarthKml}
                onProjectLoaded={loadProject}
                onRefreshProjects={repository.refreshProjects}
                onSaveProject={saveCurrentProject}
                project={project}
                repository={repository}
                result={result}
              />
              <View style={styles.metricGrid}>
                <MetricTile label="Archive" value="ZIP" />
                <MetricTile label="GIS exchange" value="GeoJSON/KML" />
                <MetricTile label="Geometry" value="Projected XY" />
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

function SmallActionButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void | Promise<void> }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallActionButton, disabled && styles.smallActionButtonDisabled]}>
      {label.startsWith("Save") ? <Save size={14} color={disabled ? "#68766d" : "#254234"} /> : null}
      <Text style={[styles.smallActionText, disabled && styles.smallActionTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function MapFeatureEditor({
  feature,
  onDelete,
  onRename,
}: {
  feature: ProjectMapFeature | null;
  onDelete: (featureId: string) => void;
  onRename: (feature: ProjectMapFeature, name: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState(feature?.name ?? "");

  useEffect(() => {
    setName(feature?.name ?? "");
  }, [feature?.id, feature?.name]);

  if (!feature) {
    return (
      <View style={styles.mapFeatureEditor}>
        <Text style={styles.mapFeatureTitle}>Map Feature</Text>
        <Text style={styles.mapFeatureMeta}>Select a utility feature on the map to rename or delete it.</Text>
      </View>
    );
  }

  const geometryLabel = feature.geometry.type === "Point" ? "Point" : `${feature.geometry.vertices.length} point line`;

  return (
    <View style={styles.mapFeatureEditor}>
      <View>
        <Text style={styles.mapFeatureTitle}>Map Feature</Text>
        <Text style={styles.mapFeatureMeta}>{feature.kind.replaceAll("_", " ")} · {geometryLabel}</Text>
      </View>
      <TextInput
        accessibilityLabel="Selected map feature name"
        onChangeText={setName}
        onSubmitEditing={() => onRename(feature, name)}
        style={styles.textInput}
        value={name}
      />
      <View style={styles.inlineActions}>
        <SmallActionButton disabled={name.trim().length === 0 || name.trim() === feature.name} label="Rename" onPress={() => onRename(feature, name)} />
        <SmallActionButton label="Delete" onPress={() => onDelete(feature.id)} />
      </View>
    </View>
  );
}

function MachineSettingsForm({ machine, onChange }: { machine: PivotMachine; onChange: (machine: PivotMachine) => void }): React.JSX.Element {
  const [spans, setSpans] = useState(machine.spanLengthsMeters.join(", "));
  const [overhang, setOverhang] = useState(String(machine.overhangMeters));
  const [endGun, setEndGun] = useState(String(machine.endGunThrowMeters));
  const [towerClearance, setTowerClearance] = useState(String(machine.towerClearanceBufferMeters));
  const [machineClearance, setMachineClearance] = useState(String(machine.machineClearanceBufferMeters));
  const [startAngle, setStartAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.startAngleDegrees) : "210");
  const [stopAngle, setStopAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.stopAngleDegrees) : "35");
  const [direction, setDirection] = useState<"clockwise" | "counterclockwise">(machine.sweep.mode === "partial_circle" ? machine.sweep.direction : "counterclockwise");
  const [mode, setMode] = useState<PivotSweep["mode"]>(machine.sweep.mode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSpans(machine.spanLengthsMeters.join(", "));
    setOverhang(String(machine.overhangMeters));
    setEndGun(String(machine.endGunThrowMeters));
    setTowerClearance(String(machine.towerClearanceBufferMeters));
    setMachineClearance(String(machine.machineClearanceBufferMeters));
    setMode(machine.sweep.mode);
    if (machine.sweep.mode === "partial_circle") {
      setStartAngle(String(machine.sweep.startAngleDegrees));
      setStopAngle(String(machine.sweep.stopAngleDegrees));
      setDirection(machine.sweep.direction);
    }
  }, [machine]);

  function apply(): void {
    try {
      const spanValues = spans.split(",").map((value) => requiredPositiveNumber(value.trim(), "Span length"));
      const nextMachine: PivotMachine = {
        ...machine,
        spanLengthsMeters: spanValues,
        overhangMeters: requiredNonNegativeNumber(overhang, "Overhang"),
        endGunThrowMeters: requiredNonNegativeNumber(endGun, "End gun"),
        towerClearanceBufferMeters: requiredNonNegativeNumber(towerClearance, "Tower clearance"),
        machineClearanceBufferMeters: requiredNonNegativeNumber(machineClearance, "Machine clearance"),
        sweep: mode === "full_circle"
          ? { mode: "full_circle" }
          : {
            mode: "partial_circle",
            startAngleDegrees: requiredFiniteNumber(startAngle, "Start angle"),
            stopAngleDegrees: requiredFiniteNumber(stopAngle, "Stop angle"),
            direction,
          },
      };
      setError(null);
      onChange(nextMachine);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.machineForm}>
      <View style={styles.controlRow}>
        <ActionButton label="Full circle" selected={mode === "full_circle"} onPress={() => setMode("full_circle")} />
        <ActionButton label="Part circle" selected={mode === "partial_circle"} onPress={() => setMode("partial_circle")} />
        <ActionButton label="Apply Machine Settings" selected onPress={apply} />
      </View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.formGrid}>
        <FormField label="Spans (m, comma separated)" value={spans} onChangeText={setSpans} />
        <FormField label="Overhang (m)" value={overhang} onChangeText={setOverhang} />
        <FormField label="End gun throw (m)" value={endGun} onChangeText={setEndGun} />
        <FormField label="Tower clearance (m)" value={towerClearance} onChangeText={setTowerClearance} />
        <FormField label="Machine clearance (m)" value={machineClearance} onChangeText={setMachineClearance} />
        {mode === "partial_circle" ? (
          <>
            <FormField label="Start angle" value={startAngle} onChangeText={setStartAngle} />
            <FormField label="Stop angle" value={stopAngle} onChangeText={setStopAngle} />
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Direction</Text>
              <View style={styles.controlRow}>
                <ActionButton label="CW" selected={direction === "clockwise"} onPress={() => setDirection("clockwise")} />
                <ActionButton label="CCW" selected={direction === "counterclockwise"} onPress={() => setDirection("counterclockwise")} />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function FormField({ label, onChangeText, value }: { label: string; onChangeText: (value: string) => void; value: string }): React.JSX.Element {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        style={styles.textInput}
        value={value}
      />
    </View>
  );
}

function requiredPositiveNumber(value: string, label: string): number {
  const parsed = requiredFiniteNumber(value, label);
  if (parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function requiredNonNegativeNumber(value: string, label: string): number {
  const parsed = requiredFiniteNumber(value, label);
  if (parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

function requiredFiniteNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  return parsed;
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
  projectActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallActionButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  smallActionButtonDisabled: {
    opacity: 0.45,
  },
  smallActionText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  smallActionTextDisabled: {
    color: "#68766d",
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
    flexGrow: 0.8,
    gap: 14,
    padding: 16,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  mapFeatureEditor: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  mapFeatureTitle: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
  },
  mapFeatureMeta: {
    color: "#5b6b61",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
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
  projectList: {
    gap: 10,
  },
  projectCard: {
    backgroundColor: "#f7faf5",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  machineForm: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  formField: {
    flexBasis: 210,
    flexGrow: 1,
    gap: 6,
  },
  formLabel: {
    color: "#3c4f43",
    fontSize: 12,
    fontWeight: "900",
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1d2c22",
    fontSize: 14,
    fontWeight: "800",
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  formError: {
    color: "#8d2b20",
    fontSize: 13,
    fontWeight: "800",
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
