import assert from "node:assert/strict";

import { strToU8, zipSync } from "fflate";

import {
  MAP_PACKAGE_MANIFEST_FILENAME,
  MAP_PACKAGE_TILEJSON_FILENAME,
  mapPackageManifestHasLogicalUrls,
  mapPackageLogicalUrlPrefix,
  mapPackageRuntimeUrl,
  parseMapPackageArchiveZip,
  rewriteMapPackageRuntimeUrls,
} from "./mapPackageArchive";
import { rehydrateInstalledMapPackageManifestsAsync } from "./mapPackageArchiveInstall";

const packageId = "naip-local-aerial";
const prefix = mapPackageLogicalUrlPrefix(packageId);
const manifest = {
  id: packageId,
  name: "NAIP local aerial",
  packageType: "raster_tiles",
  tileContentType: "raster",
  uri: prefix,
  minZoom: 12,
  maxZoom: 18,
  tileScheme: "xyz",
  boundsWgs84: {
    minLongitude: -105.2,
    minLatitude: 40.01,
    maxLongitude: -105.1,
    maxLatitude: 40.08,
  },
  tileJsonUrl: `${prefix}tilejson.json`,
  tileUrlTemplates: [`${prefix}tiles/{z}/{x}/{y}.png`],
  imageryProvenance: {
    providerId: "usgs_naip",
    providerName: "USGS EROS NAIP",
    sourceUrl: "https://www.usgs.gov/centers/eros/science/national-agriculture-imagery-program-naip",
    productId: "M_4010521_NE_13_1_20250715",
    acquisitionYear: 2025,
    sourceResolutionMeters: 1,
    originalCrs: "EPSG:26913",
    preprocessingSummary: "GDAL generated XYZ PNG tiles and TileJSON outside the app.",
    accessedAt: "2026-06-03T12:00:00.000Z",
    attribution: "USDA Farm Service Agency, USGS EROS NAIP",
    licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
    offlineCopyAllowed: true,
    keyedService: false,
  },
  checksumSha256: "c".repeat(64),
  installStatus: "available",
  attribution: "USDA Farm Service Agency, USGS EROS NAIP",
  licenseText: "Public domain NAIP imagery; verify source notices for the selected product.",
  bytes: 512,
  importedAt: "2026-06-03T12:00:00.000Z",
};

const archive = zipSync({
  [MAP_PACKAGE_MANIFEST_FILENAME]: strToU8(JSON.stringify(manifest)),
  [MAP_PACKAGE_TILEJSON_FILENAME]: strToU8(JSON.stringify({
    tilejson: "3.0.0",
    tiles: manifest.tileUrlTemplates,
    minzoom: manifest.minZoom,
    maxzoom: manifest.maxZoom,
  })),
  "tiles/12/856/1549.png": new Uint8Array([137, 80, 78, 71]),
});

const parsed = parseMapPackageArchiveZip(archive);
assert.equal(parsed.manifest.id, packageId);
assert.equal(parsed.manifest.imageryProvenance?.providerId, "usgs_naip");
assert.equal(mapPackageManifestHasLogicalUrls(parsed.manifest), true);
assert.equal(parsed.manifest.tileJsonUrl, `${prefix}tilejson.json`);
assert.ok(parsed.files[MAP_PACKAGE_TILEJSON_FILENAME]);
assert.ok(parsed.files["tiles/12/856/1549.png"]);

assert.equal(
  mapPackageRuntimeUrl(`${prefix}tiles/{z}/{x}/{y}.png`, packageId, "file:///documents/map-packages/naip-local-aerial"),
  "file:///documents/map-packages/naip-local-aerial/tiles/{z}/{x}/{y}.png",
);

const runtimeManifest = rewriteMapPackageRuntimeUrls(parsed.manifest, "file:///documents/map-packages/naip-local-aerial/");
assert.equal(runtimeManifest.tileJsonUrl, "file:///documents/map-packages/naip-local-aerial/tilejson.json");
assert.deepEqual(runtimeManifest.tileUrlTemplates, ["file:///documents/map-packages/naip-local-aerial/tiles/{z}/{x}/{y}.png"]);
assert.equal(mapPackageManifestHasLogicalUrls(runtimeManifest), false);

assert.throws(
  () => parseMapPackageArchiveZip(zipSync({
    [MAP_PACKAGE_MANIFEST_FILENAME]: strToU8(JSON.stringify({
      ...manifest,
      tileJsonUrl: "file:///tmp/tilejson.json",
    })),
    [MAP_PACKAGE_TILEJSON_FILENAME]: strToU8("{}"),
    "tiles/12/856/1549.png": new Uint8Array([1]),
  })),
  /logical app URLs/,
);

assert.throws(
  () => parseMapPackageArchiveZip(zipSync({
    [MAP_PACKAGE_MANIFEST_FILENAME]: strToU8(JSON.stringify(manifest)),
    "../evil.png": new Uint8Array([1]),
  })),
  /unsafe path/,
);

assert.throws(
  () => parseMapPackageArchiveZip(zipSync({
    [MAP_PACKAGE_MANIFEST_FILENAME]: strToU8(JSON.stringify({
      ...manifest,
      packageType: "mbtiles",
      uri: `${prefix}raw.mbtiles`,
      tileJsonUrl: undefined,
      tileUrlTemplates: [],
    })),
    "raw.mbtiles": new Uint8Array([1]),
  })),
  /generated raster tile packages only|unsupported file/,
);

void rehydrateInstalledMapPackageManifestsAsync([parsed.manifest, runtimeManifest])
  .then((runtimeManifests) => {
    assert.deepEqual(runtimeManifests, []);
    console.log("map package archive tests passed");
  });
