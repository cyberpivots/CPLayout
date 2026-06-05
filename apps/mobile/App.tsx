import { StatusBar } from "expo-status-bar";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Calculator,
  Circle,
  CircleDot,
  ClipboardList,
  Database,
  Download,
  FolderOpen,
  Home,
  Layers,
  ListChecks,
  Map as MapIcon,
  MapPin,
  MapPinned,
  PackageCheck,
  Pentagon,
  Route,
  RotateCcw,
  Ruler,
  Save,
  Satellite,
  SlidersHorizontal,
  Sprout,
  Upload,
  UserRound,
  UtilityPole,
  Waypoints,
  WifiOff,
  Wrench,
} from "lucide-react-native";
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { CoordinateFormatPanel } from "./src/components/CoordinateFormatPanel";
import { AndroidNativeProofRunner } from "./src/components/AndroidNativeProofRunner";
import { BrowserRtkReceiverPanel } from "./src/components/BrowserRtkReceiverPanel";
import { CommandBar, IconCommandButton, type CommandIconButtonConfig, type CommandMenuConfig } from "./src/components/CommandSurface";
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
import { DrawingToolPalette, type DrawingToolPaletteModal } from "./src/components/DrawingToolPalette";
import { useProjectRepository, type ProjectWorkspaceStatus } from "./src/hooks/useProjectRepository";
import type { CustomerRecord } from "@cplayout/project-store";
import { rehydrateInstalledMapPackageManifestsAsync } from "@cplayout/project-store";
import {
  COORDINATE_FORMAT_LABELS,
  MACHINE_CATALOG_PRESETS,
  applyMachineCatalogPreset,
  createProjectEditorState,
  coordinateExample,
  defaultProjectSettings,
  formatCoordinate,
  listAerialImageryCandidates,
  mergeAppSettings,
  parseCoordinateInput,
  parseAppSettings,
  projectXyToLonLat,
  projectSettingsFromApp,
  reduceProjectEditorState,
  resolveAerialReferenceImagerySource,
  importGoogleEarthKmlToProject,
  importProjectedGeoJsonToProject,
  importSurveyCsvToProject,
  improvedCenterPivotProofProject,
  realCenterPivotProofProject,
  sampleDesignProjects,
  sampleProject,
  type AppSettings,
  type GoogleEarthKmlImportResult,
  type LonLat,
  type MapPackageManifest,
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

type WorkspaceView = "dashboard" | "map" | "survey" | "files" | "settings" | "help";
type Screen = "projects" | "workspace";
type WalkthroughModuleId = "imagery" | "boundary" | "obstacles" | "pivot" | "survey" | "validation" | "export";
type DesignConsoleModal = DrawingToolPaletteModal;
type InspectorPage = "metrics" | "layers" | "feature" | "rtk" | "validation";

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
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("workspace");
  const [activeView, setActiveView] = useState<WorkspaceView>("map");
  const [editor, dispatchProject] = useReducer(reduceProjectEditorState, sampleProject, createProjectEditorState);
  const project = editor.project;
  const [runtimeMapPackages, setRuntimeMapPackages] = useState<MapPackageManifest[]>([]);
  const projectLoadSequenceRef = useRef(0);
  const runtimeProject = useMemo(() => ({
    ...project,
    mapPackages: mergeMapPackageManifests(project.mapPackages ?? [], runtimeMapPackages),
  }), [project, runtimeMapPackages]);
  const [savedRevision, setSavedRevision] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(() => browserLocalSettings(sampleProject.settings));
  const [walkthroughProgress, setWalkthroughProgress] = useState<Record<WalkthroughModuleId, boolean>>(() => loadWalkthroughProgress(sampleProject.id));
  const [selectedMapFeatureId, setSelectedMapFeatureId] = useState<string | null>(null);
  const [designScenarioPreview, setDesignScenarioPreview] = useState<DesignScenarioPreview[] | null>(null);
  const [guidedMapTool, setGuidedMapTool] = useState<{
    activeLayer: DrawingLayerType;
    featureKind?: ProjectMapFeatureKind;
    mode: DrawingMode;
    requestId: number;
  } | null>(null);
  const [designConsoleModal, setDesignConsoleModal] = useState<DesignConsoleModal>(null);
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compactLayout = windowWidth < 760;
  const tabletConsole = windowWidth >= 700 && windowWidth < 1180;
  const desktopConsole = Platform.OS === "web" && windowWidth >= 1180;
  const landscapeConsole = windowWidth > windowHeight;
  const safeBottomGutter = Math.max(insets.bottom, Platform.OS === "android" ? 24 : 0) + 10;
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(() => desktopConsole);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(() => desktopConsole);
  const [activeInspectorPage, setActiveInspectorPage] = useState<InspectorPage>("metrics");
  const repository = useProjectRepository();
  const result = useMemo(() => evaluateLayout(project), [project]);
  const androidNativeProofEnabled = Platform.OS === "android" && process.env.EXPO_PUBLIC_CPLAYOUT_ANDROID_NATIVE_PROOF === "1";
  const nativeMapLibreProofEnabled = Platform.OS === "android" && process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF === "1";
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

  useEffect(() => {
    if (homeMapView) setDesignConsoleModal(null);
  }, [homeMapView]);

  useEffect(() => {
    if (!selectedMapFeatureId) return;
    setActiveInspectorPage("feature");
    setRightDrawerOpen(true);
  }, [selectedMapFeatureId]);

  useEffect(() => {
    if (desktopConsole) {
      setLeftDrawerOpen(true);
      setRightDrawerOpen(true);
      return;
    }
    if (tabletConsole || landscapeConsole) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
  }, [desktopConsole, landscapeConsole, tabletConsole]);

  function applyPivotCoordinate(coordinate: XY, wgs84?: LonLat): void {
    dispatchProject({ type: "place_pivot", point: coordinate, wgs84 });
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
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    dispatchProject({ type: "load_project", project: nextProject });
    setRuntimeMapPackages([]);
    void rehydrateRuntimeMapPackages(loadSequence, nextProject.mapPackages ?? []);
    setSavedRevision(0);
    setSettings((current) => browserLocalSettings(nextProject.settings, current));
    setWalkthroughProgress(loadWalkthroughProgress(nextProject.id));
    setSelectedMapFeatureId(null);
    setHomeMapView(false);
    setActiveView("map");
    setWorkflowMode("design");
    if (context) {
      setActiveCatalogContext((current) => ({ ...current, ...context }));
    }
    setScreen("workspace");
  }

  async function rehydrateRuntimeMapPackages(loadSequence: number, mapPackages: MapPackageManifest[]): Promise<void> {
    try {
      const runtimeManifests = await rehydrateInstalledMapPackageManifestsAsync(mapPackages);
      if (projectLoadSequenceRef.current !== loadSequence || runtimeManifests.length === 0) return;
      setRuntimeMapPackages(runtimeManifests);
    } catch {
      // Runtime tile URLs are opportunistic display state; project metadata stays logical.
    }
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

  function openCatalogHome(): void {
    setScreen("workspace");
    setActiveView("map");
    setHomeMapView(true);
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

  function importMapPackage(manifest: MapPackageManifest, runtimeManifest: MapPackageManifest): string {
    dispatchProject({ type: "upsert_map_package", mapPackage: manifest });
    setRuntimeMapPackages((current) => mergeMapPackageManifests(current, [runtimeManifest]));
    return `Imported map package ${manifest.name}. Save Local to persist package metadata; runtime file URLs stay local to this app install.`;
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

  function activateDesignConsoleTool(mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind): void {
    activateGuidedMapTool(mode, activeLayer, featureKind);
    setDesignConsoleModal(null);
    setActiveView("map");
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
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea} testID="launcher-screen">
        <AndroidNativeProofRunner enabled={androidNativeProofEnabled} />
        <StatusBar style="dark" />
        <View style={[styles.app, { paddingBottom: safeBottomGutter }]}>
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
              onOpenImprovedProof={() => loadProjectDashboard(improvedCenterPivotProofProject)}
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
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea} testID="workspace-screen">
      <AndroidNativeProofRunner enabled={androidNativeProofEnabled} />
      <StatusBar style="dark" />
      <View style={[styles.app, { paddingBottom: safeBottomGutter }]}>
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
          <WorkspaceCommandSurface
            activeView={activeView}
            canRedo={editor.future.length > 0}
            canUndo={editor.past.length > 0}
            dirty={isDirty}
            homeMapView={homeMapView}
            leftDrawerOpen={leftDrawerOpen}
            onCalculatePreview={() => {
              calculateDesignScenarios();
              setDesignConsoleModal("calculate");
              setActiveView("map");
            }}
            onFocusMapTools={() => {
              setDesignConsoleModal(null);
              setActiveView("map");
            }}
            onNavigate={setActiveView}
            onOpenCatalog={openCatalogHome}
            onOpenFiles={() => setActiveView("files")}
            onOpenSample={(nextProject) => loadProjectDashboard(nextProject)}
            onRedo={() => dispatchProject({ type: "redo" })}
            onResetWalkthrough={resetWalkthrough}
            onSave={saveCurrentProject}
            onShowLayers={() => {
              setDesignConsoleModal("layers");
              setActiveView("map");
            }}
            onShowMetrics={() => {
              setActiveInspectorPage("metrics");
              setRightDrawerOpen(true);
              setActiveView("map");
            }}
            onShowWarnings={() => {
              setActiveInspectorPage("validation");
              setRightDrawerOpen(true);
              setActiveView("map");
            }}
            onStartBlankDesign={startBlankDesign}
            onToggleLeftDrawer={() => setLeftDrawerOpen((open) => !open)}
            onToggleRightDrawer={() => setRightDrawerOpen((open) => !open)}
            onUndo={() => dispatchProject({ type: "undo" })}
            rightDrawerOpen={rightDrawerOpen}
          />
        </View>

        <View style={[styles.workspaceShell, activeView !== "map" && compactLayout && styles.workspaceShellCompact, activeView === "map" && styles.workspaceShellConsole]} testID="workspace-shell">
          <ProjectTreeRail
            activeContext={activeCatalogContext}
            activeView={activeView}
            catalog={repository.catalog}
            compact={compactLayout}
            consoleMode={activeView === "map"}
            drawerOpen={activeView === "map" ? leftDrawerOpen : true}
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
            onToggleDrawer={() => setLeftDrawerOpen((open) => !open)}
          />

          <ScrollView
            scrollEnabled={activeView !== "map" || windowWidth < 700}
            style={[styles.workspaceScroll, activeView === "map" && windowWidth >= 700 && styles.workspaceScrollConsole]}
            contentContainerStyle={activeView === "map" ? styles.contentConsole : [styles.content, compactLayout && styles.contentCompact]}
          >
          {activeView === "dashboard" && (
            <ProjectDashboard
              compact={compactLayout}
              dirty={isDirty}
              mode="workspace"
              onCreate={routeToCustomerSelection}
              onOpenFiles={() => setActiveView("files")}
              onOpenImprovedProof={() => loadProjectDashboard(improvedCenterPivotProofProject)}
              onInspectMap={() => {
                setWorkflowMode("layout");
                setActiveView("map");
              }}
              onOpenMap={() => setActiveView("map")}
              onOpenProject={openSavedProject}
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
            <WorkspaceConsoleShell compact={compactLayout} rightDrawerOpen={nativeMapLibreProofEnabled ? false : rightDrawerOpen} testID="map-view">
              <View style={styles.mapConsoleFrame}>
                <MapSurface
                  activeLayer={guidedMapTool?.activeLayer}
                  activeMapFeatureKind={guidedMapTool?.featureKind}
                  activeToolMode={guidedMapTool?.mode}
                  activeToolRequestId={guidedMapTool?.requestId}
                  homeView={homeMapView}
                  project={runtimeProject}
                  result={result}
                  settings={settings}
                  selectedMapFeatureId={selectedMapFeatureId}
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
                {!homeMapView && !nativeMapLibreProofEnabled ? (
                  <View pointerEvents="box-none" style={styles.mapBottomHudOverlay}>
                    <DesignActionHud
                      activeModal={designConsoleModal}
                      activeTool={guidedMapTool}
                      dirty={isDirty}
                      onActivateTool={activateDesignConsoleTool}
                      onCalculate={() => {
                        calculateDesignScenarios();
                        setDesignConsoleModal("calculate");
                      }}
                      onOpenFiles={() => {
                        setDesignConsoleModal(null);
                        setActiveView("files");
                      }}
                      onOpenModal={setDesignConsoleModal}
                      onToggleLayers={() => setDesignConsoleModal((current) => current === "layers" ? null : "layers")}
                      settings={settings}
                    />
                  </View>
                ) : null}
              </View>
              {nativeMapLibreProofEnabled ? null : (
                <InspectorDrawer
                  activePage={activeInspectorPage}
                  homeView={homeMapView}
                  onPageChange={setActiveInspectorPage}
                  onToggle={() => setRightDrawerOpen((open) => !open)}
                  open={rightDrawerOpen}
                >
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
                    {activeInspectorPage === "metrics" ? (
                      <>
                        <Text style={styles.sectionTitle}>Metrics</Text>
                        <View style={styles.metricGrid}>
                          <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
                          <MetricTile label="Dry / non-irrigated" value={formatAreaFromAcres(result.metrics.nonIrrigatedAcres, settings.unitSystem)} tone="warn" />
                          <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} tone="neutral" />
                          <MetricTile label="End gun" value={formatAreaFromAcres(result.metrics.endGunAcres, settings.unitSystem)} tone="neutral" />
                          <MetricTile label="Outside field" value={formatAreaFromAcres(result.metrics.outsideFieldAcres, settings.unitSystem)} tone={result.metrics.outsideFieldAcres > 0 ? "danger" : "good"} />
                          <MetricTile label="Obstacle hits" value={`${result.metrics.obstacleConflictCount}`} tone={result.metrics.obstacleConflictCount > 0 ? "danger" : "good"} />
                          <MetricTile label="Hard path conflicts" value={`${result.metrics.hardMechanicalConflictCount}`} tone={result.metrics.hardMechanicalConflictCount > 0 ? "danger" : "good"} />
                        </View>
                        <View style={styles.mapFeatureEditor} testID="design-console-status">
                          <Text style={styles.mapFeatureTitle}>Design Console</Text>
                          <Text style={styles.mapFeatureMeta}>Use the bottom HUD for drawing and focused inputs. GPS entry uses decimal degrees; projected XY is available only in Expert XY disclosures.</Text>
                        </View>
                      </>
                    ) : null}

                    {activeInspectorPage === "layers" ? (
                      <>
                        <Text style={styles.sectionTitle}>Layers</Text>
                        <LayersSheet
                          mapPackages={runtimeProject.mapPackages ?? []}
                          onOpenFiles={() => {
                            setDesignConsoleModal(null);
                            setActiveView("files");
                          }}
                          onSettingsChange={commitSettings}
                          project={runtimeProject}
                          settings={settings}
                        />
                      </>
                    ) : null}

                    {activeInspectorPage === "rtk" && settings.mappingWorkflowMode === "layout" ? (
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
                    {activeInspectorPage === "rtk" && settings.mappingWorkflowMode !== "layout" ? (
                      <>
                        <Text style={styles.sectionTitle}>RTK Layout Capture</Text>
                        <View style={styles.mapFeatureEditor}>
                          <Text style={styles.mapFeatureTitle}>Layout mode inactive</Text>
                          <Text style={styles.mapFeatureMeta}>Switch to Layout when RTK-only capture is needed. Design mode keeps pointer edits separate from survey capture.</Text>
                        </View>
                      </>
                    ) : null}

                    {activeInspectorPage === "feature" ? (
                      <>
                        <Text style={styles.sectionTitle}>Feature</Text>
                        <MapFeatureEditor
                          feature={selectedMapFeature}
                          onDelete={deleteMapFeature}
                          onRename={updateMapFeatureName}
                          onUpdate={updateMapFeature}
                        />
                      </>
                    ) : null}

                    {activeInspectorPage === "validation" ? (
                      <>
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
                    ) : null}
                  </>
                )}
              </InspectorDrawer>
              )}
            </WorkspaceConsoleShell>
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
            <SettingsPanel mapPackages={runtimeProject.mapPackages ?? []} settings={settings} onChange={commitSettings} />
          )}

          {activeView === "help" && (
            <Section title="Help and Training" icon={<ListChecks size={20} color="#254234" />} testID="help-view">
              <HelpTrainingPanel
                onNavigate={setActiveView}
                onResetWalkthrough={resetWalkthrough}
                onToggleWalkthrough={updateWalkthrough}
                progress={walkthroughProgress}
              />
            </Section>
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
                onMapPackageImported={importMapPackage}
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
      {!homeMapView ? (
        <DesignConsoleDialog
          activeModal={designConsoleModal}
          editorError={editor.lastError}
          onActivateTool={activateDesignConsoleTool}
          onApplyPivot={(point, wgs84) => dispatchProjectWithResult({ type: "place_pivot", point, wgs84 })}
          onCalculate={calculateDesignScenarios}
          onClose={() => setDesignConsoleModal(null)}
          onOpenFiles={() => {
            setDesignConsoleModal(null);
            setActiveView("files");
          }}
          onSettingsChange={commitSettings}
          onUpdateMachine={(machine) => dispatchProjectWithResult({ type: "update_machine", machine })}
          preview={designScenarioPreview}
          project={runtimeProject}
          result={result}
          settings={settings}
          visible={designConsoleModal !== null}
        />
      ) : null}
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
  { id: "imagery", title: "Setup Imagery", checkpoint: "Local aerial package or USGS preview selected with attribution." },
  { id: "boundary", title: "Trace Boundary", checkpoint: "Field boundary draft is inspected and committed as projected XY." },
  { id: "obstacles", title: "Add Obstacles", checkpoint: "Roads, ditches, buildings, and no-spray zones are marked." },
  { id: "pivot", title: "Place Pivot", checkpoint: "Pivot, water source, and power source are positioned." },
  { id: "survey", title: "Survey Points", checkpoint: "RTK or imported control points meet the configured quality gate." },
  { id: "validation", title: "Layout Validation", checkpoint: "Layout warnings are inspected on the Map before export." },
  { id: "export", title: "Export Package", checkpoint: "ZIP/KML/GeoJSON are exported after saving local edits." },
];

function WorkspaceCommandSurface({
  activeView,
  canRedo,
  canUndo,
  dirty,
  homeMapView,
  leftDrawerOpen,
  onCalculatePreview,
  onFocusMapTools,
  onNavigate,
  onOpenCatalog,
  onOpenFiles,
  onOpenSample,
  onRedo,
  onResetWalkthrough,
  onSave,
  onShowLayers,
  onShowMetrics,
  onShowWarnings,
  onStartBlankDesign,
  onToggleLeftDrawer,
  onToggleRightDrawer,
  onUndo,
  rightDrawerOpen,
}: {
  activeView: WorkspaceView;
  canRedo: boolean;
  canUndo: boolean;
  dirty: boolean;
  homeMapView: boolean;
  leftDrawerOpen: boolean;
  onCalculatePreview: () => void;
  onFocusMapTools: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onOpenCatalog: () => void;
  onOpenFiles: () => void;
  onOpenSample: (project: PivotProject) => void;
  onRedo: () => void;
  onResetWalkthrough: () => void;
  onSave: () => void | Promise<void>;
  onShowLayers: () => void;
  onShowMetrics: () => void;
  onShowWarnings: () => void;
  onStartBlankDesign: () => void;
  onToggleLeftDrawer: () => void;
  onToggleRightDrawer: () => void;
  onUndo: () => void;
  rightDrawerOpen: boolean;
}): React.JSX.Element {
  const sampleItems = sampleDesignProjects.map((entry) => ({
    id: `sample-${entry.id}`,
    label: `Open ${entry.label}`,
    description: `${entry.description}${entry.reviewStatus === "needs_review" ? " - needs review baseline." : ""}`,
    icon: entry.reviewStatus === "needs_review" ? <AlertTriangle /> : <MapPinned />,
    onPress: () => onOpenSample(entry.project),
    testID: `command-file-${entry.id}`,
  }));
  const menuIconColor = "#254234";
  const menus: CommandMenuConfig[] = [
    {
      id: "file",
      label: "File",
      icon: <FolderOpen color={menuIconColor} />,
      items: [
        { id: "save", label: dirty ? "Save current design *" : "Save current design", description: "Persist the active project in local storage.", disabled: homeMapView, icon: <Save />, onPress: onSave, testID: "command-file-save" },
        { id: "catalog", label: "Catalog home", description: "Return to the local project catalog map.", icon: <Home />, onPress: onOpenCatalog, testID: "command-file-catalog" },
        ...sampleItems,
        { id: "blank", label: "Start Blank Design", description: "Create an unsaved projected-XY concept layout.", icon: <Wrench />, onPress: onStartBlankDesign, testID: "command-file-blank-design" },
        { id: "files", label: "Files / GIS Exchange", description: "Open ZIP, GeoJSON, KML/KMZ, CSV, and map package tools.", icon: <Download />, onPress: onOpenFiles, testID: "command-file-files" },
      ],
      testID: "command-menu-file",
    },
    {
      id: "reports",
      label: "Reports",
      icon: <ClipboardList color={menuIconColor} />,
      items: [
        { id: "dashboard", label: "Dashboard", description: "Open workflow readiness, warnings, and recent projects.", icon: <Home />, onPress: () => onNavigate("dashboard"), testID: "command-reports-dashboard" },
        { id: "metrics", label: "Metrics Inspector", description: "Show irrigated area, dry area, coverage, conflicts, and warnings.", disabled: homeMapView, icon: <Calculator />, onPress: onShowMetrics, testID: "command-reports-metrics" },
        { id: "warnings", label: "Warnings", description: "Inspect validation warnings without mutating geometry.", disabled: homeMapView, icon: <AlertTriangle />, onPress: onShowWarnings, testID: "command-reports-warnings" },
        { id: "export-readiness", label: "Export Readiness", description: "Review save and package readiness on the dashboard.", icon: <PackageCheck />, onPress: () => onNavigate("dashboard"), testID: "command-reports-export" },
      ],
      testID: "command-menu-reports",
    },
    {
      id: "tools",
      label: "Tools",
      icon: <Wrench color={menuIconColor} />,
      items: [
        { id: "undo", label: "Undo", disabled: !canUndo, icon: <RotateCcw />, onPress: onUndo, testID: "command-tools-undo" },
        { id: "redo", label: "Redo", disabled: !canRedo, icon: <RotateCcw />, onPress: onRedo, testID: "command-tools-redo" },
        { id: "calculate", label: "Calculate Preview", description: "Open design scenario preview without saving or exporting.", disabled: homeMapView, icon: <Calculator />, onPress: onCalculatePreview, testID: "command-tools-calculate" },
        { id: "focus-map", label: "Focus Map Tools", description: "Return to the contextual drawing HUD on the map.", disabled: homeMapView, icon: <MapPinned />, onPress: onFocusMapTools, testID: "command-tools-map-focus" },
        { id: "layers", label: "Places And Layers", description: "Open reference layer controls for local-first display settings.", disabled: homeMapView, icon: <Layers />, onPress: onShowLayers, testID: "command-tools-layers" },
      ],
      testID: "command-menu-tools",
    },
    {
      id: "view",
      label: "View",
      icon: <MapIcon color={menuIconColor} />,
      items: [
        { id: "map", label: "Map Workbench", icon: <MapPinned />, onPress: () => onNavigate("map"), testID: "command-view-map" },
        { id: "dashboard", label: "Dashboard", icon: <Home />, onPress: () => onNavigate("dashboard"), testID: "command-view-dashboard" },
        { id: "survey", label: "Survey", icon: <Satellite />, onPress: () => onNavigate("survey"), testID: "command-view-survey" },
        { id: "files", label: "Files", icon: <Download />, onPress: () => onNavigate("files"), testID: "command-view-files" },
        { id: "project-drawer", label: leftDrawerOpen ? "Collapse Project Drawer" : "Open Project Drawer", disabled: activeView !== "map", icon: <FolderOpen />, onPress: onToggleLeftDrawer, testID: "command-view-project-drawer" },
        { id: "inspector", label: rightDrawerOpen ? "Collapse Inspector" : "Open Inspector", disabled: activeView !== "map", icon: <SlidersHorizontal />, onPress: onToggleRightDrawer, testID: "command-view-inspector" },
      ],
      testID: "command-menu-view",
    },
    {
      id: "connections",
      label: "Connections",
      icon: <Satellite color={menuIconColor} />,
      items: [
        { id: "rtk", label: "RTK / Survey", description: "Open local browser receiver and survey capture readiness.", icon: <Satellite />, onPress: () => onNavigate("survey"), testID: "command-connections-rtk" },
        { id: "imagery", label: "Imagery Status", description: "Review no-key imagery and local package settings.", icon: <WifiOff />, onPress: () => onNavigate("settings"), testID: "command-connections-imagery" },
        { id: "handoff", label: "External Map Handoff", description: "Use Files for KML/KMZ companion exchange; rendering proof stays separate.", icon: <Upload />, onPress: onOpenFiles, testID: "command-connections-handoff" },
      ],
      testID: "command-menu-connections",
    },
    {
      id: "settings",
      label: "Settings",
      icon: <SlidersHorizontal color={menuIconColor} />,
      items: [
        { id: "settings", label: "Settings", icon: <SlidersHorizontal />, onPress: () => onNavigate("settings"), testID: "command-settings-open" },
        { id: "coordinates", label: "Coordinate Display", description: "Configure display formats; projected XY remains canonical.", icon: <Ruler />, onPress: () => onNavigate("settings"), testID: "command-settings-coordinates" },
        { id: "imagery", label: "Imagery Setup", description: "Manage no-key previews and local package metadata.", icon: <Satellite />, onPress: () => onNavigate("settings"), testID: "command-settings-imagery" },
      ],
      testID: "command-menu-settings",
    },
    {
      id: "help",
      label: "Help",
      icon: <ListChecks color={menuIconColor} />,
      items: [
        { id: "help", label: "Help And Training", icon: <ListChecks />, onPress: () => onNavigate("help"), testID: "command-help-open" },
        { id: "reset", label: "Reset Walkthrough", description: "Clear local-only walkthrough progress for the active project.", icon: <RotateCcw />, onPress: onResetWalkthrough, testID: "command-help-reset" },
      ],
      testID: "command-menu-help",
    },
  ];
  const iconButtons: CommandIconButtonConfig[] = [
    { id: "save", label: dirty ? "Save *" : "Save", disabled: homeMapView, icon: <Save />, onPress: onSave, testID: "command-icon-save" },
    { id: "catalog", label: "Catalog", icon: <Home />, onPress: onOpenCatalog, testID: "command-icon-catalog" },
  ];
  if (activeView === "map" && !leftDrawerOpen) {
    iconButtons.push({ id: "sample", label: "Open Sample", icon: <MapPinned />, onPress: () => onOpenSample(sampleProject), testID: "command-icon-open-sample" });
  }
  if (activeView === "map" && homeMapView && !rightDrawerOpen) {
    iconButtons.push({ id: "blank", label: "Start Blank Design", icon: <Wrench />, onPress: onStartBlankDesign, testID: "command-icon-start-blank-design" });
  }

  return <CommandBar iconButtons={iconButtons} menus={menus} testID="workspace-command-bar" />;
}

function DesignActionHud({
  activeModal,
  activeTool,
  dirty,
  onActivateTool,
  onCalculate,
  onOpenFiles,
  onOpenModal,
  onToggleLayers,
  settings,
}: {
  activeModal: DesignConsoleModal;
  activeTool: { activeLayer: DrawingLayerType; featureKind?: ProjectMapFeatureKind; mode: DrawingMode; requestId: number } | null;
  dirty: boolean;
  onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  onCalculate: () => void;
  onOpenFiles: () => void;
  onOpenModal: (modal: DesignConsoleModal) => void;
  onToggleLayers: () => void;
  settings: AppSettings;
}): React.JSX.Element {
  return (
    <DrawingToolPalette
      activeModal={activeModal}
      activeTool={activeTool}
      dirty={dirty}
      onActivateTool={onActivateTool}
      onCalculate={onCalculate}
      onOpenFiles={onOpenFiles}
      onOpenModal={onOpenModal}
      onToggleLayers={onToggleLayers}
      settings={settings}
    />
  );
}

function DesignConsoleDialog({
  activeModal,
  editorError,
  onActivateTool,
  onApplyPivot,
  onCalculate,
  onClose,
  onOpenFiles,
  onSettingsChange,
  onUpdateMachine,
  preview,
  project,
  result,
  settings,
  visible,
}: {
  activeModal: DesignConsoleModal;
  editorError: string | null;
  onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  onApplyPivot: (point: XY, wgs84?: LonLat) => boolean;
  onCalculate: () => void;
  onClose: () => void;
  onOpenFiles: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  onUpdateMachine: (machine: PivotMachine) => boolean;
  preview: DesignScenarioPreview[] | null;
  project: PivotProject;
  result: ReturnType<typeof evaluateLayout>;
  settings: AppSettings;
  visible: boolean;
}): React.JSX.Element | null {
  if (!activeModal) return null;
  const copy = designConsoleCopy(activeModal);
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.consoleModalBackdrop} testID="design-console-dialog-backdrop">
        <View accessibilityViewIsModal style={styles.consoleDialog} testID="design-console-dialog">
          <View style={styles.consoleDialogHeader}>
            <View style={styles.consoleIconBadge}>{copy.icon}</View>
            <View style={styles.consoleDialogTitleBlock}>
              <Text style={styles.consoleDialogTitle}>{copy.title}</Text>
              <Text style={styles.consoleDialogMeta}>{copy.meta}</Text>
            </View>
            <Pressable accessibilityLabel="Close design console dialog" accessibilityRole="button" onPress={onClose} style={styles.consoleCloseButton} testID="design-console-close">
              <Text style={styles.consoleCloseText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.consoleDialogBody} contentContainerStyle={styles.consoleDialogBodyContent}>
            {activeModal === "point" ? <PointToolSheet onActivateTool={onActivateTool} /> : null}
            {activeModal === "line" ? <LineToolSheet onActivateTool={onActivateTool} /> : null}
            {activeModal === "polygon" ? <PolygonToolSheet onActivateTool={onActivateTool} /> : null}
            {activeModal === "circle" ? <CircleToolSheet onActivateTool={onActivateTool} /> : null}
            {activeModal === "obstacle" ? <ObstacleToolSheet onActivateTool={onActivateTool} /> : null}
            {activeModal === "pivot" ? <PivotGpsCoordinateForm onApply={onApplyPivot} project={project} /> : null}
            {activeModal === "machine" ? (
              <MachineSettingsForm machine={project.machine} onChange={onUpdateMachine} unitSystem={settings.unitSystem} />
            ) : null}
            {activeModal === "endGun" ? (
              <EndGunSettingsForm machine={project.machine} onChange={onUpdateMachine} result={result} unitSystem={settings.unitSystem} />
            ) : null}
            {activeModal === "cornerArm" ? (
              <CornerArmSheet
                footprintCount={(project.mapFeatures ?? []).filter((feature) => feature.kind === "corner_swing_limit").length}
                machine={project.machine}
                onActivateTool={onActivateTool}
                result={result}
              />
            ) : null}
            {activeModal === "calculate" ? (
              <CalculateSheet
                editorError={editorError}
                onCalculate={onCalculate}
                preview={preview}
                result={result}
                settings={settings}
              />
            ) : null}
            {activeModal === "layers" ? (
              <LayersSheet
                mapPackages={project.mapPackages ?? []}
                onOpenFiles={onOpenFiles}
                onSettingsChange={onSettingsChange}
                project={project}
                settings={settings}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function designConsoleCopy(modal: NonNullable<DesignConsoleModal>): { icon: React.ReactNode; meta: string; title: string } {
  const color = "#eef7f1";
  switch (modal) {
    case "point":
      return { icon: <MapPin size={21} color={color} />, title: "Placemark Tools", meta: "Place pivot, water, power, control, and utility placemarks from map clicks." };
    case "line":
      return { icon: <Route size={21} color={color} />, title: "Path Tools", meta: "Draw projected XY path features from map clicks; decimal GPS stays the display layer." };
    case "polygon":
      return { icon: <Pentagon size={21} color={color} />, title: "Polygon Tools", meta: "Choose the feature type, then click vertices on the map and commit through projected-XY validation." };
    case "circle":
      return { icon: <Circle size={21} color={color} />, title: "Ruler And Measure Tools", meta: "Use center plus radius-point clicks for advisory circular map features." };
    case "pivot":
      return { icon: <CircleDot size={21} color={color} />, title: "Pivot GPS Entry", meta: "Default entry is WGS84 decimal degrees; projected XY remains internal." };
    case "obstacle":
      return { icon: <Sprout size={21} color={color} />, title: "Obstacle And Constraint Tools", meta: "Draw no-spray and hard-conflict polygons without changing map viewport state." };
    case "machine":
      return { icon: <Wrench size={21} color={color} />, title: "Machine", meta: "Set spans, overhang, sweep, and clearance buffers from source-backed or custom inputs." };
    case "endGun":
      return { icon: <Ruler size={21} color={color} />, title: "End Gun", meta: "End-gun throw and shutoff arcs are separate from corner-arm advisory footprints." };
    case "cornerArm":
      return { icon: <Waypoints size={21} color={color} />, title: "Corner Arm Advisory", meta: "Operator/vendor footprint evidence only; manufacturer kinematics are not modeled." };
    case "calculate":
      return { icon: <Calculator size={21} color={color} />, title: "Calculate", meta: "Preview scenarios and metrics without save/export side effects." };
    case "layers":
      return { icon: <Layers size={21} color={color} />, title: "Places And Layers", meta: "Reference and imagery settings remain no-key, local-first, and separate from canonical projected XY." };
  }
}

function PointToolSheet({ onActivateTool }: { onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void }): React.JSX.Element {
  return (
    <View style={styles.consoleChoiceGrid}>
      <ConsoleChoiceButton label="Pivot Map Click" meta="Click the map to place pivot center." onPress={() => onActivateTool("place_pivot", "pivot_center")} />
      <ConsoleChoiceButton label="Water Source" meta="Click the map to move the water source." onPress={() => onActivateTool("place_pivot", "water_source")} />
      <ConsoleChoiceButton label="Power Source" meta="Click the map to move the power source." onPress={() => onActivateTool("place_pivot", "power_source")} />
      <ConsoleChoiceButton label="Control Point" meta="Capture a manual control point." onPress={() => onActivateTool("capture_point", "control_point")} />
      <ConsoleChoiceButton label="Note Point" meta="Capture a map note point." onPress={() => onActivateTool("capture_point", "note_point")} />
      <ConsoleChoiceButton label="Pump Feature" meta="Save a pump location map feature from one click." onPress={() => onActivateTool("measure", "control_point", "pump_location")} />
      <ConsoleChoiceButton label="Power Pole" meta="Save a utility pole map feature from one click." onPress={() => onActivateTool("measure", "control_point", "power_pole")} />
      <ConsoleChoiceButton label="Tree Point" meta="Save a tree map feature from one click." onPress={() => onActivateTool("measure", "control_point", "tree")} />
    </View>
  );
}

function LineToolSheet({ onActivateTool }: { onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void }): React.JSX.Element {
  const lineKinds: Array<{ kind: ProjectMapFeatureKind; label: string; meta: string }> = [
    { kind: "underground_pipeline", label: "Pipeline", meta: "Click line vertices for buried main or lateral route." },
    { kind: "power_line", label: "Power Line", meta: "Click vertices for overhead or buried power path." },
    { kind: "fence", label: "Fence", meta: "Trace fence path as a utility line." },
    { kind: "access_lane", label: "Access Lane", meta: "Trace farm access or service path." },
    { kind: "ditch", label: "Ditch", meta: "Trace ditch path as a utility line." },
    { kind: "canal", label: "Canal", meta: "Trace canal path as a utility line." },
    { kind: "road", label: "Road", meta: "Trace road edge or access road path." },
  ];
  return (
    <View style={styles.consoleChoiceGrid}>
      {lineKinds.map((option) => (
        <ConsoleChoiceButton key={option.kind} label={option.label} meta={option.meta} onPress={() => onActivateTool("measure", "control_point", option.kind)} />
      ))}
    </View>
  );
}

function PolygonToolSheet({ onActivateTool }: { onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void }): React.JSX.Element {
  return (
    <View style={styles.consoleChoiceGrid}>
      <ConsoleChoiceButton label="Field Boundary" meta="Click vertices; snap or double-click near the first point to close." onPress={() => onActivateTool("draw_boundary", "field_boundary")} />
      <ConsoleChoiceButton label="Obstacle / No-Spray" meta="Draw a hard-conflict no-spray exclusion polygon." onPress={() => onActivateTool("mark_obstacle", "exclusion")} />
      <ConsoleChoiceButton label="Building Footprint" meta="Draw a building obstacle polygon." onPress={() => onActivateTool("mark_obstacle", "building")} />
      <ConsoleChoiceButton label="Corner-Arm Footprint" meta="Draw advisory vendor/operator footprint evidence." onPress={() => onActivateTool("measure", "control_point", "corner_swing_limit")} />
    </View>
  );
}

function CircleToolSheet({ onActivateTool }: { onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void }): React.JSX.Element {
  return (
    <View style={styles.consoleChoiceGrid}>
      <ConsoleChoiceButton label="End-Gun Circle" meta="Click center, then radius point; save as an advisory end-gun map feature." onPress={() => onActivateTool("measure", "control_point", "end_gun_arc")} />
    </View>
  );
}

function ObstacleToolSheet({ onActivateTool }: { onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void }): React.JSX.Element {
  const obstacleLayers: Array<{ layer: DrawingLayerType; label: string; meta: string }> = [
    { layer: "exclusion", label: "No-Spray Area", meta: "Hard conflict and no-spray polygon." },
    { layer: "road", label: "Road", meta: "Road obstacle polygon." },
    { layer: "ditch", label: "Ditch", meta: "Ditch obstacle polygon." },
    { layer: "fence", label: "Fence", meta: "Fence obstacle polygon." },
    { layer: "building", label: "Building", meta: "Building footprint obstacle." },
    { layer: "canal", label: "Canal", meta: "Canal obstacle polygon." },
    { layer: "tree", label: "Tree Row", meta: "Tree or grove obstacle polygon." },
  ];
  return (
    <View style={styles.consoleChoiceGrid}>
      {obstacleLayers.map((option) => (
        <ConsoleChoiceButton key={option.layer} label={option.label} meta={option.meta} onPress={() => onActivateTool("mark_obstacle", option.layer)} />
      ))}
    </View>
  );
}

function ConsoleChoiceButton({ label, meta, onPress }: { label: string; meta: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.consoleChoiceButton}>
      <Text style={styles.consoleChoiceTitle}>{label}</Text>
      <Text style={styles.consoleChoiceMeta}>{meta}</Text>
    </Pressable>
  );
}

function PivotGpsCoordinateForm({ onApply, project }: { onApply: (point: XY, wgs84?: LonLat) => boolean; project: PivotProject }): React.JSX.Element {
  const gpsDefault = useMemo(() => {
    try {
      return { ok: true as const, value: formatCoordinate({ projected: project.pivotCenter, projectCrs: project.projectCrs }, "decimal_degrees", 7), error: null };
    } catch (error) {
      return { ok: false as const, value: coordinateExample("decimal_degrees"), error: error instanceof Error ? error.message : String(error) };
    }
  }, [project.pivotCenter, project.projectCrs]);
  const [gpsText, setGpsText] = useState(gpsDefault.value);
  const [expertOpen, setExpertOpen] = useState(false);
  const [x, setX] = useState(project.pivotCenter.x.toFixed(3));
  const [y, setY] = useState(project.pivotCenter.y.toFixed(3));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGpsText(gpsDefault.value);
    setX(project.pivotCenter.x.toFixed(3));
    setY(project.pivotCenter.y.toFixed(3));
    setError(null);
  }, [gpsDefault.value, project.pivotCenter.x, project.pivotCenter.y]);

  function applyGps(): void {
    if (!gpsDefault.ok) {
      setError(`GPS unavailable until CRS/calibration is set: ${gpsDefault.error}`);
      return;
    }
    const parsed = parseCoordinateInput(gpsText, "decimal_degrees", project.projectCrs);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const accepted = onApply(parsed.coordinate.projected, parsed.coordinate.wgs84);
    setError(accepted ? null : "Pivot coordinate was rejected by project validation.");
  }

  function applyExpertXy(): void {
    try {
      const accepted = onApply({ x: requiredFiniteNumber(x, "Pivot X"), y: requiredFiniteNumber(y, "Pivot Y") });
      setError(accepted ? null : "Pivot XY was rejected by project validation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.machineForm}>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>Pivot latitude, longitude</Text>
        <TextInput
          accessibilityLabel="Pivot latitude and longitude decimal degrees"
          editable={gpsDefault.ok}
          keyboardType="numbers-and-punctuation"
          onChangeText={(value) => {
            setGpsText(value);
            if (error) setError(null);
          }}
          style={[styles.textInput, !gpsDefault.ok && styles.inputDisabled]}
          testID="pivot-gps-input"
          value={gpsText}
        />
        <Text style={styles.mapFeatureMeta}>
          Decimal degrees in WGS84, formatted as latitude, longitude. The reducer receives projected XY after CRS conversion.
        </Text>
        {!gpsDefault.ok ? <Text style={styles.formError}>GPS unavailable until CRS/calibration is set: {gpsDefault.error}</Text> : null}
      </View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.inlineActions}>
        <SmallActionButton disabled={!gpsDefault.ok} label="Apply GPS" onPress={applyGps} />
        <SmallActionButton label={expertOpen ? "Hide Expert XY" : "Expert XY"} onPress={() => setExpertOpen((open) => !open)} />
      </View>
      {expertOpen ? (
        <View style={styles.expertPanel} testID="pivot-expert-xy">
          <Text style={styles.mapFeatureTitle}>Expert XY</Text>
          <Text style={styles.mapFeatureMeta}>Projected/local XY is canonical internal geometry. Use this only for diagnostics or surveyed project coordinates.</Text>
          <View style={styles.formGrid}>
            <FormField label="Pivot X" value={x} onChangeText={setX} />
            <FormField label="Pivot Y" value={y} onChangeText={setY} />
          </View>
          <View style={styles.inlineActions}>
            <SmallActionButton label="Apply Expert XY" onPress={applyExpertXy} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function EndGunSettingsForm({
  machine,
  onChange,
  result,
  unitSystem,
}: {
  machine: PivotMachine;
  onChange: (machine: PivotMachine) => boolean | void;
  result: ReturnType<typeof evaluateLayout>;
  unitSystem: PivotProject["unitSystem"];
}): React.JSX.Element {
  const firstRange = machine.endGunAngleRanges?.[0] ?? null;
  const [throwDistance, setThrowDistance] = useState(formatDistanceInputValue(machine.endGunThrowMeters, unitSystem));
  const [arcEnabled, setArcEnabled] = useState(Boolean(firstRange));
  const [startAngle, setStartAngle] = useState(firstRange ? String(firstRange.startAngleDegrees) : "0");
  const [stopAngle, setStopAngle] = useState(firstRange ? String(firstRange.stopAngleDegrees) : "120");
  const [direction, setDirection] = useState<"clockwise" | "counterclockwise">(firstRange?.direction ?? "counterclockwise");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextRange = machine.endGunAngleRanges?.[0] ?? null;
    setThrowDistance(formatDistanceInputValue(machine.endGunThrowMeters, unitSystem));
    setArcEnabled(Boolean(nextRange));
    setStartAngle(nextRange ? String(nextRange.startAngleDegrees) : "0");
    setStopAngle(nextRange ? String(nextRange.stopAngleDegrees) : "120");
    setDirection(nextRange?.direction ?? "counterclockwise");
    setError(null);
  }, [machine, unitSystem]);

  function apply(): void {
    try {
      const nextMachine: PivotMachine = {
        ...machine,
        endGunThrowMeters: requiredNonNegativeDistanceInput(throwDistance, unitSystem, "End gun throw"),
        endGunAngleRanges: arcEnabled
          ? [{
            startAngleDegrees: requiredFiniteNumber(startAngle, "End gun arc start"),
            stopAngleDegrees: requiredFiniteNumber(stopAngle, "End gun arc stop"),
            direction,
          }]
          : [],
      };
      const accepted = onChange(nextMachine);
      setError(accepted === false ? "End-gun settings were rejected by project validation." : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <View style={styles.machineForm}>
      <View style={styles.metricGrid}>
        <MetricTile label="End-gun acres" value={formatAreaFromAcres(result.metrics.endGunAcres, unitSystem)} />
        <MetricTile label="No-spray conflicts" value={`${result.metrics.noSprayConflictCount}`} tone={result.metrics.noSprayConflictCount > 0 ? "warn" : "good"} />
      </View>
      <Text style={styles.mapFeatureMeta}>
        Use throw distance and optional shutoff arcs for end-gun inspection. Corner-arm footprints remain separate advisory map features.
      </Text>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={styles.formGrid}>
        <FormField label={`Throw (${unitSystem === "metric" ? "m" : "ft/in"})`} value={throwDistance} onChangeText={setThrowDistance} />
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Arc mode</Text>
          <View style={styles.controlRow}>
            <ActionButton label="Full sweep" selected={!arcEnabled} onPress={() => setArcEnabled(false)} />
            <ActionButton label="Angle range" selected={arcEnabled} onPress={() => setArcEnabled(true)} />
          </View>
        </View>
        {arcEnabled ? (
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
      <View style={styles.inlineActions}>
        <SmallActionButton label="Apply End Gun" onPress={apply} />
      </View>
    </View>
  );
}

function CornerArmSheet({
  footprintCount,
  machine,
  onActivateTool,
  result,
}: {
  footprintCount: number;
  machine: PivotMachine;
  onActivateTool: (mode: DrawingMode, activeLayer: DrawingLayerType, featureKind?: ProjectMapFeatureKind) => void;
  result: ReturnType<typeof evaluateLayout>;
}): React.JSX.Element {
  return (
    <View style={styles.machineForm}>
      <View style={styles.metricGrid}>
        <MetricTile label="Advisory footprints" value={`${footprintCount}`} />
        <MetricTile label="Tower track conflicts" value={`${result.metrics.towerTrackConflictCount}`} tone={result.metrics.towerTrackConflictCount > 0 ? "danger" : "good"} />
      </View>
      <Text style={styles.mapFeatureMeta}>
        Corner-arm support is advisory only. Store vendor/operator supplied footprint, track, and coverage evidence as map features; CPLayout does not model manufacturer-specific corner-arm kinematics without source-backed geometry data.
      </Text>
      <Text style={styles.mapFeatureMeta}>
        Catalog compatibility: {machine.catalogSelection ? `${machine.catalogSelection.manufacturer} ${machine.catalogSelection.model} is selected as an advisory snapshot.` : "No catalog preset selected; verify compatibility from operator/vendor sources."}
      </Text>
      <View style={styles.consoleChoiceGrid}>
        <ConsoleChoiceButton label="Draw Footprint Polygon" meta="Click vertices for an advisory corner-arm swing or coverage footprint." onPress={() => onActivateTool("measure", "control_point", "corner_swing_limit")} />
        <ConsoleChoiceButton label="Draw Track Evidence" meta="Trace track or operator-supplied evidence as a utility line." onPress={() => onActivateTool("measure", "control_point", "access_lane")} />
      </View>
    </View>
  );
}

function CalculateSheet({
  editorError,
  onCalculate,
  preview,
  result,
  settings,
}: {
  editorError: string | null;
  onCalculate: () => void;
  preview: DesignScenarioPreview[] | null;
  result: ReturnType<typeof evaluateLayout>;
  settings: AppSettings;
}): React.JSX.Element {
  return (
    <View style={styles.machineForm}>
      <View style={styles.metricGrid}>
        <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} />
        <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
        <MetricTile label="Outside field" value={formatAreaFromAcres(result.metrics.outsideFieldAcres, settings.unitSystem)} tone={result.metrics.outsideFieldAcres > 0 ? "danger" : "good"} />
      </View>
      <Pressable accessibilityRole="button" onPress={onCalculate} style={styles.calculateButton} testID="design-console-calculate">
        <Calculator size={16} color="#ffffff" />
        <Text style={styles.calculateButtonText}>Calculate Preview</Text>
      </Pressable>
      {editorError ? <Text style={styles.formError}>{editorError}</Text> : null}
      <ScenarioPreviewList preview={preview} settings={settings} />
    </View>
  );
}

function LayersSheet({
  mapPackages,
  onOpenFiles,
  onSettingsChange,
  project,
  settings,
}: {
  mapPackages: MapPackageManifest[];
  onOpenFiles: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  project: PivotProject;
  settings: AppSettings;
}): React.JSX.Element {
  const [mapAppStatus, setMapAppStatus] = useState<string | null>(null);
  const mapLibreTarget = Platform.OS === "android"
    ? "android_maplibre_rn"
    : Platform.OS === "ios"
      ? "ios_maplibre_rn"
      : "web_maplibre_gl_js";
  const aerialCandidates = listAerialImageryCandidates({ mapPackages, target: mapLibreTarget });
  const aerialReference = useMemo(
    () => resolveAerialReferenceImagerySource({
      preferences: settings.aerialImagery,
      onlineImagery: settings.onlineImagery,
      mapPackages,
      target: mapLibreTarget,
    }),
    [mapLibreTarget, mapPackages, settings.aerialImagery, settings.onlineImagery],
  );
  const aerialMode = settings.aerialImagery.mode === "off" && settings.onlineImagery.enabled && settings.onlineImagery.providerId === "usgs_imagery_only"
    ? "USGS only"
    : settings.aerialImagery.mode === "off"
      ? "Off"
      : settings.aerialImagery.mode === "manual"
        ? "Manual local"
        : "Auto";
  const aerialStatus = aerialReference.sourceKind === "local_raster"
    ? `Local raster first: ${aerialReference.localAerial.packageName ?? aerialReference.localAerial.packageId}.`
    : aerialReference.sourceKind === "online_provider" && aerialReference.onlineProvider
      ? `${aerialProviderLabel(aerialReference.autoFallback, settings.aerialImagery.mode, aerialReference.onlineProvider.id)}: ${aerialReference.onlineProvider.name}.`
      : aerialReference.reason;

  function setAerialMode(mode: "off" | "auto" | "manual" | "usgs_live_preview"): void {
    if (mode === "usgs_live_preview") {
      onSettingsChange({
        ...settings,
        aerialImagery: { ...settings.aerialImagery, mode: "off" },
        onlineImagery: { ...settings.onlineImagery, enabled: true, providerId: "usgs_imagery_only" },
      });
      return;
    }
    if (mode === "auto") {
      onSettingsChange({
        ...settings,
        aerialImagery: { ...settings.aerialImagery, mode: "auto" },
        onlineImagery: { ...settings.onlineImagery, enabled: true, providerId: "usgs_imagery_only" },
      });
      return;
    }
    onSettingsChange({
      ...settings,
      aerialImagery: { ...settings.aerialImagery, mode },
      onlineImagery: { ...settings.onlineImagery, enabled: false },
    });
  }

  async function openAndroidMapApp(): Promise<void> {
    if (Platform.OS !== "android") {
      setMapAppStatus("External map handoff is Android-only.");
      return;
    }
    try {
      const center = project.wgs84Companion?.pivotCenter ?? projectXyToLonLat(project.pivotCenter, project.projectCrs);
      const label = encodeURIComponent(`${project.name} pivot reference`);
      const url = `geo:0,0?q=${center.latitude.toFixed(7)},${center.longitude.toFixed(7)}(${label})`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setMapAppStatus("No installed map app accepted the geo handoff.");
        return;
      }
      await Linking.openURL(url);
      setMapAppStatus("Opened external map app as a reference handoff.");
    } catch (error) {
      setMapAppStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <View style={styles.machineForm}>
      <View style={styles.metricGrid}>
        <MetricTile label="Aerial imagery" value={aerialMode} />
        <MetricTile label="Reference overlay" value={settings.referenceOverlay.mode === "off" ? "Off" : settings.referenceOverlay.mode} />
        <MetricTile label="Coordinate display" value={COORDINATE_FORMAT_LABELS[settings.coordinateDisplayFormat]} />
      </View>
      <View style={styles.layerGroupGrid} testID="places-layers-summary">
        <LayerGroupCard
          title="Canonical Geometry"
          detail={`${project.fieldBoundary.length} boundary vertices · ${project.obstacles.length} obstacle polygons · ${(project.mapFeatures ?? []).length} map features`}
          meta={`${project.projectCrs} projected XY remains the editable project geometry.`}
        />
        <LayerGroupCard
          title="Map Packages"
          detail={mapPackages.length > 0 ? `${mapPackages.length} imported package${mapPackages.length === 1 ? "" : "s"}` : "No imported local package"}
          meta="Logical package metadata can be saved; runtime file paths stay local to this install."
        />
        <LayerGroupCard
          title="Live Preview Imagery"
          detail={aerialMode}
          meta={aerialStatus}
        />
        <LayerGroupCard
          title="Reference Overlays"
          detail={settings.referenceOverlay.mode === "off" ? "Roads, borders, labels off" : "Roads, borders, labels available"}
          meta="Overlay toggles are reference display controls, not project geometry visibility state."
        />
      </View>
      <Text style={styles.mapFeatureMeta}>
        Auto uses a renderable local raster package first, then the no-key USGS ImageryOnly connected preview. USGS only turns local aerial off and remains a reference handoff outside project ZIPs.
      </Text>
      <Text style={styles.mapFeatureMeta}>
        {aerialStatus}
      </Text>
      <View style={styles.inlineActions}>
        <SmallActionButton
          label="Aerial Off"
          onPress={() => setAerialMode("off")}
        />
        <SmallActionButton
          label="Auto"
          onPress={() => setAerialMode("auto")}
        />
        <SmallActionButton
          label="Manual Local"
          onPress={() => setAerialMode("manual")}
        />
        <SmallActionButton
          label="USGS Only"
          onPress={() => setAerialMode("usgs_live_preview")}
        />
        {Platform.OS === "android" ? (
          <SmallActionButton
            label="Open Maps App"
            onPress={() => void openAndroidMapApp()}
          />
        ) : null}
        <SmallActionButton
          label={settings.referenceOverlay.mode === "off" ? "Overlay On" : "Overlay Off"}
          onPress={() => onSettingsChange({ ...settings, referenceOverlay: { ...settings.referenceOverlay, mode: settings.referenceOverlay.mode === "off" ? "manual" : "off" } })}
        />
        <SmallActionButton label="Import / Export" onPress={onOpenFiles} />
      </View>
      {mapAppStatus ? <Text style={styles.mapFeatureMeta}>{mapAppStatus}</Text> : null}
      {settings.aerialImagery.mode === "manual" && !settings.onlineImagery.enabled ? (
        <Text style={styles.mapFeatureMeta}>
          {aerialCandidates.length > 0
            ? `Manual local aerial candidates: ${aerialCandidates.map((candidate) => candidate.packageName).join(", ")}. Choose the exact package in Settings.`
            : "Manual local aerial needs an imported raster package with local TileJSON or tile URL templates."}
        </Text>
      ) : null}
    </View>
  );
}

function LayerGroupCard({ detail, meta, title }: { detail: string; meta: string; title: string }): React.JSX.Element {
  return (
    <View style={styles.layerGroupCard}>
      <Text style={styles.mapFeatureTitle}>{title}</Text>
      <Text style={styles.mapFeatureMeta}>{detail}</Text>
      <Text style={styles.dashboardMuted}>{meta}</Text>
    </View>
  );
}

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
      <Text style={styles.mapFeatureMeta}>End-gun throw and angle ranges live in the machine form. Use the End gun utility circle for advisory radius or shutoff inspection marks.</Text>
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
        <SmallActionButton label="Apply Coordinates" onPress={apply} />
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
        <SmallActionButton label="Apply Vertices" onPress={apply} />
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
            <Text style={styles.scenarioScore}>{scenario.feasible ? scenario.score.toFixed(1) : "Check"}</Text>
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
  const hasCatalogRecords = catalog.customers.length > 0 || catalog.projects.length > 0 || catalog.fieldMaps.length > 0 || catalog.designs.length > 0;
  const storageLabel = repository.backendInfo?.backendLabel ?? repository.backendLabel;
  const nextAction = hasCatalogRecords ? "Open design" : "Add customer";
  const imageryState = settings.onlineImagery.enabled ? "No-key preview" : "Off";

  return (
    <>
      <Text style={styles.sectionTitle}>Catalog Home</Text>
      <View style={styles.metricGrid} testID="catalog-home-readiness">
        <MetricTile label="Storage" value={storageLabel} />
        <MetricTile label="Active context" value="Catalog" />
        <MetricTile label="Next action" value={nextAction} tone={hasCatalogRecords ? "neutral" : "warn"} />
        <MetricTile label="Imagery" value={imageryState} tone={settings.onlineImagery.enabled ? "neutral" : "good"} />
      </View>
      <View style={styles.mapFeatureEditor} testID="catalog-home-status">
        <Text style={styles.mapFeatureTitle}>{storageLabel}</Text>
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
            <SmallActionButton label="Inspect Map" onPress={onInspectMap} />
            <SmallActionButton label="Export Package" onPress={onOpenFiles} />
          </View>
        </View>
        <View style={styles.dashboardMetricStack}>
          <MetricTile label="Coverage" value={`${result.metrics.coveragePercent.toFixed(1)}%`} tone="neutral" />
          <MetricTile label="Irrigated" value={formatAreaFromAcres(result.metrics.irrigatedAcres, settings.unitSystem)} tone="good" />
          <MetricTile label="Machine radius" value={formatDistance(machineRadiusMeters(project.machine), settings.unitSystem)} />
          <MetricTile label="Layout warnings" value={`${warningCount}`} tone={warningCount > 0 ? "warn" : "good"} />
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
            <SmallActionButton label="Improved Pivot Proof" onPress={onOpenImprovedProof} />
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

        <View style={styles.dashboardPanel} testID="dashboard-layout-warnings">
          <View style={styles.dashboardPanelHeader}>
            <AlertTriangle size={19} color="#173428" />
            <Text style={styles.dashboardPanelTitle}>Layout Warnings</Text>
          </View>
          <View style={styles.dashboardActions}>
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

function HelpTrainingPanel({
  onNavigate,
  onResetWalkthrough,
  onToggleWalkthrough,
  progress,
}: {
  onNavigate: (view: WorkspaceView) => void;
  onResetWalkthrough: () => void;
  onToggleWalkthrough: (moduleId: WalkthroughModuleId, complete: boolean) => void;
  progress: Record<WalkthroughModuleId, boolean>;
}): React.JSX.Element {
  const modules: Array<{
    boundary: string;
    checkpoints: WalkthroughModuleId[];
    detail: string;
    icon: React.ReactNode;
    route: WorkspaceView;
    routeLabel: string;
    testID: string;
    title: string;
  }> = [
    {
      boundary: "Start from a saved project, a sample, or a blank design; local progress stays outside project ZIPs.",
      checkpoints: [],
      detail: "Use the catalog, then move into Map for layout work.",
      icon: <Home size={18} color="#254234" />,
      route: "map",
      routeLabel: "Go to Map",
      testID: "help-module-start",
      title: "Start",
    },
    {
      boundary: "Polygon, Path, Placemark, and Ruler labels map to CPLayout projected-XY tools; viewport pan/zoom state is separate.",
      checkpoints: ["boundary", "obstacles", "pivot"],
      detail: "Trace field polygons, obstacle polygons, utility paths, placemarks, and measurement marks in Design mode.",
      icon: <Pentagon size={18} color="#254234" />,
      route: "map",
      routeLabel: "Go to Map",
      testID: "help-module-map-tools",
      title: "Map Tools",
    },
    {
      boundary: "Google Earth Pro is a local companion reference only; KML/KMZ styles, labels, LookAt, imagery, and screenshots are not canonical geometry.",
      checkpoints: ["boundary", "obstacles"],
      detail: "Use Search, Add Polygon, Add Path, Add Placemark, then import focused KML/KMZ through Files import selection cards.",
      icon: <MapPinned size={18} color="#254234" />,
      route: "files",
      routeLabel: "Go to Files",
      testID: "help-module-google-earth",
      title: "Google Earth Companion",
    },
    {
      boundary: "Local aerial packages and no-key USGS preview are reference layers; they are not stored as geometry.",
      checkpoints: ["imagery"],
      detail: "Choose offline local aerial packages first, use live preview only as capped reference imagery, and keep attribution visible.",
      icon: <Satellite size={18} color="#254234" />,
      route: "settings",
      routeLabel: "Go to Settings",
      testID: "help-module-imagery",
      title: "Imagery",
    },
    {
      boundary: "Validation warnings stay in the layout workflow; Files imports and map edits are operator-selected projected XY changes.",
      checkpoints: ["validation"],
      detail: "Inspect coverage warnings, obstacle conflicts, outside-field acres, and draft validation before export.",
      icon: <ClipboardList size={18} color="#254234" />,
      route: "map",
      routeLabel: "Inspect Map",
      testID: "help-module-layout-validation",
      title: "Layout Validation",
    },
    {
      boundary: "Android SQLite and ZIP behavior require device proof for each runtime claim; browser local storage remains the web MVP backend.",
      checkpoints: ["export"],
      detail: "Save Local before export, keep machine paths local-only, and treat native proof reports separately from browser checks.",
      icon: <Database size={18} color="#254234" />,
      route: "settings",
      routeLabel: "Go to Settings",
      testID: "help-module-android-storage",
      title: "Android Storage",
    },
    {
      boundary: "Project ZIP is canonical. KML/KMZ and GeoJSON are interchange outputs and do not prove Google Earth rendering.",
      checkpoints: ["export"],
      detail: "Export ZIP for backup/handoff, and export KML/KMZ or GeoJSON for visual interchange.",
      icon: <PackageCheck size={18} color="#254234" />,
      route: "files",
      routeLabel: "Go to Files",
      testID: "help-module-export",
      title: "Export",
    },
  ];
  const completedCount = WALKTHROUGH_MODULES.filter((module) => progress[module.id]).length;

  return (
    <View style={styles.helpPanel}>
      <View style={styles.helpHeader} testID="help-training-panel">
        <View style={styles.helpHeaderCopy}>
          <Text style={styles.dashboardCardValue}>{completedCount}/{WALKTHROUGH_MODULES.length} workflow checkpoints</Text>
          <Text style={styles.dashboardMuted}>Training progress uses the same local walkthrough store as the dashboard and stays out of project schemas and archives.</Text>
        </View>
        <View style={styles.helpQuickActions}>
          <HelpActionButton label="Go to Map" onPress={() => onNavigate("map")} testID="help-action-map" />
          <HelpActionButton label="Go to Files" onPress={() => onNavigate("files")} testID="help-action-files" />
          <HelpActionButton label="Go to Settings" onPress={() => onNavigate("settings")} testID="help-action-settings" />
          <HelpActionButton label="Reset" onPress={onResetWalkthrough} testID="help-reset-progress" />
        </View>
      </View>
      <View style={styles.helpModuleGrid}>
        {modules.map((module) => {
          const complete = module.checkpoints.length > 0 && module.checkpoints.every((checkpoint) => progress[checkpoint]);
          return (
            <View key={module.title} style={styles.helpModuleCard} testID={module.testID}>
              <View style={styles.dashboardPanelHeader}>
                {module.icon}
                <Text style={styles.dashboardCardTitle}>{module.title}</Text>
              </View>
              <Text style={styles.dashboardMuted}>{module.detail}</Text>
              <Text style={styles.mapFeatureMeta}>{module.boundary}</Text>
              {module.checkpoints.length > 0 ? (
                <View style={styles.helpCheckpointRow}>
                  {module.checkpoints.map((checkpoint) => (
                    <Pressable
                      accessibilityLabel={`${progress[checkpoint] ? "Clear" : "Complete"} ${walkthroughTitle(checkpoint)} walkthrough checkpoint`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: progress[checkpoint] }}
                      key={checkpoint}
                      onPress={() => onToggleWalkthrough(checkpoint, !progress[checkpoint])}
                      style={[styles.helpCheckpoint, progress[checkpoint] && styles.helpCheckpointComplete]}
                      testID={`help-checkpoint-${checkpoint}`}
                      {...webCheckboxProps(progress[checkpoint], () => onToggleWalkthrough(checkpoint, !progress[checkpoint]))}
                    >
                      {progress[checkpoint] ? <CheckCircle2 size={15} color="#0f5e3d" /> : <Upload size={15} color="#6b796f" />}
                      <Text style={styles.helpCheckpointText}>{walkthroughTitle(checkpoint)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.helpCheckpointText}>Workflow entry point</Text>
              )}
              <View style={styles.inlineActions}>
                <HelpActionButton label={module.routeLabel} onPress={() => onNavigate(module.route)} testID={`${module.testID}-route`} />
                {module.checkpoints.length > 0 ? (
                  <Text style={[styles.helpStatusBadge, complete && styles.helpCompleteBadge]}>{complete ? "Complete" : "In progress"}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HelpActionButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }): React.JSX.Element {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.smallActionButton} testID={testID}>
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function walkthroughTitle(moduleId: WalkthroughModuleId): string {
  return WALKTHROUGH_MODULES.find((module) => module.id === moduleId)?.title ?? moduleId;
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
  if (!settings.onlineImagery.enabled && !progress.imagery) return "Next: choose local aerial package or USGS preview in Settings.";
  if (!progress.imagery) return "Next: confirm imagery attribution and source status.";
  if (project.fieldBoundary.length < 3 || !progress.boundary) return "Next: trace or inspect the field boundary in Design mode.";
  if (project.obstacles.length === 0 || !progress.obstacles) return "Next: add visible obstacles and no-spray zones.";
  if (!progress.pivot) return "Next: place pivot, water source, and power source.";
  if (project.surveyPoints.length === 0 || !progress.survey) return "Next: capture or import survey/control points.";
  if (result.warnings.length > 0 || result.metrics.obstacleConflictCount > 0 || !progress.validation) return "Next: inspect Map validation and resolve layout warnings.";
  if (!progress.export) return "Next: save local edits and export a project package.";
  return "Project is ready for repeat inspection, export, or field handoff.";
}

function editorWarningRows(result: ReturnType<typeof evaluateLayout>): string[] {
  return [
    ...result.warnings,
    ...(result.metrics.obstacleConflictCount > 0 ? [`${result.metrics.obstacleConflictCount} obstacle conflict${result.metrics.obstacleConflictCount === 1 ? "" : "s"} detected.`] : []),
    ...(result.metrics.outsideFieldAcres > 0 ? [`${result.metrics.outsideFieldAcres.toFixed(2)} acres of wet coverage are outside the field.`] : []),
  ];
}

function mergeMapPackageManifests(base: MapPackageManifest[], overrides: MapPackageManifest[]): MapPackageManifest[] {
  const byId = new Map(base.map((mapPackage) => [mapPackage.id, mapPackage]));
  for (const mapPackage of overrides) byId.set(mapPackage.id, mapPackage);
  return [...byId.values()];
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
    validation: false,
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
      validation: parsed.validation === true,
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

function aerialProviderLabel(autoFallback: boolean, aerialMode: AppSettings["aerialImagery"]["mode"], providerId: string): string {
  if (providerId === "usgs_imagery_only" && (autoFallback || aerialMode === "auto")) return "USGS fallback";
  if (providerId === "usgs_imagery_only") return "USGS only";
  return "Connected preview";
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

function WorkspaceConsoleShell({
  children,
  compact,
  rightDrawerOpen,
  testID,
}: {
  children: React.ReactNode;
  compact: boolean;
  rightDrawerOpen: boolean;
  testID?: string;
}): React.JSX.Element {
  return (
    <View style={[styles.consoleShell, compact && styles.consoleShellCompact, !rightDrawerOpen && styles.consoleShellRightCollapsed]} testID={testID}>
      {children}
    </View>
  );
}

const INSPECTOR_PAGES: Array<{ id: InspectorPage; label: string }> = [
  { id: "metrics", label: "Metrics" },
  { id: "layers", label: "Layers" },
  { id: "feature", label: "Feature" },
  { id: "rtk", label: "RTK" },
  { id: "validation", label: "Validation" },
];

function InspectorDrawer({
  activePage,
  children,
  homeView,
  onPageChange,
  onToggle,
  open,
}: {
  activePage: InspectorPage;
  children: React.ReactNode;
  homeView: boolean;
  onPageChange: (page: InspectorPage) => void;
  onToggle: () => void;
  open: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.inspectorDrawer, !open && styles.inspectorDrawerCollapsed]} testID="inspector-drawer">
      <Pressable
        accessibilityLabel={open ? "Collapse map inspector" : "Open map inspector"}
        accessibilityRole="button"
        onPress={onToggle}
        style={styles.inspectorDrawerHandle}
        testID="right-drawer-handle"
      >
        {open ? <ChevronRight size={21} color="#d5e2db" /> : <ChevronLeft size={21} color="#d5e2db" />}
      </Pressable>
      {open ? (
        <View style={styles.inspectorDrawerBody}>
          {!homeView ? (
            <View style={styles.inspectorTabs} testID="inspector-tabs">
              {INSPECTOR_PAGES.map((page) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: activePage === page.id }}
                  aria-selected={activePage === page.id}
                  key={page.id}
                  onPress={() => onPageChange(page.id)}
                  style={[styles.inspectorTab, activePage === page.id && styles.inspectorTabActive]}
                  testID={`inspector-tab-${page.id}`}
                >
                  <Text style={[styles.inspectorTabText, activePage === page.id && styles.inspectorTabTextActive]}>{page.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ScrollView style={styles.inspectorScroll} contentContainerStyle={styles.inspectorContent} testID="inspector-scroll">
            {children}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function ProjectTreeRail({
  activeContext,
  activeView,
  catalog,
  compact,
  consoleMode,
  drawerOpen,
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
  onToggleDrawer,
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
  consoleMode: boolean;
  drawerOpen: boolean;
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
  onToggleDrawer: () => void;
}): React.JSX.Element {
  const visibleCustomers = activeContext.projectId
    ? catalog.customers.filter((customer) => customer.id === activeContext.customerId)
    : catalog.customers;
  const activeProject = activeContext.projectId
    ? catalog.projects.find((project) => project.id === activeContext.projectId) ?? null
    : null;

  return (
    <View style={[styles.leftRail, compact && !consoleMode && styles.leftRailCompact, consoleMode && styles.leftRailConsole, consoleMode && !drawerOpen && styles.leftRailConsoleCollapsed]} testID="workspace-rail">
      {consoleMode ? (
        <Pressable
          accessibilityLabel={drawerOpen ? "Collapse project drawer" : "Open project drawer"}
          accessibilityRole="button"
          onPress={onToggleDrawer}
          style={styles.leftDrawerHandle}
          testID="left-drawer-handle"
        >
          {drawerOpen ? <ChevronLeft size={21} color="#d5e2db" /> : <ChevronRight size={21} color="#d5e2db" />}
        </Pressable>
      ) : null}
      {drawerOpen ? (
        <View style={styles.projectTreePanel} testID="project-tree-rail">
          <View style={styles.projectTreeHeader}>
            <FolderOpen size={18} color="#d5e2db" />
            <Text style={styles.projectTreeTitle}>{activeProject ? activeProject.name : "Project Catalog"}</Text>
          </View>
          <View style={styles.projectTreeActions} testID="project-tree-actions">
            <IconCommandButton icon={<UserRound />} id="customer" label="Customer" onPress={onCreateCustomer} testID="project-tree-action-customer" />
            <IconCommandButton disabled={!activeContext.customerId} icon={<Database />} id="project" label="Project" onPress={onCreateProject} testID="project-tree-action-project" />
            <IconCommandButton disabled={!activeContext.projectId} icon={<MapIcon />} id="field-map" label="Field Map" onPress={onCreateFieldMap} testID="project-tree-action-field-map" />
            <IconCommandButton disabled={!activeContext.fieldMapId} icon={<Layers />} id="design" label="Design" onPress={onCreateDesign} testID="project-tree-action-design" />
            <IconCommandButton icon={<Wrench />} id="blank-design" label="Blank Design" onPress={onStartBlankDesign} testID="project-tree-action-blank-design" />
            <IconCommandButton icon={<MapPinned />} id="open-sample" label="Open Sample" onPress={onOpenSample} testID="project-tree-action-open-sample" />
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
      <View style={[styles.projectTreeNav, compact && !consoleMode && styles.projectTreeNavCompact, consoleMode && styles.projectTreeNavConsole, consoleMode && !drawerOpen && styles.projectTreeNavCollapsed]}>
        <RailButton active={activeView === "dashboard"} collapsed={consoleMode} icon={<Home size={18} />} label="Dashboard" onPress={() => onNavigate("dashboard")} testID="workspace-nav-dashboard" />
        <RailButton active={activeView === "help"} collapsed={consoleMode} icon={<ListChecks size={18} />} label="Help" onPress={() => onNavigate("help")} testID="workspace-nav-help" />
        <RailButton active={activeView === "map"} collapsed={consoleMode} icon={<MapPinned size={18} />} label="Map" onPress={() => onNavigate("map")} testID="workspace-nav-map" />
        <RailButton active={activeView === "survey"} collapsed={consoleMode} icon={<Satellite size={18} />} label="Survey" onPress={() => onNavigate("survey")} testID="workspace-nav-survey" />
        <RailButton active={activeView === "files"} collapsed={consoleMode} icon={<Download size={18} />} label="Files" onPress={() => onNavigate("files")} testID="workspace-nav-files" />
        <RailButton active={activeView === "settings"} collapsed={consoleMode} icon={<SlidersHorizontal size={18} />} label="Settings" onPress={() => onNavigate("settings")} testID="workspace-nav-settings" />
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

function RailButton({ active, collapsed = false, icon, label, onPress, testID }: { active: boolean; collapsed?: boolean; icon: React.ReactNode; label: string; onPress: () => void; testID?: string }): React.JSX.Element {
  const tintedIcon = React.isValidElement<{ color?: string }>(icon)
    ? React.cloneElement(icon, { color: active ? "#ffffff" : "#d5e2db" })
    : icon;
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected: active }} aria-selected={active} onPress={onPress} style={[styles.railButton, collapsed && styles.railButtonCollapsed, active && styles.railButtonActive]} testID={testID}>
      {tintedIcon}
      {!collapsed ? <Text style={[styles.railLabel, active && styles.railLabelActive]}>{label}</Text> : null}
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
  const [spans, setSpans] = useState(formatDistanceInputList(machine.spanLengthsMeters, unitSystem));
  const [overhang, setOverhang] = useState(formatDistanceInputValue(machine.overhangMeters, unitSystem));
  const [towerClearance, setTowerClearance] = useState(formatDistanceInputValue(machine.towerClearanceBufferMeters, unitSystem));
  const [machineClearance, setMachineClearance] = useState(formatDistanceInputValue(machine.machineClearanceBufferMeters, unitSystem));
  const [startAngle, setStartAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.startAngleDegrees) : "210");
  const [stopAngle, setStopAngle] = useState(machine.sweep.mode === "partial_circle" ? String(machine.sweep.stopAngleDegrees) : "35");
  const [direction, setDirection] = useState<"clockwise" | "counterclockwise">(machine.sweep.mode === "partial_circle" ? machine.sweep.direction : "counterclockwise");
  const [mode, setMode] = useState<PivotSweep["mode"]>(machine.sweep.mode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSpans(formatDistanceInputList(machine.spanLengthsMeters, unitSystem));
    setOverhang(formatDistanceInputValue(machine.overhangMeters, unitSystem));
    setTowerClearance(formatDistanceInputValue(machine.towerClearanceBufferMeters, unitSystem));
    setMachineClearance(formatDistanceInputValue(machine.machineClearanceBufferMeters, unitSystem));
    setMode(machine.sweep.mode);
    if (machine.sweep.mode === "partial_circle") {
      setStartAngle(String(machine.sweep.startAngleDegrees));
      setStopAngle(String(machine.sweep.stopAngleDegrees));
      setDirection(machine.sweep.direction);
    }
  }, [machine, unitSystem]);

  function apply(): void {
    try {
      const spanValues = spans.split(",").map((value) => requiredPositiveDistanceInput(value.trim(), unitSystem, "Span length"));
      const nextMachine: PivotMachine = {
        ...machine,
        spanLengthsMeters: spanValues,
        overhangMeters: requiredNonNegativeDistanceInput(overhang, unitSystem, "Overhang"),
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
  const wetRadiusMeters = machineRadiusMeters(machine) + Math.max(0, machine.endGunThrowMeters);

  return (
    <View style={styles.machineForm}>
      <Text style={styles.mapFeatureMeta}>
        Base machine radius {formatDistance(machineRadiusMeters(machine), unitSystem)} · current end-gun adjusted wet radius {formatDistance(wetRadiusMeters, unitSystem)}{unitSystem === "us_survey_feet" ? ` (${formatFeetInches(wetRadiusMeters)})` : ""}. Edit end-gun throw and shutoff arcs in the End Gun sheet.
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
        <FormField label={`Tower clearance (${unitLabel})`} value={towerClearance} onChangeText={setTowerClearance} />
        <FormField label={`Machine clearance (${unitLabel})`} value={machineClearance} onChangeText={setMachineClearance} />
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
    position: "relative",
    zIndex: 40,
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
  workspaceShellConsole: {
    flexDirection: "row",
    overflow: "hidden",
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
  leftRailConsole: {
    flexShrink: 0,
    gap: 8,
    minHeight: 0,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 8,
    width: 292,
  },
  leftRailConsoleCollapsed: {
    alignItems: "center",
    paddingHorizontal: 4,
    width: 64,
  },
  leftRailCompact: {
    borderRightWidth: 0,
    flexShrink: 0,
    maxHeight: 360,
    paddingHorizontal: 8,
    width: "100%",
  },
  workspaceScroll: {
    flex: 1,
    minHeight: 0,
  },
  workspaceScrollConsole: {
    overflow: "hidden",
  },
  projectTreeHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 32,
  },
  projectTreePanel: {
    flex: 1,
    gap: 6,
    minHeight: 0,
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
  projectTreeNavConsole: {
    alignItems: "flex-end",
    alignSelf: "flex-end",
    borderTopWidth: 0,
    flexShrink: 0,
    paddingTop: 0,
    width: 56,
  },
  projectTreeNavCollapsed: {
    alignItems: "center",
    gap: 7,
    width: 56,
  },
  leftDrawerHandle: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#1b3026",
    borderColor: "#30483b",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    width: 56,
  },
  railButton: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  railButtonCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
    width: 48,
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
    paddingVertical: 10,
    minHeight: 44,
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
  contentConsole: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
    padding: 0,
  },
  consoleShell: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 0,
    overflow: "hidden",
    padding: 10,
    width: "100%",
  },
  consoleShellCompact: {
    gap: 8,
    padding: 8,
  },
  consoleShellRightCollapsed: {
    gap: 8,
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
  mapConsoleFrame: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: "relative",
  },
  mapBottomHudOverlay: {
    bottom: 8,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 8,
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
  inspectorDrawer: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    minHeight: 0,
    overflow: "hidden",
    width: 360,
  },
  inspectorDrawerCollapsed: {
    backgroundColor: "#13211b",
    borderColor: "#26392f",
    width: 56,
  },
  inspectorDrawerHandle: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#1b3026",
    justifyContent: "center",
    minHeight: 56,
    width: 56,
  },
  inspectorDrawerBody: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  inspectorTabs: {
    borderBottomColor: "#d8ded6",
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 10,
  },
  inspectorTab: {
    backgroundColor: "#eef4ef",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  inspectorTabActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  inspectorTabText: {
    color: "#254234",
    fontSize: 11,
    fontWeight: "900",
  },
  inspectorTabTextActive: {
    color: "#ffffff",
  },
  inspectorScroll: {
    flex: 1,
    minHeight: 0,
  },
  inspectorContent: {
    gap: 14,
    padding: 14,
    paddingBottom: 20,
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
  layerGroupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  layerGroupCard: {
    backgroundColor: "#f8faf4",
    borderColor: "#d8e0d4",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 156,
    flexGrow: 1,
    gap: 5,
    minWidth: 0,
    padding: 10,
  },
  helpPanel: {
    gap: 14,
  },
  helpHeader: {
    alignItems: "flex-start",
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 14,
  },
  helpHeaderCopy: {
    flexBasis: 320,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 0,
  },
  helpQuickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: "100%",
  },
  helpModuleGrid: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  helpModuleCard: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 300,
    flexGrow: 1,
    gap: 9,
    minWidth: 0,
    padding: 14,
  },
  helpCheckpointRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  helpCheckpoint: {
    alignItems: "center",
    backgroundColor: "#f6faf5",
    borderColor: "#dce4da",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  helpCheckpointComplete: {
    backgroundColor: "#edf7f0",
    borderColor: "#9cc8ad",
  },
  helpCheckpointText: {
    color: "#405146",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
  },
  helpStatusBadge: {
    alignSelf: "center",
    backgroundColor: "#eef4ef",
    borderColor: "#b7c8bb",
    borderRadius: 8,
    borderWidth: 1,
    color: "#254234",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: "uppercase",
  },
  helpCompleteBadge: {
    backgroundColor: "#edf8ef",
    borderColor: "#a8d3b5",
    color: "#1f5f39",
  },
  mapFeatureEditor: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  consoleModalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(12, 22, 17, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 12,
  },
  consoleDialog: {
    backgroundColor: "#fbfcf8",
    borderColor: "#cbd8ce",
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 760,
    overflow: "hidden",
    width: "100%",
  },
  consoleDialogHeader: {
    alignItems: "center",
    backgroundColor: "#f3f7f0",
    borderBottomColor: "#d7e0d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  consoleIconBadge: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  consoleDialogTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  consoleDialogTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  consoleDialogMeta: {
    color: "#53665b",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  consoleCloseButton: {
    backgroundColor: "#eef4ef",
    borderColor: "#c7d6ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  consoleCloseText: {
    color: "#173428",
    fontSize: 12,
    fontWeight: "900",
  },
  consoleDialogBody: {
    minHeight: 0,
  },
  consoleDialogBodyContent: {
    gap: 12,
    padding: 14,
  },
  consoleChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  consoleChoiceButton: {
    backgroundColor: "#f6faf5",
    borderColor: "#d5e0d6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    gap: 5,
    minHeight: 76,
    minWidth: 0,
    padding: 12,
  },
  consoleChoiceTitle: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
  },
  consoleChoiceMeta: {
    color: "#5b6b61",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  expertPanel: {
    backgroundColor: "#f6faf5",
    borderColor: "#d5e0d6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  inputDisabled: {
    backgroundColor: "#edf1ec",
    color: "#65746a",
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
