import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  defaultProjectSettings,
  importGoogleEarthKmlToProject,
  projectLonLatToXy,
  type AdvisorySourceReference,
  type PivotMachine,
  type PivotProject,
  type ProjectMapFeature,
  type SurveyPoint,
  type XY,
} from "@cplayout/core";
import {
  analyzeAdvisoryMultiMachineLayout,
  analyzeAdvisoryObstacleInteractions,
  auditGeneratedFieldPivotReviewZones,
  buildAdvisoryGeneratedMultiPivotScenarioReview,
  buildAdvisoryRadiusSensitivityReview,
  buildAdvisoryDesignReport,
  compareAdvisoryMachineStrategies,
  evaluateLayout,
  planAdvisoryFieldPivots,
} from "@cplayout/geometry";
import { strFromU8, unzipSync } from "fflate";

export interface ClientKmzAdvisoryReportOptions {
  inputPath?: string;
  outputDir?: string;
  projectId?: string;
  projectName?: string;
  projectCrs?: string;
  generatedAt?: string;
  maxMachines?: number;
  fixedMachineCost?: number;
  costPerMeter?: number;
  costPerTower?: number;
  currencyCode?: string;
  targetSpanLengthMeters?: number;
  overhangMeters?: number;
  endGunThrowMeters?: number;
  towerClearanceBufferMeters?: number;
  machineClearanceBufferMeters?: number;
  radiusSensitivityRadiiMeters?: number[];
}

export interface ClientKmzAdvisoryReportResult {
  outputDir: string;
  manifestPath: string;
  reportPath: string;
  sourceSha256: string;
  projectCrs: string;
  importedBoundary: boolean;
  importedMapFeatureCount: number;
  importedSurveyPointCount: number;
  fullScopeCoveragePercent: number;
  selectedMachineCount: number;
  readyScenarioCount: number;
  costInputStatus: string;
  radiusSensitivityReadyCount: number;
  bestSensitivityRadiusMeters: number | null;
}

interface KmlArtifact {
  kmlText: string;
  kmlEntryName: string | null;
}

interface LonLat {
  longitude: number;
  latitude: number;
}

const DEFAULT_INPUT_PATH = "tmp/Will Rhea.kmz";
const DEFAULT_OUTPUT_ROOT = "reports/client-kmz-advisory";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = optionsFromArgs(process.argv.slice(2));
  const result = generateClientKmzAdvisoryReport(options);
  console.log(JSON.stringify(result, null, 2));
}

