import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import { parseProjectDocument, PROJECT_DOCUMENT_VERSION, serializeProjectDocument } from "./projectDocument";
import type { LayoutResult, PivotProject, SurveyPoint } from "./types";

export const PROJECT_ARCHIVE_VERSION = "center-pivot-project-archive-v1";
export const PROJECT_JSON_FILENAME = "project.json";
export const PROJECT_MANIFEST_FILENAME = "manifest.json";
export const PROJECT_GEOJSON_FILENAME = "exports/scenario.geojson";
export const SURVEY_CSV_FILENAME = "exports/survey-points.csv";
export const METRICS_CSV_FILENAME = "exports/scenario-metrics.csv";
export const MAP_PACKAGES_CSV_FILENAME = "exports/map-packages.csv";

export interface ProjectArchiveManifest {
  archiveVersion: typeof PROJECT_ARCHIVE_VERSION;
  createdAt: string;
  projectId: string;
  projectName: string;
  projectCrs: string;
  files: string[];
  offlineFirst: true;
  paidServicesRequired: false;
  projectDocumentVersion: typeof PROJECT_DOCUMENT_VERSION;
}

export interface ProjectArchiveBundle {
  manifest: ProjectArchiveManifest;
  files: Record<string, string>;
}

const ProjectArchiveManifestSchema = z.object({
  archiveVersion: z.literal(PROJECT_ARCHIVE_VERSION),
  createdAt: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  projectCrs: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
  offlineFirst: z.literal(true),
  paidServicesRequired: z.literal(false),
  projectDocumentVersion: z.literal(PROJECT_DOCUMENT_VERSION),
});

export function buildProjectArchiveBundle(
  project: PivotProject,
  result: LayoutResult,
  geoJson: object,
  createdAt = new Date().toISOString(),
): ProjectArchiveBundle {
  const manifest: ProjectArchiveManifest = {
    archiveVersion: PROJECT_ARCHIVE_VERSION,
    createdAt,
    projectId: project.id,
    projectName: project.name,
    projectCrs: project.projectCrs,
    files: [
      PROJECT_MANIFEST_FILENAME,
      PROJECT_JSON_FILENAME,
      PROJECT_GEOJSON_FILENAME,
      SURVEY_CSV_FILENAME,
      METRICS_CSV_FILENAME,
      MAP_PACKAGES_CSV_FILENAME,
    ],
    offlineFirst: true,
    paidServicesRequired: false,
    projectDocumentVersion: PROJECT_DOCUMENT_VERSION,
  };

  return {
    manifest,
    files: {
      [PROJECT_MANIFEST_FILENAME]: JSON.stringify(manifest, null, 2),
      [PROJECT_JSON_FILENAME]: serializeProjectDocument(project),
      [PROJECT_GEOJSON_FILENAME]: JSON.stringify(geoJson, null, 2),
      [SURVEY_CSV_FILENAME]: surveyPointsToCsv(project.surveyPoints),
      [METRICS_CSV_FILENAME]: metricsToCsv(result),
      [MAP_PACKAGES_CSV_FILENAME]: mapPackagesToCsv(project),
    },
  };
}

export function exportProjectArchiveZip(bundle: ProjectArchiveBundle): Uint8Array {
  const files = Object.fromEntries(
    Object.entries(bundle.files).map(([path, contents]) => [path, strToU8(contents)]),
  );
  return zipSync(files);
}

export function importProjectArchiveZip(data: Uint8Array): PivotProject {
  const unzipped = unzipSync(data);
  const manifestBytes = unzipped[PROJECT_MANIFEST_FILENAME];
  const projectBytes = unzipped[PROJECT_JSON_FILENAME];
  if (!manifestBytes || !projectBytes) {
    throw new Error("Project archive must contain manifest.json and project.json.");
  }

  const manifest = ProjectArchiveManifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  for (const requiredFile of [PROJECT_MANIFEST_FILENAME, PROJECT_JSON_FILENAME]) {
    if (!manifest.files.includes(requiredFile)) throw new Error(`Project archive manifest must list ${requiredFile}.`);
  }

  const project = parseProjectDocument(strFromU8(projectBytes));
  if (manifest.projectId !== project.id) throw new Error("Project archive manifest projectId does not match project.json.");
  if (manifest.projectCrs !== project.projectCrs) throw new Error("Project archive manifest projectCrs does not match project.json.");
  return project;
}

export function surveyPointsToCsv(points: SurveyPoint[]): string {
  const rows = [
    ["id", "label", "role", "x", "y", "longitude", "latitude", "observedAt", "source", "confidence", "notes"],
    ...points.map((point) => [
      point.id,
      point.label,
      point.role,
      point.projected.x,
      point.projected.y,
      point.wgs84?.longitude ?? "",
      point.wgs84?.latitude ?? "",
      point.observedAt,
      point.source,
      point.confidence,
      point.notes ?? "",
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function metricsToCsv(result: LayoutResult): string {
  const rows = [
    ["metric", "value"],
    ...Object.entries(result.metrics).map(([metric, value]) => [metric, value]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function mapPackagesToCsv(project: PivotProject): string {
  const rows = [
    [
      "id",
      "name",
      "packageType",
      "tileContentType",
      "uri",
      "minZoom",
      "maxZoom",
      "tileScheme",
      "minLongitude",
      "minLatitude",
      "maxLongitude",
      "maxLatitude",
      "tileJsonUrl",
      "tileUrlTemplates",
      "checksumSha256",
      "installStatus",
      "attribution",
      "licenseText",
      "bytes",
      "importedAt",
    ],
    ...(project.mapPackages ?? []).map((mapPackage) => [
      mapPackage.id,
      mapPackage.name,
      mapPackage.packageType,
      mapPackage.tileContentType,
      mapPackage.uri,
      mapPackage.minZoom,
      mapPackage.maxZoom,
      mapPackage.tileScheme,
      mapPackage.boundsWgs84.minLongitude,
      mapPackage.boundsWgs84.minLatitude,
      mapPackage.boundsWgs84.maxLongitude,
      mapPackage.boundsWgs84.maxLatitude,
      mapPackage.tileJsonUrl ?? "",
      (mapPackage.tileUrlTemplates ?? []).join(" "),
      mapPackage.checksumSha256 ?? "",
      mapPackage.installStatus ?? "metadata_only",
      mapPackage.attribution,
      mapPackage.licenseText,
      mapPackage.bytes ?? "",
      mapPackage.importedAt,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: unknown): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}
