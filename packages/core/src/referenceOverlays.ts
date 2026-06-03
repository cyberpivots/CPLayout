import type { ReferenceOverlayMode, ReferenceOverlayPreferences, ReferenceOverlaySchema } from "./settings";
import { describeTilePackageReadiness, isNativeMapLibreTarget, type MapLibreTileSourceDescriptor, type TileRuntimeTarget } from "./mapTilePackages";
import type { MapPackageManifest, VectorOverlayMetadata } from "./types";

export type ReferenceOverlayLayerKey = "roads" | "borders" | "labels";

export interface ReferenceOverlayLayerContract {
  roads: string;
  roadLabels: string;
  borders: string;
  places: string;
}

export interface ReferenceOverlayRasterSourceDescriptor {
  id: string;
  name: string;
  type: "raster";
  layer: ReferenceOverlayLayerKey;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  tileSize: number;
  attribution: string;
}

export interface ReferenceOverlayPublicProviderDescriptor {
  id: string;
  name: string;
  attribution: string;
  licenseText: string;
  sourceUrl: string;
}

export interface ReferenceOverlayResolution {
  status: "off" | "missing_source" | "missing_package" | "ambiguous_source" | "unavailable" | "ready";
  canRender: boolean;
  reason: string;
  mode: ReferenceOverlayMode;
  autoApplied: boolean;
  sourceKind: "none" | "vector" | "public_raster";
  packageId?: string;
  packageName?: string;
  source?: MapLibreTileSourceDescriptor;
  rasterSources?: ReferenceOverlayRasterSourceDescriptor[];
  schema: ReferenceOverlaySchema;
  layers: ReferenceOverlayLayerContract;
  attribution?: string;
  licenseText?: string;
}

export interface ReferenceOverlayCandidate {
  packageId: string;
  packageName: string;
  schema: ReferenceOverlaySchema;
  layers: ReferenceOverlayLayerContract;
  attribution: string;
  licenseText: string;
}

export const REFERENCE_OVERLAY_LAYER_CONTRACTS: Record<ReferenceOverlaySchema, ReferenceOverlayLayerContract> = {
  cplayout_reference_v1: {
    roads: "roads",
    roadLabels: "road_labels",
    borders: "borders",
    places: "places",
  },
  openmaptiles: {
    roads: "transportation",
    roadLabels: "transportation_name",
    borders: "boundary",
    places: "place",
  },
};

export const PUBLIC_REFERENCE_OVERLAY_PROVIDER: ReferenceOverlayPublicProviderDescriptor = {
  id: "usgs_tnm_reference",
  name: "USGS The National Map Imagery Topo",
  attribution: "USGS The National Map: Orthoimagery and US Topo",
  licenseText: "Public no-key USGS TNM cached imagery-topo service; interactive reference only, no bulk cache in CPLayout.",
  sourceUrl: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer",
};

export const PUBLIC_REFERENCE_OVERLAY_RASTER_SOURCES: ReferenceOverlayRasterSourceDescriptor[] = [
  {
    id: "reference-public-imagery-topo",
    name: "USGS TNM Imagery Topo roads, borders, and labels",
    type: "raster",
    layer: "labels",
    tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"],
    minzoom: 0,
    maxzoom: 16,
    tileSize: 256,
    attribution: "USGS The National Map: Orthoimagery and US Topo",
  },
];

export function resolveReferenceOverlaySource({
  allowPublicNetwork = false,
  mapPackages,
  preferences,
  target,
}: {
  allowPublicNetwork?: boolean;
  mapPackages?: MapPackageManifest[];
  preferences: ReferenceOverlayPreferences;
  target: TileRuntimeTarget;
}): ReferenceOverlayResolution {
  const base = {
    mode: preferences.mode,
    autoApplied: false,
    sourceKind: "none" as const,
    schema: preferences.schema,
    layers: REFERENCE_OVERLAY_LAYER_CONTRACTS[preferences.schema],
  };

  if (preferences.mode === "off") {
    return {
      ...base,
      status: "off",
      canRender: false,
      reason: "Reference overlays are off.",
    };
  }

  if (target === "svg_mvp") {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      reason: "The SVG drawing surface does not render local vector tile reference overlays.",
    };
  }

  if (preferences.mode === "manual") {
    if (!preferences.sourcePackageId) {
      return {
        ...base,
        status: "missing_source",
        canRender: false,
        reason: "Choose a local vector map package before enabling manual roads, borders, or labels.",
      };
    }
    return resolveSelectedReferenceOverlayPackage({
      autoApplied: false,
      mapPackages: mapPackages ?? [],
      packageId: preferences.sourcePackageId,
      schema: preferences.schema,
      target,
    });
  }

  if (preferences.sourcePackageId) {
    const selected = resolveSelectedReferenceOverlayPackage({
      autoApplied: true,
      mapPackages: mapPackages ?? [],
      packageId: preferences.sourcePackageId,
      schema: preferences.schema,
      target,
      requireMetadata: true,
      suppressMissingPackage: true,
    });
    if (selected.canRender) return selected;
  }

  const candidates = listReferenceOverlayCandidates({
    mapPackages,
    target,
  });

  if (candidates.length === 0) {
    if (allowPublicNetwork && target === "web_maplibre_gl_js") return publicRasterReferenceOverlayResolution(preferences);
    return {
      ...base,
      status: "missing_source",
      canRender: false,
      reason: target === "web_maplibre_gl_js"
        ? "No auto-eligible local vector reference package is available; public no-key USGS Imagery Topo can auto-apply when live reference sources are enabled."
        : "No auto-eligible local vector TileJSON/template reference package is available for native MapLibre.",
    };
  }

  if (candidates.length > 1) {
    return {
      ...base,
      status: "ambiguous_source",
      canRender: false,
      reason: "Multiple local vector reference packages are available; choose one in Settings to make the overlay deterministic.",
    };
  }

  return resolveSelectedReferenceOverlayPackage({
    autoApplied: true,
    mapPackages: mapPackages ?? [],
    packageId: candidates[0].packageId,
    schema: candidates[0].schema,
    target,
    requireMetadata: true,
  });
}

