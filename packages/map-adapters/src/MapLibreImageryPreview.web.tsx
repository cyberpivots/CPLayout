import maplibregl, { type StyleSpecification } from "maplibre-gl";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { resolveOnlineImageryProvider, type OnlineImageryProvider } from "@cplayout/core";
import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import type { MapLibreImageryPreviewProps } from "./MapLibreImageryPreview";

export function MapLibreImageryPreview({
  project,
  result,
  settings,
  visible,
}: MapLibreImageryPreviewProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const provider = useMemo(() => {
    if (!settings.onlineImagery.enabled) return null;
    try {
      return resolveOnlineImageryProvider(settings.onlineImagery.providerId, settings.onlineImagery.customSource);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [settings.onlineImagery.customSource, settings.onlineImagery.enabled, settings.onlineImagery.providerId]);
  const featureCollection = useMemo(() => projectLayoutToWgs84FeatureCollection(project, result), [project, result]);
  const bounds = useMemo(() => projectWgs84Bounds(project), [project]);
  const center = useMemo(() => projectWgs84Center(project), [project]);

  useEffect(() => {
    if (!visible || !containerRef.current || provider === null || provider instanceof Error) return undefined;
    setRuntimeError(null);
    const map = new maplibregl.Map({
      attributionControl: false,
      center,
      container: containerRef.current,
      interactive: false,
      style: buildPreviewStyle(provider, featureCollection),
      zoom: Math.min(15, provider.maxZoom),
    });

    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        duration: 0,
        maxZoom: Math.min(17, provider.maxZoom),
        padding: 36,
      },
    );
    map.on("error", (event) => {
      const message = event.error?.message;
      if (message) setRuntimeError(message);
    });

    return () => {
      map.remove();
    };
  }, [bounds, center, featureCollection, provider, visible]);

  if (!visible) return null;

  const providerError = provider instanceof Error ? provider.message : null;
  const activeProvider = provider instanceof Error || provider === null ? null : provider;

  return (
    <View style={styles.previewBand}>
      <View style={styles.previewHeader}>
        <View>
          <Text style={styles.previewTitle}>MapLibre Imagery Preview</Text>
          <Text style={styles.previewSubtitle}>{activeProvider?.name ?? "Custom source"} · WGS84 display overlay</Text>
        </View>
        <Text style={styles.previewBadge}>Preview only</Text>
      </View>
      {providerError ? (
        <Text style={styles.errorText}>{providerError}</Text>
      ) : (
        React.createElement("div", {
          "aria-label": "MapLibre imagery preview",
          ref: containerRef,
          style: mapContainerStyle,
        })
      )}
      {runtimeError ? <Text style={styles.errorText}>{runtimeError}</Text> : null}
      <Text style={styles.attributionText}>
        {(activeProvider ?? settingsFallbackProvider()).attribution} · {(activeProvider ?? settingsFallbackProvider()).licenseText}
      </Text>
    </View>
  );
}

function buildPreviewStyle(provider: OnlineImageryProvider, featureCollection: ReturnType<typeof projectLayoutToWgs84FeatureCollection>): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: [toMapLibreTileTemplate(provider.tileUrlTemplate)],
        tileSize: provider.tileSize,
        minzoom: provider.minZoom,
        maxzoom: provider.maxZoom,
        scheme: provider.tileScheme,
        attribution: provider.attribution,
      },
      layout: {
        type: "geojson",
        data: featureCollection,
      },
    },
    layers: [
      {
        id: "imagery",
        type: "raster",
        source: "imagery",
        paint: { "raster-opacity": 0.72 },
      },
      fillLayer("allowed-fill", "allowed_coverage", "#6cb6df", 0.36),
      fillLayer("end-gun-fill", "end_gun_coverage", "#63c7cf", 0.28),
      fillLayer("outside-fill", "outside_field_coverage", "#e68b58", 0.22),
      fillLayer("obstacle-fill", "obstacle", "#c64f43", 0.52),
      lineLayer("field-line", "field_boundary", "#15241b", 3),
      lineLayer("obstacle-line", "obstacle", "#70271f", 2),
      circleLayer("pivot-point", "pivot_center", "#151c2a", 6),
      circleLayer("water-point", "water_source", "#006a9f", 5),
      circleLayer("power-point", "power_source", "#a36500", 5),
      circleLayer("tower-point", "tower_location", "#54645a", 3),
    ],
  };
}

function fillLayer(id: string, layerType: string, color: string, opacity: number): StyleSpecification["layers"][number] {
  return {
    id,
    type: "fill",
    source: "layout",
    filter: ["==", ["get", "layerType"], layerType],
    paint: {
      "fill-color": color,
      "fill-opacity": opacity,
    },
  };
}

function lineLayer(id: string, layerType: string, color: string, width: number): StyleSpecification["layers"][number] {
  return {
    id,
    type: "line",
    source: "layout",
    filter: ["==", ["get", "layerType"], layerType],
    paint: {
      "line-color": color,
      "line-width": width,
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

function settingsFallbackProvider(): Pick<OnlineImageryProvider, "attribution" | "licenseText"> {
  return {
    attribution: "Attribution required for custom open imagery",
    licenseText: "Live imagery preview only; do not bulk cache.",
  };
}

const mapContainerStyle: React.CSSProperties = {
  height: 300,
  minHeight: 300,
  width: "100%",
};

const styles = StyleSheet.create({
  previewBand: {
    backgroundColor: "#eef3ea",
    borderTopColor: "#d8ded6",
    borderTopWidth: 1,
    gap: 8,
    padding: 12,
  },
  previewHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  previewTitle: {
    color: "#15241b",
    fontSize: 15,
    fontWeight: "900",
  },
  previewSubtitle: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  previewBadge: {
    backgroundColor: "#fffef8",
    borderColor: "#b9c5b6",
    borderRadius: 8,
    borderWidth: 1,
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attributionText: {
    color: "#405448",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  errorText: {
    backgroundColor: "#fff8ed",
    borderColor: "#e6c29c",
    borderRadius: 8,
    borderWidth: 1,
    color: "#8a4d1f",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    padding: 10,
  },
});
