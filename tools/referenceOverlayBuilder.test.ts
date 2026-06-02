import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReferenceOverlayPackage, CPLAYOUT_REFERENCE_LAYER_FILES } from "./referenceOverlayBuilder";

void main();

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "cplayout-reference-overlay-"));
  const sourceDir = join(root, "source");
  const outDir = join(root, "out");
  await mkdir(sourceDir, { recursive: true });

  const fixtures: Record<string, object> = {
    [CPLAYOUT_REFERENCE_LAYER_FILES.roads]: lineFixture([[-105.25, 40.01], [-105.2, 40.04]]),
    [CPLAYOUT_REFERENCE_LAYER_FILES.road_labels]: lineFixture([[-105.24, 40.02], [-105.21, 40.03]]),
    [CPLAYOUT_REFERENCE_LAYER_FILES.borders]: lineFixture([[-105.26, 40], [-105.19, 40.05]]),
    [CPLAYOUT_REFERENCE_LAYER_FILES.places]: pointFixture([-105.22, 40.035]),
  };
  for (const [fileName, fixture] of Object.entries(fixtures)) {
    await writeFile(join(sourceDir, fileName), JSON.stringify(fixture), "utf8");
  }

  const result = await buildReferenceOverlayPackage({
    sourceDir,
    outDir,
    packageId: "fixture-reference",
    name: "Fixture reference overlay",
    attribution: "US Census TIGER/Line; Natural Earth",
    licenseText: "Fixture data for local tests only.",
    tileUrlTemplate: "http://127.0.0.1:8765/reference/{z}/{x}/{y}.pbf",
    importedAt: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(result.manifest.id, "fixture-reference");
  assert.equal(result.manifest.tileContentType, "vector");
  assert.equal(result.manifest.installStatus, "available");
  assert.deepEqual(result.manifest.tileUrlTemplates, ["http://127.0.0.1:8765/reference/{z}/{x}/{y}.pbf"]);
  assert.deepEqual(result.manifest.vectorOverlay?.sourceLayers, {
    roads: "roads",
    roadLabels: "road_labels",
    borders: "borders",
    places: "places",
  });
  assert.deepEqual(result.manifest.boundsWgs84, {
    minLongitude: -105.26,
    minLatitude: 40,
    maxLongitude: -105.19,
    maxLatitude: 40.05,
  });
  assert.equal(result.normalizedLayerPaths.length, 4);

  const tileJson = JSON.parse(await readFile(result.tileJsonPath, "utf8")) as {
    vector_layers: Array<{ id: string }>;
    tiles: string[];
  };
  assert.deepEqual(tileJson.vector_layers.map((layer) => layer.id), ["roads", "road_labels", "borders", "places"]);
  assert.deepEqual(tileJson.tiles, ["http://127.0.0.1:8765/reference/{z}/{x}/{y}.pbf"]);

  await assert.rejects(
    () => buildReferenceOverlayPackage({
      sourceDir,
      outDir: join(root, "bad"),
      packageId: "bad-reference",
      name: "Bad reference",
      attribution: "Bad",
      licenseText: "Bad",
      tileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.pbf?api_key=secret",
    }),
    /hidden credentials|local file/,
  );

  console.log("reference overlay builder tests passed");
}

function lineFixture(coordinates: number[][]): object {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "Fixture" },
      geometry: { type: "LineString", coordinates },
    }],
  };
}

function pointFixture(coordinates: number[]): object {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "Fixture place" },
      geometry: { type: "Point", coordinates },
    }],
  };
}
