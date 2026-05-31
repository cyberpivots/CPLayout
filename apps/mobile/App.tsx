import { StatusBar } from "expo-status-bar";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FolderOpen,
  Home,
  Layers,
  ListChecks,
  Map as MapIcon,
  MapPinned,
  PackageCheck,
  RotateCcw,
  Ruler,
  Save,
  Satellite,
  SlidersHorizontal,
  Settings2,
  Upload,
  WifiOff,
} from "lucide-react-native";
import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { CoordinateFormatPanel } from "./src/components/CoordinateFormatPanel";
import { BrowserRtkReceiverPanel } from "./src/components/BrowserRtkReceiverPanel";
import { ExpertReviewPanel } from "./src/components/ExpertReviewPanel";
import { MapSurface } from "@cplayout/map-adapters";
import { MetricTile } from "./src/components/MetricTile";
import { ProjectFilesPanel } from "./src/components/ProjectFilesPanel";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { useProjectRepository, type ProjectWorkspaceStatus } from "./src/hooks/useProjectRepository";
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
  improvedCenterPivotReviewProject,
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

type WorkspaceView = "dashboard" | "map" | "survey" | "review" | "files" | "settings";
type Screen = "projects" | "workspace";
type WalkthroughModuleId = "imagery" | "boundary" | "obstacles" | "pivot" | "survey" | "review" | "export";

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("projects");
  const [activeView, setActiveView] = useState<WorkspaceView>("dashboard");
  const [editor, dispatchProject] = useReducer(reduceProjectEditorState, sampleProject, createProjectEditorState);
  const project = editor.project;
  const [savedRevision, setSavedRevision] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(() => browserLocalSettings(sampleProject.settings));
  const [walkthroughProgress, setWalkthroughProgress] = useState<Record<WalkthroughModuleId, boolean>>(() => loadWalkthroughProgress(sampleProject.id));
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const [advisoryRecommendationPreview, setAdvisoryRecommendationPreview] = useState<ModelRecommendation | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const compactLayout = windowWidth < 760;
  const repository = useProjectRepository();
  const result = useMemo(() => evaluateLayout(project), [project]);
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

  function applyModelRecommendation(recommendation: ModelRecommendation): string | null {
    const nextEditor = reduceProjectEditorState(editor, { type: "apply_model_recommendation", recommendation });
    if (nextEditor.lastError) return nextEditor.lastError;
    dispatchProject({ type: "apply_model_recommendation", recommendation });
    setAdvisoryRecommendationPreview(null);
    return null;
  }

  function commitSettings(nextSettings: AppSettings): void {
    const parsed = parseAppSettings(nextSettings);
    setSettings(parsed);
    dispatchProject({ type: "update_project_settings", unitSystem: parsed.unitSystem, settings: projectSettingsFromApp(parsed) });
  }

  function setWorkflowMode(mappingWorkflowMode: AppSettings["mappingWorkflowMode"]): void {
    setSettings((current) => parseAppSettings({ ...current, mappingWorkflowMode }));
  }

  function loadProject(nextProject: PivotProject): void {
    dispatchProject({ type: "load_project", project: nextProject });
    setSavedRevision(0);
    setSettings((current) => browserLocalSettings(nextProject.settings, current));
    setWalkthroughProgress(loadWalkthroughProgress(nextProject.id));
    setSelectedMapFeatureId(null);
    setAdvisoryRecommendationPreview(null);
    setActiveView("dashboard");
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

  function updateWalkthrough(moduleId: WalkthroughModuleId, complete: boolean): void {
    setWalkthroughProgress((current) => {
      const next = { ...current, [moduleId]: complete };
      saveWalkthroughProgress(project.id, next);
      return next;
    });
  }

  function resetWalkthrough(): void {
    const next = emptyWalkthroughProgress();
    saveWalkthroughProgress(project.id, next);
    setWalkthroughProgress(next);
  }

  if (screen === "projects") {
    return (
      <SafeAreaView style={styles.safeArea} testID="launcher-screen">
        <StatusBar style="dark" />
        <View style={styles.app}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.appTitle}>CPLayout</Text>
              <Text style={styles.appSubtitle}>Browser mapping console</Text>
            </View>
            <View style={[styles.statusRow, compactLayout && styles.statusRowCompact]}>
              <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline storage" />
              <StatusPill icon={<Ruler size={15} color="#254234" />} label="Projected XY canonical" />
              <StatusPill icon={<Satellite size={15} color="#254234" />} label={settings.onlineImagery.enabled ? "USGS imagery ready" : "Imagery off"} />
            </View>
          </View>
          <ScrollView contentContainerStyle={[styles.content, compactLayout && styles.contentCompact]}>
            <ProjectDashboard
              compact={compactLayout}
              dirty={isDirty}
              mode="launcher"
              onCreate={createNewProject}
              onOpenFiles={() => {
                setScreen("workspace");
                setActiveView("files");
              }}
              onOpenImprovedProof={() => loadProject(improvedCenterPivotReviewProject)}
              onOpenMap={() => {
                setScreen("workspace");
                setActiveView("map");
              }}
              onOpenProject={openSavedProject}
              onOpenReview={() => {
                setScreen("workspace");
                setActiveView("review");
              }}
              onOpenRealProof={() => loadProject(realCenterPivotProofProject)}
              onOpenSample={() => loadProject(sampleProject)}
              project={project}
              repository={repository}
              result={result}
              settings={settings}
              walkthroughProgress={walkthroughProgress}
              onResetWalkthrough={resetWalkthrough}
              onToggleWalkthrough={updateWalkthrough}
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
      <SafeAreaView style={styles.safeArea} testID="workspace-screen">
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appTitle}>CPLayout</Text>
            <Text style={styles.appSubtitle}>{project.name}</Text>
          </View>
          <View style={[styles.statusRow, compactLayout && styles.statusRowCompact]}>
            <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline storage" />
            {settings.onlineImagery.enabled ? <StatusPill icon={<Satellite size={15} color="#254234" />} label="USGS imagery on" /> : null}
            <StatusPill icon={<MapPinned size={15} color="#254234" />} label={workflowModeLabel(settings.mappingWorkflowMode)} />
            <StatusPill icon={<Satellite size={15} color="#254234" />} label={`${settings.gpsQuality.minimumFixType.replaceAll("_", " ")} gate`} />
            <StatusPill icon={<Ruler size={15} color="#254234" />} label={project.projectCrs} />
            <StatusPill icon={<SlidersHorizontal size={15} color="#254234" />} label={COORDINATE_FORMAT_LABELS[settings.coordinateDisplayFormat]} />
            <StatusPill icon={<ClipboardList size={15} color="#254234" />} label={isDirty ? "Unsaved edits" : "Saved"} testID="project-save-state" />
          </View>
          <View style={[styles.projectActionRow, compactLayout && styles.statusRowCompact]}>
            <SmallActionButton label={isDirty ? "Save *" : "Save"} onPress={saveCurrentProject} />
            <SmallActionButton label="Projects" onPress={() => setScreen("projects")} />
            <SmallActionButton label="Undo" disabled={editor.past.length === 0} onPress={() => dispatchProject({ type: "undo" })} />
            <SmallActionButton label="Redo" disabled={editor.future.length === 0} onPress={() => dispatchProject({ type: "redo" })} />
          </View>
        </View>

        <View style={[styles.workspaceShell, compactLayout && styles.workspaceShellCompact]}>
          <View style={[styles.leftRail, compactLayout && styles.leftRailCompact]}>
            <RailButton active={activeView === "dashboard"} icon={<Home size={18} />} label="Dashboard" onPress={() => setActiveView("dashboard")} testID="workspace-nav-dashboard" />
            <RailButton active={activeView === "map"} icon={<MapPinned size={18} />} label="Map" onPress={() => setActiveView("map")} testID="workspace-nav-map" />
            <RailButton active={activeView === "survey"} icon={<Satellite size={18} />} label="Survey" onPress={() => setActiveView("survey")} testID="workspace-nav-survey" />
            <RailButton active={activeView === "review"} icon={<ClipboardList size={18} />} label="Review" onPress={() => setActiveView("review")} testID="workspace-nav-review" />
            <RailButton active={activeView === "files"} icon={<Download size={18} />} label="Files" onPress={() => setActiveView("files")} testID="workspace-nav-files" />
            <RailButton active={activeView === "settings"} icon={<SlidersHorizontal size={18} />} label="Settings" onPress={() => setActiveView("settings")} testID="workspace-nav-settings" />
          </View>

          <ScrollView style={styles.workspaceScroll} contentContainerStyle={[styles.content, compactLayout && styles.contentCompact]}>
          {activeView === "dashboard" && (
            <ProjectDashboard
              compact={compactLayout}
              dirty={isDirty}
              mode="workspace"
              onCreate={createNewProject}
              onOpenFiles={() => setActiveView("files")}
              onOpenImprovedProof={() => loadProject(improvedCenterPivotReviewProject)}
              onOpenMap={() => setActiveView("map")}
              onOpenProject={openSavedProject}
              onOpenReview={() => setActiveView("review")}
              onOpenRealProof={() => loadProject(realCenterPivotProofProject)}
              onOpenSample={() => loadProject(sampleProject)}
              project={project}
              repository={repository}
              result={result}
              settings={settings}
              walkthroughProgress={walkthroughProgress}
              onResetWalkthrough={resetWalkthrough}
              onToggleWalkthrough={updateWalkthrough}
            />
          )}

          {activeView === "map" && (
            <View style={[styles.layoutGrid, compactLayout && styles.layoutGridCompact]} testID="map-view">
              <MapSurface
                project={project}
                result={result}
                settings={settings}
                selectedMapFeatureId={selectedMapFeatureId}
                advisoryRecommendationPreview={advisoryRecommendationPreview}
                onMappingWorkflowModeChange={setWorkflowMode}
                onCommitBoundaryDraft={(vertices) => dispatchProject({ type: "commit_boundary_draft", vertices })}
                onCommitObstacleDraft={(vertices, kind, confidence) => dispatchProject({ type: "commit_obstacle_draft", vertices, kind, confidence })}
                onMoveBoundaryVertex={(vertexIndex, point) => dispatchProject({ type: "move_boundary_vertex", vertexIndex, point })}
                onDeleteBoundaryVertex={(vertexIndex) => dispatchProject({ type: "delete_boundary_vertex", vertexIndex })}
                onMoveObstacleVertex={(obstacleId, vertexIndex, point) => dispatchProject({ type: "move_obstacle_vertex", obstacleId, vertexIndex, point })}
                onDeleteObstacleVertex={(obstacleId, vertexIndex) => dispatchProject({ type: "delete_obstacle_vertex", obstacleId, vertexIndex })}
                onPlacePivot={(point, wgs84) => dispatchProject({ type: "place_pivot", point, wgs84 })}
                onMoveInfrastructurePoint={(pointType, point, wgs84) => dispatchProject({ type: "move_infrastructure", pointType, point, wgs84 })}
                onAddSurveyPoint={(point) => dispatchProject({ type: "add_survey_point", point })}
                onAddMapFeature={addMapFeature}
                onSelectMapFeature={setSelectedMapFeatureId}
              />
              <View style={[styles.sidePanel, compactLayout && styles.sidePanelCompact]}>
                <Text style={styles.sectionTitle}>Map Inspector</Text>
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

                <Text style={styles.sectionTitle}>Machine</Text>
                <MachineSettingsForm
                  machine={project.machine}
                  onChange={(machine) => dispatchProject({ type: "update_machine", machine })}
                />

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

          {activeView === "survey" && (
            <Section title="Survey Capture Readiness" icon={<Satellite size={20} color="#254234" />} testID="survey-view">
              <BrowserRtkReceiverPanel
                onAddMapFeature={addMapFeature}
                onAddSurveyPoint={(point) => dispatchProject({ type: "add_survey_point", point })}
                onCommitBoundaryDraft={(vertices) => dispatchProject({ type: "commit_boundary_draft", vertices })}
                onCommitObstacleDraft={(vertices, kind, confidence) => dispatchProject({ type: "commit_obstacle_draft", vertices, kind, confidence })}
                project={project}
                settings={settings}
              />
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

          {activeView === "settings" && (
            <SettingsPanel settings={settings} onChange={commitSettings} />
          )}

          {activeView === "review" && (
            <ExpertReviewPanel
              onApplyRecommendation={applyModelRecommendation}
              onPreviewRecommendation={setAdvisoryRecommendationPreview}
              project={project}
              result={result}
              selectedPreviewRecommendationId={advisoryRecommendationPreview?.id ?? null}
              settings={settings}
            />
          )}

          {activeView === "files" && (
            <Section title="Files and GIS Exchange" icon={<ClipboardList size={20} color="#254234" />} testID="files-view">
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
      </View>
    </SafeAreaView>
  );
}

const WALKTHROUGH_STORAGE_KEY = "cplayout.walkthrough-progress.v1";

const WALKTHROUGH_MODULES: Array<{
  id: WalkthroughModuleId;
  title: string;
  checkpoint: string;
}> = [
  { id: "imagery", title: "Setup Imagery", checkpoint: "USGS/default or approved custom source visible with attribution." },
  { id: "boundary", title: "Trace Boundary", checkpoint: "Field boundary draft is reviewed and committed as projected XY." },
  { id: "obstacles", title: "Add Obstacles", checkpoint: "Roads, ditches, buildings, and no-spray zones are marked." },
  { id: "pivot", title: "Place Pivot", checkpoint: "Pivot, water source, and power source are positioned." },
  { id: "survey", title: "Survey Points", checkpoint: "RTK or imported control points meet the configured quality gate." },
  { id: "review", title: "Expert Review", checkpoint: "Review center findings and recommendations are resolved or deferred." },
  { id: "export", title: "Export Package", checkpoint: "ZIP/KML/GeoJSON are exported after saving local edits." },
];

function ProjectDashboard({
  compact,
  dirty,
  mode,
  onCreate,
  onOpenFiles,
  onOpenImprovedProof,
  onOpenMap,
  onOpenProject,
  onOpenRealProof,
  onOpenReview,
  onOpenSample,
  onResetWalkthrough,
  onToggleWalkthrough,
  project,
  repository,
  result,
  settings,
  walkthroughProgress,
}: {
  compact: boolean;
  dirty: boolean;
  mode: "launcher" | "workspace";
  onCreate: () => void;
  onOpenFiles: () => void;
  onOpenImprovedProof: () => void;
  onOpenMap: () => void;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onOpenRealProof: () => void;
  onOpenReview: () => void;
  onOpenSample: () => void;
  onResetWalkthrough: () => void;
  onToggleWalkthrough: (moduleId: WalkthroughModuleId, complete: boolean) => void;
  project: PivotProject;
  repository: ProjectWorkspaceStatus;
  result: ReturnType<typeof evaluateLayout>;
  settings: AppSettings;
  walkthroughProgress: Record<WalkthroughModuleId, boolean>;
}): React.JSX.Element {
  const completedWalkthrough = WALKTHROUGH_MODULES.filter((module) => walkthroughProgress[module.id]).length;
  const warningCount = result.warnings.length + result.metrics.obstacleConflictCount + (result.metrics.outsideFieldAcres > 0 ? 1 : 0);
  const nextStep = recommendedWorkflowStep(project, result, settings, walkthroughProgress, dirty);
  const recentProjects = repository.projects.slice(0, 5);

  return (
    <View style={styles.dashboard} testID={`dashboard-${mode}`}>
      <View style={[styles.dashboardHero, compact && styles.dashboardHeroCompact]}>
        <View style={styles.dashboardIntro}>
          <Text style={styles.dashboardTitle}>{mode === "launcher" ? "Project Dashboard" : project.name}</Text>
          <Text style={styles.dashboardSubtitle}>
            {nextStep}
          </Text>
          <View style={styles.dashboardActions}>
            <SmallActionButton label="Continue Mapping" onPress={onOpenMap} />
            <SmallActionButton label="Expert Review" onPress={onOpenReview} />
            <SmallActionButton label="Export Package" onPress={onOpenFiles} />
          </View>
        </View>
        <View style={styles.dashboardMetricStack}>
          <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} tone="neutral" />
          <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
          <MetricTile label="Machine radius" value={formatDistance(machineRadiusMeters(project.machine), settings.unitSystem)} />
          <MetricTile label="Review warnings" value={`${warningCount}`} tone={warningCount > 0 ? "warn" : "good"} />
        </View>
      </View>

      <View style={styles.dashboardGrid}>
        <DashboardCard
          icon={<Satellite size={20} color="#173428" />}
          testID="dashboard-card-imagery"
          title="Imagery Status"
          value={settings.onlineImagery.enabled ? "USGS live reference enabled" : "Live imagery disabled"}
          detail={settings.onlineImagery.enabled ? "Attribution is shown on-map; imagery is not stored in project files." : "Enable imagery in Settings for browser-local tracing."}
        />
        <DashboardCard
          icon={<Database size={20} color="#173428" />}
          testID="dashboard-card-storage"
          title="Storage"
          value={repository.backendInfo?.backendLabel ?? repository.backendLabel}
          detail={`${repository.statusMessage} · ${dirty ? "unsaved edits" : "export-ready after latest save"}`}
        />
        <DashboardCard
          icon={<PackageCheck size={20} color="#173428" />}
          testID="dashboard-card-export"
          title="Export Readiness"
          value={dirty ? "Save before export" : "Ready to package"}
          detail="Project ZIP excludes browser-local imagery settings, custom drafts, local directories, and walkthrough progress."
        />
        <DashboardCard
          icon={<ListChecks size={20} color="#173428" />}
          testID="dashboard-card-walkthrough"
          title="Walkthrough"
          value={`${completedWalkthrough}/${WALKTHROUGH_MODULES.length} modules`}
          detail="Progress is local-only and is never written into PivotProject or project archives."
        />
      </View>

      <WorkflowWalkthrough
        onReset={onResetWalkthrough}
        onToggle={onToggleWalkthrough}
        progress={walkthroughProgress}
      />

      <View style={styles.dashboardGrid}>
        <View style={styles.dashboardPanel} testID="dashboard-recent-projects">
          <View style={styles.dashboardPanelHeader}>
            <FolderOpen size={19} color="#173428" />
            <Text style={styles.dashboardPanelTitle}>Recent Projects</Text>
          </View>
          <View style={styles.dashboardActions}>
            <SmallActionButton label="Create New" onPress={onCreate} />
            <SmallActionButton label="Open Sample" onPress={onOpenSample} />
            <SmallActionButton label="Real Proof" onPress={onOpenRealProof} />
            <SmallActionButton label="Improved Review" onPress={onOpenImprovedProof} />
          </View>
          {recentProjects.length === 0 ? (
            <Text style={styles.dashboardMuted}>No saved browser projects yet.</Text>
          ) : recentProjects.map((summary) => (
            <Pressable
              accessibilityLabel={`Open recent project ${summary.name}`}
              accessibilityRole="button"
              key={summary.id}
              onPress={() => void onOpenProject(summary.id)}
              style={styles.recentProjectRow}
              testID={`recent-project-${summary.id}`}
            >
              <View>
                <Text style={styles.rowTitle}>{summary.name}</Text>
                <Text style={styles.rowMeta}>{summary.projectCrs} · {summary.unitSystem.replaceAll("_", " ")} · {new Date(summary.updatedAt).toLocaleString()}</Text>
              </View>
              <FolderOpen size={18} color="#173428" />
            </Pressable>
          ))}
        </View>

        <View style={styles.dashboardPanel} testID="dashboard-review-warnings">
          <View style={styles.dashboardPanelHeader}>
            <AlertTriangle size={19} color="#173428" />
            <Text style={styles.dashboardPanelTitle}>Review Warnings</Text>
          </View>
          {editorWarningRows(result).length === 0 ? (
            <Text style={styles.dashboardMuted}>No active layout warnings.</Text>
          ) : editorWarningRows(result).map((warning) => (
            <View key={warning} style={styles.warningItem}>
              <AlertTriangle size={17} color="#9a4c1c" />
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function WorkflowWalkthrough({
  onReset,
  onToggle,
  progress,
}: {
  onReset: () => void;
  onToggle: (moduleId: WalkthroughModuleId, complete: boolean) => void;
  progress: Record<WalkthroughModuleId, boolean>;
}): React.JSX.Element {
  return (
    <View style={[styles.dashboardPanel, styles.walkthroughPanel]}>
      <View style={styles.dashboardPanelHeader}>
        <ListChecks size={19} color="#173428" />
        <Text style={styles.dashboardPanelTitle}>Workflow Walkthrough</Text>
        <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
          <RotateCcw size={14} color="#173428" />
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>
      <View style={styles.walkthroughGrid}>
        {WALKTHROUGH_MODULES.map((module) => {
          const complete = progress[module.id];
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: complete }}
              key={module.id}
              onPress={() => onToggle(module.id, !complete)}
              style={[styles.walkthroughModule, complete && styles.walkthroughModuleComplete]}
              testID={`walkthrough-module-${module.id}`}
            >
              {complete ? <CheckCircle2 size={18} color="#0f5e3d" /> : <Upload size={18} color="#6b796f" />}
              <View style={styles.walkthroughText}>
                <Text style={styles.walkthroughTitle}>{module.title}</Text>
                <Text style={styles.walkthroughCheckpoint}>{module.checkpoint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DashboardCard({ detail, icon, testID, title, value }: { detail: string; icon: React.ReactNode; testID?: string; title: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.dashboardCard} testID={testID}>
      <View style={styles.dashboardPanelHeader}>
        {icon}
        <Text style={styles.dashboardCardTitle}>{title}</Text>
      </View>
      <Text style={styles.dashboardCardValue}>{value}</Text>
      <Text style={styles.dashboardMuted}>{detail}</Text>
    </View>
  );
}

function recommendedWorkflowStep(
  project: PivotProject,
  result: ReturnType<typeof evaluateLayout>,
  settings: AppSettings,
  progress: Record<WalkthroughModuleId, boolean>,
  dirty: boolean,
): string {
  if (dirty) return "Next: save local edits and export a project package.";
  if (!settings.onlineImagery.enabled) return "Next: keep offline overlay or enable approved no-key imagery in Settings.";
  if (!progress.imagery) return "Next: confirm imagery attribution and live-source status.";
  if (project.fieldBoundary.length < 3 || !progress.boundary) return "Next: trace or review the field boundary in Edit Geometry.";
  if (project.obstacles.length === 0 || !progress.obstacles) return "Next: add visible obstacles and no-spray zones.";
  if (!progress.pivot) return "Next: place pivot, water source, and power source.";
  if (project.surveyPoints.length === 0 || !progress.survey) return "Next: capture or import survey/control points.";
  if (result.warnings.length > 0 || result.metrics.obstacleConflictCount > 0 || !progress.review) return "Next: open Expert Review Center and resolve findings.";
  if (!progress.export) return "Next: save local edits and export a project package.";
  return "Project is ready for repeat review, export, or field handoff.";
}

function editorWarningRows(result: ReturnType<typeof evaluateLayout>): string[] {
  return [
    ...result.warnings,
    ...(result.metrics.obstacleConflictCount > 0 ? [`${result.metrics.obstacleConflictCount} obstacle conflict${result.metrics.obstacleConflictCount === 1 ? "" : "s"} detected.`] : []),
    ...(result.metrics.outsideFieldAcres > 0 ? [`${result.metrics.outsideFieldAcres.toFixed(2)} acres of wet coverage are outside the field.`] : []),
  ];
}

function browserLocalSettings(settings?: PivotProject["settings"], current?: AppSettings): AppSettings {
  const merged = mergeAppSettings(settings);
  if (current) {
    return {
      ...merged,
      onlineImagery: current.onlineImagery,
    };
  }
  if (Platform.OS !== "web") return merged;
  return {
    ...merged,
    onlineImagery: {
      ...merged.onlineImagery,
      enabled: true,
      providerId: "usgs_imagery_only",
      maxTilesPerView: Math.min(64, merged.onlineImagery.maxTilesPerView),
    },
  };
}

function emptyWalkthroughProgress(): Record<WalkthroughModuleId, boolean> {
  return {
    imagery: false,
    boundary: false,
    obstacles: false,
    pivot: false,
    survey: false,
    review: false,
    export: false,
  };
}

function loadWalkthroughProgress(projectId: string): Record<WalkthroughModuleId, boolean> {
  const empty = emptyWalkthroughProgress();
  if (Platform.OS !== "web") return empty;
  try {
    const raw = globalThis.localStorage?.getItem(walkthroughStorageKey(projectId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<WalkthroughModuleId, boolean>>;
    return {
      imagery: parsed.imagery === true,
      boundary: parsed.boundary === true,
      obstacles: parsed.obstacles === true,
      pivot: parsed.pivot === true,
      survey: parsed.survey === true,
      review: parsed.review === true,
      export: parsed.export === true,
    };
  } catch {
    return empty;
  }
}

function saveWalkthroughProgress(projectId: string, progress: Record<WalkthroughModuleId, boolean>): void {
  if (Platform.OS !== "web") return;
  try {
    globalThis.localStorage?.setItem(walkthroughStorageKey(projectId), JSON.stringify(progress));
  } catch {
    // Local progress is optional and must not block project work.
  }
}

function walkthroughStorageKey(projectId: string): string {
  return `${WALKTHROUGH_STORAGE_KEY}.${projectId}`;
}

function workflowModeLabel(mode: AppSettings["mappingWorkflowMode"]): string {
  return mode === "design" ? "Edit Geometry" : "Review Layout";
}

function Section({ title, icon, children, testID }: { title: string; icon: React.ReactNode; children: React.ReactNode; testID?: string }): React.JSX.Element {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatusPill({ icon, label, testID }: { icon: React.ReactNode; label: string; testID?: string }): React.JSX.Element {
  return (
    <View style={styles.statusPill} testID={testID}>
      {icon}
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function RailButton({ active, icon, label, onPress, testID }: { active: boolean; icon: React.ReactNode; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  const tintedIcon = React.isValidElement<{ color?: string }>(icon)
    ? React.cloneElement(icon, { color: active ? "#ffffff" : "#d5e2db" })
    : icon;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.railButton, active && styles.railButtonActive]} testID={testID}>
      {tintedIcon}
      <Text style={[styles.railLabel, active && styles.railLabelActive]}>{label}</Text>
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
    flexShrink: 1,
    gap: 8,
    maxWidth: "100%",
  },
  statusRowCompact: {
    width: "100%",
  },
  projectActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    gap: 8,
    maxWidth: "100%",
  },
  workspaceShell: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  workspaceShellCompact: {
    flexDirection: "column",
  },
  leftRail: {
    backgroundColor: "#13211b",
    borderRightColor: "#26392f",
    borderRightWidth: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 12,
    width: 148,
  },
  leftRailCompact: {
    borderRightWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    width: "100%",
  },
  workspaceScroll: {
    flex: 1,
  },
  railButton: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  railButtonActive: {
    backgroundColor: "#2f6f5b",
    borderColor: "#6da992",
  },
  railLabel: {
    color: "#d5e2db",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
  },
  railLabelActive: {
    color: "#ffffff",
  },
  smallActionButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
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
  contentCompact: {
    padding: 10,
  },
  layoutGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    width: "100%",
  },
  layoutGridCompact: {
    gap: 12,
  },
  sidePanel: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 360,
    flexGrow: 0.8,
    flexShrink: 1,
    gap: 14,
    minWidth: 0,
    padding: 16,
  },
  sidePanelCompact: {
    flexBasis: "100%",
    width: "100%",
  },
  dashboard: {
    gap: 14,
  },
  dashboardHero: {
    alignItems: "stretch",
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
    padding: 16,
  },
  dashboardHeroCompact: {
    padding: 12,
  },
  dashboardIntro: {
    flex: 1,
    gap: 10,
    minWidth: 260,
  },
  dashboardTitle: {
    color: "#121d17",
    fontSize: 24,
    fontWeight: "900",
  },
  dashboardSubtitle: {
    color: "#44564b",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  dashboardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dashboardMetricStack: {
    flexBasis: 360,
    flexDirection: "row",
    flexGrow: 1,
    flexWrap: "wrap",
    gap: 10,
  },
  dashboardGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dashboardPanel: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 360,
    flexGrow: 1,
    gap: 12,
    minWidth: 0,
    padding: 14,
  },
  walkthroughPanel: {
    flexBasis: "auto",
    flexGrow: 0,
  },
  dashboardPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dashboardPanelTitle: {
    color: "#17241c",
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  dashboardCard: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 240,
    flexGrow: 1,
    gap: 8,
    minWidth: 0,
    padding: 14,
  },
  dashboardCardTitle: {
    color: "#17241c",
    fontSize: 13,
    fontWeight: "900",
  },
  dashboardCardValue: {
    color: "#14221b",
    fontSize: 18,
    fontWeight: "900",
  },
  dashboardMuted: {
    color: "#56685d",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  recentProjectRow: {
    alignItems: "center",
    backgroundColor: "#f6faf5",
    borderColor: "#dce4da",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 12,
  },
  walkthroughGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  walkthroughModule: {
    alignItems: "flex-start",
    backgroundColor: "#f6faf5",
    borderColor: "#dce4da",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 240,
    flexDirection: "row",
    flexGrow: 1,
    gap: 9,
    padding: 12,
  },
  walkthroughModuleComplete: {
    backgroundColor: "#edf7f0",
    borderColor: "#9cc8ad",
  },
  walkthroughText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  walkthroughTitle: {
    color: "#17241c",
    fontSize: 13,
    fontWeight: "900",
  },
  walkthroughCheckpoint: {
    color: "#58675e",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  resetButton: {
    alignItems: "center",
    backgroundColor: "#eef4ef",
    borderColor: "#c7d6ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  resetButtonText: {
    color: "#173428",
    fontSize: 11,
    fontWeight: "900",
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
