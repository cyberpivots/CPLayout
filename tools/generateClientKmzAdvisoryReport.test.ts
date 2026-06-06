import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strToU8, zipSync } from "fflate";

import { generateClientKmzAdvisoryReport } from "./generateClientKmzAdvisoryReport";

const root = mkdtempSync(join(tmpdir(), "cplayout-client-kmz-advisory-"));
const inputPath = join(root, "operator.kmz");
const outputDir = join(root, "reports");

const syntheticKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Full_Scope_Field Boundary</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -102.1050,40.0000,0 -102.0950,40.0000,0 -102.0940,40.0060,0 -102.1020,40.0090,0 -102.1100,40.0040,0 -102.1050,40.0000,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark>
      <name>Middle_Machine_Field_Boundary</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -102.1045,40.0010,0 -102.1005,40.0010,0 -102.1005,40.0048,0 -102.1045,40.0048,0 -102.1045,40.0010,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark>
      <name>South_Machine_Field_Boundary</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        -102.1000,40.0020,0 -102.0960,40.0020,0 -102.0960,40.0055,0 -102.1000,40.0055,0 -102.1000,40.0020,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark>
      <name>LRDU Distance</name>
      <LineString><coordinates>-102.1030,40.0025,0 -102.1020,40.0025,0</coordinates></LineString>
    </Placemark>
    <Placemark>
      <name>Pivot Point</name>
      <Point><coordinates>-102.1030,40.0025,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

try {
  mkdirSync(root, { recursive: true });
  writeFileSync(inputPath, zipSync({ "doc.kml": strToU8(syntheticKml) }));

  const result = generateClientKmzAdvisoryReport({
    inputPath,
    outputDir,
    projectName: "Synthetic Client KMZ Advisory",
    generatedAt: "2026-06-06T00:00:00.000Z",
    fixedMachineCost: 85000,
    costPerMeter: 650,
    costPerTower: 2800,
    maxMachines: 3,
  });

  assert.equal(result.importedBoundary, true);
  assert.equal(result.importedSurveyPointCount, 1);
  assert.ok(result.importedMapFeatureCount >= 3);
  assert.equal(result.sourceSha256, createHash("sha256").update(readFileSync(inputPath)).digest("hex"));
  assert.equal(result.costInputStatus, "complete");

  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as {
    schemaVersion?: string;
    boundaries?: {
      canonicalGeometryMutation?: boolean;
      writesProjectStorage?: boolean;
      googleEarthRenderProof?: boolean;
      finalClientDesign?: boolean;
    };
    source?: { kmlEntryName?: string; sha256?: string };
    importReview?: {
      items?: Array<{ name?: string; classification?: string; featureKind?: string | null }>;
    };
    advisoryReview?: {
      multiMachineReview?: { scenarioCount?: number; readyScenarioCount?: number };
      strategyComparison?: { costInputStatus?: string; readyStrategyCount?: number };
    };
  };
  assert.equal(manifest.schemaVersion, "cplayout-client-kmz-advisory-report-v1");
  assert.equal(manifest.source?.kmlEntryName, "doc.kml");
  assert.equal(manifest.boundaries?.canonicalGeometryMutation, false);
  assert.equal(manifest.boundaries?.writesProjectStorage, false);
  assert.equal(manifest.boundaries?.googleEarthRenderProof, false);
  assert.equal(manifest.boundaries?.finalClientDesign, false);
  assert.equal(manifest.importReview?.items?.some((item) => item.featureKind === "machine_zone"), true);
  assert.equal(manifest.importReview?.items?.some((item) => item.featureKind === "measurement_line"), true);
  assert.equal(manifest.importReview?.items?.some((item) => item.classification === "existing_pivot"), true);
  assert.ok((manifest.advisoryReview?.multiMachineReview?.scenarioCount ?? 0) >= 2);
  assert.ok((manifest.advisoryReview?.multiMachineReview?.readyScenarioCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.strategyComparison?.costInputStatus, "complete");
  assert.ok((manifest.advisoryReview?.strategyComparison?.readyStrategyCount ?? 0) >= 1);

  const report = readFileSync(result.reportPath, "utf8");
  assert.match(report, /Advisory only: true/);
  assert.match(report, /Canonical geometry mutation: false/);
  assert.match(report, /Machine Strategy And Cost Review/);
  assert.match(report, /Cost review is local and advisory/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("client KMZ advisory report tests passed");
