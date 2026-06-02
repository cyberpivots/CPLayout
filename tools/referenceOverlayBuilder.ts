import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { validateMapPackageManifest, type MapPackageManifest, type ReferenceOverlaySchema } from "@cplayout/core";

export const CPLAYOUT_REFERENCE_LAYER_FILES = {
  roads: "roads.geojson",
  road_labels: "road_labels.geojson",
  borders: "borders.geojson",
  places: "places.geojson",
} as const;

export interface ReferenceOverlayBuildInput {
  sourceDir: string;
  outDir: string;
  packageId: string;
  name: string;
  attribution: string;
  licenseText: string;
  importedAt?: string;
  minZoom?: number;
  maxZoom?: number;
  boundsWgs84?: MapPackageManifest["boundsWgs84"];
  schema?: ReferenceOverlaySchema;
  tileJsonUrl?: string;
  tileUrlTemplate?: string;
  pmtilesUri?: string;
}

export interface ReferenceOverlayBuildResult {
  manifest: MapPackageManifest;
  manifestPath: string;
  tileJsonPath: string;
  normalizedLayerPaths: string[];
}

export async function buildReferenceOverlayPackage(input: ReferenceOverlayBuildInput): Promise<ReferenceOverlayBuildResult> {
  const schema = input.schema ?? "cplayout_reference_v1";
  if (schema !== "cplayout_reference_v1") {
    throw new Error("The generated CPLayout builder emits cplayout_reference_v1 layer names. Use user-supplied package metadata for OpenMapTiles packages.");
  }
  assertRequiredText(input.packageId, "package id");
  assertRequiredText(input.name, "name");
  assertRequiredText(input.attribution, "attribution");
  assertRequiredText(input.licenseText, "license");

  const sourceDir = resolve(input.sourceDir);
  const outDir = resolve(input.outDir);
  const layerOutDir = join(outDir, "layers");
  await mkdir(layerOutDir, { recursive: true });

  const normalizedLayerPaths: string[] = [];
  const derivedBounds = createEmptyBounds();
  for (const [layerName, fileName] of Object.entries(CPLAYOUT_REFERENCE_LAYER_FILES)) {
    const sourcePath = join(sourceDir, fileName);
    const raw = await readFile(sourcePath, "utf8");
    const geoJson = parseGeoJsonFeatureCollection(raw, fileName);
    extendBoundsFromFeatures(geoJson.features, derivedBounds);
    const outPath = join(layerOutDir, fileName);
    await writeFile(outPath, `${JSON.stringify({ ...geoJson, name: layerName }, null, 2)}\n`, "utf8");
    normalizedLayerPaths.push(outPath);
  }

  if (!input.tileJsonUrl && !input.tileUrlTemplate && !input.pmtilesUri) {
    throw new Error("Reference overlay packages need --pmtiles-uri, --tilejson-url, or --tile-url-template before they can be auto-applied.");
  }
  const tileJsonUrl = input.tileJsonUrl;
  const tileUrlTemplate = input.tileUrlTemplate;
  if (tileJsonUrl) assertLocalReferenceUrl(tileJsonUrl, "TileJSON URL");
  if (tileUrlTemplate) assertLocalReferenceUrl(tileUrlTemplate, "Tile URL template");
  if (input.pmtilesUri) assertLocalReferenceUrl(input.pmtilesUri, "PMTiles URI");

  const boundsWgs84 = input.boundsWgs84 ?? finalizeBounds(derivedBounds);
  const tileJson = {
    tilejson: "3.0.0",
    name: input.name,
    attribution: input.attribution,
    minzoom: input.minZoom ?? 0,
    maxzoom: input.maxZoom ?? 14,
    bounds: [
      boundsWgs84.minLongitude,
      boundsWgs84.minLatitude,
      boundsWgs84.maxLongitude,
      boundsWgs84.maxLatitude,
    ],
    vector_layers: Object.keys(CPLAYOUT_REFERENCE_LAYER_FILES).map((id) => ({ id })),
    tiles: tileUrlTemplate ? [tileUrlTemplate] : [],
  };
  const tileJsonPath = join(outDir, `${input.packageId}.tilejson.json`);
  await writeFile(tileJsonPath, `${JSON.stringify(tileJson, null, 2)}\n`, "utf8");

  const manifest = validateMapPackageManifest({
    id: input.packageId,
    name: input.name,
    packageType: "pmtiles",
    tileContentType: "vector",
    uri: input.pmtilesUri ?? input.tileJsonUrl ?? outDir,
    minZoom: input.minZoom ?? 0,
    maxZoom: input.maxZoom ?? 14,
    tileScheme: "xyz",
    boundsWgs84,
    tileJsonUrl,
    tileUrlTemplates: tileUrlTemplate ? [tileUrlTemplate] : [],
    vectorOverlay: {
      schema,
      sourceLayers: {
        roads: "roads",
        roadLabels: "road_labels",
        borders: "borders",
        places: "places",
      },
    },
    installStatus: "available",
    attribution: input.attribution,
    licenseText: input.licenseText,
    importedAt: input.importedAt ?? new Date().toISOString(),
  });
  const manifestPath = join(outDir, `${input.packageId}.manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    manifest,
    manifestPath,
    tileJsonPath,
    normalizedLayerPaths,
  };
}

export function parseReferenceOverlayBuildArgs(args: string[]): ReferenceOverlayBuildInput {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument "${key}".`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}.`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return {
    sourceDir: requiredArg(values, "source-dir"),
    outDir: requiredArg(values, "out-dir"),
    packageId: requiredArg(values, "package-id"),
    name: requiredArg(values, "name"),
    attribution: requiredArg(values, "attribution"),
    licenseText: requiredArg(values, "license"),
    schema: (values.get("schema") as ReferenceOverlaySchema | undefined) ?? "cplayout_reference_v1",
    tileJsonUrl: values.get("tilejson-url"),
    tileUrlTemplate: values.get("tile-url-template"),
    pmtilesUri: values.get("pmtiles-uri"),
    minZoom: optionalInteger(values.get("min-zoom"), "min-zoom"),
    maxZoom: optionalInteger(values.get("max-zoom"), "max-zoom"),
  };
}

export async function cli(args: string[]): Promise<void> {
  try {
    const result = await buildReferenceOverlayPackage(parseReferenceOverlayBuildArgs(args));
    process.stdout.write(`Reference overlay manifest: ${result.manifestPath}\n`);
    process.stdout.write(`TileJSON metadata: ${result.tileJsonPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write("Expected source files: roads.geojson, road_labels.geojson, borders.geojson, places.geojson.\n");
    process.stderr.write("For PMTiles output, generate local vector tiles with tippecanoe and pmtiles, then pass --pmtiles-uri pmtiles://file:///absolute/path/reference.pmtiles or a localhost URL.\n");
    process.exitCode = 1;
  }
}

