import {
  ONLINE_IMAGERY_PROVIDER_CATALOG,
  buildOnlineImageryTileUrl,
  projectLonLatToXy,
  projectXyToLonLat,
  resolveOnlineImageryProvider,
  type OnlineImageryCustomSource,
  type OnlineImageryProvider,
  type OnlineImageryProviderId,
  type XY,
} from "@cplayout/core";

import type { MapViewport } from "./mapInteraction";
import { visibleHeightMeters, visibleWidthMeters } from "./mapInteraction";

export interface PlannedImageryTile {
  key: string;
  href: string;
  z: number;
  x: number;
  y: number;
  projectedBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ImageryTilePlan {
  provider: OnlineImageryProvider;
  tiles: PlannedImageryTile[];
  capped: boolean;
  error: string | null;
}

export function planOnlineImageryTiles(params: {
  viewport: MapViewport;
  projectCrs: string;
  providerId: OnlineImageryProviderId;
  customSource?: OnlineImageryCustomSource;
  maxTiles: number;
}): ImageryTilePlan {
  let provider = ONLINE_IMAGERY_PROVIDER_CATALOG[params.providerId];
  try {
    provider = resolveOnlineImageryProvider(params.providerId, params.customSource);
    if (!supportsSvgOnlineImageryOverlay(params.projectCrs)) {
      throw new Error("Online imagery preview is disabled for this project CRS until a local reprojection adapter is available.");
    }
    const maxTiles = Math.max(1, Math.floor(params.maxTiles));
    const bounds = viewportWgs84Bounds(params.viewport, params.projectCrs);
    const z = chooseZoom(bounds, provider, maxTiles);
    const minTile = lonLatToTile(bounds.minLongitude, bounds.maxLatitude, z);
    const maxTile = lonLatToTile(bounds.maxLongitude, bounds.minLatitude, z);
    const minX = clampTileIndex(Math.min(minTile.x, maxTile.x), z);
    const maxX = clampTileIndex(Math.max(minTile.x, maxTile.x), z);
    const minY = clampTileIndex(Math.min(minTile.y, maxTile.y), z);
    const maxY = clampTileIndex(Math.max(minTile.y, maxTile.y), z);
    const planned: PlannedImageryTile[] = [];
    let capped = false;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (planned.length >= maxTiles) {
          capped = true;
          break;
        }
        planned.push(tileToPlannedTile(provider, x, y, z, params.projectCrs));
      }
      if (capped) break;
    }

    return { provider, tiles: planned, capped, error: null };
  } catch (error) {
    return {
      provider,
      tiles: [],
      capped: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function supportsSvgOnlineImageryOverlay(projectCrs: string): boolean {
  const normalized = projectCrs.trim().toUpperCase();
  return normalized === "EPSG:3857" || normalized === "EPSG:900913";
}

function viewportWgs84Bounds(viewport: MapViewport, projectCrs: string): {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
} {
  const halfWidth = visibleWidthMeters(viewport) / 2;
  const halfHeight = visibleHeightMeters(viewport) / 2;
  const corners: XY[] = [
    { x: viewport.center.x - halfWidth, y: viewport.center.y - halfHeight },
    { x: viewport.center.x + halfWidth, y: viewport.center.y - halfHeight },
    { x: viewport.center.x + halfWidth, y: viewport.center.y + halfHeight },
    { x: viewport.center.x - halfWidth, y: viewport.center.y + halfHeight },
  ];
  const lonLats = corners.map((corner) => projectXyToLonLat(corner, projectCrs));
  return {
    minLongitude: Math.min(...lonLats.map((point) => point.longitude)),
    minLatitude: Math.min(...lonLats.map((point) => point.latitude)),
    maxLongitude: Math.max(...lonLats.map((point) => point.longitude)),
    maxLatitude: Math.max(...lonLats.map((point) => point.latitude)),
  };
}

function chooseZoom(
  bounds: { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number },
  provider: OnlineImageryProvider,
  maxTiles: number,
): number {
  for (let z = provider.maxZoom; z >= provider.minZoom; z -= 1) {
    const minTile = lonLatToTile(bounds.minLongitude, bounds.maxLatitude, z);
    const maxTile = lonLatToTile(bounds.maxLongitude, bounds.minLatitude, z);
    const xCount = Math.abs(maxTile.x - minTile.x) + 1;
    const yCount = Math.abs(maxTile.y - minTile.y) + 1;
    if (xCount * yCount <= maxTiles) return z;
  }
  return provider.minZoom;
}

function tileToPlannedTile(provider: OnlineImageryProvider, x: number, y: number, z: number, projectCrs: string): PlannedImageryTile {
  const westNorth = tileToLonLat(x, y, z);
  const eastSouth = tileToLonLat(x + 1, y + 1, z);
  const projectedCorners = [
    projectLonLatToXy({ longitude: westNorth.longitude, latitude: westNorth.latitude }, projectCrs),
    projectLonLatToXy({ longitude: eastSouth.longitude, latitude: westNorth.latitude }, projectCrs),
    projectLonLatToXy({ longitude: eastSouth.longitude, latitude: eastSouth.latitude }, projectCrs),
    projectLonLatToXy({ longitude: westNorth.longitude, latitude: eastSouth.latitude }, projectCrs),
  ];
  const xs = projectedCorners.map((point) => point.x);
  const ys = projectedCorners.map((point) => point.y);
  return {
    key: `${provider.id}-${z}-${x}-${y}`,
    href: buildOnlineImageryTileUrl(provider, { z, x, y }),
    z,
    x,
    y,
    projectedBounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

function lonLatToTile(longitude: number, latitude: number, z: number): { x: number; y: number } {
  const latRad = clampLatitude(latitude) * Math.PI / 180;
  const n = 2 ** z;
  return {
    x: Math.floor(((longitude + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

function tileToLonLat(x: number, y: number, z: number): { longitude: number; latitude: number } {
  const n = 2 ** z;
  const longitude = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  return { longitude, latitude: latRad * 180 / Math.PI };
}

function clampTileIndex(value: number, z: number): number {
  const max = 2 ** z - 1;
  return Math.max(0, Math.min(max, value));
}

function clampLatitude(latitude: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}