export function generateClientKmzAdvisoryReport(
  options: ClientKmzAdvisoryReportOptions = {},
): ClientKmzAdvisoryReportResult {
  const inputPath = options.inputPath ?? DEFAULT_INPUT_PATH;
  if (!existsSync(inputPath)) throw new Error(`Client KMZ/KML input is missing: ${inputPath}`);

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outputDir = options.outputDir ?? join(DEFAULT_OUTPUT_ROOT, timestampSlug(generatedAt));
  mkdirSync(outputDir, { recursive: true });

  const sourceBytes = readFileSync(inputPath);
  const sourceSha256 = sha256(sourceBytes);
  const artifact = readKmlArtifact(inputPath, sourceBytes);
  const projectCrs = options.projectCrs ?? autoUtmProjectCrs(artifact.kmlText);
  const seedProject = buildSeedProject(artifact.kmlText, projectCrs, options, generatedAt);
  const imported = importGoogleEarthKmlToProject(seedProject, artifact.kmlText, { observedAt: generatedAt });
  const analysisProject = applyAdvisoryEvidenceAssumptions(imported.project, options);
  const sourceRefs: AdvisorySourceReference[] = [{
    sourceId: `local-client-kmz-${sourceSha256.slice(0, 12)}`,
    title: "Operator-supplied local KMZ/KML evidence",
    checkedAt: generatedAt,
    limit: "Operator-supplied client artifact for advisory review only; commit/checkpoint only with explicit owner-selected scope, not a final design, not Google Earth render proof, and not automatic canonical geometry mutation.",
  }];
  const costInput = costInputFromOptions(options, sourceRefs);
  const reviewOptions = {
    maxMachines: Math.max(1, Math.floor(options.maxMachines ?? 3)),
    costInput,
    sourceRefs,
    includeMachineZoneReviews: true,
    includeGeneratedRadiusStrategies: true,
    includeUnsupportedConceptPlaceholders: false,
  };
  const layoutResult = evaluateLayout(analysisProject);
  const fieldPivotPlan = planAdvisoryFieldPivots(analysisProject, reviewOptions);
  const reviewZoneAudit = auditGeneratedFieldPivotReviewZones(analysisProject, fieldPivotPlan);
  const generatedMultiPivotScenarioReview = buildAdvisoryGeneratedMultiPivotScenarioReview(fieldPivotPlan);
  const multiMachineReview = analyzeAdvisoryMultiMachineLayout(analysisProject, reviewOptions);
  const strategyComparison = compareAdvisoryMachineStrategies(analysisProject, reviewOptions);
  const obstacleInteractionReview = analyzeAdvisoryObstacleInteractions(analysisProject, { sourceRefs });
  const radiusSensitivity = buildAdvisoryRadiusSensitivityReview(analysisProject, {
    maxMachines: Math.max(1, Math.floor(options.maxMachines ?? 3)),
    costInput,
    sourceRefs,
    radiiMeters: options.radiusSensitivityRadiiMeters,
    source: "imported_radius_sensitivity",
    buildMachineForRadius: (_project, radiusMeters) => buildMachineFromRadius(radiusMeters, options),
  });
  const report = buildAdvisoryDesignReport({
    project: analysisProject,
    result: layoutResult,
    fieldPivotPlan,
    multiMachineReview,
    strategyComparison,
    obstacleInteractionReview,
    radiusSensitivityReview: radiusSensitivity,
    generatedMultiPivotScenarioReview,
    reviewZoneAudit,
    generatedAt,
  });

  const reportPath = join(outputDir, "advisory-design-report.txt");
  const manifestPath = join(outputDir, "advisory-design-summary.json");
  writeFileSync(reportPath, report.text, "utf8");
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: "cplayout-client-kmz-advisory-report-v1",
    generatedAt,
    generatedBy: "tools/generateClientKmzAdvisoryReport.ts",
    source: {
      path: inputPath,
      basename: basename(inputPath),
      byteSize: sourceBytes.length,
      sha256: sourceSha256,
      kmlEntryName: artifact.kmlEntryName,
    },
    project: {
      id: analysisProject.id,
      name: analysisProject.name,
      projectCrs,
      unitSystem: analysisProject.unitSystem,
    },
    assumptions: {
      pivotCenterSource: pivotAssumptionSource(imported.project),
      machineRadiusSource: machineRadiusAssumptionSource(imported.project),
      machineRadiusMeters: round(analysisProject.machine.spanLengthsMeters.reduce((sum, span) => sum + span, 0) + analysisProject.machine.overhangMeters),
      spanCount: analysisProject.machine.spanLengthsMeters.length,
      overhangMeters: analysisProject.machine.overhangMeters,
      endGunThrowMeters: analysisProject.machine.endGunThrowMeters,
      costInputStatus: strategyComparison.costInputStatus,
      costInputProvided: Boolean(costInput),
    },
    importReview: {
      importedBoundary: imported.importedBoundary,
      importedObstacleCount: imported.importedObstacleCount,
      importedSurveyPointCount: imported.importedSurveyPointCount,
      importedMapFeatureCount: imported.importedMapFeatureCount,
      skippedFeatureCount: imported.skippedFeatureCount,
      items: imported.items.map((item) => ({
        name: item.name,
        classification: item.classification,
        featureKind: item.featureKind ?? null,
        geometryType: item.geometryType,
        selected: item.selected,
        warning: item.warning ?? null,
      })),
      warnings: imported.warnings,
    },
    advisoryReview: {
      currentLayout: {
        fieldAcres: round(layoutResult.metrics.fieldAcres),
        irrigatedAcres: round(layoutResult.metrics.irrigatedAcres),
        coveragePercent: round(layoutResult.metrics.coveragePercent),
        outsideFieldAcres: round(layoutResult.metrics.outsideFieldAcres),
      },
      fieldPivotPlan: {
        status: fieldPivotPlan.status,
        advisoryOnly: fieldPivotPlan.advisoryOnly,
        canonicalGeometryMutation: fieldPivotPlan.canonicalGeometryMutation,
        qualifiedReviewRequired: fieldPivotPlan.qualifiedReviewRequired,
        requestedMachineCount: fieldPivotPlan.requestedMachineCount,
        selectedMachineCount: fieldPivotPlan.selectedMachineCount,
        candidatePoolCount: fieldPivotPlan.candidatePoolCount,
        feasibleCandidateCount: fieldPivotPlan.feasibleCandidateCount,
        rejectedForSeparationCount: fieldPivotPlan.rejectedForSeparationCount,
        fieldCoveragePercent: fieldPivotPlan.fieldCoveragePercent,
        modeledIrrigatedUnionAcres: fieldPivotPlan.modeledIrrigatedUnionAcres,
        candidates: fieldPivotPlan.candidates.map((candidate) => ({
          id: candidate.id,
          sequence: candidate.sequence,
          advisoryOnly: candidate.advisoryOnly,
          canonicalGeometryMutation: candidate.canonicalGeometryMutation,
          qualifiedReviewRequired: candidate.qualifiedReviewRequired,
          pivotCenter: candidate.pivotCenter,
          machineRadiusMeters: candidate.machineRadiusMeters,
          modeledIrrigatedAcres: candidate.modeledIrrigatedAcres,
          incrementalIrrigatedAcres: candidate.incrementalIrrigatedAcres,
          cumulativeFieldCoveragePercent: candidate.cumulativeFieldCoveragePercent,
          minimumRequiredSeparationMeters: candidate.minimumRequiredSeparationMeters,
          nearestSelectedDistanceMeters: candidate.nearestSelectedDistanceMeters,
          warnings: candidate.warnings,
        })),
        separationRejections: fieldPivotPlan.separationRejections.map((rejection) => ({
          candidateId: rejection.candidateId,
          nearestSelectedCandidateId: rejection.nearestSelectedCandidateId,
          advisoryOnly: rejection.advisoryOnly,
          canonicalGeometryMutation: rejection.canonicalGeometryMutation,
          qualifiedReviewRequired: rejection.qualifiedReviewRequired,
          pivotCenter: rejection.pivotCenter,
          centerDistanceMeters: rejection.centerDistanceMeters,
          minimumRequiredSeparationMeters: rejection.minimumRequiredSeparationMeters,
          separationDeficitMeters: rejection.separationDeficitMeters,
          warnings: rejection.warnings,
        })),
        blockers: fieldPivotPlan.blockers,
        warnings: fieldPivotPlan.warnings,
      },
      generatedMultiPivotScenarioReview: {
        status: generatedMultiPivotScenarioReview.status,
        advisoryOnly: generatedMultiPivotScenarioReview.advisoryOnly,
        canonicalGeometryMutation: generatedMultiPivotScenarioReview.canonicalGeometryMutation,
        qualifiedReviewRequired: generatedMultiPivotScenarioReview.qualifiedReviewRequired,
        selectedCenterCount: generatedMultiPivotScenarioReview.selectedCenterCount,
        requestedMachineCount: generatedMultiPivotScenarioReview.requestedMachineCount,
        candidatePoolCount: generatedMultiPivotScenarioReview.candidatePoolCount,
        feasibleCandidateCount: generatedMultiPivotScenarioReview.feasibleCandidateCount,
        rejectedForSeparationCount: generatedMultiPivotScenarioReview.rejectedForSeparationCount,
        fieldCoveragePercent: generatedMultiPivotScenarioReview.fieldCoveragePercent,
        modeledIrrigatedUnionAcres: generatedMultiPivotScenarioReview.modeledIrrigatedUnionAcres,
        duplicateModeledCoverageAcres: generatedMultiPivotScenarioReview.duplicateModeledCoverageAcres,
        tightestSelectedSeparationMarginMeters: generatedMultiPivotScenarioReview.tightestSelectedSeparationMarginMeters,
        largestSeparationDeficitMeters: generatedMultiPivotScenarioReview.largestSeparationDeficitMeters,
        costInputStatus: generatedMultiPivotScenarioReview.costInputStatus,
        rows: generatedMultiPivotScenarioReview.rows,
        rejectedRows: generatedMultiPivotScenarioReview.rejectedRows,
        blockers: generatedMultiPivotScenarioReview.blockers,
        warnings: generatedMultiPivotScenarioReview.warnings,
      },
      generatedReviewZoneAudit: {
        advisoryOnly: reviewZoneAudit.advisoryOnly,
        canonicalGeometryMutation: reviewZoneAudit.canonicalGeometryMutation,
        qualifiedReviewRequired: reviewZoneAudit.qualifiedReviewRequired,
        itemCount: reviewZoneAudit.itemCount,
        currentCount: reviewZoneAudit.currentCount,
        missingCount: reviewZoneAudit.missingCount,
        staleCount: reviewZoneAudit.staleCount,
        items: reviewZoneAudit.items,
        warnings: reviewZoneAudit.warnings,
      },
      multiMachineReview: {
        status: multiMachineReview.status,
        blockers: multiMachineReview.blockers,
        warnings: multiMachineReview.warnings,
        scenarios: multiMachineReview.scenarios.map((scenario) => ({
          id: scenario.id,
          zoneFeatureId: scenario.zoneFeatureId,
          zoneName: scenario.zoneName,
          zoneKind: scenario.zoneKind,
          status: scenario.status,
          advisoryOnly: scenario.advisoryOnly,
          canonicalGeometryMutation: scenario.canonicalGeometryMutation,
          qualifiedReviewRequired: scenario.qualifiedReviewRequired,
          zoneAcres: scenario.zoneAcres,
          machineRadiusMeters: scenario.machineRadiusMeters,
          candidateCount: scenario.candidateCount,
          modeledIrrigatedAcres: scenario.modeledIrrigatedAcres,
          warnings: scenario.warnings,
        })),
        conflicts: multiMachineReview.conflicts.map((conflict) => ({
          id: conflict.id,
          leftZoneName: conflict.leftZoneName,
          rightZoneName: conflict.rightZoneName,
          status: conflict.status,
          severity: conflict.severity,
          advisoryOnly: conflict.advisoryOnly,
          canonicalGeometryMutation: conflict.canonicalGeometryMutation,
          qualifiedReviewRequired: conflict.qualifiedReviewRequired,
          operatorCollisionReviewRequired: conflict.operatorCollisionReviewRequired,
          centerDistanceMeters: conflict.centerDistanceMeters,
          minimumRequiredSeparationMeters: conflict.minimumRequiredSeparationMeters,
          separationDeficitMeters: conflict.separationDeficitMeters,
          collisionZoneAcres: conflict.collisionZoneAcres,
          separationReviewZoneAcres: conflict.separationReviewZoneAcres,
          warnings: conflict.warnings,
        })),
        readyScenarioCount: multiMachineReview.compilation.readyScenarioCount,
        scenarioCount: multiMachineReview.compilation.scenarioCount,
        fullScopeCoveragePercent: multiMachineReview.compilation.fullScopeCoveragePercent,
        fullScopeUnirrigatedAcres: multiMachineReview.compilation.fullScopeUnirrigatedAcres,
      },
      strategyComparison: {
        status: strategyComparison.status,
        costInputStatus: strategyComparison.costInputStatus,
        bestStrategyId: strategyComparison.bestStrategy?.id ?? null,
        readyStrategyCount: strategyComparison.strategies.filter((strategy) => strategy.status === "ready").length,
      },
      obstacleInteractionReview: {
        status: obstacleInteractionReview.status,
        itemCount: obstacleInteractionReview.itemCount,
        hardBlockingCount: obstacleInteractionReview.summary.hardBlockingCount,
        utilityPathReviewCount: obstacleInteractionReview.summary.utilityPathReviewCount,
      },
      radiusSensitivity,
    },
    boundaries: {
      canonicalGeometryMutation: false,
      writesProjectStorage: false,
      writesProjectZip: false,
      googleEarthRenderProof: false,
      finalClientDesign: false,
      advisoryOnly: true,
      qualifiedReviewRequired: true,
    },
    outputs: {
      reportText: relative(outputDir, reportPath).replaceAll("\\", "/"),
      summaryJson: relative(outputDir, manifestPath).replaceAll("\\", "/"),
    },
  }, null, 2), "utf8");

  return {
    outputDir,
    manifestPath,
    reportPath,
    sourceSha256,
    projectCrs,
    importedBoundary: imported.importedBoundary,
    importedMapFeatureCount: imported.importedMapFeatureCount,
    importedSurveyPointCount: imported.importedSurveyPointCount,
    fullScopeCoveragePercent: multiMachineReview.compilation.fullScopeCoveragePercent,
    selectedMachineCount: fieldPivotPlan.selectedMachineCount,
    readyScenarioCount: multiMachineReview.compilation.readyScenarioCount,
    costInputStatus: strategyComparison.costInputStatus,
    radiusSensitivityReadyCount: radiusSensitivity.readyRowCount,
    bestSensitivityRadiusMeters: radiusSensitivity.bestByCostPerAcre?.radiusMeters
      ?? radiusSensitivity.bestByFullScopeCoverage?.radiusMeters
      ?? null,
  };
}

