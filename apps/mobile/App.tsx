import { StatusBar } from "expo-status-bar";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Calculator,
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
  Upload,
  UserRound,
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
import {
  ConfirmActionDialog,
  CustomerProfileDialog,
  MoveProjectDialog,
  ProjectCatalogDialog,
  type CustomerProfileDialogValue,
  type ProjectCatalogDialogMode,
} from "./src/components/ProjectCatalogDialog";
import { ProjectFilesPanel } from "./src/components/ProjectFilesPanel";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { useProjectRepository, type ProjectWorkspaceStatus } from "./src/hooks/useProjectRepository";
import type { CustomerRecord } from "@cplayout/project-store";
import {
  COORDINATE_FORMAT_LABELS,
  MACHINE_CATALOG_PRESETS,
  applyMachineCatalogPreset,
  createProjectEditorState,
  defaultProjectSettings,
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
  type ProjectEditorAction,
  type ProjectMapFeature,
  type ProjectMapFeatureKind,
  type PivotSweep,
  type XY,
} from "@cplayout/core";
import { buildDesignScenarioPreview, evaluateLayout, exportScenarioGeoJson, machineRadiusMeters, type DesignScenarioPreview, type DrawingLayerType, type DrawingMode } from "@cplayout/geometry";
import { formatAreaFromAcres, formatDistance, formatDistanceInputValue, formatFeetInches, parseDistanceInput } from "@cplayout/core";

type WorkspaceView = "dashboard" | "map" | "survey" | "review" | "files" | "settings";
type Screen = "projects" | "workspace";
type WalkthroughModuleId = "imagery" | "boundary" | "obstacles" | "pivot" | "survey" | "review" | "export";