function parseGeoJsonFeatureCollection(raw: string, fileName: string): { type: "FeatureCollection"; features: unknown[] } {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${fileName} must be a GeoJSON FeatureCollection.`);
  }
  return parsed as { type: "FeatureCollection"; features: unknown[] };
}

interface BoundsAccumulator {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
  seen: boolean;
}

function createEmptyBounds(): BoundsAccumulator {
  return {
    minLongitude: Number.POSITIVE_INFINITY,
    minLatitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
    seen: false,
  };
}

function extendBoundsFromFeatures(features: unknown[], bounds: BoundsAccumulator): void {
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    extendBoundsFromGeometry(feature.geometry, bounds);
  }
}

function extendBoundsFromGeometry(geometry: unknown, bounds: BoundsAccumulator): void {
  if (!isRecord(geometry)) return;
  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    for (const childGeometry of geometry.geometries) extendBoundsFromGeometry(childGeometry, bounds);
    return;
  }
  extendBoundsFromCoordinates(geometry.coordinates, bounds);
}

function extendBoundsFromCoordinates(value: unknown, bounds: BoundsAccumulator): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    const longitude = value[0];
    const latitude = value[1];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    bounds.minLongitude = Math.min(bounds.minLongitude, longitude);
    bounds.minLatitude = Math.min(bounds.minLatitude, latitude);
    bounds.maxLongitude = Math.max(bounds.maxLongitude, longitude);
    bounds.maxLatitude = Math.max(bounds.maxLatitude, latitude);
    bounds.seen = true;
    return;
  }
  for (const child of value) extendBoundsFromCoordinates(child, bounds);
}

function finalizeBounds(bounds: BoundsAccumulator): MapPackageManifest["boundsWgs84"] {
  if (!bounds.seen) {
    return {
      minLongitude: -180,
      minLatitude: -90,
      maxLongitude: 180,
      maxLatitude: 90,
    };
  }
  return {
    minLongitude: bounds.minLongitude,
    minLatitude: bounds.minLatitude,
    maxLongitude: bounds.maxLongitude,
    maxLatitude: bounds.maxLatitude,
  };
}

function assertRequiredText(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`Reference overlay ${label} is required.`);
}

function assertLocalReferenceUrl(value: string, label: string): void {
  const lower = value.trim().toLowerCase();
  if (/api[_-]?key|apikey|access[_-]?token|client[_-]?secret|subscription[_-]?key|signature|token=/i.test(value)) {
    throw new Error(`${label} cannot include hidden credentials or tokens.`);
  }
  if (lower.startsWith("pmtiles://")) {
    assertLocalReferenceUrl(value.trim().slice("pmtiles://".length), label);
    return;
  }
  if (
    lower.startsWith("file://")
    || lower.startsWith("asset://")
    || lower.startsWith("content://")
    || lower.startsWith("app://")
    || lower.startsWith("/")
    || lower.startsWith("./")
    || lower.startsWith("../")
  ) {
    return;
  }
  try {
    const parsed = new URL(value.replace(/\{[^{}]+\}/g, "0"));
    const hostname = parsed.hostname.toLowerCase();
    const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && localHost) return;
    throw new Error(`${label} must point to a local file, app asset, or localhost tile service.`);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`${label} must be a valid local URL or path.`);
    throw error;
  }
}

function requiredArg(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}

function optionalInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`--${label} must be an integer.`);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
