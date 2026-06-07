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
    radiusSensitivityRadiiMeters: [60, 85],
  });

  assert.equal(result.importedBoundary, true);
  assert.equal(result.importedSurveyPointCount, 1);
  assert.ok(result.importedMapFeatureCount >= 3);
  assert.equal(result.sourceSha256, createHash("sha256").update(readFileSync(inputPath)).digest("hex"));
  assert.equal(result.costInputStatus, "complete");
  assert.ok(result.radiusSensitivityReadyCount >= 1);
  assert.ok((result.bestSensitivityRadiusMeters ?? 0) > 0);

  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as {
    schemaVersion?: string;
    boundaries?: {
      canonicalGeometryMutation?: boolean;
      writesProjectStorage?: boolean;
      writesProjectZip?: boolean;
      googleEarthRenderProof?: boolean;
      finalClientDesign?: boolean;
      advisoryOnly?: boolean;
      qualifiedReviewRequired?: boolean;
    };
    source?: { kmlEntryName?: string; sha256?: string };
    importReview?: {
      items?: Array<{ name?: string; classification?: string; featureKind?: string | null }>;
    };
    advisoryReview?: {
      fieldPivotPlan?: {
        advisoryOnly?: boolean;
        canonicalGeometryMutation?: boolean;
        qualifiedReviewRequired?: boolean;
        candidates?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
          pivotCenter?: { x?: number; y?: number };
          incrementalIrrigatedAcres?: number;
        }>;
        separationRejections?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
          separationDeficitMeters?: number;
        }>;
      };
      generatedMultiPivotScenarioReview?: {
        advisoryOnly?: boolean;
        canonicalGeometryMutation?: boolean;
        qualifiedReviewRequired?: boolean;
        selectedCenterCount?: number;
        costInputStatus?: string;
        rows?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
          costStatus?: string;
        }>;
        rejectedRows?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
        }>;
      };
      generatedReviewZoneAudit?: {
        advisoryOnly?: boolean;
        canonicalGeometryMutation?: boolean;
        qualifiedReviewRequired?: boolean;
        itemCount?: number;
        currentCount?: number;
        missingCount?: number;
        staleCount?: number;
        items?: Array<{
          status?: string;
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
        }>;
      };
      multiMachineReview?: {
        scenarioCount?: number;
        readyScenarioCount?: number;
        scenarios?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
        }>;
      };
      strategyComparison?: { costInputStatus?: string; readyStrategyCount?: number };
      radiusSensitivity?: {
        advisoryOnly?: boolean;
        canonicalGeometryMutation?: boolean;
        qualifiedReviewRequired?: boolean;
        source?: string;
        rowCount?: number;
        readyRowCount?: number;
        bestByCostPerAcre?: { radiusMeters?: number; cost?: { status?: string; costPerIrrigatedAcre?: number | null } } | null;
        rows?: Array<{
          advisoryOnly?: boolean;
          canonicalGeometryMutation?: boolean;
          radiusMeters?: number;
          cost?: { status?: string; costPerIrrigatedAcre?: number | null };
        }>;
      };
    };
  };
  assert.equal(manifest.schemaVersion, "cplayout-client-kmz-advisory-report-v1");
  assert.equal(manifest.source?.kmlEntryName, "doc.kml");
  assert.equal(manifest.boundaries?.canonicalGeometryMutation, false);
  assert.equal(manifest.boundaries?.writesProjectStorage, false);
  assert.equal(manifest.boundaries?.writesProjectZip, false);
  assert.equal(manifest.boundaries?.googleEarthRenderProof, false);
  assert.equal(manifest.boundaries?.finalClientDesign, false);
  assert.equal(manifest.boundaries?.advisoryOnly, true);
  assert.equal(manifest.boundaries?.qualifiedReviewRequired, true);
  assert.equal(manifest.importReview?.items?.some((item) => item.featureKind === "machine_zone"), true);
  assert.equal(manifest.importReview?.items?.some((item) => item.featureKind === "measurement_line"), true);
  assert.equal(manifest.importReview?.items?.some((item) => item.classification === "existing_pivot"), true);
  assert.ok((manifest.advisoryReview?.multiMachineReview?.scenarioCount ?? 0) >= 2);
  assert.ok((manifest.advisoryReview?.multiMachineReview?.readyScenarioCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.advisoryOnly, true);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.canonicalGeometryMutation, false);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.qualifiedReviewRequired, true);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.candidates?.every((candidate) => candidate.advisoryOnly === true), true);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.candidates?.every((candidate) => candidate.canonicalGeometryMutation === false), true);
  assert.equal(manifest.advisoryReview?.fieldPivotPlan?.candidates?.every((candidate) => Number.isFinite(candidate.pivotCenter?.x) && Number.isFinite(candidate.pivotCenter?.y)), true);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.advisoryOnly, true);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.canonicalGeometryMutation, false);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.qualifiedReviewRequired, true);
  assert.ok((manifest.advisoryReview?.generatedMultiPivotScenarioReview?.selectedCenterCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.costInputStatus, "complete");
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.rows?.every((row) => row.advisoryOnly === true), true);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.rows?.every((row) => row.canonicalGeometryMutation === false), true);
  assert.equal(manifest.advisoryReview?.generatedMultiPivotScenarioReview?.rows?.some((row) => row.costStatus === "complete"), true);
  assert.equal(manifest.advisoryReview?.generatedReviewZoneAudit?.advisoryOnly, true);
  assert.equal(manifest.advisoryReview?.generatedReviewZoneAudit?.canonicalGeometryMutation, false);
  assert.equal(manifest.advisoryReview?.generatedReviewZoneAudit?.qualifiedReviewRequired, true);
  assert.ok((manifest.advisoryReview?.generatedReviewZoneAudit?.itemCount ?? 0) >= 1);
  assert.ok((manifest.advisoryReview?.generatedReviewZoneAudit?.missingCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.generatedReviewZoneAudit?.items?.every((item) => item.advisoryOnly === true), true);
  assert.equal(manifest.advisoryReview?.generatedReviewZoneAudit?.items?.every((item) => item.canonicalGeometryMutation === false), true);
  assert.equal(manifest.advisoryReview?.multiMachineReview?.scenarios?.every((scenario) => scenario.advisoryOnly === true), true);
  assert.equal(manifest.advisoryReview?.multiMachineReview?.scenarios?.every((scenario) => scenario.canonicalGeometryMutation === false), true);
  assert.equal(manifest.advisoryReview?.strategyComparison?.costInputStatus, "complete");
  assert.ok((manifest.advisoryReview?.strategyComparison?.readyStrategyCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.advisoryOnly, true);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.canonicalGeometryMutation, false);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.qualifiedReviewRequired, true);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.source, "imported_radius_sensitivity");
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.rowCount, 2);
  assert.ok((manifest.advisoryReview?.radiusSensitivity?.readyRowCount ?? 0) >= 1);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.rows?.some((row) => row.cost?.status === "complete"), true);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.rows?.every((row) => row.advisoryOnly === true), true);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.rows?.every((row) => row.canonicalGeometryMutation === false), true);
  assert.equal(manifest.advisoryReview?.radiusSensitivity?.bestByCostPerAcre?.cost?.status, "complete");

  const report = readFileSync(result.reportPath, "utf8");
  assert.match(report, /Advisory only: true/);
  assert.match(report, /Canonical geometry mutation: false/);
  assert.match(report, /Machine Strategy And Cost Review/);
  assert.match(report, /Generated Multi-Pivot Scenario Review/);
  assert.match(report, /Generated multi-pivot scenario review is advisory only/);
  assert.match(report, /Cost review is local and advisory/);
  assert.match(report, /Radius Sensitivity Review/);
  assert.match(report, /Best cost-per-acre radius/);
  assert.match(report, /not a final design, not Google Earth render proof, and not automatic canonical geometry mutation/);
  assert.match(report, /does not change project geometry, machine settings, storage, archives, or KML\/KMZ/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("client KMZ advisory report tests passed");
