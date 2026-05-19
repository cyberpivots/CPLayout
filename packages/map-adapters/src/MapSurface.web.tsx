import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f4f2e8" },
    },
  ],
};

let pmtilesProtocolInstalled = false;

export function MapSurface(props: MapSurfaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const geoJson = useMemo(
    () => projectLayoutToWgs84FeatureCollection(props.project, props.result, props.draftVertices),
    [props.project, props.result, props.draftVertices],
  );

  useEffect(() => {
    let disposed = false;
    if (!hasWebGl()) {
      setFallback(true);
      return;
    }

    async function mountMap(): Promise<void> {
      try {
        const [{ default: maplibregl }, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);
        if (disposed || !containerRef.current) return;
        if (!pmtilesProtocolInstalled) {
          const protocol = new Protocol();
          maplibregl.addProtocol("pmtiles", protocol.tile);
          pmtilesProtocolInstalled = true;
        }
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: BLANK_STYLE as maplibregl.StyleSpecification,
          center: projectWgs84Center(props.project),
          zoom: 14,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        mapRef.current = map;
        map.once("load", () => {
          if (disposed) return;
          map.addSource("project-overlays", { type: "geojson", data: geoJson as never });
          addOverlayLayers(map);
          map.fitBounds(projectWgs84Bounds(props.project), { padding: 40, duration: 0 });
          setReady(true);
        });
      } catch {
        if (!disposed) setFallback(true);
      }
    }

    void mountMap();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [props.project]);

  useEffect(() => {
    const map = mapRef.current as { getSource?: (id: string) => { setData?: (data: unknown) => void } | undefined } | null;
    map?.getSource?.("project-overlays")?.setData?.(geoJson);
  }, [geoJson]);

  if (fallback) return <SvgMapSurface {...props} />;

  return (
    <View style={styles.webShell}>
      {!ready ? <SvgMapSurface {...props} /> : null}
      <View
        ref={(node) => {
          containerRef.current = node as unknown as HTMLElement | null;
        }}
        style={[styles.webMap, !ready && styles.loadingMap]}
      />
    </View>
  );
}

export { SvgMapSurface };

function addOverlayLayers(map: {
  addLayer: (layer: never) => void;
}): void {
  map.addLayer({ id: "allowed-coverage", type: "fill", source: "project-overlays", filter: ["==", ["get", "layerType"], "allowed_coverage"], paint: { "fill-color": "#6cb6df", "fill-opacity": 0.54 } } as never);
  map.addLayer({ id: "end-gun-coverage", type: "fill", source: "project-overlays", filter: ["==", ["get", "layerType"], "end_gun_coverage"], paint: { "fill-color": "#63c7cf", "fill-opacity": 0.26 } } as never);
  map.addLayer({ id: "outside-field-coverage", type: "fill", source: "project-overlays", filter: ["==", ["get", "layerType"], "outside_field_coverage"], paint: { "fill-color": "#e68b58", "fill-opacity": 0.32 } } as never);
  map.addLayer({ id: "obstacles", type: "fill", source: "project-overlays", filter: ["==", ["get", "layerType"], "obstacle"], paint: { "fill-color": "#c64f43", "fill-opacity": 0.78 } } as never);
  map.addLayer({ id: "field-boundary", type: "line", source: "project-overlays", filter: ["==", ["get", "layerType"], "field_boundary"], paint: { "line-color": "#253f2f", "line-width": 4 } } as never);
  map.addLayer({ id: "draft-vertices", type: "line", source: "project-overlays", filter: ["==", ["get", "layerType"], "draft_vertices"], paint: { "line-color": "#7b1f5a", "line-width": 3, "line-dasharray": [2, 2] } } as never);
  map.addLayer({ id: "project-points", type: "circle", source: "project-overlays", filter: ["in", ["get", "layerType"], ["literal", ["pivot_center", "water_source", "power_source", "tower_location"]]], paint: { "circle-radius": 6, "circle-color": "#fffef8", "circle-stroke-color": "#253f2f", "circle-stroke-width": 2 } } as never);
}

function hasWebGl(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"));
}

const styles = StyleSheet.create({
  webShell: {
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 620,
    flexGrow: 2,
    minWidth: 320,
    minHeight: 520,
    overflow: "hidden",
    position: "relative",
  },
  webMap: {
    bottom: 0,
    left: 0,
    minHeight: 520,
    position: "absolute",
    right: 0,
    top: 0,
  },
  loadingMap: {
    opacity: 0,
  },
});