function readKmlArtifact(inputPath: string, sourceBytes: Buffer): KmlArtifact {
  const suffix = extname(inputPath).toLowerCase();
  if (suffix === ".kml") {
    return { kmlText: sourceBytes.toString("utf8"), kmlEntryName: null };
  }
  if (suffix !== ".kmz") throw new Error(`Client artifact must be .kml or .kmz: ${inputPath}`);
  const unzipped = unzipSync(new Uint8Array(sourceBytes));
  const kmlEntry = Object.keys(unzipped).find((entry) => entry.toLowerCase().endsWith(".kml"));
  if (!kmlEntry) throw new Error(`Client KMZ contains no KML document: ${inputPath}`);
  return { kmlText: strFromU8(unzipped[kmlEntry]), kmlEntryName: kmlEntry };
}

function buildSeedProject(
  kmlText: string,
  projectCrs: string,
  options: ClientKmzAdvisoryReportOptions,
  generatedAt: string,
): PivotProject {
  const center = projectedCentroid(kmlText, projectCrs);
  const seedBoundary = [
    { x: center.x - 1, y: center.y - 1 },
    { x: center.x + 1, y: center.y - 1 },
    { x: center.x, y: center.y + 1 },
  ];
  const machine = buildMachineFromRadius(220, options);
  return {
    id: options.projectId ?? "local-client-kmz-advisory-review",
    name: options.projectName ?? "Local Client KMZ Advisory Review",
    projectCrs,
    unitSystem: "us_survey_feet",
    settings: defaultProjectSettings(),
    fieldBoundary: seedBoundary,
    pivotCenter: center,
    waterSource: center,
    powerSource: center,
    machine,
    obstacles: [],
    surveyPoints: [{
      id: "local-kmz-seed-centroid",
      label: "Temporary KMZ centroid seed",
      role: "control",
      projected: center,
      observedAt: generatedAt,
      source: "imported",
      confidence: "user_estimated",
      notes: "Temporary analysis seed; replaced by imported evidence where available.",
    }],
    mapPackages: [],
    mapFeatures: [],
  };
}

