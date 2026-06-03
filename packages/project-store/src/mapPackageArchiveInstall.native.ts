import { Directory, File, Paths } from "expo-file-system";
import { validateMapPackageManifest, type MapPackageManifest } from "@cplayout/core";

import {
  mapPackageManifestHasLogicalUrls,
  mapPackageRuntimeUrl,
  parseMapPackageArchiveZip,
  rewriteMapPackageRuntimeUrls,
} from "./mapPackageArchive";

export interface InstalledMapPackageArchive {
  manifest: MapPackageManifest;
  runtimeManifest: MapPackageManifest;
  packageDirectoryUri: string;
  fileCount: number;
}

export async function installMapPackageArchiveZipAsync(data: Uint8Array): Promise<InstalledMapPackageArchive> {
  const parsed = parseMapPackageArchiveZip(data);
  const packageDirectory = new Directory(Paths.document, "map-packages", parsed.manifest.id);
  packageDirectory.create({ idempotent: true, intermediates: true });

  for (const [filename, bytes] of Object.entries(parsed.files)) {
    const parts = filename.split("/");
    const basename = parts.at(-1);
    if (!basename) continue;
    let directory = packageDirectory;
    for (const segment of parts.slice(0, -1)) {
      directory = new Directory(directory, segment);
      directory.create({ idempotent: true, intermediates: true });
    }
    const file = new File(directory, basename);
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
  }

  return {
    manifest: parsed.manifest,
    runtimeManifest: rewriteMapPackageRuntimeUrls(parsed.manifest, packageDirectory.uri),
    packageDirectoryUri: packageDirectory.uri,
    fileCount: Object.keys(parsed.files).length,
  };
}

export async function rehydrateInstalledMapPackageManifestsAsync(
  mapPackages: MapPackageManifest[] = [],
): Promise<MapPackageManifest[]> {
  const runtimeManifests: MapPackageManifest[] = [];
  for (const mapPackage of mapPackages) {
    const runtimeManifest = rehydrateInstalledMapPackageManifest(mapPackage);
    if (runtimeManifest) runtimeManifests.push(runtimeManifest);
  }
  return runtimeManifests;
}

function rehydrateInstalledMapPackageManifest(mapPackage: MapPackageManifest): MapPackageManifest | null {
  try {
    const manifest = validateMapPackageManifest(mapPackage);
    if (!mapPackageManifestHasLogicalUrls(manifest)) return null;
    const packageDirectory = new Directory(Paths.document, "map-packages", manifest.id);
    if (!packageDirectory.exists) return null;
    if (!requiredLogicalFilesExist(manifest, packageDirectory.uri)) return null;
    return rewriteMapPackageRuntimeUrls(manifest, packageDirectory.uri);
  } catch {
    return null;
  }
}

function requiredLogicalFilesExist(manifest: MapPackageManifest, packageDirectoryUri: string): boolean {
  if (manifest.tileJsonUrl) {
    const tileJsonRuntimeUri = mapPackageRuntimeUrl(manifest.tileJsonUrl, manifest.id, packageDirectoryUri);
    if (!new File(tileJsonRuntimeUri).exists) return false;
  }
  for (const template of manifest.tileUrlTemplates ?? []) {
    if (!template.includes("{z}") && !template.includes("{TileMatrix}")) {
      const tileRuntimeUri = mapPackageRuntimeUrl(template, manifest.id, packageDirectoryUri);
      if (!new File(tileRuntimeUri).exists) return false;
    }
  }
  return true;
}
