import assert from "node:assert/strict";

import {
  createProjectEditorState,
  exportProjectGoogleEarthKml,
  reduceProjectEditorState,
  realCenterPivotProofProject,
  sampleProject,
  type PivotProject,
} from "@cplayout/core";
import { evaluateLayout, exportScenarioGeoJson, validateCenterPivotProofGeometry } from "@cplayout/geometry";
import {
  PROJECT_GOOGLE_EARTH_KML_FILENAME,
  PROJECT_JSON_FILENAME,
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
} from "./projectArchive";
import { projectRepository } from "./projectRepository";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
});

const CATALOG_STORAGE_KEY = "center-pivot-layout-project-catalog-v1";

async function run(): Promise<void> {
  globalThis.localStorage.clear();

  globalThis.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify({
    customers: [{
      id: "legacy-profile-customer",
      displayName: "Legacy Profile Customer",
      sortName: "Legacy Profile Customer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }],
    projects: [],
    fieldMaps: [],
    designs: [],
  }));
  const backfilledCatalog = await projectRepository.listProjectCatalogAsync();
  assert.equal(backfilledCatalog.customers[0]?.companyName, "Legacy Profile Customer");
  assert.equal(backfilledCatalog.customers[0]?.contactName, "");
  assert.equal(backfilledCatalog.customers[0]?.primaryContactFirstName, "");
  assert.equal(backfilledCatalog.customers[0]?.primaryContactLastName, "");
  assert.equal(backfilledCatalog.customers[0]?.email, "");
  assert.match(globalThis.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "", /"companyName":"Legacy Profile Customer"/);
  assert.match(globalThis.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "", /"contactName":""/);
  assert.match(globalThis.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "", /"primaryContactLastName":""/);

  globalThis.localStorage.clear();
  const profileCustomer = await projectRepository.createCustomerAsync({
    companyName: "Profile Farms",
    primaryContactFirstName: "Ana",
    primaryContactMiddleInitial: "J",
    primaryContactLastName: "Operator",
    primaryContactSuffix: "Jr.",
    email: "ana@example.test",
    phone: "555-0100",
    location: "Adams County",
    notes: "Local-only customer profile.",
  });
  assert.equal(profileCustomer.companyName, "Profile Farms");
  assert.equal(profileCustomer.displayName, "Profile Farms");
  assert.equal(profileCustomer.contactName, "Operator, Ana J. Jr.");
  const updatedProfileCustomer = await projectRepository.updateCustomerAsync({
    id: profileCustomer.id,
    companyName: "Profile Farms LLC",
    phone: "555-0199",
    notes: "",
  });
  assert.equal(updatedProfileCustomer.displayName, "Profile Farms LLC");
  assert.equal(updatedProfileCustomer.phone, "555-0199");
  assert.equal(updatedProfileCustomer.email, "ana@example.test");
  await projectRepository.deleteCustomerAsync(profileCustomer.id);
  assert.equal((await projectRepository.listProjectCatalogAsync()).customers.some((customer) => customer.id === profileCustomer.id), false);

  const sourceCustomer = await projectRepository.createCustomerAsync({
    companyName: "Source Farms",
    primaryContactFirstName: "Sam",
    primaryContactLastName: "Source",
  });
  const targetCustomer = await projectRepository.createCustomerAsync({
    companyName: "Target Farms",
    primaryContactFirstName: "Tara",
    primaryContactLastName: "Target",
  });
  const catalogOnlyWorkspace = await projectRepository.createProjectWithInitialFieldMapAsync({
    customerId: sourceCustomer.id,
    projectId: "catalog-only-project",
    projectName: "Catalog Only Project",
    projectCrs: sampleProject.projectCrs,
    unitSystem: sampleProject.unitSystem,
    fieldMapId: "catalog-only-project:field-map:primary",
    fieldMapName: "Primary Field Map",
  });
  assert.equal(catalogOnlyWorkspace.projectRecord.customerId, sourceCustomer.id);
  assert.equal(catalogOnlyWorkspace.fieldMap.projectId, "catalog-only-project");
  let catalogOnlyCatalog = await projectRepository.listProjectCatalogAsync();
  assert.equal(catalogOnlyCatalog.projects.some((record) => record.id === "catalog-only-project"), true);
  assert.equal(catalogOnlyCatalog.fieldMaps.filter((record) => record.projectId === "catalog-only-project").length, 1);
  assert.equal(catalogOnlyCatalog.designs.filter((record) => record.fieldMapId === catalogOnlyWorkspace.fieldMap.id).length, 0);
  assert.equal(await projectRepository.loadProjectAsync("catalog-only-project"), null);
  await assert.rejects(
    () => projectRepository.createDesignRecordAsync({
      fieldMapId: catalogOnlyWorkspace.fieldMap.id,
      name: "Missing Design Document",
      pivotProjectId: "missing-design-project",
    }),
    /saved design project/,
  );
  const importedDesignProject: PivotProject = {
    ...sampleProject,
    id: "catalog-only-imported-design",
    name: "Catalog Only Imported Design",
  };
  await projectRepository.saveProjectAsync(importedDesignProject, evaluateLayout(importedDesignProject));
  const explicitDesign = await projectRepository.createDesignRecordAsync({
    fieldMapId: catalogOnlyWorkspace.fieldMap.id,
    name: "Imported Design",
    pivotProjectId: importedDesignProject.id,
  });
  assert.equal(explicitDesign.pivotProjectId, importedDesignProject.id);
  assert.equal((await projectRepository.loadDesignProjectAsync(explicitDesign.id))?.id, importedDesignProject.id);
  await projectRepository.deleteProjectAsync("catalog-only-project");
  catalogOnlyCatalog = await projectRepository.listProjectCatalogAsync();
  assert.equal(catalogOnlyCatalog.projects.some((record) => record.id === "catalog-only-project"), false);
  assert.equal(catalogOnlyCatalog.designs.some((record) => record.pivotProjectId === importedDesignProject.id), false);

  const managedProject: PivotProject = {
    ...sampleProject,
    id: "managed-customer-project",
    name: "Managed Customer Project",
  };
  const createdWorkspace = await projectRepository.createProjectWithInitialDesignAsync({
    customerId: sourceCustomer.id,
    project: managedProject,
    result: evaluateLayout(managedProject),
  });
  assert.equal(createdWorkspace.projectRecord.customerId, sourceCustomer.id);
  assert.equal(createdWorkspace.fieldMap.projectId, managedProject.id);
  assert.equal(createdWorkspace.design.pivotProjectId, managedProject.id);
  await assert.rejects(
    () => projectRepository.deleteCustomerAsync(sourceCustomer.id),
    /still contains projects/,
  );
  const renamedProject = await projectRepository.renameProjectAsync(managedProject.id, "Renamed Managed Project");
  assert.equal(renamedProject.name, "Renamed Managed Project");
  const renamedReloaded = await projectRepository.loadProjectAsync(managedProject.id);
  assert.ok(renamedReloaded);
  assert.equal(renamedReloaded?.name, "Renamed Managed Project");
  assert.deepEqual(renamedReloaded?.fieldBoundary, managedProject.fieldBoundary);
  const movedProjectRecord = await projectRepository.moveProjectToCustomerAsync(managedProject.id, targetCustomer.id);
  assert.equal(movedProjectRecord.customerId, targetCustomer.id);
  const movedCatalog = await projectRepository.listProjectCatalogAsync();
  assert.equal(movedCatalog.projects.find((record) => record.id === managedProject.id)?.customerId, targetCustomer.id);
  assert.equal(movedCatalog.fieldMaps.filter((record) => record.projectId === managedProject.id).length, 1);
  assert.equal(movedCatalog.designs.filter((record) => record.pivotProjectId === managedProject.id).length, 1);
  const profileArchiveBundle = buildProjectArchiveBundle(
    renamedReloaded,
    evaluateLayout(renamedReloaded),
    exportScenarioGeoJson(renamedReloaded, evaluateLayout(renamedReloaded)),
    "2026-06-01T12:00:00.000Z",
  );
  assert.doesNotMatch(profileArchiveBundle.files[PROJECT_JSON_FILENAME], /Operator, Ana J\. Jr\.|Profile Farms|Source Farms|Target Farms/);
  await projectRepository.deleteProjectAsync(managedProject.id);
  const afterManagedDelete = await projectRepository.listProjectCatalogAsync();
  assert.equal(afterManagedDelete.projects.some((record) => record.id === managedProject.id), false);
  assert.equal(afterManagedDelete.fieldMaps.some((record) => record.projectId === managedProject.id), false);
  assert.equal(afterManagedDelete.designs.some((record) => record.pivotProjectId === managedProject.id), false);
  await projectRepository.deleteCustomerAsync(sourceCustomer.id);
  await projectRepository.deleteCustomerAsync(targetCustomer.id);

  globalThis.localStorage.clear();
  const editedProject = buildEditedProjectFromEditorActions();
  await projectRepository.saveProjectAsync(editedProject, evaluateLayout(editedProject));
  const summaries = await projectRepository.listProjectsAsync();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.id, editedProject.id);
  const legacyCatalog = await projectRepository.listProjectCatalogAsync();
  assert.equal(legacyCatalog.customers[0]?.displayName, "Example Customer");
  assert.equal(legacyCatalog.projects[0]?.customerId, "example-customer");
  assert.equal(legacyCatalog.fieldMaps[0]?.name, "Primary Field Map");
  assert.equal(legacyCatalog.designs[0]?.pivotProjectId, editedProject.id);

  const reloaded = await projectRepository.loadProjectAsync(editedProject.id);
  assert.ok(reloaded);
  assert.deepEqual(reloaded.fieldBoundary, editedProject.fieldBoundary);
  assert.deepEqual(
    reloaded.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon,
    editedProject.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon,
  );
  assert.equal(reloaded.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.name, "Iteration 5 obstacle proof");
  assert.deepEqual(reloaded.mapFeatures, editedProject.mapFeatures);

  const result = evaluateLayout(reloaded);
  const archiveBundle = buildProjectArchiveBundle(reloaded, result, exportScenarioGeoJson(reloaded, result), "2026-05-28T12:00:00.000Z");
  assert.match(archiveBundle.files[PROJECT_JSON_FILENAME], /Browser Editor Workflow Proof/);
  assert.match(archiveBundle.files[PROJECT_JSON_FILENAME], /Iteration 5 utility line/);
  assert.match(archiveBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Iteration 5 obstacle proof/);
  assert.match(archiveBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Iteration 5 utility line/);
  const archiveRoundTrip = importProjectArchiveZip(exportProjectArchiveZip(archiveBundle));
  assert.deepEqual(archiveRoundTrip.fieldBoundary, editedProject.fieldBoundary);
  assert.deepEqual(
    archiveRoundTrip.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon,
    editedProject.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon,
  );
  assert.deepEqual(archiveRoundTrip.mapFeatures, editedProject.mapFeatures);

  const kml = exportProjectGoogleEarthKml(reloaded, result);
  assert.match(kml.kml, /Iteration 5 obstacle proof/);
  assert.match(kml.kml, /Iteration 5 utility line/);
  assert.match(kml.kml, /iteration-5-utility-line/);
  assert.ok(kml.exportedFeatureCount >= reloaded.obstacles.length + (reloaded.mapFeatures?.length ?? 0) + 4);

  const proofResult = evaluateLayout(realCenterPivotProofProject);
  assert.deepEqual(validateCenterPivotProofGeometry(realCenterPivotProofProject, proofResult), []);
  await projectRepository.saveProjectAsync(realCenterPivotProofProject, proofResult);
  const proofReloaded = await projectRepository.loadProjectAsync(realCenterPivotProofProject.id);
  assert.ok(proofReloaded);
  assert.equal(proofReloaded.fieldBoundary.length, realCenterPivotProofProject.fieldBoundary.length);
  assert.equal(proofReloaded.obstacles.length, realCenterPivotProofProject.obstacles.length);
  assert.deepEqual(validateCenterPivotProofGeometry(proofReloaded, evaluateLayout(proofReloaded)), []);
  const proofBundle = buildProjectArchiveBundle(
    proofReloaded,
    evaluateLayout(proofReloaded),
    exportScenarioGeoJson(proofReloaded, evaluateLayout(proofReloaded)),
    "2026-05-29T12:00:00.000Z",
  );
  assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Base pivot wet circle/);
  assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Allowed irrigated coverage/);
  assert.match(proofBundle.files[PROJECT_GOOGLE_EARTH_KML_FILENAME], /Public proof pivot center/);

  const customerB = await projectRepository.createCustomerAsync({
    companyName: "Zephyr Farms",
    primaryContactFirstName: "Zane",
    primaryContactLastName: "Zephyr",
  });
  const customerA = await projectRepository.createCustomerAsync({
    companyName: "Adams Irrigation",
    primaryContactFirstName: "Ada",
    primaryContactLastName: "Adams",
  });
  const catalog = await projectRepository.listProjectCatalogAsync();
  assert.deepEqual(
    catalog.customers.map((customer) => customer.displayName).slice(0, 2),
    ["Adams Irrigation", "Example Customer"],
  );
  const projectRecord = await projectRepository.createProjectRecordAsync({
    customerId: customerA.id,
    id: "adams-catalog-project",
    name: "Adams North Unit",
    projectCrs: editedProject.projectCrs,
    unitSystem: editedProject.unitSystem,
  });
  const fieldMap = await projectRepository.createFieldMapRecordAsync({
    id: "adams-north-field-map",
    projectId: projectRecord.id,
    name: "North Quarter",
  });
  const design = await projectRepository.createDesignRecordAsync({
    id: "adams-north-design",
    fieldMapId: fieldMap.id,
    name: "Base Pivot",
    pivotProjectId: editedProject.id,
  });
  await projectRepository.saveDesignProjectAsync(design.id, { ...editedProject, name: "Adams North Base Pivot" }, evaluateLayout(editedProject));
  const designReloaded = await projectRepository.loadDesignProjectAsync(design.id);
  assert.ok(designReloaded);
  assert.equal(designReloaded.name, "Adams North Base Pivot");
  assert.ok(customerB.id.startsWith("customer-"));

  console.log("project repository saveable geometry tests passed");
}

