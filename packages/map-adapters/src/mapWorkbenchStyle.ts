import {
  resolveReferenceOverlaySource,
  type AerialReferenceImageryResolution,
  type MapLibreTileSourceDescriptor,
  type OnlineImageryProvider,
} from "@cplayout/core";
import type { StyleSpecification } from "maplibre-gl";
import { projectLayoutToWgs84FeatureCollection } from "./mapOverlayGeoJson";
import { buildReferenceOverlayStyleParts } from "./referenceOverlayStyle";
import type { MapSurfaceProps } from "./types";

export interface RasterImageryStyleSource {
  id: string;
  name: string;
  attribution: string;
  licenseText: string;
  minzoom: number;
  maxzoom: number;
  scheme: "xyz" | "tms";
  tileSize: number;
  tiles?: string[];
  url?: string;
}

export function buildWorkbenchStyle(
  imagery: RasterImageryStyleSource | null,
  featureCollection: ReturnType<typeof projectLayoutToWgs84FeatureCollection>,
  referenceOverlay: ReturnType<typeof resolveReferenceOverlaySource>,
  referenceOverlayPreferences: MapSurfaceProps["settings"]["referenceOverlay"],
): StyleSpecification {
  const referenceOverlayParts = buildReferenceOverlayStyleParts(referenceOverlay, referenceOverlayPreferences);
  const sources: StyleSpecification["sources"] = {
    ...referenceOverlayParts.sources,
    layout: {
      type: "geojson",
      data: featureCollection,
    },
  };
  const layers: StyleSpecification["layers"] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": imagery ? "#d8dfd5" : "#eef2ec" },
    },
  ];

  if (imagery) {
    const source: Record<string, unknown> = {
      type: "raster",
      tileSize: imagery.tileSize,
      minzoom: imagery.minzoom,
      maxzoom: imagery.maxzoom,
      scheme: imagery.scheme,
      attribution: imagery.attribution,
    };
    if (imagery.url) source.url = imagery.url;
    if (imagery.tiles) source.tiles = imagery.tiles.map(toMapLibreTileTemplate);
    sources.imagery = source as StyleSpecification["sources"][string];
    layers.push({
      id: "imagery",
      type: "raster",
      source: "imagery",
      paint: { "raster-opacity": 0.88 },
    });
  }

  layers.push(
    ...referenceOverlayParts.layers,
    fillLayer("field-fill", "field_boundary", "#f4f1df", 0.18),
    fillLayer("allowed-fill", "allowed_coverage", "#2f8fc1", 0.34),
    fillLayer("end-gun-fill", "end_gun_coverage", "#33a79b", 0.28),
    fillLayer("outside-fill", "outside_field_coverage", "#d8893f", 0.28),
    fillLayer("obstacle-fill", "obstacle", "#b73f35", 0.5),
    fillLayer("map-feature-polygon", "map_feature", "#7c5b14", 0.18, ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "layerType"], "map_feature"]]),
    lineLayer("field-line", "field_boundary", "#111c17", 3),
    lineLayer("obstacle-line", "obstacle", "#6d251f", 2),
    lineLayer("map-feature-line", "map_feature", "#7c5b14", 3, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "map_feature"]]),
    lineLayer("draft-line", "draft_vertices", "#ffffff", 5, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "draft_vertices"]]),
    lineLayer("draft-line-core", "draft_vertices", "#0f766e", 2, ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "layerType"], "draft_vertices"]]),
    circleLayer("pivot-point", "pivot_center", "#111827", 7),
    circleLayer("water-point", "water_source", "#006a9f", 6),
    circleLayer("power-point", "power_source", "#a36500", 6),
    circleLayer("tower-point", "tower_location", "#49574f", 3),
    circleLayer("map-feature-point", "map_feature", "#7c5b14", 6),
    circleLayer("draft-point", "draft_vertices", "#0f766e", 7),
  );

  const style: StyleSpecification = {
    version: 8,
    sources,
    layers,
  };
  if (referenceOverlayParts.glyphs) style.glyphs = referenceOverlayParts.glyphs;
  return style;
}

