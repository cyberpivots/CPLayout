import type { MapPackageManifest } from "@cplayout/core";

export interface InstalledMapPackageArchive {
  manifest: MapPackageManifest;
  runtimeManifest: MapPackageManifest;
  packageDirectoryUri: string;
  fileCount: number;
}

export async function installMapPackageArchiveZipAsync(_data: Uint8Array): Promise<InstalledMapPackageArchive> {
  throw new Error("Native map package install is available only through the Expo FileSystem native adapter.");
}

export async function rehydrateInstalledMapPackageManifestsAsync(
  _mapPackages: MapPackageManifest[] = [],
): Promise<MapPackageManifest[]> {
  return [];
}
