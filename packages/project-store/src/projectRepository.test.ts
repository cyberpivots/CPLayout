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

async function run(): Promise<void> {
  globalThis.localStorage.clear();

  const editedProject = buildEditedProjectFromEditorActions();
  await projectRepository.saveProjectAsync(editedProject, evaluateLayout(editedProject));
  const summaries = await projectRepository.listProjectsAsync();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.id, editedProject.id);

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