export function formatReferenceOverlayStatus(referenceOverlay: ReturnType<typeof resolveReferenceOverlaySource>): string {
  if (referenceOverlay.sourceKind === "public_raster") {
    return `${referenceOverlay.autoApplied ? "Auto-applied" : "Manual"}: ${referenceOverlay.packageName ?? "USGS public reference"} · public no-key raster`;
  }
  return `${referenceOverlay.autoApplied ? "Auto-applied" : "Manual"}: ${referenceOverlay.packageName ?? referenceOverlay.packageId} · ${referenceOverlay.schema.replaceAll("_", " ")}`;
}

export function rasterStyleSourceFromAerialReferenceResolution(resolution: AerialReferenceImageryResolution): RasterImageryStyleSource | null {
  if (resolution.sourceKind === "online_provider" && resolution.onlineProvider) {
    return rasterStyleSourceFromOnlineProvider(resolution.onlineProvider);
  }
  if (!resolution.localAerial.canRender || !resolution.localAerial.source) return null;
  return {
    ...rasterStyleSourceFromTileDescriptor(resolution.localAerial.source),
    name: resolution.localAerial.packageName ?? resolution.localAerial.packageId ?? resolution.localAerial.source.id,
    attribution: resolution.localAerial.attribution ?? resolution.localAerial.source.attribution,
    licenseText: resolution.localAerial.licenseText ?? "License metadata required.",
  };
}

export function rasterStyleSourceFromOnlineProvider(provider: OnlineImageryProvider): RasterImageryStyleSource {
  return {
    id: `online-${provider.id}`,
    name: provider.name,
    attribution: provider.attribution,
    licenseText: provider.licenseText,
    minzoom: provider.minZoom,
    maxzoom: provider.maxZoom,
    scheme: provider.tileScheme,
    tileSize: provider.tileSize,
    tiles: [provider.tileUrlTemplate],
  };
}

export function rasterStyleSourceFromTileDescriptor(source: MapLibreTileSourceDescriptor): RasterImageryStyleSource {
  return {
    id: source.id,
    name: source.id,
    attribution: source.attribution,
    licenseText: "License metadata required.",
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    scheme: source.scheme,
    tileSize: 256,
    tiles: source.tiles,
    url: source.url,
  };
}

export function toMapLibreTileTemplate(template: string): string {
  return template
    .replace(/\{TileMatrix\}/gi, "{z}")
    .replace(/\{TileCol\}/gi, "{x}")
    .replace(/\{TileRow\}/gi, "{y}")
    .replace(/\{level\}/gi, "{z}")
    .replace(/\{column\}/gi, "{x}")
    .replace(/\{col\}/gi, "{x}")
    .replace(/\{row\}/gi, "{y}");
}

function fillLayer(
  id: string,
  layerType: string,
  color: string,
  opacity: number,
  filter: unknown[] = ["==", ["get", "layerType"], layerType],
): StyleSpecification["layers"][number] {
  return {
    id,
    type: "fill",
    source: "layout",
    filter: filter as never,
    paint: {
      "fill-color": color,
      "fill-opacity": opacity,
    },
  };
}

function lineLayer(
  id: string,
  layerType: string,
  color: string,
  width: number,
  filter: unknown[] = ["==", ["get", "layerType"], layerType],
): StyleSpecification["layers"][number] {
  return {
    id,
    type: "line",
    source: "layout",
    filter: filter as never,
    paint: {
      "line-color": color,
      "line-width": width,
      "line-opacity": 0.95,
    },
  };
}

function circleLayer(id: string, layerType: string, color: string, radius: number): StyleSpecification["layers"][number] {
  return {
    id,
    type: "circle",
    source: "layout",
    filter: ["==", ["get", "layerType"], layerType],
    paint: {
      "circle-color": "#fffef8",
      "circle-radius": radius,
      "circle-stroke-color": color,
      "circle-stroke-width": 2,
    },
  };
}