function buildEditedProjectFromEditorActions(): PivotProject {
  let state = createProjectEditorState({
    ...sampleProject,
    id: "browser-editor-workflow-proof",
    name: "Browser Editor Workflow Proof",
  });
  const boundaryDraft = [
    { x: 500980, y: 4506190 },
    { x: 501360, y: 4506170 },
    { x: 501420, y: 4506520 },
    { x: 501160, y: 4506810 },
    { x: 500940, y: 4506570 },
  ];
  state = reduceProjectEditorState(state, { type: "commit_boundary_draft", vertices: boundaryDraft });
  assert.equal(state.lastError, null);
  assert.deepEqual(state.project.fieldBoundary, boundaryDraft);

  state = reduceProjectEditorState(state, {
    type: "move_boundary_vertex",
    vertexIndex: 0,
    point: { x: 500970, y: 4506205 },
  });
  state = reduceProjectEditorState(state, { type: "delete_boundary_vertex", vertexIndex: 4 });
  assert.equal(state.project.fieldBoundary.length, 4);

  state = reduceProjectEditorState(state, {
    type: "commit_obstacle_draft",
    id: "iteration-5-obstacle-proof",
    kind: "exclusion",
    name: "Iteration 5 obstacle proof",
    vertices: [
      { x: 501060, y: 4506320 },
      { x: 501150, y: 4506330 },
      { x: 501150, y: 4506410 },
      { x: 501060, y: 4506410 },
    ],
  });
  state = reduceProjectEditorState(state, {
    type: "move_obstacle_vertex",
    obstacleId: "iteration-5-obstacle-proof",
    vertexIndex: 1,
    point: { x: 501170, y: 4506345 },
  });
  state = reduceProjectEditorState(state, {
    type: "delete_obstacle_vertex",
    obstacleId: "iteration-5-obstacle-proof",
    vertexIndex: 3,
  });
  assert.equal(state.project.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon.length, 3);

  const afterVertexDelete = state.project;
  state = reduceProjectEditorState(state, { type: "undo" });
  assert.equal(state.project.obstacles.find((obstacle) => obstacle.id === "iteration-5-obstacle-proof")?.polygon.length, 4);
  state = reduceProjectEditorState(state, { type: "redo" });
  assert.deepEqual(state.project, afterVertexDelete);

  state = reduceProjectEditorState(state, {
    type: "add_map_feature",
    feature: {
      id: "iteration-5-utility-line",
      name: "Iteration 5 utility line",
      kind: "power_line",
      geometry: {
        type: "LineString",
        vertices: [
          { x: sampleProject.powerSource.x + 12, y: sampleProject.powerSource.y - 18 },
          { x: sampleProject.pivotCenter.x - 22, y: sampleProject.pivotCenter.y + 16 },
        ],
      },
      confidence: "user_estimated",
      notes: "Browser editor save/reopen/export proof feature.",
    },
  });
  assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "iteration-5-utility-line"), true);
  state = reduceProjectEditorState(state, { type: "undo" });
  assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "iteration-5-utility-line"), false);
  state = reduceProjectEditorState(state, { type: "redo" });
  assert.equal(state.project.mapFeatures?.some((feature) => feature.id === "iteration-5-utility-line"), true);

  return state.project;
}

run().catch((error: unknown) => {
  throw error;
});