function createBlankDesignProject(settings: AppSettings): PivotProject {
  const timestamp = new Date().toISOString();
  const compactTimestamp = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  const origin = { x: 501000, y: 4506200 };
  const fieldBoundary = [
    { x: origin.x, y: origin.y },
    { x: origin.x + 400, y: origin.y },
    { x: origin.x + 400, y: origin.y + 400 },
    { x: origin.x, y: origin.y + 400 },
  ];

  return {
    id: `blank-design-${compactTimestamp}`,
    name: "Blank Field Design",
    projectCrs: "EPSG:32613",
    unitSystem: settings.unitSystem,
    settings: defaultProjectSettings(),
    fieldBoundary,
    pivotCenter: { x: origin.x + 200, y: origin.y + 200 },
    waterSource: { x: origin.x + 160, y: origin.y + 160 },
    powerSource: { x: origin.x + 40, y: origin.y + 360 },
    machine: {
      id: "blank-design-machine",
      name: "Blank concept pivot",
      spanLengthsMeters: [55, 55, 55],
      overhangMeters: 15,
      endGunThrowMeters: 0,
      endGunAngleRanges: [],
      towerClearanceBufferMeters: 5,
      machineClearanceBufferMeters: 8,
      sweep: { mode: "full_circle" },
    },
    obstacles: [],
    surveyPoints: [],
    mapPackages: [],
    mapFeatures: [],
  };
}

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("workspace");
  const [activeView, setActiveView] = useState<WorkspaceView>("map");
  const [editor, dispatchProject] = useReducer(reduceProjectEditorState, sampleProject, createProjectEditorState);
  const project = editor.project;
  const [savedRevision, setSavedRevision] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(() => browserLocalSettings(sampleProject.settings));
  const [walkthroughProgress, setWalkthroughProgress] = useState<Record<WalkthroughModuleId, boolean>>(() => loadWalkthroughProgress(sampleProject.id));
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const [advisoryRecommendationPreview, setAdvisoryRecommendationPreview] = useState<ModelRecommendation | null>(null);
  const [designScenarioPreview, setDesignScenarioPreview] = useState<DesignScenarioPreview[] | null>(null);
  const [guidedMapTool, setGuidedMapTool] = useState<{
    activeLayer: DrawingLayerType;
    featureKind?: ProjectMapFeatureKind;
    mode: DrawingMode;
    requestId: number;
  } | null>(null);
  const [homeMapView, setHomeMapView] = useState(true);
  const [activeCatalogContext, setActiveCatalogContext] = useState<{
    customerId: string | null;
    projectId: string | null;
    fieldMapId: string | null;
    designId: string | null;
  }>({ customerId: null, projectId: null, fieldMapId: null, designId: null });
  const [catalogDialogMode, setCatalogDialogMode] = useState<ProjectCatalogDialogMode | null>(null);
  const [catalogDialogDefaultName, setCatalogDialogDefaultName] = useState("");
  const [customerProfileDialogMode, setCustomerProfileDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [catalogDialogSubmitting, setCatalogDialogSubmitting] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const compactLayout = windowWidth < 760;
  const repository = useProjectRepository();
  const result = useMemo(() => evaluateLayout(project), [project]);
  const isDirty = editor.revision !== savedRevision;
  const selectedMapFeature = useMemo(
    () => (project.mapFeatures ?? []).find((feature) => feature.id === selectedMapFeatureId) ?? null,
    [project.mapFeatures, selectedMapFeatureId],
  );
  const selectedCustomer = activeCatalogContext.customerId
    ? repository.catalog.customers.find((customer) => customer.id === activeCatalogContext.customerId) ?? null
    : null;
  const editingCustomer = editingCustomerId
    ? repository.catalog.customers.find((customer) => customer.id === editingCustomerId) ?? null
    : null;
  const renamingProject = renamingProjectId
    ? repository.catalog.projects.find((record) => record.id === renamingProjectId) ?? null
    : null;
  const movingProject = movingProjectId
    ? repository.catalog.projects.find((record) => record.id === movingProjectId) ?? null
    : null;
  const deletingProject = deletingProjectId
    ? repository.catalog.projects.find((record) => record.id === deletingProjectId) ?? null
    : null;
  const deletingCustomer = deletingCustomerId
    ? repository.catalog.customers.find((customer) => customer.id === deletingCustomerId) ?? null
    : null;

  useEffect(() => {
    if (selectedMapFeatureId && !(project.mapFeatures ?? []).some((feature) => feature.id === selectedMapFeatureId)) {
      setSelectedMapFeatureId(null);
    }
  }, [project.mapFeatures, selectedMapFeatureId]);

  useEffect(() => {
    setDesignScenarioPreview(null);
  }, [editor.revision]);

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

  function dispatchProjectWithResult(action: ProjectEditorAction): boolean {
    const nextEditor = reduceProjectEditorState(editor, action);
    dispatchProject(action);
    return nextEditor.lastError === null;
  }

  function calculateDesignScenarios(): void {
    setDesignScenarioPreview(buildDesignScenarioPreview(project, { maxOptimizedCandidates: 3 }));
  }

  function commitSettings(nextSettings: AppSettings): void {
    const parsed = parseAppSettings(nextSettings);
    setSettings(parsed);
    dispatchProject({ type: "update_project_settings", unitSystem: parsed.unitSystem, settings: projectSettingsFromApp(parsed) });
  }

  function setWorkflowMode(mappingWorkflowMode: AppSettings["mappingWorkflowMode"]): void {
    setSettings((current) => parseAppSettings({ ...current, mappingWorkflowMode }));
  }

  function loadProject(nextProject: PivotProject, context?: Partial<typeof activeCatalogContext>): void {
    dispatchProject({ type: "load_project", project: nextProject });
    setSavedRevision(0);
    setSettings((current) => browserLocalSettings(nextProject.settings, current));
    setWalkthroughProgress(loadWalkthroughProgress(nextProject.id));
    setSelectedMapFeatureId(null);
    setAdvisoryRecommendationPreview(null);
    setHomeMapView(false);
    setActiveView("map");
    setWorkflowMode("design");
    if (context) {
      setActiveCatalogContext((current) => ({ ...current, ...context }));
    }
    setScreen("workspace");
  }

  function loadProjectDashboard(nextProject: PivotProject, context?: Partial<typeof activeCatalogContext>): void {
    loadProject(nextProject, context);
    setActiveView("dashboard");
  }

  function startBlankDesign(): void {
    loadProject(createBlankDesignProject(settings), {
      customerId: null,
      projectId: null,
      fieldMapId: null,
      designId: null,
    });
  }

  async function saveCurrentProject(): Promise<void> {
    const saved = activeCatalogContext.designId
      ? await repository.saveDesignProject(activeCatalogContext.designId, project, result)
      : await repository.saveProject(project, result);
    if (saved) setSavedRevision(editor.revision);
  }

  async function openSavedProject(projectId: string): Promise<void> {
    const loaded = await repository.openProject(projectId);
    if (!loaded) return;
    const design = repository.catalog.designs.find((record) => record.pivotProjectId === projectId) ?? null;
    const fieldMap = design ? repository.catalog.fieldMaps.find((record) => record.id === design.fieldMapId) ?? null : null;
    const projectRecord = repository.catalog.projects.find((record) => record.id === (fieldMap?.projectId ?? projectId)) ?? null;
    loadProject(loaded, {
      customerId: projectRecord?.customerId ?? activeCatalogContext.customerId,
      projectId: fieldMap?.projectId ?? projectId,
      fieldMapId: fieldMap?.id ?? null,
      designId: design?.id ?? null,
    });
  }

  async function openDesignProject(designId: string): Promise<void> {
    const loaded = await repository.openDesignProject(designId);
    if (!loaded) return;
    const design = repository.catalog.designs.find((record) => record.id === designId) ?? null;
    const fieldMap = design ? repository.catalog.fieldMaps.find((record) => record.id === design.fieldMapId) ?? null : null;
    const projectRecord = fieldMap ? repository.catalog.projects.find((record) => record.id === fieldMap.projectId) ?? null : null;
    loadProject(loaded, {
      customerId: projectRecord?.customerId ?? activeCatalogContext.customerId,
      projectId: fieldMap?.projectId ?? null,
      fieldMapId: fieldMap?.id ?? null,
      designId,
    });
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

  function updateMapFeature(feature: ProjectMapFeature): void {
    dispatchProject({ type: "update_map_feature", feature });
  }

  function deleteMapFeature(featureId: string): void {
    dispatchProject({ type: "delete_map_feature", id: featureId });
    setSelectedMapFeatureId(null);
  }

  function activateGuidedMapTool(mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind): void {
    setWorkflowMode("design");
    setGuidedMapTool((current) => ({
      activeLayer,
      featureKind,
      mode,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function routeToCustomerSelection(): void {
    showCatalogMap(
      { customerId: activeCatalogContext.customerId, projectId: null, fieldMapId: null, designId: null },
      "Select or create a customer folder, then use New Project inside that customer.",
    );
  }

  function openCatalogDialog(mode: ProjectCatalogDialogMode): void {
    if (mode === "customer") {
      openCustomerCreateDialog();
      return;
    }
    if (mode === "project" && !selectedCustomer) {
      routeToCustomerSelection();
      return;
    }
    setCatalogDialogDefaultName(defaultCatalogDialogName(mode));
    setCatalogDialogMode(mode);
  }

  function openCustomerCreateDialog(): void {
    setCatalogNotice(null);
    setEditingCustomerId(null);
    setCustomerProfileDialogMode("create");
  }

  function openCustomerEditDialog(customerId: string): void {
    setCatalogNotice(null);
    setEditingCustomerId(customerId);
    setCustomerProfileDialogMode("edit");
  }

  async function submitCatalogDialog(name: string): Promise<void> {
    if (!catalogDialogMode || catalogDialogSubmitting) return;
    setCatalogDialogSubmitting(true);
    try {
      if (catalogDialogMode === "project") await createProjectFolder(name);
      if (catalogDialogMode === "fieldMap") await createFieldMapForProject(name);
      if (catalogDialogMode === "design") await createDesignForFieldMap(name);
      setCatalogDialogMode(null);
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  function closeCatalogDialog(): void {
    if (catalogDialogSubmitting) return;
    setCatalogDialogMode(null);
  }

  function defaultCatalogDialogName(mode: ProjectCatalogDialogMode): string {
    if (mode === "customer") return `Customer ${repository.catalog.customers.length + 1}`;
    if (mode === "project") return `Untitled Project ${repository.catalog.projects.length + 1}`;
    if (mode === "fieldMap") {
      const projectId = activeCatalogContext.projectId;
      const siblingCount = repository.catalog.fieldMaps.filter((record) => record.projectId === projectId).length;
      return `Field Map ${siblingCount + 1}`;
    }
    const fieldMapId = activeCatalogContext.fieldMapId;
    const siblingCount = repository.catalog.designs.filter((record) => record.fieldMapId === fieldMapId).length;
    return `Design ${siblingCount + 1}`;
  }

  function catalogDialogContextPreview(mode: ProjectCatalogDialogMode): string {
    if (mode === "customer") return "Saved under: Project Catalog";
    if (mode === "project") {
      return selectedCustomer ? `Saved under: ${selectedCustomer.displayName}` : "Select a customer folder before creating a project.";
    }
    if (mode === "fieldMap") {
      const projectRecord = activeCatalogContext.projectId
        ? repository.catalog.projects.find((record) => record.id === activeCatalogContext.projectId) ?? null
        : null;
      return formatCatalogPath(projectRecord ? catalogPathForProject(projectRecord.id) : []);
    }
    const fieldMap = activeCatalogContext.fieldMapId
      ? repository.catalog.fieldMaps.find((record) => record.id === activeCatalogContext.fieldMapId) ?? null
      : null;
    return formatCatalogPath(fieldMap ? [...catalogPathForProject(fieldMap.projectId), fieldMap.name] : []);
  }

  function catalogPathForProject(projectId: string): string[] {
    const projectRecord = repository.catalog.projects.find((record) => record.id === projectId) ?? null;
    const customer = projectRecord
      ? repository.catalog.customers.find((record) => record.id === projectRecord.customerId) ?? null
      : null;
    return [customer?.displayName, projectRecord?.name].filter((part): part is string => Boolean(part));
  }

  function formatCatalogPath(parts: string[]): string {
    return `Saved under: ${parts.length > 0 ? parts.join(" > ") : "Project Catalog"}`;
  }

  async function submitCustomerProfile(value: CustomerProfileDialogValue): Promise<void> {
    if (!customerProfileDialogMode || catalogDialogSubmitting) return;
    setCatalogDialogSubmitting(true);
    try {
      if (customerProfileDialogMode === "create") {
        const customer = await repository.createCustomer(value);
        if (customer) {
          showCatalogMap({ customerId: customer.id, projectId: null, fieldMapId: null, designId: null });
        }
      } else if (editingCustomerId) {
        const customer = await repository.updateCustomer({ id: editingCustomerId, ...value });
        if (customer) setCatalogNotice(null);
      }
      setCustomerProfileDialogMode(null);
      setEditingCustomerId(null);
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  function closeCustomerProfileDialog(): void {
    if (catalogDialogSubmitting) return;
    setCustomerProfileDialogMode(null);
    setEditingCustomerId(null);
  }

  async function createProjectFolder(name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const customer = selectedCustomer;
    if (!customer) {
      routeToCustomerSelection();
      return;
    }
    const createdAt = new Date().toISOString();
    const projectId = `project-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const fieldMapId = `${projectId}:field-map:primary`;
    const created = await repository.createProjectWithInitialFieldMap({
      customerId: customer.id,
      projectId,
      projectName: trimmedName,
      projectCrs: project.projectCrs,
      unitSystem: settings.unitSystem,
      fieldMapId,
      fieldMapName: "Primary Field Map",
    });
    if (created) {
      showCatalogMap({
        customerId: customer.id,
        projectId: created.projectRecord.id,
        fieldMapId: created.fieldMap.id,
        designId: null,
      });
    }
  }

  async function createFieldMapForProject(name: string, projectId = activeCatalogContext.projectId): Promise<void> {
    const fieldName = name.trim();
    if (!fieldName) return;
    const projectRecord = projectId ? repository.catalog.projects.find((record) => record.id === projectId) ?? null : null;
    if (!projectRecord) return;
    const createdAt = new Date().toISOString();
    const fieldMapId = `${projectRecord.id}:field-map:${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const fieldMap = await repository.createFieldMapRecord({ id: fieldMapId, projectId: projectRecord.id, name: fieldName });
    if (fieldMap) {
      showCatalogMap({
        customerId: projectRecord.customerId,
        projectId: projectRecord.id,
        fieldMapId: fieldMap.id,
        designId: null,
      });
    }
  }

  async function createDesignForFieldMap(name: string, fieldMapId = activeCatalogContext.fieldMapId): Promise<void> {
    const designName = name.trim();
    if (!designName) return;
    const fieldMap = fieldMapId ? repository.catalog.fieldMaps.find((record) => record.id === fieldMapId) ?? null : null;
    if (!fieldMap) return;
    const projectRecord = repository.catalog.projects.find((record) => record.id === fieldMap.projectId) ?? null;
    if (!projectRecord) return;
    showCatalogMap(
      {
        customerId: projectRecord.customerId,
        projectId: projectRecord.id,
        fieldMapId: fieldMap.id,
        designId: null,
      },
      `Design creation for ${designName} starts after a map is imported or the real design initialization workflow is implemented.`,
    );
  }

  async function openFieldMap(fieldMapId: string): Promise<void> {
    const design = repository.catalog.designs.find((record) => record.fieldMapId === fieldMapId && record.isActive)
      ?? repository.catalog.designs.find((record) => record.fieldMapId === fieldMapId)
      ?? null;
    if (design) await openDesignProject(design.id);
    else selectFieldMapCatalogOnly(fieldMapId);
  }

  async function renameProjectFolder(projectId: string, name: string): Promise<void> {
    if (catalogDialogSubmitting) return;
    setCatalogDialogSubmitting(true);
    try {
      const updatedProjectRecord = await repository.renameProject(projectId, name);
      if (!updatedProjectRecord) return;
      if (project.id === projectId) {
        dispatchProject({ type: "load_project", project: { ...project, name: updatedProjectRecord.name } });
        setSavedRevision(0);
      }
      setRenamingProjectId(null);
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  async function moveProjectFolder(projectId: string, customerId: string): Promise<void> {
    if (catalogDialogSubmitting) return;
    setCatalogDialogSubmitting(true);
    try {
      const moved = await repository.moveProjectToCustomer(projectId, customerId);
      if (!moved) return;
      if (activeCatalogContext.projectId === projectId) {
        setActiveCatalogContext((current) => ({ ...current, customerId }));
      }
      setMovingProjectId(null);
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  async function confirmDeleteProject(): Promise<void> {
    if (!deletingProjectId || catalogDialogSubmitting) return;
    const projectId = deletingProjectId;
    setCatalogDialogSubmitting(true);
    try {
      const deleted = await repository.deleteProject(projectId);
      if (deleted) {
        if (activeCatalogContext.projectId === projectId || project.id === projectId) {
          showCatalogMap({ customerId: activeCatalogContext.customerId, projectId: null, fieldMapId: null, designId: null });
        }
        setDeletingProjectId(null);
      }
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  async function confirmDeleteCustomer(): Promise<void> {
    if (!deletingCustomerId || catalogDialogSubmitting) return;
    const customerId = deletingCustomerId;
    setCatalogDialogSubmitting(true);
    try {
      const deleted = await repository.deleteCustomer(customerId);
      if (deleted) {
        if (activeCatalogContext.customerId === customerId) {
          setActiveCatalogContext({ customerId: null, projectId: null, fieldMapId: null, designId: null });
        }
        setDeletingCustomerId(null);
      }
    } finally {
      setCatalogDialogSubmitting(false);
    }
  }

  function selectCustomerFolder(customerId: string): void {
    showCatalogMap({ customerId, projectId: null, fieldMapId: null, designId: null });
  }

  function selectProjectCatalogOnly(projectId: string): void {
    const record = repository.catalog.projects.find((candidate) => candidate.id === projectId) ?? null;
    showCatalogMap({
      customerId: record?.customerId ?? activeCatalogContext.customerId,
      projectId,
      fieldMapId: null,
      designId: null,
    });
  }

  function selectFieldMapCatalogOnly(fieldMapId: string): void {
    const fieldMap = repository.catalog.fieldMaps.find((record) => record.id === fieldMapId) ?? null;
    const projectRecord = fieldMap
      ? repository.catalog.projects.find((record) => record.id === fieldMap.projectId) ?? null
      : null;
    showCatalogMap(
      {
        customerId: projectRecord?.customerId ?? activeCatalogContext.customerId,
        projectId: fieldMap?.projectId ?? activeCatalogContext.projectId,
        fieldMapId,
        designId: null,
      },
      fieldMap ? `${fieldMap.name} has ${repository.catalog.designs.filter((record) => record.fieldMapId === fieldMap.id).length} designs.` : null,
    );
  }

  function showCatalogMap(context: Partial<typeof activeCatalogContext>, notice: string | null = null): void {
    setScreen("workspace");
    setActiveView("map");
    setHomeMapView(true);
    setWorkflowMode("layout");
    setCatalogNotice(notice);
    setSelectedMapFeatureId(null);
    setAdvisoryRecommendationPreview(null);
    setActiveCatalogContext((current) => ({ ...current, ...context }));
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
              onCreate={routeToCustomerSelection}
              onOpenFiles={() => {
                setScreen("workspace");
                setActiveView("files");
              }}
              onOpenImprovedProof={() => loadProjectDashboard(improvedCenterPivotReviewProject)}
              onInspectMap={() => {
                setWorkflowMode("layout");
                setScreen("workspace");
                setActiveView("map");
              }}
              onOpenMap={() => {
                setScreen("workspace");
                setActiveView("map");
              }}
              onOpenProject={openSavedProject}
              onOpenReview={() => {
                setScreen("workspace");
                setActiveView("review");
              }}
              onOpenRealProof={() => loadProjectDashboard(realCenterPivotProofProject)}
              onOpenSample={() => loadProjectDashboard(sampleProject)}
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
            <Text style={styles.appSubtitle}>{homeMapView ? "North America project catalog" : project.name}</Text>
          </View>
          <View style={[styles.statusRow, compactLayout && styles.statusRowCompact]}>
            <StatusPill icon={<WifiOff size={15} color="#254234" />} label="Offline storage" />
            {settings.onlineImagery.enabled ? <StatusPill icon={<Satellite size={15} color="#254234" />} label="USGS imagery on" /> : null}
            <StatusPill icon={<MapPinned size={15} color="#254234" />} label={homeMapView ? "Catalog" : workflowModeLabel(settings.mappingWorkflowMode)} />
            <StatusPill icon={<Satellite size={15} color="#254234" />} label={`${settings.gpsQuality.minimumFixType.replaceAll("_", " ")} gate`} />
            <StatusPill icon={<Ruler size={15} color="#254234" />} label={homeMapView ? "North America" : project.projectCrs} />
            <StatusPill icon={<SlidersHorizontal size={15} color="#254234" />} label={COORDINATE_FORMAT_LABELS[settings.coordinateDisplayFormat]} />
            <StatusPill icon={<ClipboardList size={15} color="#254234" />} label={isDirty ? "Unsaved edits" : "Saved"} testID="project-save-state" />
          </View>
          <View style={[styles.projectActionRow, compactLayout && styles.statusRowCompact]}>
            <SmallActionButton disabled={homeMapView} label={isDirty ? "Save *" : "Save"} onPress={saveCurrentProject} />
            <SmallActionButton label="Catalog" onPress={() => {
              setScreen("workspace");
              setActiveView("map");
              setHomeMapView(true);
            }} />
            <SmallActionButton label="Dashboard" onPress={() => setActiveView("dashboard")} />
            <SmallActionButton label="Undo" disabled={editor.past.length === 0} onPress={() => dispatchProject({ type: "undo" })} />
            <SmallActionButton label="Redo" disabled={editor.future.length === 0} onPress={() => dispatchProject({ type: "redo" })} />
          </View>
        </View>

        <View style={[styles.workspaceShell, compactLayout && styles.workspaceShellCompact]}>
          <ProjectTreeRail
            activeContext={activeCatalogContext}
            activeView={activeView}
            catalog={repository.catalog}
            compact={compactLayout}
            mapFocus={compactLayout && activeView === "map" && !homeMapView}
            onCreateCustomer={openCustomerCreateDialog}
            onCreateDesign={() => openCatalogDialog("design")}
            onCreateFieldMap={() => openCatalogDialog("fieldMap")}
            onCreateProject={() => openCatalogDialog("project")}
            onNavigate={setActiveView}
            onOpenDesign={openDesignProject}
            onOpenFieldMap={openFieldMap}
            onOpenProject={(projectId) => {
              selectProjectCatalogOnly(projectId);
            }}
            onOpenSample={() => loadProjectDashboard(sampleProject, { customerId: null, projectId: null, fieldMapId: null, designId: null })}
            onStartBlankDesign={startBlankDesign}
            onSelectCustomer={selectCustomerFolder}
            onSelectProject={selectProjectCatalogOnly}
            onSelectFieldMap={selectFieldMapCatalogOnly}
          />

          <ScrollView style={styles.workspaceScroll} contentContainerStyle={[styles.content, compactLayout && styles.contentCompact]}>
          {activeView === "dashboard" && (
            <ProjectDashboard
              compact={compactLayout}
              dirty={isDirty}
              mode="workspace"
              onCreate={routeToCustomerSelection}
              onOpenFiles={() => setActiveView("files")}
              onOpenImprovedProof={() => loadProjectDashboard(improvedCenterPivotReviewProject)}
              onInspectMap={() => {
                setWorkflowMode("layout");
                setActiveView("map");
              }}
              onOpenMap={() => setActiveView("map")}
              onOpenProject={openSavedProject}
              onOpenReview={() => setActiveView("review")}
              onOpenRealProof={() => loadProjectDashboard(realCenterPivotProofProject)}
              onOpenSample={() => loadProjectDashboard(sampleProject)}
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
                activeLayer={guidedMapTool?.activeLayer}
                activeMapFeatureKind={guidedMapTool?.featureKind}
                activeToolMode={guidedMapTool?.mode}
                activeToolRequestId={guidedMapTool?.requestId}
                homeView={homeMapView}
                project={project}
                result={result}
                settings={settings}
                selectedMapFeatureId={selectedMapFeatureId}
                advisoryRecommendationPreview={advisoryRecommendationPreview}
                onSettingsChange={commitSettings}
                onMappingWorkflowModeChange={setWorkflowMode}
                onCommitBoundaryDraft={(vertices) => dispatchProjectWithResult({ type: "commit_boundary_draft", vertices })}
                onCommitObstacleDraft={(vertices, kind, confidence) => dispatchProjectWithResult({ type: "commit_obstacle_draft", vertices, kind, confidence })}
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
                {homeMapView ? (
                  selectedCustomer ? (
                    <CustomerDetailPanel
                      activeProjectId={activeCatalogContext.projectId}
                      catalog={repository.catalog}
                      customer={selectedCustomer}
                      notice={catalogNotice}
                      onCreateProject={() => openCatalogDialog("project")}
                      onDeleteCustomer={(customerId) => setDeletingCustomerId(customerId)}
                      onDeleteProject={(projectId) => setDeletingProjectId(projectId)}
                      onEditCustomer={openCustomerEditDialog}
                      onMoveProject={(projectId) => setMovingProjectId(projectId)}
                      onOpenProject={selectProjectCatalogOnly}
                      onRenameProject={(projectId) => setRenamingProjectId(projectId)}
                      onSelectProject={(projectId) => {
                        const record = repository.catalog.projects.find((candidate) => candidate.id === projectId) ?? null;
                        setActiveCatalogContext({
                          customerId: record?.customerId ?? selectedCustomer.id,
                          projectId,
                          fieldMapId: null,
                          designId: null,
                        });
                      }}
                    />
                  ) : (
                    <CatalogHomePanel
                      catalog={repository.catalog}
                      notice={catalogNotice}
                      onCreateCustomer={openCustomerCreateDialog}
                      onStartBlankDesign={startBlankDesign}
                      repository={repository}
                      settings={settings}
                    />
                  )
                ) : (
                  <>
                    <DesignBuilderPanel
                      editorError={editor.lastError}
                      onActivateMapTool={activateGuidedMapTool}
                      onCalculate={calculateDesignScenarios}
                      onCommitBoundaryVertices={(vertices) => dispatchProjectWithResult({ type: "commit_boundary_draft", vertices })}
                      onPlacePivot={(point) => dispatchProjectWithResult({ type: "place_pivot", point })}
                      onReplaceObstaclePolygon={(obstacleId, vertices) => dispatchProjectWithResult({ type: "replace_obstacle_polygon", obstacleId, vertices })}
                      onUpdateMachine={(machine) => dispatchProjectWithResult({ type: "update_machine", machine })}
                      preview={designScenarioPreview}
                      project={project}
                      result={result}
                      settings={settings}
                    />

                    <Text style={styles.sectionTitle}>Map Inspector</Text>
                    <View style={styles.metricGrid}>
                      <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
                      <MetricTile label="Dry / non-irrigated" value={formatAreaFromAcres(result.metrics.nonIrrigatedAcres, settings.unitSystem)} tone="warn" />
                      <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} tone="neutral" />
                      <MetricTile label="End gun" value={formatAreaFromAcres(result.metrics.endGunAcres, settings.unitSystem)} tone="neutral" />
                      <MetricTile label="Outside field" value={formatAreaFromAcres(result.metrics.outsideFieldAcres, settings.unitSystem)} tone={result.metrics.outsideFieldAcres > 0 ? "danger" : "good"} />
                      <MetricTile label="Obstacle hits" value={`${result.metrics.obstacleConflictCount}`} tone={result.metrics.obstacleConflictCount > 0 ? "danger" : "good"} />
                      <MetricTile label="Hard path conflicts" value={`${result.metrics.hardMechanicalConflictCount}`} tone={result.metrics.hardMechanicalConflictCount > 0 ? "danger" : "good"} />
                    </View>

                    <CoordinateFormatPanel
                      coordinate={project.pivotCenter}
                      format={settings.coordinateDisplayFormat}
                      onApply={applyPivotCoordinate}
                      onFormatChange={(coordinateDisplayFormat) => commitSettings({ ...settings, coordinateDisplayFormat })}
                      projectCrs={project.projectCrs}
                    />

                    {settings.mappingWorkflowMode === "layout" ? (
                      <>
                        <Text style={styles.sectionTitle}>RTK Layout Capture</Text>
                        <BrowserRtkReceiverPanel
                          onAddMapFeature={addMapFeature}
                          onAddSurveyPoint={(point) => dispatchProject({ type: "add_survey_point", point })}
                          onCommitBoundaryDraft={(vertices) => dispatchProject({ type: "commit_boundary_draft", vertices })}
                          onCommitObstacleDraft={(vertices, kind, confidence) => dispatchProject({ type: "commit_obstacle_draft", vertices, kind, confidence })}
                          project={project}
                          settings={settings}
                        />
                      </>
                    ) : null}

                    <MapFeatureEditor
                      feature={selectedMapFeature}
                      onDelete={deleteMapFeature}
                      onRename={updateMapFeatureName}
                      onUpdate={updateMapFeature}
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
                  </>
                )}
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
                <MetricTile label="Survey points" testID="survey-metric-points" value={`${project.surveyPoints.length}`} />
                <MetricTile label="RTK fixed points" testID="survey-metric-rtk-fixed" value={`${project.surveyPoints.filter((point) => point.confidence === "rtk_fixed").length}`} tone="good" />
                <MetricTile label="Draft inputs" testID="survey-metric-draft-inputs" value={`${project.surveyPoints.filter((point) => point.confidence !== "rtk_fixed").length}`} tone="warn" />
              </View>
              {project.surveyPoints.map((point) => (
                <View key={point.id} style={styles.listRow} testID={`survey-point-${point.id}`}>
                  <View>
                    <Text style={styles.rowTitle}>{point.label}</Text>
                    <Text style={styles.rowMeta}>{point.role} · {point.source} · {point.confidence}</Text>
                    <View style={styles.inlineActions}>
                      {point.role === "pivot_center" ? <SmallActionButton accessibilityLabel={`Set Pivot from ${point.label}`} label="Set Pivot" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "pivot_center" })} /> : null}
                      {point.role === "water_source" ? <SmallActionButton accessibilityLabel={`Set Water from ${point.label}`} label="Set Water" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "water_source" })} /> : null}
                      {point.role === "power_source" ? <SmallActionButton accessibilityLabel={`Set Power from ${point.label}`} label="Set Power" onPress={() => dispatchProject({ type: "promote_survey_point", id: point.id, target: "power_source" })} /> : null}
                      <SmallActionButton accessibilityLabel={`Delete survey point ${point.label}`} label="Delete" onPress={() => dispatchProject({ type: "delete_survey_point", id: point.id })} />
                    </View>
                  </View>
                  <Text style={styles.coordinate}>{formatProjectCoordinate(point.projected)}</Text>
                </View>
              ))}
            </Section>
          )}

          {activeView === "settings" && (
            <SettingsPanel mapPackages={project.mapPackages ?? []} settings={settings} onChange={commitSettings} />
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
                onDeleteProject={(projectId) => {
                  setDeletingProjectId(projectId);
                  return Promise.resolve(false);
                }}
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
      {catalogDialogMode ? (
        <ProjectCatalogDialog
          contextPreview={catalogDialogContextPreview(catalogDialogMode)}
          defaultName={catalogDialogDefaultName}
          mode={catalogDialogMode}
          onCancel={closeCatalogDialog}
          onCreate={submitCatalogDialog}
          submitting={catalogDialogSubmitting}
          visible
        />
      ) : null}
      {customerProfileDialogMode ? (
        <CustomerProfileDialog
          defaultDisplayName={`Customer ${repository.catalog.customers.length + 1}`}
          initialCustomer={customerProfileDialogMode === "edit" ? editingCustomer : null}
          mode={customerProfileDialogMode}
          onCancel={closeCustomerProfileDialog}
          onSave={submitCustomerProfile}
          submitting={catalogDialogSubmitting}
          visible
        />
      ) : null}
      {renamingProject ? (
        <ProjectCatalogDialog
          contextPreview={formatCatalogPath(catalogPathForProject(renamingProject.id))}
          createButtonLabel="Rename"
          defaultName={renamingProject.name}
          helper="Rename updates the local project document and catalog row without changing projected XY geometry."
          mode="project"
          onCancel={() => {
            if (!catalogDialogSubmitting) setRenamingProjectId(null);
          }}
          onCreate={(name) => renameProjectFolder(renamingProject.id, name)}
          submitting={catalogDialogSubmitting}
          title="Rename Project"
          visible
        />
      ) : null}
      {movingProject ? (
        <MoveProjectDialog
          currentCustomerId={movingProject.customerId}
          customers={repository.catalog.customers}
          onCancel={() => {
            if (!catalogDialogSubmitting) setMovingProjectId(null);
          }}
          onMove={(customerId) => moveProjectFolder(movingProject.id, customerId)}
          projectName={movingProject.name}
          submitting={catalogDialogSubmitting}
          visible
        />
      ) : null}
      {deletingProject ? (
        <ConfirmActionDialog
          confirmLabel="Delete Project"
          message={`Delete ${deletingProject.name} and its contained field maps/designs from the local catalog. Project ZIP archives are not changed.`}
          onCancel={() => {
            if (!catalogDialogSubmitting) setDeletingProjectId(null);
          }}
          onConfirm={confirmDeleteProject}
          submitting={catalogDialogSubmitting}
          testID="delete-project-dialog"
          title="Delete Project"
          visible
        />
      ) : null}
      {deletingCustomer ? (
        <ConfirmActionDialog
          confirmLabel="Delete Customer"
          message={`Delete the empty customer folder ${deletingCustomer.displayName}. This is blocked automatically if any projects remain inside it.`}
          onCancel={() => {
            if (!catalogDialogSubmitting) setDeletingCustomerId(null);
          }}
          onConfirm={confirmDeleteCustomer}
          submitting={catalogDialogSubmitting}
          testID="delete-customer-dialog"
          title="Delete Customer"
          visible
        />
      ) : null}
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

function DesignBuilderPanel({
  editorError,
  onActivateMapTool,
  onCalculate,
  onCommitBoundaryVertices,
  onPlacePivot,
  onReplaceObstaclePolygon,
  onUpdateMachine,
  preview,
  project,
  result,
  settings,
}: {
  editorError: string | null;
  onActivateMapTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  onCalculate: () => void;
  onCommitBoundaryVertices: (vertices: XY[]) => boolean;
  onPlacePivot: (point: XY) => boolean;
  onReplaceObstaclePolygon: (obstacleId: string, vertices: XY[]) => boolean;
  onUpdateMachine: (machine: PivotMachine) => boolean;
  preview: DesignScenarioPreview[] | null;
  project: PivotProject;
  result: ReturnType<typeof evaluateLayout>;
  settings: AppSettings;
}): React.JSX.Element {
  const [selectedObstacleId, setSelectedObstacleId] = useState(project.obstacles[0]?.id ?? null);
  const selectedObstacle = project.obstacles.find((obstacle) => obstacle.id === selectedObstacleId) ?? project.obstacles[0] ?? null;
  const cornerArmFootprintCount = (project.mapFeatures ?? []).filter((feature) => feature.kind === "corner_swing_limit").length;

  useEffect(() => {
    if (!selectedObstacleId || !project.obstacles.some((obstacle) => obstacle.id === selectedObstacleId)) {
      setSelectedObstacleId(project.obstacles[0]?.id ?? null);
    }
  }, [project.obstacles, selectedObstacleId]);

  return (
    <View style={styles.designBuilderPanel} testID="design-builder-panel">
      <View style={styles.designBuilderHeader}>
        <View>
          <Text style={styles.sectionTitle}>Design Builder</Text>
          <Text style={styles.mapFeatureMeta}>Projected XY workflow · Calculate before save/export</Text>
        </View>
        <SmallActionButton label="Design Mode" onPress={() => onActivateMapTool("pan", "field_boundary")} />
      </View>

      <DesignStep index={1} title="Field Boundary" meta={`${project.fieldBoundary.length} vertices`}>
        <View style={styles.inlineActions}>
          <SmallActionButton label="Draw Boundary" onPress={() => onActivateMapTool("draw_boundary", "field_boundary")} />
          <SmallActionButton label="Edit Vertices" onPress={() => onActivateMapTool("edit_vertices", "field_boundary")} />
        </View>
        <ProjectedPolygonEditor
          label="Boundary XY"
          onApply={onCommitBoundaryVertices}
          vertices={project.fieldBoundary}
        />
      </DesignStep>

      <DesignStep index={2} title="Pivot Center" meta={formatDistance(machineRadiusMeters(project.machine), settings.unitSystem)}>
        <View style={styles.inlineActions}>
          <SmallActionButton label="Map Click" onPress={() => onActivateMapTool("place_pivot", "pivot_center")} />
          <SmallActionButton label="Survey Point" onPress={() => onActivateMapTool("capture_point", "pivot_center")} />
        </View>
        <PivotCoordinateForm
          onApply={onPlacePivot}
          point={project.pivotCenter}
        />
      </DesignStep>

      <DesignStep index={3} title="Machine Radius" meta={formatDistance(machineRadiusMeters(project.machine), settings.unitSystem)}>
        <MachineSettingsForm machine={project.machine} onChange={onUpdateMachine} unitSystem={settings.unitSystem} />
      </DesignStep>

      <DesignStep index={4} title="Obstacles And Utilities" meta={`${project.obstacles.length} obstacles · ${(project.mapFeatures ?? []).length} utility features`}>
        <View style={styles.inlineActions}>
          <SmallActionButton label="Draw Obstacle" onPress={() => onActivateMapTool("mark_obstacle", "obstacle")} />
          <SmallActionButton label="Utility Line" onPress={() => onActivateMapTool("measure", "control_point")} />
        </View>
        {project.obstacles.length > 0 ? (
          <>
            <View style={styles.controlRow}>
              {project.obstacles.map((obstacle) => (
                <ActionButton
                  key={obstacle.id}
                  label={obstacle.name}
                  onPress={() => setSelectedObstacleId(obstacle.id)}
                  selected={selectedObstacle?.id === obstacle.id}
                />
              ))}
            </View>
            {selectedObstacle ? (
              <ProjectedPolygonEditor
                label={`${selectedObstacle.name} XY`}
                onApply={(vertices) => onReplaceObstaclePolygon(selectedObstacle.id, vertices)}
                vertices={selectedObstacle.polygon}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.mapFeatureMeta}>No obstacle polygons are committed yet.</Text>
        )}
      </DesignStep>

      <DesignStep index={5} title="End Gun" meta={`${formatDistance(project.machine.endGunThrowMeters, settings.unitSystem)} throw · ${project.machine.endGunAngleRanges?.length ?? 0} angle ranges`}>
        <View style={styles.metricGrid}>
          <MetricTile label="End-gun arcs" value={`${project.machine.endGunAngleRanges?.length ?? 0}`} />
          <MetricTile label="No-spray conflicts" value={`${result.metrics.noSprayConflictCount}`} tone={result.metrics.noSprayConflictCount > 0 ? "warn" : "good"} />
          <MetricTile label="End-gun acres" value={formatAreaFromAcres(result.metrics.endGunAcres, settings.unitSystem)} />
        </View>
        <View style={styles.inlineActions}>
          <SmallActionButton label="End Gun Circle" onPress={() => onActivateMapTool("measure", "control_point", "end_gun_arc")} />
        </View>
        <Text style={styles.mapFeatureMeta}>End-gun throw and angle ranges live in the machine form. Use the End gun utility circle for advisory radius or shutoff review marks.</Text>
      </DesignStep>

      <DesignStep index={6} title="Corner Arm" meta={`${cornerArmFootprintCount} advisory footprints`}>
        <View style={styles.metricGrid}>
          <MetricTile label="Corner footprints" value={`${cornerArmFootprintCount}`} />
          <MetricTile label="Tower tracks" value={`${result.metrics.towerTrackConflictCount}`} tone={result.metrics.towerTrackConflictCount > 0 ? "danger" : "good"} />
        </View>
        <View style={styles.inlineActions}>
          <SmallActionButton label="Corner Footprint" onPress={() => onActivateMapTool("measure", "control_point", "corner_swing_limit")} />
        </View>
        <Text style={styles.mapFeatureMeta}>Corner-arm inputs are advisory footprints only until operator/vendor coverage and track geometry are supplied. They do not change end-gun settings.</Text>
      </DesignStep>

      <DesignStep index={7} title="Calculate Preview" meta={preview ? `${preview.length} scenarios` : "Not calculated"}>
        <Pressable accessibilityRole="button" onPress={onCalculate} style={styles.calculateButton} testID="design-builder-calculate">
          <Calculator size={16} color="#ffffff" />
          <Text style={styles.calculateButtonText}>Calculate</Text>
        </Pressable>
        {editorError ? <Text style={styles.formError}>{editorError}</Text> : null}
        <ScenarioPreviewList preview={preview} settings={settings} />
      </DesignStep>
    </View>
  );
}

function DesignStep({ children, index, meta, title }: { children: React.ReactNode; index: number; meta: string; title: string }): React.JSX.Element {
  return (
    <View style={styles.designStep}>
      <View style={styles.designStepHeader}>
        <View style={styles.designStepBadge}>
          <Text style={styles.designStepBadgeText}>{index}</Text>
        </View>
        <View style={styles.designStepTitleBlock}>
          <Text style={styles.designStepTitle}>{title}</Text>
          <Text style={styles.mapFeatureMeta}>{meta}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function PivotCoordinateForm({ onApply, point }: { onApply: (point: XY) => boolean; point: XY }): React.JSX.Element {
  const [x, setX] = useState(point.x.toFixed(3));
  const [y, setY] = useState(point.y.toFixed(3));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setX(point.x.toFixed(3));
    setY(point.y.toFixed(3));
  }, [point.x, point.y]);

  function apply(): void {
    try {
      const next = { x: requiredFiniteNumber(x, "Pivot X"), y: requiredFiniteNumber(y, "Pivot Y") };
      const accepted = onApply(next);
      setError(accepted ? null : "Pivot coordinate was rejected by project validation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.machineForm}>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.formGrid}>
        <FormField label="Pivot X" value={x} onChangeText={setX} />
        <FormField label="Pivot Y" value={y} onChangeText={setY} />
      </View>
      <View style={styles.inlineActions}>
        <SmallActionButton label="Apply XY" onPress={apply} />
      </View>
    </View>
  );
}

function ProjectedPolygonEditor({ label, onApply, vertices }: { label: string; onApply: (vertices: XY[]) => boolean; vertices: XY[] }): React.JSX.Element {
  const [text, setText] = useState(formatXyLines(vertices));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatXyLines(vertices));
  }, [vertices]);

  function apply(): void {
    try {
      const parsed = parseXyLines(text);
      const accepted = onApply(parsed);
      setError(accepted ? null : `${label} was rejected by polygon validation.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addRow(): void {
    try {
      const current = parseXyLinesAllowEmpty(text);
      const last = current.at(-1) ?? { x: 0, y: 0 };
      setText(formatXyLines([...current, { x: last.x + 10, y: last.y }]));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function removeLast(): void {
    try {
      setText(formatXyLines(parseXyLinesAllowEmpty(text).slice(0, -1)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function rotateFirst(): void {
    try {
      const current = parseXyLinesAllowEmpty(text);
      if (current.length < 2) return;
      setText(formatXyLines([...current.slice(1), current[0]]));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.xyEditor}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline
        onChangeText={setText}
        style={[styles.textInput, styles.xyTextArea]}
        value={text}
      />
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.inlineActions}>
        <SmallActionButton label="Add Row" onPress={addRow} />
        <SmallActionButton label="Remove Last" onPress={removeLast} />
        <SmallActionButton label="Reorder" onPress={rotateFirst} />
        <SmallActionButton label="Apply XY" onPress={apply} />
      </View>
    </View>
  );
}

function ScenarioPreviewList({ preview, settings }: { preview: DesignScenarioPreview[] | null; settings: AppSettings }): React.JSX.Element {
  if (!preview) {
    return <Text style={styles.mapFeatureMeta}>Scenario metrics update only after Calculate.</Text>;
  }
  return (
    <View style={styles.scenarioList} testID="design-builder-scenarios">
      {preview.map((scenario) => (
        <View key={scenario.id} style={[styles.scenarioRow, scenario.feasible ? styles.scenarioRowFeasible : styles.scenarioRowRejected]}>
          <View style={styles.scenarioRowHeader}>
            <Text style={styles.rowTitle}>{scenario.label}</Text>
            <Text style={styles.scenarioScore}>{scenario.feasible ? scenario.score.toFixed(1) : "Review"}</Text>
          </View>
          <Text style={styles.rowMeta}>
            {formatAreaFromAcres(scenario.metrics.irrigatedAcres, settings.unitSystem)} · {scenario.metrics.coveragePercent.toFixed(1)}% · outside {formatAreaFromAcres(scenario.metrics.outsideFieldAcres, settings.unitSystem)}
          </Text>
          {scenario.rejectionReasons.length > 0 ? (
            <Text style={styles.mapFeatureMeta}>{scenario.rejectionReasons[0]}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function CatalogHomePanel({
  catalog,
  notice,
  onCreateCustomer,
  onStartBlankDesign,
  repository,
  settings,
}: {
  catalog: ProjectWorkspaceStatus["catalog"];
  notice: string | null;
  onCreateCustomer: () => void;
  onStartBlankDesign: () => void;
  repository: ProjectWorkspaceStatus;
  settings: AppSettings;
}): React.JSX.Element {
  return (
    <>
      <Text style={styles.sectionTitle}>Catalog Home</Text>
      <View style={styles.metricGrid} testID="catalog-home-metrics">
        <MetricTile label="Customers" value={`${catalog.customers.length}`} />
        <MetricTile label="Projects" value={`${catalog.projects.length}`} />
        <MetricTile label="Field maps" value={`${catalog.fieldMaps.length}`} />
        <MetricTile label="Designs" value={`${catalog.designs.length}`} />
      </View>
      <View style={styles.mapFeatureEditor} testID="catalog-home-status">
        <Text style={styles.mapFeatureTitle}>{repository.backendInfo?.backendLabel ?? repository.backendLabel}</Text>
        <Text style={styles.mapFeatureMeta}>
          {repository.statusMessage} · {settings.onlineImagery.enabled ? "USGS live reference is enabled with attribution on the map." : "No external imagery is requested."}
        </Text>
      </View>
      {notice ? (
        <View style={styles.warningItem} testID="catalog-notice">
          <AlertTriangle size={17} color="#9a4c1c" />
          <Text style={styles.warningText}>{notice}</Text>
        </View>
      ) : null}
      <View style={styles.inlineActions}>
        <SmallActionButton label="Add Customer" onPress={onCreateCustomer} />
        <SmallActionButton label="Start Blank Design" onPress={onStartBlankDesign} />
      </View>
      <View style={styles.warningItem}>
        <MapPinned size={17} color="#9a4c1c" />
        <Text style={styles.warningText}>Use Start Blank Design or open a saved design from the tree to enable drawing. Catalog maps are navigation-only.</Text>
      </View>
    </>
  );
}

function CustomerDetailPanel({
  activeProjectId,
  catalog,
  customer,
  notice,
  onCreateProject,
  onDeleteCustomer,
  onDeleteProject,
  onEditCustomer,
  onMoveProject,
  onOpenProject,
  onRenameProject,
  onSelectProject,
}: {
  activeProjectId: string | null;
  catalog: ProjectWorkspaceStatus["catalog"];
  customer: CustomerRecord;
  notice: string | null;
  onCreateProject: () => void;
  onDeleteCustomer: (customerId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onEditCustomer: (customerId: string) => void;
  onMoveProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onRenameProject: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
}): React.JSX.Element {
  const projects = catalog.projects.filter((projectRecord) => projectRecord.customerId === customer.id);
  const profileRows = [
    ["Company", customer.companyName],
    ["Primary Contact", customer.contactName],
    ["Email", customer.email],
    ["Phone", customer.phone],
    ["Location", customer.location],
  ].filter(([, value]) => value);
  const canDeleteCustomer = projects.length === 0;

  return (
    <>
      <View style={styles.customerDetailHeader} testID="customer-detail-panel">
        <View style={styles.customerIconBadge}>
          <UserRound size={22} color="#eef7f1" />
        </View>
        <View style={styles.customerDetailTitleBlock}>
          <Text style={styles.sectionTitle}>{customer.displayName}</Text>
          <Text style={styles.mapFeatureMeta}>{projects.length} project{projects.length === 1 ? "" : "s"} in this customer folder</Text>
        </View>
      </View>

      <View style={styles.inlineActions}>
        <SmallActionButton label="Edit Customer" onPress={() => onEditCustomer(customer.id)} />
        <SmallActionButton disabled={!canDeleteCustomer} label="Delete Customer" onPress={() => onDeleteCustomer(customer.id)} />
        <SmallActionButton label="New Project" onPress={onCreateProject} />
      </View>

      {notice ? (
        <View style={styles.warningItem} testID="catalog-notice">
          <AlertTriangle size={17} color="#9a4c1c" />
          <Text style={styles.warningText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.mapFeatureEditor}>
        <Text style={styles.mapFeatureTitle}>Profile</Text>
        {profileRows.length === 0 && !customer.notes ? (
          <Text style={styles.mapFeatureMeta}>No contact details saved yet.</Text>
        ) : profileRows.map(([label, value]) => (
          <View key={label} style={styles.profileRow}>
            <Text style={styles.profileLabel}>{label}</Text>
            <Text style={styles.profileValue}>{value}</Text>
          </View>
        ))}
        {customer.notes ? <Text style={styles.profileNotes}>{customer.notes}</Text> : null}
        {!canDeleteCustomer ? <Text style={styles.mapFeatureMeta}>Delete is available after moving or deleting contained projects.</Text> : null}
      </View>

      <View style={styles.projectList} testID="customer-detail-projects">
        {projects.length === 0 ? (
          <Text style={styles.dashboardMuted}>No projects in this customer folder.</Text>
        ) : projects.map((projectRecord) => {
          const fieldMaps = catalog.fieldMaps.filter((fieldMap) => fieldMap.projectId === projectRecord.id);
          const active = activeProjectId === projectRecord.id;
          return (
            <Pressable
              accessibilityLabel={`Select project ${projectRecord.name}`}
              accessibilityRole="button"
              key={projectRecord.id}
              onPress={() => onSelectProject(projectRecord.id)}
              style={[styles.customerProjectRow, active && styles.customerProjectRowActive]}
              testID={`customer-project-row-${projectRecord.id}`}
            >
              <View style={styles.customerProjectText}>
                <Text style={styles.rowTitle}>{projectRecord.name}</Text>
                <Text style={styles.rowMeta}>{fieldMaps.length} field map{fieldMaps.length === 1 ? "" : "s"} · {projectRecord.projectCrs} · {projectRecord.unitSystem.replaceAll("_", " ")}</Text>
              </View>
              <View style={styles.inlineActions}>
                <SmallActionButton label="Open" onPress={() => onOpenProject(projectRecord.id)} />
                <SmallActionButton label="Rename" onPress={() => onRenameProject(projectRecord.id)} />
                <SmallActionButton label="Move" onPress={() => onMoveProject(projectRecord.id)} />
                <SmallActionButton label="Delete" onPress={() => onDeleteProject(projectRecord.id)} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function ProjectDashboard({
  compact,
  dirty,
  mode,
  onCreate,
  onInspectMap,
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
  onInspectMap: () => void;
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
          <View style={styles.dashboardActions}>
            <SmallActionButton label="Open Review" onPress={onOpenReview} />
            <SmallActionButton label="Inspect Map" onPress={onInspectMap} />
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
        <Pressable
          accessibilityLabel="Reset walkthrough progress for active project"
          accessibilityRole="button"
          onPress={onReset}
          style={styles.resetButton}
        >
          <RotateCcw size={14} color="#173428" />
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>
      <View style={styles.walkthroughGrid}>
        {WALKTHROUGH_MODULES.map((module) => {
          const complete = progress[module.id];
          const toggleModule = () => onToggle(module.id, !complete);
          return (
            <Pressable
              accessibilityLabel={`${complete ? "Clear" : "Complete"} ${module.title} walkthrough checkpoint`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: complete }}
              key={module.id}
              onPress={toggleModule}
              style={[styles.walkthroughModule, complete && styles.walkthroughModuleComplete]}
              testID={`walkthrough-module-${module.id}`}
              {...webCheckboxProps(complete, toggleModule)}
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

function webCheckboxProps(checked: boolean, onActivate: () => void): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    "aria-checked": checked ? "true" : "false",
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      onActivate();
    },
    tabIndex: 0,
  };
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
  if (!settings.onlineImagery.enabled && !progress.imagery) return "Next: keep offline overlay or enable approved no-key imagery in Settings.";
  if (!progress.imagery) return "Next: confirm imagery attribution and live-source status.";
  if (project.fieldBoundary.length < 3 || !progress.boundary) return "Next: trace or review the field boundary in Design mode.";
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
      referenceOverlay: current.referenceOverlay,
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
  return mode === "design" ? "Design" : "Layout RTK";
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

function ProjectTreeRail({
  activeContext,
  activeView,
  catalog,
  compact,
  mapFocus,
  onCreateCustomer,
  onCreateDesign,
  onCreateFieldMap,
  onCreateProject,
  onNavigate,
  onOpenDesign,
  onOpenFieldMap,
  onOpenProject,
  onOpenSample,
  onStartBlankDesign,
  onSelectCustomer,
  onSelectFieldMap,
  onSelectProject,
}: {
  activeContext: {
    customerId: string | null;
    projectId: string | null;
    fieldMapId: string | null;
    designId: string | null;
  };
  activeView: WorkspaceView;
  catalog: ProjectWorkspaceStatus["catalog"];
  compact: boolean;
  mapFocus: boolean;
  onCreateCustomer: () => void | Promise<void>;
  onCreateDesign: () => void | Promise<void>;
  onCreateFieldMap: () => void | Promise<void>;
  onCreateProject: () => void | Promise<void>;
  onNavigate: (view: WorkspaceView) => void;
  onOpenDesign: (designId: string) => void | Promise<void>;
  onOpenFieldMap: (fieldMapId: string) => void | Promise<void>;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onOpenSample: () => void;
  onStartBlankDesign: () => void;
  onSelectCustomer: (customerId: string) => void;
  onSelectFieldMap: (fieldMapId: string) => void;
  onSelectProject: (projectId: string) => void;
}): React.JSX.Element {
  const visibleCustomers = activeContext.projectId
    ? catalog.customers.filter((customer) => customer.id === activeContext.customerId)
    : catalog.customers;
  const activeProject = activeContext.projectId
    ? catalog.projects.find((project) => project.id === activeContext.projectId) ?? null
    : null;

  return (
    <View style={[styles.leftRail, compact && styles.leftRailCompact, mapFocus && styles.leftRailCompactMapFocus]} testID="workspace-rail">
      {!mapFocus ? (
        <View style={styles.projectTreePanel} testID="project-tree-rail">
          <View style={styles.projectTreeHeader}>
            <FolderOpen size={18} color="#d5e2db" />
            <Text style={styles.projectTreeTitle}>{activeProject ? activeProject.name : "Project Catalog"}</Text>
          </View>
          <View style={styles.projectTreeActions} testID="project-tree-actions">
            <SmallActionButton label="Customer" onPress={onCreateCustomer} />
            <SmallActionButton disabled={!activeContext.customerId} label="Project" onPress={onCreateProject} />
            <SmallActionButton disabled={!activeContext.projectId} label="Field Map" onPress={onCreateFieldMap} />
            <SmallActionButton disabled={!activeContext.fieldMapId} label="Design" onPress={onCreateDesign} />
            <SmallActionButton label="Blank Design" onPress={onStartBlankDesign} />
            <SmallActionButton label="Open Sample" onPress={onOpenSample} />
          </View>
          <ScrollView style={[styles.projectTreeScroll, compact && styles.projectTreeScrollCompact]} contentContainerStyle={styles.projectTreeContent} testID="project-tree-scroll">
            {catalog.customers.length === 0 ? (
              <Text style={styles.projectTreeEmpty}>No customer folders yet.</Text>
            ) : null}
            {visibleCustomers.map((customer) => {
              const projects = catalog.projects.filter((project) => project.customerId === customer.id);
              return (
                <View key={customer.id} style={styles.projectTreeGroup}>
                  <ProjectTreeNode
                    active={activeContext.customerId === customer.id}
                    depth={0}
                    icon={<FolderOpen size={15} color="#d5e2db" />}
                    label={customer.displayName}
                    meta={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
                    onOpen={() => onSelectCustomer(customer.id)}
                    onSelect={() => onSelectCustomer(customer.id)}
                    testID={`catalog-customer-${customer.id}`}
                  />
                  {projects.map((projectRecord) => {
                    const fieldMaps = catalog.fieldMaps.filter((fieldMap) => fieldMap.projectId === projectRecord.id);
                    const showProjectChildren = activeContext.projectId === null || activeContext.projectId === projectRecord.id;
                    return (
                      <View key={projectRecord.id}>
                        <ProjectTreeNode
                          active={activeContext.projectId === projectRecord.id}
                          depth={1}
                          icon={<Database size={14} color="#d5e2db" />}
                          label={projectRecord.name}
                          meta={`${fieldMaps.length} field map${fieldMaps.length === 1 ? "" : "s"}`}
                          onOpen={() => onOpenProject(projectRecord.id)}
                          onSelect={() => onSelectProject(projectRecord.id)}
                          testID={`catalog-project-${projectRecord.id}`}
                        />
                        {showProjectChildren ? fieldMaps.map((fieldMap) => {
                          const designs = catalog.designs.filter((design) => design.fieldMapId === fieldMap.id);
                          return (
                            <View key={fieldMap.id}>
                              <ProjectTreeNode
                                active={activeContext.fieldMapId === fieldMap.id}
                                depth={2}
                                icon={<MapIcon size={14} color="#d5e2db" />}
                                label={fieldMap.name}
                                meta={`${designs.length} design${designs.length === 1 ? "" : "s"}`}
                                onOpen={() => onOpenFieldMap(fieldMap.id)}
                                onSelect={() => onSelectFieldMap(fieldMap.id)}
                                testID={`catalog-field-map-${fieldMap.id}`}
                              />
                              {designs.map((design) => (
                                <ProjectTreeNode
                                  active={activeContext.designId === design.id}
                                  depth={3}
                                  icon={<Layers size={14} color="#d5e2db" />}
                                  key={design.id}
                                  label={design.name}
                                  meta={design.isActive ? "active design" : "layout variant"}
                                  onOpen={() => onOpenDesign(design.id)}
                                  onSelect={() => onSelectFieldMap(fieldMap.id)}
                                  testID={`catalog-design-${design.id}`}
                                />
                              ))}
                            </View>
                          );
                        }) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <View style={[styles.projectTreeNav, compact && styles.projectTreeNavCompact, mapFocus && styles.projectTreeNavMapFocus]}>
        <RailButton active={activeView === "dashboard"} icon={<Home size={18} />} label="Dashboard" onPress={() => onNavigate("dashboard")} testID="workspace-nav-dashboard" />
        <RailButton active={activeView === "map"} icon={<MapPinned size={18} />} label="Map" onPress={() => onNavigate("map")} testID="workspace-nav-map" />
        <RailButton active={activeView === "survey"} icon={<Satellite size={18} />} label="Survey" onPress={() => onNavigate("survey")} testID="workspace-nav-survey" />
        <RailButton active={activeView === "review"} icon={<ClipboardList size={18} />} label="Review" onPress={() => onNavigate("review")} testID="workspace-nav-review" />
        <RailButton active={activeView === "files"} icon={<Download size={18} />} label="Files" onPress={() => onNavigate("files")} testID="workspace-nav-files" />
        <RailButton active={activeView === "settings"} icon={<SlidersHorizontal size={18} />} label="Settings" onPress={() => onNavigate("settings")} testID="workspace-nav-settings" />
      </View>
    </View>
  );
}

function ProjectTreeNode({
  active,
  depth,
  icon,
  label,
  meta,
  onOpen,
  onSelect,
  testID,
}: {
  active: boolean;
  depth: 0 | 1 | 2 | 3;
  icon: React.ReactNode;
  label: string;
  meta: string;
  onOpen: () => void | Promise<void>;
  onSelect: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={onSelect}
      style={[styles.projectTreeNode, active && styles.projectTreeNodeActive, { paddingLeft: 8 + depth * 12 }]}
      testID={testID}
      {...webDoubleClickProps(onOpen)}
    >
      {icon}
      <View style={styles.projectTreeNodeText}>
        <Text style={[styles.projectTreeNodeLabel, active && styles.projectTreeNodeLabelActive]} numberOfLines={1}>{label}</Text>
        <Text style={styles.projectTreeNodeMeta} numberOfLines={1}>{meta}</Text>
      </View>
    </Pressable>
  );
}

function webDoubleClickProps(onDoubleClick: () => void | Promise<void>): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    onDoubleClick: (event: React.MouseEvent) => {
      event.preventDefault();
      void onDoubleClick();
    },
  };
}

function RailButton({ active, icon, label, onPress, testID }: { active: boolean; icon: React.ReactNode; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  const tintedIcon = React.isValidElement<{ color?: string }>(icon)
    ? React.cloneElement(icon, { color: active ? "#ffffff" : "#d5e2db" })
    : icon;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} aria-selected={active} onPress={onPress} style={[styles.railButton, active && styles.railButtonActive]} testID={testID}>
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

function SmallActionButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void | Promise<void>;
}): React.JSX.Element {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallActionButton, disabled && styles.smallActionButtonDisabled]}>
      {label.startsWith("Save") ? <Save size={14} color={disabled ? "#68766d" : "#254234"} /> : null}
      <Text style={[styles.smallActionText, disabled && styles.smallActionTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function MapFeatureEditor({
  feature,
  onDelete,
  onRename,
  onUpdate,
}: {
  feature: ProjectMapFeature | null;
  onDelete: (featureId: string) => void;
  onRename: (feature: ProjectMapFeature, name: string) => void;
  onUpdate: (feature: ProjectMapFeature) => void;
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

  const geometryLabel = mapFeatureGeometryLabel(feature);

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
      {feature.geometry.type === "Point" ? (
        <PivotCoordinateForm
          onApply={(point) => {
            onUpdate({ ...feature, geometry: { type: "Point", point } });
            return true;
          }}
          point={feature.geometry.point}
        />
      ) : feature.geometry.type === "Circle" ? (
        <CircleFeatureEditor feature={{ ...feature, geometry: feature.geometry }} onUpdate={onUpdate} />
      ) : feature.geometry.type === "LineString" ? (
        <ProjectedPolygonEditor
          label={`${feature.name} line XY`}
          onApply={(vertices) => {
            if (vertices.length < 2) throw new Error("Line feature needs at least two projected XY rows.");
            onUpdate({ ...feature, geometry: { type: "LineString", vertices } });
            return true;
          }}
          vertices={feature.geometry.vertices}
        />
      ) : (
        <ProjectedPolygonEditor
          label={`${feature.name} polygon XY`}
          onApply={(vertices) => {
            if (vertices.length < 3) throw new Error("Polygon feature needs at least three projected XY rows.");
            onUpdate({ ...feature, geometry: { type: "Polygon", vertices } });
            return true;
          }}
          vertices={feature.geometry.vertices}
        />
      )}
    </View>
  );
}

function CircleFeatureEditor({ feature, onUpdate }: { feature: ProjectMapFeature & { geometry: { type: "Circle"; center: XY; radiusMeters: number } }; onUpdate: (feature: ProjectMapFeature) => void }): React.JSX.Element {
  const [radius, setRadius] = useState(String(roundCoordinate(feature.geometry.radiusMeters)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRadius(String(roundCoordinate(feature.geometry.radiusMeters)));
  }, [feature.geometry.radiusMeters]);

  function applyRadius(): void {
    try {
      const radiusMeters = requiredPositiveNumber(radius, "Circle radius");
      onUpdate({ ...feature, geometry: { ...feature.geometry, radiusMeters } });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.machineForm}>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <PivotCoordinateForm
        onApply={(center) => {
          onUpdate({ ...feature, geometry: { ...feature.geometry, center } });
          return true;
        }}
        point={feature.geometry.center}
      />
      <View style={styles.formGrid}>
        <FormField label="Radius (m)" value={radius} onChangeText={setRadius} />
      </View>
      <View style={styles.inlineActions}>
        <SmallActionButton label="Apply Radius" onPress={applyRadius} />
      </View>
    </View>
  );
}

function mapFeatureGeometryLabel(feature: ProjectMapFeature): string {
  if (feature.geometry.type === "Point") return "Point";
  if (feature.geometry.type === "LineString") return `${feature.geometry.vertices.length} point line`;
  if (feature.geometry.type === "Polygon") return `${feature.geometry.vertices.length} point polygon`;
  return `Circle · ${formatDistance(feature.geometry.radiusMeters, "metric")} radius`;
}

function MachineSettingsForm({ machine, onChange, unitSystem }: { machine: PivotMachine; onChange: (machine: PivotMachine) => void; unitSystem: PivotProject["unitSystem"] }): React.JSX.Element {
  const firstEndGunRange = machine.endGunAngleRanges?.[0] ?? null;
  const [spans, setSpans] = useState(formatDistanceInputList(machine.spanLengthsMeters, unitSystem));
  const [overhang, setOverhang] = useState(formatDistanceInputValue(machine.overhangMeters, unitSystem));
  const [endGun, setEndGun] = useState(formatDistanceInputValue(machine.endGunThrowMeters, unitSystem));
  const [towerClearance, setTowerClearance] = useState(formatDistanceInputValue(machine.towerClearanceBufferMeters, unitSystem));
  const [machineClearance, setMachineClearance] = useState(formatDistanceInputValue(machine.machineClearanceBufferMeters, unitSystem));
  const [startAngle, setStartAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.startAngleDegrees) : "210");
  const [stopAngle, setStopAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.stopAngleDegrees) : "35");
  const [direction, setDirection] = useState<"clockwise" | "counterclockwise">(machine.sweep.mode === "partial_circle" ? machine.sweep.direction : "counterclockwise");
  const [mode, setMode] = useState<PivotSweep["mode"]>(machine.sweep.mode);
  const [endGunArcEnabled, setEndGunArcEnabled] = useState(Boolean(firstEndGunRange));
  const [endGunArcStart, setEndGunArcStart] = useState(firstEndGunRange ? String(firstEndGunRange.startAngleDegrees) : "0");
  const [endGunArcStop, setEndGunArcStop] = useState(firstEndGunRange ? String(firstEndGunRange.stopAngleDegrees) : "120");
  const [endGunArcDirection, setEndGunArcDirection] = useState<"clockwise" | "counterclockwise">(firstEndGunRange?.direction ?? "counterclockwise");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextEndGunRange = machine.endGunAngleRanges?.[0] ?? null;
    setSpans(formatDistanceInputList(machine.spanLengthsMeters, unitSystem));
    setOverhang(formatDistanceInputValue(machine.overhangMeters, unitSystem));
    setEndGun(formatDistanceInputValue(machine.endGunThrowMeters, unitSystem));
    setTowerClearance(formatDistanceInputValue(machine.towerClearanceBufferMeters, unitSystem));
    setMachineClearance(formatDistanceInputValue(machine.machineClearanceBufferMeters, unitSystem));
    setMode(machine.sweep.mode);
    if (machine.sweep.mode === "partial_circle") {
      setStartAngle(String(machine.sweep.startAngleDegrees));
      setStopAngle(String(machine.sweep.stopAngleDegrees));
      setDirection(machine.sweep.direction);
    }
    setEndGunArcEnabled(Boolean(nextEndGunRange));
    setEndGunArcStart(nextEndGunRange ? String(nextEndGunRange.startAngleDegrees) : "0");
    setEndGunArcStop(nextEndGunRange ? String(nextEndGunRange.stopAngleDegrees) : "120");
    setEndGunArcDirection(nextEndGunRange?.direction ?? "counterclockwise");
  }, [machine, unitSystem]);

  function apply(): void {
    try {
      const spanValues = spans.split(",").map((value) => requiredPositiveDistanceInput(value.trim(), unitSystem, "Span length"));
      const nextMachine: PivotMachine = {
        ...machine,
        spanLengthsMeters: spanValues,
        overhangMeters: requiredNonNegativeDistanceInput(overhang, unitSystem, "Overhang"),
        endGunThrowMeters: requiredNonNegativeDistanceInput(endGun, unitSystem, "End gun"),
        endGunAngleRanges: endGunArcEnabled
          ? [{
            startAngleDegrees: requiredFiniteNumber(endGunArcStart, "End gun arc start"),
            stopAngleDegrees: requiredFiniteNumber(endGunArcStop, "End gun arc stop"),
            direction: endGunArcDirection,
          }]
          : [],
        towerClearanceBufferMeters: requiredNonNegativeDistanceInput(towerClearance, unitSystem, "Tower clearance"),
        machineClearanceBufferMeters: requiredNonNegativeDistanceInput(machineClearance, unitSystem, "Machine clearance"),
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

  function applyCatalogPreset(presetId: string): void {
    try {
      setError(null);
      onChange(applyMachineCatalogPreset(machine, presetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const unitLabel = unitSystem === "metric" ? "m" : "ft/in";
  const endGunMeters = safeDistanceInput(endGun, unitSystem);
  const wetRadiusMeters = machineRadiusMeters(machine) + Math.max(0, endGunMeters ?? machine.endGunThrowMeters);

  return (
    <View style={styles.machineForm}>
      <Text style={styles.mapFeatureMeta}>
        Derived wet radius {formatDistance(wetRadiusMeters, unitSystem)}{unitSystem === "us_survey_feet" ? ` (${formatFeetInches(wetRadiusMeters)})` : ""} · base radius {formatDistance(machineRadiusMeters(machine), unitSystem)}
      </Text>
      <View style={styles.machineCatalogPanel}>
        <Text style={styles.formLabel}>Source-backed presets</Text>
        <View style={styles.controlRow}>
          {MACHINE_CATALOG_PRESETS.map((preset) => (
            <ActionButton
              key={preset.id}
              label={`${preset.manufacturer} ${preset.model}`}
              onPress={() => applyCatalogPreset(preset.id)}
              selected={machine.catalogSelection?.catalogId === preset.id}
            />
          ))}
        </View>
        <Text style={styles.mapFeatureMeta}>
          {machine.catalogSelection
            ? `${machine.catalogSelection.manufacturer} ${machine.catalogSelection.model} selected · advisory snapshot only`
            : "Use a preset or custom/as-built distances; catalog selections are advisory until vendor/operator verified."}
        </Text>
      </View>
      <View style={styles.controlRow}>
        <ActionButton label="Full circle" selected={mode === "full_circle"} onPress={() => setMode("full_circle")} />
        <ActionButton label="Part circle" selected={mode === "partial_circle"} onPress={() => setMode("partial_circle")} />
        <ActionButton label="Apply Machine Settings" selected onPress={apply} />
      </View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.formGrid}>
        <FormField label={`Spans (${unitLabel}, comma separated)`} value={spans} onChangeText={setSpans} />
        <FormField label={`Overhang (${unitLabel})`} value={overhang} onChangeText={setOverhang} />
        <FormField label={`End gun throw (${unitLabel})`} value={endGun} onChangeText={setEndGun} />
        <FormField label={`Tower clearance (${unitLabel})`} value={towerClearance} onChangeText={setTowerClearance} />
        <FormField label={`Machine clearance (${unitLabel})`} value={machineClearance} onChangeText={setMachineClearance} />
        <View style={styles.formField}>
          <Text style={styles.formLabel}>End gun arc mode</Text>
          <View style={styles.controlRow}>
            <ActionButton label="Full sweep" selected={!endGunArcEnabled} onPress={() => setEndGunArcEnabled(false)} />
            <ActionButton label="Angle range" selected={endGunArcEnabled} onPress={() => setEndGunArcEnabled(true)} />
          </View>
        </View>
        {endGunArcEnabled ? (
          <>
            <FormField label="End gun start angle" value={endGunArcStart} onChangeText={setEndGunArcStart} />
            <FormField label="End gun stop angle" value={endGunArcStop} onChangeText={setEndGunArcStop} />
            <View style={styles.formField}>
              <Text style={styles.formLabel}>End gun direction</Text>
              <View style={styles.controlRow}>
                <ActionButton label="CW" selected={endGunArcDirection === "clockwise"} onPress={() => setEndGunArcDirection("clockwise")} />
                <ActionButton label="CCW" selected={endGunArcDirection === "counterclockwise"} onPress={() => setEndGunArcDirection("counterclockwise")} />
              </View>
            </View>
          </>
        ) : null}
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

function formatXyLines(vertices: XY[]): string {
  return vertices.map((vertex) => `${roundCoordinate(vertex.x)}, ${roundCoordinate(vertex.y)}`).join("\n");
}

function parseXyLines(text: string): XY[] {
  const vertices = parseXyLinesAllowEmpty(text);
  if (vertices.length === 0) throw new Error("Enter at least one projected XY row.");
  return vertices;
}

function parseXyLinesAllowEmpty(text: string): XY[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const parts = line.split(/[,\s]+/).filter((part) => part.length > 0);
      if (parts.length < 2) throw new Error(`XY row ${index + 1} needs x and y.`);
      return {
        x: requiredFiniteNumber(parts[0], `XY row ${index + 1} x`),
        y: requiredFiniteNumber(parts[1], `XY row ${index + 1} y`),
      };
    });
}

function roundCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatDistanceInputList(values: number[], unitSystem: PivotProject["unitSystem"]): string {
  return values.map((value) => formatDistanceInputValue(value, unitSystem)).join(", ");
}

function requiredPositiveDistanceInput(value: string, unitSystem: PivotProject["unitSystem"], label: string): number {
  const parsed = parseDistanceInput(value, unitSystem, label);
  if (parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function requiredNonNegativeDistanceInput(value: string, unitSystem: PivotProject["unitSystem"], label: string): number {
  const parsed = parseDistanceInput(value, unitSystem, label);
  if (parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

function safeDistanceInput(value: string, unitSystem: PivotProject["unitSystem"]): number | null {
  try {
    return parseDistanceInput(value, unitSystem, "Distance");
  } catch {
    return null;
  }
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
    position: "relative",
    width: 292,
    zIndex: 2,
  },
  leftRailCompact: {
    borderRightWidth: 0,
    flexShrink: 0,
    maxHeight: 360,
    paddingHorizontal: 8,
    width: "100%",
  },
  leftRailCompactMapFocus: {
    maxHeight: 108,
    paddingVertical: 8,
  },
  workspaceScroll: {
    flex: 1,
  },
  projectTreeHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 32,
  },
  projectTreePanel: {
    gap: 6,
  },
  projectTreeTitle: {
    color: "#eef7f1",
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  projectTreeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 6,
  },
  projectTreeScroll: {
    flex: 1,
    minHeight: 0,
  },
  projectTreeScrollCompact: {
    flexGrow: 0,
    maxHeight: 120,
    minHeight: 30,
  },
  projectTreeContent: {
    gap: 6,
    paddingBottom: 8,
  },
  projectTreeGroup: {
    gap: 3,
  },
  projectTreeEmpty: {
    color: "#d5e2db",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  projectTreeNode: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 42,
    paddingRight: 8,
    paddingVertical: 7,
  },
  projectTreeNodeActive: {
    backgroundColor: "#274f42",
    borderColor: "#6da992",
  },
  projectTreeNodeText: {
    flex: 1,
    minWidth: 0,
  },
  projectTreeNodeLabel: {
    color: "#e5f0e8",
    fontSize: 12,
    fontWeight: "900",
  },
  projectTreeNodeLabelActive: {
    color: "#ffffff",
  },
  projectTreeNodeMeta: {
    color: "#aebfb6",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  projectTreeNav: {
    borderTopColor: "#26392f",
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 8,
  },
  projectTreeNavCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  projectTreeNavMapFocus: {
    borderTopWidth: 0,
    paddingTop: 0,
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
  designBuilderPanel: {
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  designBuilderHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  designStep: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  designStepHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  designStepBadge: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  designStepBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  designStepTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  designStepTitle: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
  },
  xyEditor: {
    gap: 8,
  },
  xyTextArea: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  calculateButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#254234",
    borderColor: "#254234",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  calculateButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  scenarioList: {
    gap: 8,
  },
  scenarioRow: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10,
  },
  scenarioRowFeasible: {
    backgroundColor: "#eef8f0",
    borderColor: "#9fc7a9",
  },
  scenarioRowRejected: {
    backgroundColor: "#fff7e6",
    borderColor: "#e0c074",
  },
  scenarioRowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  scenarioScore: {
    color: "#254234",
    fontSize: 13,
    fontWeight: "900",
  },
  customerDetailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  customerIconBadge: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  customerDetailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  profileRow: {
    alignItems: "center",
    borderBottomColor: "#e1e8df",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  profileLabel: {
    color: "#526257",
    fontSize: 12,
    fontWeight: "900",
  },
  profileValue: {
    color: "#1d2c22",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  profileNotes: {
    color: "#44564b",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  customerProjectRow: {
    backgroundColor: "#f7faf5",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  customerProjectRowActive: {
    backgroundColor: "#edf7f0",
    borderColor: "#77aa8b",
  },
  customerProjectText: {
    gap: 3,
    minWidth: 0,
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
  machineCatalogPanel: {
    backgroundColor: "#f7faf5",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10,
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