function applyAdvisoryEvidenceAssumptions(project: PivotProject, options: ClientKmzAdvisoryReportOptions): PivotProject {
  const pivotEvidence = importedPivotEvidence(project);
  const measurementRadius = longestMeasurementLineMeters(project.mapFeatures ?? []);
  const radius = measurementRadius ?? 220;
  return {
    ...project,
    pivotCenter: pivotEvidence?.projected ?? centroid(project.fieldBoundary),
    waterSource: pivotEvidence?.projected ?? project.waterSource,
    powerSource: pivotEvidence?.projected ?? project.powerSource,
    machine: buildMachineFromRadius(radius, options),
  };
}

function buildMachineFromRadius(radiusMeters: number, options: ClientKmzAdvisoryReportOptions): PivotMachine {
  const overhangMeters = Math.max(0, options.overhangMeters ?? 0);
  const lastWheelRadiusMeters = Math.max(1, radiusMeters);
  const targetSpanLengthMeters = Math.max(1, options.targetSpanLengthMeters ?? 54);
  const spanCount = Math.max(1, Math.ceil(lastWheelRadiusMeters / targetSpanLengthMeters));
  const spanLength = lastWheelRadiusMeters / spanCount;
  return {
    id: "local-client-kmz-advisory-machine",
    name: "Local KMZ advisory machine template",
    spanLengthsMeters: Array.from({ length: spanCount }, () => round(spanLength)),
    overhangMeters,
    endGunThrowMeters: Math.max(0, options.endGunThrowMeters ?? 0),
    towerClearanceBufferMeters: Math.max(0, options.towerClearanceBufferMeters ?? 5),
    machineClearanceBufferMeters: Math.max(0, options.machineClearanceBufferMeters ?? 8),
    sweep: { mode: "full_circle" },
  };
}

