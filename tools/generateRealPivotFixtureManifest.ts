import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { realCenterPivotProofProject } from "@cplayout/core";

interface GeneratedRealPivotFixtureManifestOptions {
  outputPath?: string;
  proofDirectory?: string;
  projectReferencePath?: string;
  generatedAt?: string;
}

interface PivotProjectJson {
  id?: unknown;
  name?: unknown;
  projectCrs?: unknown;
  pivotCenter?: unknown;
  surveyPoints?: Array<{
    id?: unknown;
    role?: unknown;
    projected?: unknown;
    wgs84?: unknown;
    confidence?: unknown;
    source?: unknown;
    notes?: unknown;
  }>;
}

interface XY {
  x: number;
  y: number;
}

export const DEFAULT_REAL_PIVOT_FIXTURE_MANIFEST_PATH = "fixtures/real-pivot/manifest.json";
export const DEFAULT_REAL_PIVOT_PROJECT_REFERENCE_PATH =
  "reports/google-earth-visual-fidelity/public-adams-county-center-pivot-proof-project.json";
export const DEFAULT_REAL_PIVOT_GOOGLE_EARTH_PROOF_DIRECTORY = "reports/google-earth-visual-fidelity/20260604T-render-proof-kml-strict";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputPath = valueFor(process.argv.slice(2), "--output")
    ?? valueFor(process.argv.slice(2), "--output-path")
    ?? DEFAULT_REAL_PIVOT_FIXTURE_MANIFEST_PATH;
  const generated = generateDefaultRealPivotFixtureManifest({ outputPath });
  console.log(JSON.stringify(generated, null, 2));
}

