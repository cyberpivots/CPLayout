import assert from "node:assert/strict";

import { defaultAppSettings } from "./settings";
import {
  PUBLIC_REFERENCE_OVERLAY_RASTER_SOURCES,
  REFERENCE_OVERLAY_LAYER_CONTRACTS,
  listReferenceOverlayCandidates,
  resolveReferenceOverlaySource,
} from "./referenceOverlays";
import type { MapPackageManifest } from "./types";

const vectorPackage: MapPackageManifest = {
  id: "local-reference",
  name: "Local reference overlay",
  packageType: "pmtiles",
  tileContentType: "vector",
  uri: "pmtiles://http://127.0.0.1:8765/reference.pmtiles",
  minZoom: 0,
  maxZoom: 14,
  tileScheme: "xyz",
  boundsWgs84: {
    minLongitude: -125,
    minLatitude: 24,
    maxLongitude: -66,
    maxLatitude: 50,
  },
  vectorOverlay: {
    schema: "cplayout_reference_v1",
    sourceLayers: {
      roads: "roads",
      roadLabels: "road_labels",
      borders: "borders",
      places: "places",
    },
  },
  installStatus: "available",
  attribution: "US Census TIGER/Line; Natural Earth",
  licenseText: "Local offline reference overlay package.",
  importedAt: "2026-06-01T00:00:00.000Z",
};

const defaults = defaultAppSettings();
assert.equal(defaults.referenceOverlay.mode, "auto");
assert.equal(defaults.referenceOverlay.roads, true);
assert.equal(defaults.referenceOverlay.borders, true);
assert.equal(defaults.referenceOverlay.labels, true);
assert.equal(defaults.referenceOverlay.schema, "cplayout_reference_v1");

assert.deepEqual(REFERENCE_OVERLAY_LAYER_CONTRACTS.cplayout_reference_v1, {
  roads: "roads",
  roadLabels: "road_labels",
  borders: "borders",
  places: "places",
});
assert.deepEqual(REFERENCE_OVERLAY_LAYER_CONTRACTS.openmaptiles, {
  roads: "transportation",
  roadLabels: "transportation_name",
  borders: "boundary",
  places: "place",
});

const autoReady = resolveReferenceOverlaySource({
  preferences: defaults.referenceOverlay,
  mapPackages: [vectorPackage],
  target: "web_maplibre_gl_js",
});
assert.equal(autoReady.canRender, true);
assert.equal(autoReady.status, "ready");
assert.equal(autoReady.autoApplied, true);
assert.equal(autoReady.packageId, vectorPackage.id);
assert.equal(autoReady.sourceKind, "vector");

const noSource = resolveReferenceOverlaySource({
  preferences: { ...defaults.referenceOverlay, mode: "auto" },
  mapPackages: [],
  target: "web_maplibre_gl_js",
});
assert.equal(noSource.canRender, false);
assert.equal(noSource.status, "missing_source");

const publicAuto = resolveReferenceOverlaySource({
  allowPublicNetwork: true,
  preferences: { ...defaults.referenceOverlay, mode: "auto" },
  mapPackages: [],
  target: "web_maplibre_gl_js",
});
assert.equal(publicAuto.canRender, true);
assert.equal(publicAuto.status, "ready");
assert.equal(publicAuto.autoApplied, true);
assert.equal(publicAuto.sourceKind, "public_raster");
assert.equal(publicAuto.rasterSources?.length, PUBLIC_REFERENCE_OVERLAY_RASTER_SOURCES.length);
assert.match(publicAuto.packageName ?? "", /USGS The National Map Imagery Topo/);
assert.ok(publicAuto.rasterSources?.every((source) => source.tiles[0]?.includes("USGSImageryTopo")));

const localPreferredOverPublic = resolveReferenceOverlaySource({
  allowPublicNetwork: true,
  preferences: defaults.referenceOverlay,
  mapPackages: [vectorPackage],
  target: "web_maplibre_gl_js",
});
assert.equal(localPreferredOverPublic.sourceKind, "vector");
assert.equal(localPreferredOverPublic.packageId, vectorPackage.id);

const ready = resolveReferenceOverlaySource({
  preferences: { ...defaults.referenceOverlay, mode: "manual", sourcePackageId: vectorPackage.id },
  mapPackages: [vectorPackage],
  target: "web_maplibre_gl_js",
});
assert.equal(ready.canRender, true);
assert.equal(ready.status, "ready");
assert.equal(ready.autoApplied, false);
assert.equal(ready.source?.type, "vector");
assert.equal(ready.source?.url, vectorPackage.uri);

assert.deepEqual(listReferenceOverlayCandidates({
  mapPackages: [vectorPackage],
  target: "web_maplibre_gl_js",
}).map((candidate) => candidate.packageId), [vectorPackage.id]);

const unannotatedPackage: MapPackageManifest = {
  ...vectorPackage,
  id: "local-unannotated",
  vectorOverlay: undefined,
};
const unannotatedAuto = resolveReferenceOverlaySource({
  preferences: defaults.referenceOverlay,
  mapPackages: [unannotatedPackage],
  target: "web_maplibre_gl_js",
});
assert.equal(unannotatedAuto.canRender, false);
assert.equal(unannotatedAuto.status, "missing_source");

const ambiguousAuto = resolveReferenceOverlaySource({
  preferences: defaults.referenceOverlay,
  mapPackages: [vectorPackage, { ...vectorPackage, id: "second-reference", name: "Second reference overlay" }],
  target: "web_maplibre_gl_js",
});
assert.equal(ambiguousAuto.canRender, false);
assert.equal(ambiguousAuto.status, "ambiguous_source");

const ambiguousAutoNoPublicFallback = resolveReferenceOverlaySource({
  allowPublicNetwork: true,
  preferences: defaults.referenceOverlay,
  mapPackages: [vectorPackage, { ...vectorPackage, id: "third-reference", name: "Third reference overlay" }],
  target: "web_maplibre_gl_js",
});
assert.equal(ambiguousAutoNoPublicFallback.canRender, false);
assert.equal(ambiguousAutoNoPublicFallback.status, "ambiguous_source");

const remotePackage: MapPackageManifest = {
  ...vectorPackage,
  id: "remote-reference",
  uri: "pmtiles://https://tiles.example.invalid/reference.pmtiles",
};
const remote = resolveReferenceOverlaySource({
  preferences: { ...defaults.referenceOverlay, mode: "manual", sourcePackageId: remotePackage.id },
  mapPackages: [remotePackage],
  target: "web_maplibre_gl_js",
});
assert.equal(remote.canRender, false);
assert.match(remote.reason, /local app-readable files|PMTiles URIs must point to local/);

const svgUnavailable = resolveReferenceOverlaySource({
  preferences: { ...defaults.referenceOverlay, mode: "auto", sourcePackageId: vectorPackage.id },
  mapPackages: [vectorPackage],
  target: "svg_mvp",
});
assert.equal(svgUnavailable.canRender, false);
assert.match(svgUnavailable.reason, /SVG drawing surface/);

console.log("reference overlay tests passed");