function machineRadiusMeters(machine: PivotMachine): number {
  return machine.spanLengthsMeters.reduce((sum, span) => sum + span, 0) + machine.overhangMeters;
}

function costInputFromOptions(
  options: ClientKmzAdvisoryReportOptions,
  sourceRefs: AdvisorySourceReference[],
) {
  const fixedMachineCost = options.fixedMachineCost;
  const costPerMeter = options.costPerMeter;
  const costPerTower = options.costPerTower;
  if (fixedMachineCost === undefined && costPerMeter === undefined && costPerTower === undefined) return undefined;
  return {
    fixedMachineCost,
    costPerMeter,
    costPerTower,
    currencyCode: options.currencyCode ?? "USD",
    notes: "Operator-supplied local advisory cost assumptions for comparison only.",
    sourceRefs,
  };
}

function importedPivotEvidence(project: PivotProject): SurveyPoint | null {
  return project.surveyPoints.find((point) => point.role === "pivot_center" && point.source === "imported")
    ?? project.surveyPoints.find((point) => point.role === "pivot_center")
    ?? null;
}

function longestMeasurementLineMeters(features: ProjectMapFeature[]): number | null {
  const lengths = features
    .filter((feature) => feature.kind === "measurement_line" && feature.geometry.type === "LineString")
    .map((feature) => polylineLength(feature.geometry.type === "LineString" ? feature.geometry.vertices : []))
    .filter((length) => length > 0);
  return lengths.length > 0 ? Math.max(...lengths) : null;
}

