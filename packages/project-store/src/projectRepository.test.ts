import assert from "node:assert/strict";

import {
  exportProjectGoogleEarthKml,
  sampleProject,
  type PivotProject,
} from "@cplayout/core";
import { evaluateLayout, exportScenarioGeoJson } from "@cplayout/geometry";
import {
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

const editedProject: PivotProject = {
  ...sampleProject,
  id: "saveable-geometry-edit-proof",
  name: "Saveable Geometry Edit Proof",
  fieldBoundary: sampleProject.fieldBoundary.map((point, index) =>
    index === 0 ? { x: point.x - 18, y: point.y + 11 } : point,
  ),
  obstacles: sampleProject.obstacles.map((obstacle, obstacleIndex) =>
    obstacleIndex === 0
      ? {
        ...obstacle,
        name: "Edited road obstacle",
        polygon: obstacle.polygon.map((point, vertexIndex) =>
          vertexIndex === 1 ? { x: point.x + 9, y: point.y - 7 } : point,
        ),
      }
      : obstacle,
  ),
  mapFeatures: [
    {
      id: "iteration-4-utility-line",
      name: "Iteration 4 utility line",
      kind: "power_line",
      geometry: {
        type: "LineString",
        vertices: [
          { x: sampleProject.powerSource.x + 3, y: sampleProject.powerSource.y + 4 },
          { x: sampleProject.pivotCenter.x - 5, y: sampleProject.pivotCenter.y + 6 },
        ],
      },
      confidence: "user_estimated",
      notes: "Save/reopen/export proof feature.",
    },
  ],
};

async function run(): Promise<void> {
  globalThis.localStorage.clear();

  await projectRepository.saveProjectAsync(editedProject, evaluateLayout(editedProject));
  const summaries = await projectRepository.listProjectsAsync();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.id, editedProject.id);

  const reloaded = await projectRepository.loadProjectAsync(editedProject.id);
  assert.ok(reloaded);
  assert.deepEqual(reloaded.fieldBoundary, editedProject.fieldBoundary);
  assert.deepEqual(reloaded.obstacles[0]?.polygon, editedProject.obstacles[0]?.polygon);
  assert.equal(reloaded.obstacles[0]?.name, "Edited road obstacle");
  assert.deepEqual(reloaded.mapFeatures, editedProject.mapFeatures);

  const result = evaluateLayout(reloaded);
  const archiveBundle = buildProjectArchiveBundle(reloaded, result, exportScenarioGeoJson(reloaded, result), "2026-05-28T12:00:00.000Z");
  assert.match(archiveBundle.files[PROJECT_JSON_FILENAME], /Saveable Geometry Edit Proof/);
  assert.match(archiveBundle.files[PROJECT_JSON_FILENAME], /Iteration 4 utility line/);
  const archiveRoundTrip = importProjectArchiveZip(exportProjectArchiveZip(archiveBundle));
  assert.deepEqual(archiveRoundTrip.fieldBoundary, editedProject.fieldBoundary);
  assert.deepEqual(archiveRoundTrip.obstacles[0]?.polygon, editedProject.obstacles[0]?.polygon);
  assert.deepEqual(archiveRoundTrip.mapFeatures, editedProject.mapFeatures);

  const kml = exportProjectGoogleEarthKml(reloaded, result);
  assert.match(kml.kml, /Edited road obstacle/);
  assert.match(kml.kml, /Iteration 4 utility line/);
  assert.match(kml.kml, /iteration-4-utility-line/);
  assert.ok(kml.exportedFeatureCount >= reloaded.obstacles.length + (reloaded.mapFeatures?.length ?? 0) + 4);

  console.log("project repository saveable geometry tests passed");
}

run().catch((error: unknown) => {
  throw error;
});