export function listReferenceOverlayCandidates({
  mapPackages,
  target,
}: {
  mapPackages?: MapPackageManifest[];
  target: TileRuntimeTarget;
}): ReferenceOverlayCandidate[] {
  if (target === "svg_mvp") return [];
  return (mapPackages ?? []).flatMap((mapPackage) => {
    const overlay = validVectorOverlayMetadata(mapPackage.vectorOverlay);
    if (!overlay) return [];
    const resolved = resolveSelectedReferenceOverlayPackage({
      autoApplied: true,
      mapPackages: [mapPackage],
      packageId: mapPackage.id,
      schema: overlay.schema,
      target,
      requireMetadata: true,
    });
    if (!resolved.canRender) return [];
    return [{
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      schema: resolved.schema,
      layers: resolved.layers,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
    }];
  });
}

function publicRasterReferenceOverlayResolution(preferences: ReferenceOverlayPreferences): ReferenceOverlayResolution {
  return {
    mode: preferences.mode,
    autoApplied: true,
    sourceKind: "public_raster",
    status: "ready",
    canRender: true,
    packageId: PUBLIC_REFERENCE_OVERLAY_PROVIDER.id,
    packageName: PUBLIC_REFERENCE_OVERLAY_PROVIDER.name,
    rasterSources: PUBLIC_REFERENCE_OVERLAY_RASTER_SOURCES,
    schema: preferences.schema,
    layers: REFERENCE_OVERLAY_LAYER_CONTRACTS[preferences.schema],
    attribution: PUBLIC_REFERENCE_OVERLAY_PROVIDER.attribution,
    licenseText: PUBLIC_REFERENCE_OVERLAY_PROVIDER.licenseText,
    reason: "Public no-key USGS Imagery Topo reference layer was auto-applied in the browser MapLibre surface.",
  };
}

function resolveSelectedReferenceOverlayPackage({
  autoApplied,
  mapPackages,
  packageId,
  requireMetadata = false,
  schema,
  suppressMissingPackage = false,
  target,
}: {
  autoApplied: boolean;
  mapPackages: MapPackageManifest[];
  packageId: string;
  requireMetadata?: boolean;
  schema: ReferenceOverlaySchema;
  suppressMissingPackage?: boolean;
  target: TileRuntimeTarget;
}): ReferenceOverlayResolution {
  const mapPackage = mapPackages.find((candidate) => candidate.id === packageId);
  const overlay = validVectorOverlayMetadata(mapPackage?.vectorOverlay);
  const resolvedSchema = overlay?.schema ?? schema;
  const layers = overlay?.sourceLayers ?? REFERENCE_OVERLAY_LAYER_CONTRACTS[resolvedSchema];
  const base = {
    mode: autoApplied ? "auto" as const : "manual" as const,
    autoApplied,
    sourceKind: "none" as const,
    schema: resolvedSchema,
    layers,
  };

  if (!mapPackage) {
    return {
      ...base,
      status: "missing_package",
      canRender: false,
      packageId,
      reason: suppressMissingPackage
        ? "The sticky reference overlay package is not present in this project."
        : "The selected reference overlay package is not present in this project.",
    };
  }

  if (requireMetadata && !overlay) {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
      reason: "Automatic reference overlays require vectorOverlay schema and source-layer metadata in the package manifest.",
    };
  }

  if (mapPackage.tileContentType !== "vector") {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
      reason: "Reference overlays require a local vector tile package; raster packages remain imagery-only.",
    };
  }

  if (mapPackage.installStatus !== "available" && mapPackage.installStatus !== "indexed") {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
      reason: "Reference overlay package metadata is present, but the local vector package is not installed or indexed.",
    };
  }

  const readiness = describeTilePackageReadiness(mapPackage, target);
  if (!readiness.canRender || !readiness.source) {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
      reason: readiness.reason,
    };
  }

  if (readiness.source.type !== "vector") {
    return {
      ...base,
      status: "unavailable",
      canRender: false,
      packageId: mapPackage.id,
      packageName: mapPackage.name,
      attribution: mapPackage.attribution,
      licenseText: mapPackage.licenseText,
      reason: "Reference overlays require a vector MapLibre source.",
    };
  }

  return {
    ...base,
    sourceKind: "vector",
    status: "ready",
    canRender: true,
    packageId: mapPackage.id,
    packageName: mapPackage.name,
    source: readiness.source,
    attribution: mapPackage.attribution,
    licenseText: mapPackage.licenseText,
    reason: autoApplied
      ? `Local vector reference overlay package was auto-applied in the ${referenceOverlayTargetLabel(target)}.`
      : `Local vector reference overlay package is renderable in the ${referenceOverlayTargetLabel(target)}.`,
  };
}

function referenceOverlayTargetLabel(target: TileRuntimeTarget): string {
  if (target === "web_maplibre_gl_js") return "browser MapLibre surface";
  if (isNativeMapLibreTarget(target)) return "native MapLibre surface";
  return "selected map surface";
}

function validVectorOverlayMetadata(metadata: VectorOverlayMetadata | undefined): VectorOverlayMetadata | null {
  if (!metadata) return null;
  if (!REFERENCE_OVERLAY_LAYER_CONTRACTS[metadata.schema]) return null;
  const layers = metadata.sourceLayers;
  if (!layers.roads || !layers.roadLabels || !layers.borders || !layers.places) return null;
  return metadata;
}
