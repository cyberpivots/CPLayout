import { strFromU8, unzipSync } from "fflate";

import { validateMapPackageManifest, type MapPackageManifest } from "@cplayout/core";

export const MAP_PACKAGE_ARCHIVE_VERSION = "cplayout-map-package-v1";
export const MAP_PACKAGE_MANIFEST_FILENAME = "manifest.json";
export const MAP_PACKAGE_TILEJSON_FILENAME = "tilejson.json";
export const MAP_PACKAGE_TILES_PREFIX = "tiles/";
export const MAP_PACKAGE_LOGICAL_URL_PREFIX = "app://map-packages/";
export const MAP_PACKAGE_ARCHIVE_MAX_COMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
export const MAP_PACKAGE_ARCHIVE_MAX_ENTRY_BYTES = 128 * 1024 * 1024;

export interface MapPackageArchiveBundle {
  manifest: MapPackageManifest;
  files: Record<string, Uint8Array>;
}

export function parseMapPackageArchiveZip(data: Uint8Array): MapPackageArchiveBundle {
  if (data.byteLength > MAP_PACKAGE_ARCHIVE_MAX_COMPRESSED_BYTES) {
    throw new Error(`Map package archive compressed size exceeds ${MAP_PACKAGE_ARCHIVE_MAX_COMPRESSED_BYTES} bytes.`);
  }

  const unzipped = unzipSync(data, {
    filter: (file) => {
      validateMapPackageArchiveEntry(file.name, file.originalSize);
      return true;
    },
  });
  const manifestBytes = unzipped[MAP_PACKAGE_MANIFEST_FILENAME];
  if (!manifestBytes) throw new Error("Map package archive must contain manifest.json.");

  const manifest = validateMapPackageManifest(JSON.parse(strFromU8(manifestBytes)));
  validateMapPackageLogicalUrls(manifest);
  if (manifest.packageType !== "raster_tiles" || manifest.tileContentType !== "raster") {
    throw new Error("Map package archive v1 imports generated raster tile packages only.");
  }
  if (manifest.tileJsonUrl && !unzipped[MAP_PACKAGE_TILEJSON_FILENAME]) {
    throw new Error("Map package manifest lists tilejson.json, but the archive does not contain it.");
  }
  if ((manifest.tileUrlTemplates ?? []).length === 0 && !manifest.tileJsonUrl) {
    throw new Error("Map package archive requires tilejsonUrl or tileUrlTemplates.");
  }
  const tileEntryCount = Object.keys(unzipped).filter((filename) => filename.startsWith(MAP_PACKAGE_TILES_PREFIX)).length;
  if (tileEntryCount === 0) throw new Error("Map package archive must contain tiles/{z}/{x}/{y}.png entries.");

  return {
    manifest,
    files: Object.fromEntries(
      Object.entries(unzipped).filter(([filename]) => filename !== MAP_PACKAGE_MANIFEST_FILENAME),
    ),
  };
}

export function mapPackageRuntimeUrl(logicalUrl: string, packageId: string, baseFileUri: string): string {
  const expectedPrefix = mapPackageLogicalUrlPrefix(packageId);
  if (!logicalUrl.startsWith(expectedPrefix)) {
    throw new Error(`Map package URL must start with ${expectedPrefix}.`);
  }
  return joinFileUri(baseFileUri, logicalUrl.slice(expectedPrefix.length));
}

export function rewriteMapPackageRuntimeUrls(manifest: MapPackageManifest, baseFileUri: string): MapPackageManifest {
  const parsed = validateMapPackageManifest(manifest);
  return validateMapPackageManifest({
    ...parsed,
    uri: mapPackageRuntimeUrl(parsed.uri, parsed.id, baseFileUri),
    tileJsonUrl: parsed.tileJsonUrl ? mapPackageRuntimeUrl(parsed.tileJsonUrl, parsed.id, baseFileUri) : undefined,
    tileUrlTemplates: (parsed.tileUrlTemplates ?? []).map((template) => mapPackageRuntimeUrl(template, parsed.id, baseFileUri)),
  });
}

export function mapPackageManifestHasLogicalUrls(manifest: MapPackageManifest): boolean {
  const parsed = validateMapPackageManifest(manifest);
  return [
    parsed.uri,
    parsed.tileJsonUrl,
    ...(parsed.tileUrlTemplates ?? []),
  ].some((url) => typeof url === "string" && url.startsWith(mapPackageLogicalUrlPrefix(parsed.id)));
}

export function mapPackageLogicalUrlPrefix(packageId: string): string {
  return `${MAP_PACKAGE_LOGICAL_URL_PREFIX}${encodeURIComponent(packageId)}/`;
}

function validateMapPackageLogicalUrls(manifest: MapPackageManifest): void {
  const expectedPrefix = mapPackageLogicalUrlPrefix(manifest.id);
  const urls = [
    manifest.uri,
    manifest.tileJsonUrl,
    ...(manifest.tileUrlTemplates ?? []),
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  for (const url of urls) {
    if (!url.startsWith(expectedPrefix)) {
      throw new Error(`Map package archive URLs must use ${expectedPrefix} logical app URLs.`);
    }
    const relativePath = url.slice(expectedPrefix.length);
    if (relativePath.length > 0) validateMapPackageArchivePath(relativePath);
  }
}

function validateMapPackageArchiveEntry(filename: string, originalSize: number): void {
  validateMapPackageArchivePath(filename);
  if (filename !== MAP_PACKAGE_MANIFEST_FILENAME && filename !== MAP_PACKAGE_TILEJSON_FILENAME && !filename.startsWith(MAP_PACKAGE_TILES_PREFIX)) {
    throw new Error(`Map package archive contains unsupported file: ${filename}.`);
  }
  if (originalSize > MAP_PACKAGE_ARCHIVE_MAX_ENTRY_BYTES) {
    throw new Error(`Map package archive entry ${filename} exceeds ${MAP_PACKAGE_ARCHIVE_MAX_ENTRY_BYTES} uncompressed bytes.`);
  }
}

function validateMapPackageArchivePath(filename: string): void {
  if (filename.length === 0 || filename.length > 220) {
    throw new Error(`Map package archive contains unsafe path length: ${filename}.`);
  }
  if (filename.startsWith("/") || filename.startsWith("\\") || /^[A-Za-z]:/.test(filename) || filename.includes("\\")) {
    throw new Error(`Map package archive contains unsafe path: ${filename}.`);
  }
  const parts = filename.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Map package archive contains unsafe path: ${filename}.`);
  }
  if (filename.startsWith(MAP_PACKAGE_TILES_PREFIX) && !/^tiles\/\{?z\}?\/\{?x\}?\/\{?y\}?\.png$|^tiles\/\d+\/\d+\/\d+\.png$/.test(filename)) {
    throw new Error(`Map package archive tile path must be tiles/{z}/{x}/{y}.png or concrete XYZ PNG tiles: ${filename}.`);
  }
}

function joinFileUri(baseFileUri: string, relativePath: string): string {
  const base = baseFileUri.endsWith("/") ? baseFileUri : `${baseFileUri}/`;
  return `${base}${relativePath}`;
}
