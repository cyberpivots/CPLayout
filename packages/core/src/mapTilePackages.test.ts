import assert from "node:assert/strict";

import {
  describeTilePackageReadiness,
  toMapLibreTileSourceDescriptor,
  validateMapPackageManifest,
} from "./mapTilePackages";
import type { MapPackageManifest } from "./types";

const packageManifest: MapPackageManifest = {
  id: "field-imagery-z12",
  name: "Field imagery package",
  packageType: "pmtiles",
  tileContentType: "raster",
  uri: "file:///offline/field.pmtiles",
  minZoom: 10,
  maxZoom: 18,
  tileScheme: "xyz",
  boundsWgs84: {
    minLongitude: -105.21,
    minLatitude: 40.01,
    maxLongitude: -105.11,
    maxLatitude: 40.11,
  },
  tileJsonUrl: "http://127.0.0.1:8765/field/tilejson.json",
  tileUrlTemplates: ["http://127.0.0.1:8765/field/{z}/{x}/{y}.png"],
  checksumSha256: "a".repeat(64),
  installStatus: "available",
  attribution: "Local orthomosaic, licensed for offline field use.",
  licenseText: "Operator supplied local imagery.",
  bytes: 123456,
  importedAt: "2026-05-19T12:00:00.000Z",
};

const parsed = validateMapPackageManifest(packageManifest);
assert.equal(parsed.tileScheme, "xyz");
assert.equal(parsed.tileContentType, "raster");

const source = toMapLibreTileSourceDescriptor(parsed);
assert.ok(source);
assert.equal(source.type, "raster");
assert.equal(source.scheme, "xyz");
assert.deepEqual(source.tiles, packageManifest.tileUrlTemplates);

const nativeReady = describeTilePackageReadiness(parsed, "native_maplibre_rn");
assert.equal(nativeReady.canRender, true);
assert.equal(nativeReady.requiresAdapter, false);
assert.ok(nativeReady.source);

const rawArchiveOnly = validateMapPackageManifest({
  ...packageManifest,
  id: "raw-only",
  tileJsonUrl: undefined,
  tileUrlTemplates: undefined,
  uri: "file:///offline/raw-only.mbtiles",
  packageType: "mbtiles",
});
const nativeDeferred = describeTilePackageReadiness(rawArchiveOnly, "native_maplibre_rn");
assert.equal(nativeDeferred.canRender, false);
assert.equal(nativeDeferred.requiresAdapter, true);
assert.match(nativeDeferred.reason, /raw PMTiles\/MBTiles files need/);

const webPmtiles = validateMapPackageManifest({
  ...packageManifest,
  id: "web-pmtiles",
  tileJsonUrl: undefined,
  tileUrlTemplates: [],
  uri: "pmtiles://http://127.0.0.1:8765/field.pmtiles",
});
const webReady = describeTilePackageReadiness(webPmtiles, "web_maplibre_gl_js");
assert.equal(webReady.canRender, true);
assert.match(webReady.reason, /pmtiles protocol/);

const nativeRawPmtiles = describeTilePackageReadiness(webPmtiles, "native_maplibre_rn");
assert.equal(nativeRawPmtiles.canRender, false);
assert.equal(nativeRawPmtiles.requiresAdapter, true);
assert.match(nativeRawPmtiles.reason, /raw PMTiles\/MBTiles files need/);

const remotePmtiles = validateMapPackageManifest({
  ...packageManifest,
  id: "remote-pmtiles",
  tileJsonUrl: undefined,
  tileUrlTemplates: [],
  uri: "pmtiles://https://tiles.example.invalid/field.pmtiles",
});
const remotePmtilesReadiness = describeTilePackageReadiness(remotePmtiles, "web_maplibre_gl_js");
assert.equal(remotePmtilesReadiness.canRender, false);
assert.equal(remotePmtilesReadiness.requiresAdapter, false);
assert.match(remotePmtilesReadiness.reason, /PMTiles URIs must point to local/);

assert.throws(
  () => validateMapPackageManifest({ ...packageManifest, maxZoom: 9 }),
  /maxZoom/,
);

assert.throws(
  () => validateMapPackageManifest({ ...packageManifest, checksumSha256: "not-sha256" }),
  /Invalid string|checksumSha256/,
);

const remoteTileSource = validateMapPackageManifest({
  ...packageManifest,
  id: "remote-template",
  tileJsonUrl: "https://tiles.example.invalid/tilejson.json",
  tileUrlTemplates: ["https://tiles.example.invalid/{z}/{x}/{y}.png"],
});
assert.equal(toMapLibreTileSourceDescriptor(remoteTileSource), null);
const remoteReadiness = describeTilePackageReadiness(remoteTileSource, "native_maplibre_rn");
assert.equal(remoteReadiness.canRender, false);
assert.equal(remoteReadiness.requiresAdapter, false);
assert.match(remoteReadiness.reason, /local app-readable files or localhost/);

console.log("map tile package tests passed");