function polylineLength(vertices: XY[]): number {
  let length = 0;
  for (let index = 1; index < vertices.length; index += 1) {
    length += distance(vertices[index - 1], vertices[index]);
  }
  return length;
}

function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: XY[]): XY {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function projectedCentroid(kmlText: string, projectCrs: string): XY {
  const lonLat = extractKmlLonLat(kmlText);
  if (lonLat.length === 0) throw new Error("KML did not contain coordinate tuples.");
  const projected = lonLat.map((point) => projectLonLatToXy(point, projectCrs));
  return centroid(projected);
}

function autoUtmProjectCrs(kmlText: string): string {
  const points = extractKmlLonLat(kmlText);
  if (points.length === 0) throw new Error("Cannot infer project CRS without KML coordinates.");
  const averageLongitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  const averageLatitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const zone = Math.max(1, Math.min(60, Math.floor((averageLongitude + 180) / 6) + 1));
  return `EPSG:${averageLatitude >= 0 ? "326" : "327"}${String(zone).padStart(2, "0")}`;
}

function extractKmlLonLat(kmlText: string): LonLat[] {
  const points: LonLat[] = [];
  const matches = kmlText.matchAll(/<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/gi);
  for (const match of matches) {
    const body = match[1] ?? "";
    for (const tuple of body.trim().split(/\s+/)) {
      const [longitudeText, latitudeText] = tuple.split(",");
      const longitude = Number(longitudeText);
      const latitude = Number(latitudeText);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        points.push({ longitude, latitude });
      }
    }
  }
  return points;
}

