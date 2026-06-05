import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateDefaultRealPivotFixtureManifest } from "./generateRealPivotFixtureManifest";

const root = mkdtempSync(join(tmpdir(), "cplayout-real-pivot-fixture-"));
const proofDirectory = join(root, "proof");
const outputPath = join(root, "fixtures", "real-pivot", "manifest.json");
const projectReferencePath = join(root, "project.json");

try {
  mkdirSync(proofDirectory, { recursive: true });
  writeFileSync(projectReferencePath, JSON.stringify({
    id: "public-adams-county-center-pivot-proof",
    name: "Public Adams County Center Pivot Proof",
    projectCrs: "EPSG:32613",
    pivotCenter: { x: 579493.155811059, y: 4417307.984825746 },
    surveyPoints: [{
      id: "public-proof-pivot-center",
      role: "pivot_center",
      projected: { x: 579493.155811059, y: 4417307.984825746 },
      wgs84: { latitude: 39.902125, longitude: -104.070061 },
      source: "manual",
      confidence: "imagery_digitized",
      notes: "Fixture truth.",
    }],
  }), "utf8");
  for (const filename of [
    "google-earth-visual-fidelity-map-canvas.png",
    "google-earth-visual-fidelity-full-window.png",
    "google-earth-visual-fidelity-places-sidebar.png",
    "visual-fidelity-manifest.json",
    "cplayout-google-earth-visual-fidelity.kml",
    "cplayout-google-earth-visual-fidelity.kmz",
    "generated-fixture.json",
  ]) {
    writeFileSync(join(proofDirectory, filename), `fixture ${filename}`, "utf8");
  }

  const result = generateDefaultRealPivotFixtureManifest({
    outputPath,
    proofDirectory,
    projectReferencePath,
    generatedAt: "2026-06-03T00:00:00.000Z",
  });
  assert.equal(result.projectId, "public-adams-county-center-pivot-proof");
  assert.equal(result.projectCrs, "EPSG:32613");
  assert.equal(result.artifactCount, 8);

  const manifest = JSON.parse(readFileSync(outputPath, "utf8")) as {
    schemaVersion?: string;
    canonicalGeometryMutation?: boolean;
    fixtures?: Array<{
      operatorApproved?: boolean;
      calibrationStatus?: string;
      artifacts?: Record<string, string>;
      artifactHashes?: Record<string, string>;
      truthLabels?: { TRUE_PIVOT_CENTER?: { projectedPoint?: { x?: number; y?: number } } };
      provenance?: { keyedService?: boolean; networkRequired?: boolean };
    }>;
  };
  const fixture = manifest.fixtures?.[0];
  assert.equal(manifest.schemaVersion, "cplayout-real-pivot-fixtures-v1");
  assert.equal(manifest.canonicalGeometryMutation, false);
  assert.equal(fixture?.operatorApproved, true);
  assert.equal(fixture?.calibrationStatus, "valid_projected_xy");
  assert.equal(fixture?.provenance?.keyedService, false);
  assert.equal(fixture?.provenance?.networkRequired, false);
  assert.equal(fixture?.truthLabels?.TRUE_PIVOT_CENTER?.projectedPoint?.x, 579493.155811059);
  assert.equal(
    fixture?.artifactHashes?.mapCanvasCrop,
    createHash("sha256").update("fixture google-earth-visual-fidelity-map-canvas.png").digest("hex"),
  );
  assert.match(fixture?.artifacts?.mapCanvasCrop ?? "", /\.\.\/\.\.\/proof\/google-earth-visual-fidelity-map-canvas\.png/);

  const fallbackOutputPath = join(root, "fixtures", "real-pivot", "fallback-manifest.json");
  const fallback = generateDefaultRealPivotFixtureManifest({
    outputPath: fallbackOutputPath,
    proofDirectory,
    projectReferencePath: join(root, "missing-project-reference.json"),
    generatedAt: "2026-06-03T00:00:00.000Z",
  });
  assert.equal(fallback.projectId, "public-adams-county-center-pivot-proof");
  assert.equal(fallback.artifactCount, 7);
  const fallbackManifest = JSON.parse(readFileSync(fallbackOutputPath, "utf8")) as {
    fixtures?: Array<{ artifacts?: Record<string, string>; artifactHashes?: Record<string, string> }>;
  };
  assert.equal(fallbackManifest.fixtures?.[0]?.artifacts?.projectReference, undefined);
  assert.equal(fallbackManifest.fixtures?.[0]?.artifactHashes?.projectReference, undefined);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("real pivot fixture manifest generation tests passed");
