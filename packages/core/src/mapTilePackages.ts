import { z } from "zod";

import type { MapPackageManifest, TileContentType } from "./types";

export const TILE_CONTENT_TYPES = ["raster", "vector"] as const;
export const TILE_SCHEMES = ["xyz", "tms"] as const;
export const TILE_PACKAGE_INSTALL_STATUSES = ["metadata_only", "available", "missing", "indexed"] as const;

const BoundsWgs84Schema = z.object({
  minLongitude: z.number().min(-180).max(180),
  minLatitude: z.number().min(-90).max(90),
  maxLongitude: z.number().min(-180).max(180),
  maxLatitude: z.number().min(-90).max(90),
});

export const MapPackageManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  packageType: z.enum(["pmtiles", "mbtiles", "raster_tiles"]),
  tileContentType: z.enum(TILE_CONTENT_TYPES).default("raster"),
  uri: z.string().min(1),
  minZoom: z.number().int().min(0).max(22),
  maxZoom: z.number().int().min(0).max(22),
  tileScheme: z.enum(TILE_SCHEMES).default("xyz"),
  boundsWgs84: BoundsWgs84Schema,
  tileJsonUrl: z.string().min(1).optional(),
  tileUrlTemplates: z.array(z.string().min(1)).default([]),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  installStatus: z.enum(TILE_PACKAGE_INSTALL_STATUSES).default("metadata_only"),
  attribution: z.string().min(1),
  licenseText: z.string().min(1),
  bytes: z.number().int().nonnegative().optional(),
  importedAt: z.string().min(1),
}).superRefine((manifest, context) => {
  if (manifest.maxZoom < manifest.minZoom) {
    context.addIssue({
      code: "custom",
      message: "maxZoom must be greater than or equal to minZoom.",
      path: ["maxZoom"],
    });
  }
  if (manifest.boundsWgs84.maxLongitude < manifest.boundsWgs84.minLongitude) {
    context.addIssue({
      code: "custom",
      message: "maxLongitude must be greater than or equal to minLongitude.",
      path: ["boundsWgs84", "maxLongitude"],
    });
  }
  if (manifest.boundsWgs84.maxLatitude < manifest.boundsWgs84.minLatitude) {
    context.addIssue({
      code: "custom",
      message: "maxLatitude must be greater than or equal to minLatitude.",
      path: ["boundsWgs84", "maxLatitude"],
    });
  }
});

export interface MapLibreTileSourceDescriptor {
  id: string;
  type: TileContentType;
  url?: string;
  tiles?: string[];
  minzoom: number;
  maxzoom: number;
  scheme: "xyz" | "tms";
  attribution: string;
}

export type TileRuntimeTarget = "svg_mvp" | "web_maplibre_gl_js" | "native_maplibre_rn";

export interface TilePackageReadiness {
  target: TileRuntimeTarget;
  canRender: boolean;
  requiresAdapter: boolean;
  reason: string;
  source?: MapLibreTileSourceDescriptor;
}

export function validateMapPackageManifest(input: unknown): MapPackageManifest {
  return MapPackageManifestSchema.parse(input);
}

export function mapPackageHasRenderableSource(manifest: MapPackageManifest): boolean {
  return tileSourceUrls(manifest).length > 0 && tileSourceUrls(manifest).every(isLocalTileSourceUrl);
}

export function toMapLibreTileSourceDescriptor(manifest: MapPackageManifest): MapLibreTileSourceDescriptor | null {
  const parsed = validateMapPackageManifest(manifest);
  if (!mapPackageHasRenderableSource(parsed)) return null;
  return {
    id: parsed.id,
    type: parsed.tileContentType,
    url: parsed.tileJsonUrl,
    tiles: parsed.tileUrlTemplates && parsed.tileUrlTemplates.length > 0 ? parsed.tileUrlTemplates : undefined,
    minzoom: parsed.minZoom,
    maxzoom: parsed.maxZoom,
    scheme: parsed.tileScheme,
    attribution: parsed.attribution,
  };
}

export function describeTilePackageReadiness(
  manifest: MapPackageManifest,
  target: TileRuntimeTarget,
): TilePackageReadiness {
  const parsed = validateMapPackageManifest(manifest);
  const source = toMapLibreTileSourceDescriptor(parsed);

  if (target === "svg_mvp") {
    return {
      target,
      canRender: false,
      requiresAdapter: false,
      reason: "The MVP SVG drawing surface stores package metadata only and does not render tile archives.",
    };
  }

  const tileUrls = tileSourceUrls(parsed);
  if (tileUrls.length > 0 && !tileUrls.every(isLocalTileSourceUrl)) {
    return {
      target,
      canRender: false,
      requiresAdapter: false,
      reason: "Tile source URLs must be local app-readable files or localhost tile services before this offline-first app marks them renderable.",
    };
  }

  if (source) {
    return {
      target,
      canRender: true,
      requiresAdapter: false,
      reason: "TileJSON or tile URL templates are available for a map renderer.",
      source,
    };
  }

  if (target === "web_maplibre_gl_js" && parsed.packageType === "pmtiles" && parsed.uri.startsWith("pmtiles://")) {
    if (!isLocalTileSourceUrl(parsed.uri)) {
      return {
        target,
        canRender: false,
        requiresAdapter: false,
        reason: "PMTiles URIs must point to local app-readable files or localhost tile services before this offline-first app marks them renderable.",
      };
    }
    return {
      target,
      canRender: true,
      requiresAdapter: false,
      reason: "PMTiles can be rendered by MapLibre GL JS after registering the pmtiles protocol at app startup.",
      source: {
        id: parsed.id,
        type: parsed.tileContentType,
        url: parsed.uri,
        minzoom: parsed.minZoom,
        maxzoom: parsed.maxZoom,
        scheme: parsed.tileScheme,
        attribution: parsed.attribution,
      },
    };
  }

  return {
    target,
    canRender: false,
    requiresAdapter: true,
    reason: target === "native_maplibre_rn"
      ? "Native MapLibre React Native consumes TileJSON or tile URL templates; raw PMTiles/MBTiles files need a local protocol or tile-serving adapter first."
      : "Raw tile archives need a renderer-specific protocol or tile-serving adapter before display.",
  };
}

function tileSourceUrls(manifest: MapPackageManifest): string[] {
  return [
    manifest.tileJsonUrl,
    ...(manifest.tileUrlTemplates ?? []),
  ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
}

function isLocalTileSourceUrl(value: string): boolean {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("pmtiles://")) return isLocalTileSourceUrl(trimmed.slice("pmtiles://".length));
  if (
    lower.startsWith("file://")
    || lower.startsWith("asset://")
    || lower.startsWith("content://")
    || lower.startsWith("app://")
    || lower.startsWith("blob:")
    || lower.startsWith("data:")
    || lower.startsWith("/")
    || lower.startsWith("./")
    || lower.startsWith("../")
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1");
  } catch {
    return false;
  }
}