function machineRadiusAssumptionSource(project: PivotProject): string {
  return longestMeasurementLineMeters(project.mapFeatures ?? []) === null
    ? "fallback_220m_template"
    : "imported_measurement_line_last_wheel_radius";
}

function pivotAssumptionSource(project: PivotProject): string {
  return importedPivotEvidence(project) ? "imported_pivot_center_evidence" : "projected_boundary_centroid";
}

function sha256(bytes: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function timestampSlug(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "").slice(0, 15) || "latest";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function optionsFromArgs(args: string[]): ClientKmzAdvisoryReportOptions {
  return {
    inputPath: valueFor(args, "--input") ?? valueFor(args, "--input-path") ?? DEFAULT_INPUT_PATH,
    outputDir: valueFor(args, "--output-dir"),
    projectId: valueFor(args, "--project-id"),
    projectName: valueFor(args, "--project-name"),
    projectCrs: valueFor(args, "--project-crs"),
    generatedAt: valueFor(args, "--generated-at"),
    maxMachines: numberFor(args, "--max-machines"),
    fixedMachineCost: numberFor(args, "--fixed-cost") ?? numberFor(args, "--fixed-machine-cost"),
    costPerMeter: numberFor(args, "--cost-per-meter"),
    costPerTower: numberFor(args, "--cost-per-tower"),
    currencyCode: valueFor(args, "--currency") ?? valueFor(args, "--currency-code"),
    targetSpanLengthMeters: numberFor(args, "--target-span-length-meters"),
    overhangMeters: numberFor(args, "--overhang-meters"),
    endGunThrowMeters: numberFor(args, "--end-gun-throw-meters"),
    towerClearanceBufferMeters: numberFor(args, "--tower-clearance-buffer-meters"),
    machineClearanceBufferMeters: numberFor(args, "--machine-clearance-buffer-meters"),
    radiusSensitivityRadiiMeters: numberListFor(args, "--radius-sensitivity-radii"),
  };
}

function valueFor(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function numberFor(args: string[], name: string): number | undefined {
  const value = valueFor(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
  return parsed;
}

function numberListFor(args: string[], name: string): number[] | undefined {
  const value = valueFor(args, name);
  if (value === undefined) return undefined;
  const parsed = value.split(",").map((part) => Number(part.trim()));
  const invalid = parsed.find((number) => !Number.isFinite(number) || number <= 0);
  if (invalid !== undefined) throw new Error(`Invalid numeric list for ${name}: ${value}`);
  if (parsed.length === 0) throw new Error(`Invalid numeric list for ${name}: ${value}`);
  return parsed;
}