export function generateDefaultRealPivotFixtureManifest(
  options: GeneratedRealPivotFixtureManifestOptions = {},
): { path: string; fixtureId: string; artifactCount: number; projectId: string; projectCrs: string } {
  const outputPath = options.outputPath ?? DEFAULT_REAL_PIVOT_FIXTURE_MANIFEST_PATH;
  const proofDirectory = options.proofDirectory ?? DEFAULT_REAL_PIVOT_GOOGLE_EARTH_PROOF_DIRECTORY;
  const projectReferencePath = options.projectReferencePath ?? DEFAULT_REAL_PIVOT_PROJECT_REFERENCE_PATH;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outputDirectory = dirname(outputPath);
  const projectReferenceExists = existsSync(projectReferencePath);
  const project = projectReferenceExists ? readProjectJson(projectReferencePath) : projectToJson(realCenterPivotProofProject);
  const projectId = requiredString(project.id, "Project reference must include id.");
  const projectName = requiredString(project.name, "Project reference must include name.");
  const projectCrs = requiredString(project.projectCrs, "Project reference must include projectCrs.");
  const pivotCenter = xy(project.pivotCenter, "Project reference must include pivotCenter projected XY.");
  const pivotSurveyPoint = project.surveyPoints?.find((point) => point.role === "pivot_center");
  const surveyProjected = pivotSurveyPoint ? xy(pivotSurveyPoint.projected, "Pivot survey point projected XY is invalid.") : pivotCenter;
  if (Math.hypot(surveyProjected.x - pivotCenter.x, surveyProjected.y - pivotCenter.y) > 0.001) {
    throw new Error("Project pivotCenter and pivot-center survey point do not match.");
  }

  const artifactPaths: Record<string, string> = {
    mapCanvasCrop: joinProof(proofDirectory, "google-earth-visual-fidelity-map-canvas.png"),
    fullWindowScreenshot: joinProof(proofDirectory, "google-earth-visual-fidelity-full-window.png"),
    placesSidebarScreenshot: joinProof(proofDirectory, "google-earth-visual-fidelity-places-sidebar.png"),
    visualFidelityManifest: joinProof(proofDirectory, "visual-fidelity-manifest.json"),
    kml: joinProof(proofDirectory, "cplayout-google-earth-visual-fidelity.kml"),
    kmz: joinProof(proofDirectory, "cplayout-google-earth-visual-fidelity.kmz"),
    generatedFixture: joinProof(proofDirectory, "generated-fixture.json"),
  };
  if (projectReferenceExists) artifactPaths.projectReference = projectReferencePath;
  for (const [label, path] of Object.entries(artifactPaths)) {
    if (!existsSync(path)) throw new Error(`Default real-pivot fixture artifact is missing (${label}): ${path}`);
  }

  const artifactHashes = Object.fromEntries(
    Object.entries(artifactPaths).map(([label, path]) => [label, sha256File(path)]),
  );
  const relativeArtifacts = Object.fromEntries(
    Object.entries(artifactPaths).map(([label, path]) => [label, relative(outputDirectory, path).replaceAll("\\", "/")]),
  );
  const fixtureId = "public-adams-county-google-earth-pivot-center";
  const manifest = {
    schemaVersion: "cplayout-real-pivot-fixtures-v1",
    generatedAt,
    generatedBy: "tools/generateRealPivotFixtureManifest.ts",
    projectId,
    projectName,
    projectCrs,
    canonicalGeometryMutation: false,
    fixtures: [
      {
        id: fixtureId,
        projectId,
        projectCrs,
        summary: "Public Adams County center pivot fixture derived from CPLayout canonical projected XY and rendered Google Earth proof artifacts.",
        operatorApproved: true,
        calibrationStatus: "valid_projected_xy",
        confidence: 0.72,
        provenance: {
          sourceKind: "public_google_earth_visual_fidelity_fixture",
          publicSourceUrl: "https://commons.wikimedia.org/wiki/File:Center_pivot_irrigation_in_Colorado.JPG",
          publicSourceAuthor: "Jeffrey Beall",
          publicSourceLicense: "CC BY 4.0",
          proofSurface: "Google Earth Pro rendered CPLayout KML/KMZ visual-fidelity evidence",
          keyedService: false,
          networkRequired: false,
          paidServiceRequired: false,
        },
        artifacts: relativeArtifacts,
        artifactHashes,
        truthLabels: {
          TRUE_PIVOT_CENTER: {
            projectedPoint: pivotCenter,
            displayWgs84: pivotSurveyPoint?.wgs84 ?? null,
            sourceSurveyPointId: pivotSurveyPoint?.id ?? null,
            sourceConfidence: pivotSurveyPoint?.confidence ?? null,
            sourceKind: pivotSurveyPoint?.source ?? "manual",
            sourceNotes: pivotSurveyPoint?.notes ?? null,
            calibrationStatus: "valid_projected_xy",
          },
        },
        rejectionClasses: [
          "uncalibrated_projection",
          "missing_operator_truth_label",
          "artifact_hash_mismatch",
          "hidden_key_or_paid_service_provenance",
        ],
        hardFailures: [],
        warnings: [
          "Advisory real-world fixture proof only; CPLayout geometry changes require explicit Files import or Map editing.",
        ],
      },
    ],
  };

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { path: outputPath, fixtureId, artifactCount: Object.keys(artifactPaths).length, projectId, projectCrs };
}

function readProjectJson(path: string): PivotProjectJson {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Project reference is not an object: ${path}`);
  }
  return parsed as PivotProjectJson;
}

function projectToJson(project: typeof realCenterPivotProofProject): PivotProjectJson {
  return {
    id: project.id,
    name: project.name,
    projectCrs: project.projectCrs,
    pivotCenter: project.pivotCenter,
    surveyPoints: project.surveyPoints,
  };
}

function xy(value: unknown, message: string): XY {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const candidate = value as { x?: unknown; y?: unknown };
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") throw new Error(message);
  return { x: candidate.x, y: candidate.y };
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  return value;
}

function joinProof(proofDirectory: string, filename: string): string {
  return `${proofDirectory.replace(/\/$/, "")}/${filename}`;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
