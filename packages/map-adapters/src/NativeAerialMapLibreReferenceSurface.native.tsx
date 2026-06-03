import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, RasterSource, type StyleSpecification } from "@maplibre/maplibre-react-native";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  resolveAerialReferenceImagerySource,
  type AerialReferenceImageryResolution,
  type MapLibreTileSourceDescriptor,
  type OnlineImageryProvider,
} from "@cplayout/core";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Center } from "./mapOverlayGeoJson";
import type { MapSurfaceProps } from "./types";

interface RasterReferenceSource {
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

const nativeAerialMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "cplayout-native-aerial-background",
      type: "background",
      paint: { "background-color": "#eef2ec" },
    },
  ],
};

export function NativeAerialMapLibreReferenceSurface({
  project,
  result,
  settings,
}: MapSurfaceProps): React.JSX.Element {
  const center = useMemo(() => {
    try {
      return projectWgs84Center(project);
    } catch {
      return [0, 0] as [number, number];
    }
  }, [project]);
  const featureCollection = useMemo(() => projectLayoutToWgs84FeatureCollection(project, result), [project, result]);
  const aerialReference = useMemo(
    () => resolveAerialReferenceImagerySource({
      preferences: settings.aerialImagery,
      onlineImagery: settings.onlineImagery,
      mapPackages: project.mapPackages ?? [],
      target: "android_maplibre_rn",
    }),
    [project.mapPackages, settings.aerialImagery, settings.onlineImagery],
  );
  const raster = rasterReferenceFromAerialReferenceResolution(aerialReference);
  const statusText = raster
    ? `${raster.name} · ${aerialReference.sourceKind === "local_raster" ? "local raster package" : "connected preview only"}`
    : aerialReference.reason;

  return (
    <View style={styles.shell} testID="native-aerial-reference-panel">
      {raster ? (
        <MapLibreMap
          attribution={false}
          compass={false}
          logo={false}
          mapStyle={nativeAerialMapStyle}
          scaleBar={false}
          style={styles.map}
          testID="native-aerial-reference-map"
        >
          <Camera
            initialViewState={{
              center,
              zoom: Math.min(15, raster.maxzoom),
            }}
          />
          <RasterSource
            id={raster.id}
            attribution={raster.attribution}
            maxzoom={raster.maxzoom}
            minzoom={raster.minzoom}
            scheme={raster.scheme}
            tiles={raster.tiles}
            tileSize={raster.tileSize}
            url={raster.url}
            testID="native-aerial-reference-raster-source"
          >
            <Layer
              id="native-aerial-reference-raster"
              source={raster.id}
              type="raster"
              style={{ rasterOpacity: 0.82 }}
            />
          </RasterSource>
          <GeoJSONSource
            id="native-aerial-layout"
            data={featureCollection as never}
            testID="native-aerial-layout-source"
          >
            <Layer
              id="native-aerial-field-fill"
              source="native-aerial-layout"
              type="fill"
              filter={["==", ["get", "layerType"], "field_boundary"] as never}
              style={{ fillColor: "#f4f1df", fillOpacity: 0.18 }}
            />
            <Layer
              id="native-aerial-allowed-fill"
              source="native-aerial-layout"
              type="fill"
              filter={["==", ["get", "layerType"], "allowed_coverage"] as never}
              style={{ fillColor: "#2f8fc1", fillOpacity: 0.3 }}
            />
            <Layer
              id="native-aerial-obstacle-fill"
              source="native-aerial-layout"
              type="fill"
              filter={["==", ["get", "layerType"], "obstacle"] as never}
              style={{ fillColor: "#b73f35", fillOpacity: 0.44 }}
            />
            <Layer
              id="native-aerial-field-line"
              source="native-aerial-layout"
              type="line"
              filter={["==", ["get", "layerType"], "field_boundary"] as never}
              style={{ lineColor: "#111c17", lineOpacity: 0.95, lineWidth: 3 }}
            />
            <Layer
              id="native-aerial-obstacle-line"
              source="native-aerial-layout"
              type="line"
              filter={["==", ["get", "layerType"], "obstacle"] as never}
              style={{ lineColor: "#6d251f", lineOpacity: 0.95, lineWidth: 2 }}
            />
            <Layer
              id="native-aerial-pivot-point"
              source="native-aerial-layout"
              type="circle"
              filter={["==", ["get", "layerType"], "pivot_center"] as never}
              style={{ circleColor: "#fffef8", circleRadius: 6, circleStrokeColor: "#111827", circleStrokeWidth: 2 }}
            />
          </GeoJSONSource>
        </MapLibreMap>
      ) : (
        <View style={styles.missingSourcePanel} testID="native-aerial-reference-missing-source">
          <Text style={styles.missingSourceTitle}>Aerial Reference Unavailable</Text>
          <Text style={styles.missingSourceText}>{statusText}</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.attributionHud} testID="native-aerial-attribution">
        <Text style={styles.attributionText}>{raster ? `${raster.attribution} · ${raster.licenseText}` : statusText}</Text>
      </View>
    </View>
  );
}

function rasterReferenceFromProvider(provider: OnlineImageryProvider): RasterReferenceSource {
  return {
    id: `native-aerial-online-${provider.id}`,
    name: provider.name,
    attribution: provider.attribution,
    licenseText: provider.licenseText,
    minzoom: provider.minZoom,
    maxzoom: provider.maxZoom,
    scheme: provider.tileScheme,
    tileSize: provider.tileSize,
    tiles: [toMapLibreTileTemplate(provider.tileUrlTemplate)],
  };
}

function rasterReferenceFromAerialReferenceResolution(resolution: AerialReferenceImageryResolution): RasterReferenceSource | null {
  if (resolution.sourceKind === "online_provider" && resolution.onlineProvider) {
    return rasterReferenceFromProvider(resolution.onlineProvider);
  }
  if (!resolution.localAerial.canRender || !resolution.localAerial.source) return null;
  return {
    ...rasterReferenceFromTileDescriptor(resolution.localAerial.source),
    name: resolution.localAerial.packageName ?? resolution.localAerial.packageId ?? resolution.localAerial.source.id,
    attribution: resolution.localAerial.attribution ?? resolution.localAerial.source.attribution,
    licenseText: resolution.localAerial.licenseText ?? "License metadata required.",
  };
}

function rasterReferenceFromTileDescriptor(source: MapLibreTileSourceDescriptor): RasterReferenceSource {
  return {
    id: `native-aerial-local-${source.id}`,
    name: source.id,
    attribution: source.attribution,
    licenseText: "License metadata required.",
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    scheme: source.scheme,
    tileSize: 256,
    tiles: source.tiles?.map(toMapLibreTileTemplate),
    url: source.url,
  };
}

function toMapLibreTileTemplate(template: string): string {
  return template
    .replace(/\{TileMatrix\}/gi, "{z}")
    .replace(/\{TileCol\}/gi, "{x}")
    .replace(/\{TileRow\}/gi, "{y}")
    .replace(/\{level\}/gi, "{z}")
    .replace(/\{column\}/gi, "{x}")
    .replace(/\{col\}/gi, "{x}")
    .replace(/\{row\}/gi, "{y}");
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#eef2ec",
    borderBottomColor: "#2f4337",
    borderBottomWidth: 1,
    height: 220,
    minHeight: 220,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  missingSourcePanel: {
    backgroundColor: "#eef2ec",
    flex: 1,
    gap: 6,
    justifyContent: "center",
    padding: 16,
  },
  missingSourceTitle: {
    color: "#17241c",
    fontSize: 15,
    fontWeight: "900",
  },
  missingSourceText: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  attributionHud: {
    backgroundColor: "rgba(255, 254, 248, 0.92)",
    borderColor: "#cbd8cd",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 8,
    left: 8,
    maxWidth: "92%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    position: "absolute",
  },
  attributionText: {
    color: "#173428",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
});
