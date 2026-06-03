import { Camera, Layer, Map as MapLibreMap, VectorSource, type StyleSpecification } from "@maplibre/maplibre-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

export const NATIVE_MAPLIBRE_PROOF_TILE_SOURCE = {
  id: "cplayout-native-maplibre-proof-source",
  tileUrlTemplate: "http://127.0.0.1:8765/cplayout-native-maplibre/{z}/{x}/{y}.pbf",
  tileJsonUrl: "http://127.0.0.1:8765/cplayout-native-maplibre/tilejson.json",
  attribution: "CPLayout local generated vector tile proof",
  minzoom: 0,
  maxzoom: 22,
  scheme: "xyz" as const,
  center: [-104.070061, 39.902125] as [number, number],
  layers: {
    roads: "roads",
    roadLabels: "road_labels",
    borders: "borders",
    places: "places",
  },
  zoom: 11,
};

const proofMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "cplayout-native-maplibre-proof-background",
      type: "background",
      paint: {
        "background-color": "#1a2630",
      },
    },
  ],
};

export function NativeMapLibreTileProofSurface(): React.JSX.Element {
  return (
    <View style={styles.shell} testID="native-maplibre-proof-panel">
      <MapLibreMap
        style={styles.map}
        mapStyle={proofMapStyle}
        attribution={false}
        compass={false}
        logo={false}
        scaleBar={false}
        testID="native-maplibre-proof-map"
      >
        <Camera
          initialViewState={{
            center: NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.center,
            zoom: NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.zoom,
          }}
        />
        <VectorSource
          id={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
          tiles={[NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.tileUrlTemplate]}
          minzoom={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.minzoom}
          maxzoom={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.maxzoom}
          scheme={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.scheme}
          attribution={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.attribution}
          testID="native-maplibre-proof-vector-source"
        >
          <Layer
            id="cplayout-native-maplibre-proof-borders"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.borders }}
            style={{
              lineColor: "#f2d27a",
              lineDasharray: [3, 2],
              lineOpacity: 0.9,
              lineWidth: 2,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-roads-casing"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roads }}
            style={{
              lineCap: "round",
              lineColor: "#fffaf0",
              lineJoin: "round",
              lineOpacity: 0.95,
              lineWidth: 7,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-roads"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roads }}
            style={{
              lineCap: "round",
              lineColor: "#d97832",
              lineJoin: "round",
              lineOpacity: 0.95,
              lineWidth: 3,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-road-labels"
            type="symbol"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roadLabels }}
            style={{
              symbolPlacement: "line",
              textColor: "#4d321d",
              textField: ["coalesce", ["get", "name"], ""],
              textHaloColor: "#fffef8",
              textHaloWidth: 1.4,
              textSize: 13,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-places"
            type="symbol"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.places }}
            style={{
              textColor: "#dceee6",
              textField: ["coalesce", ["get", "name"], ""],
              textHaloColor: "#1a2630",
              textHaloWidth: 1.4,
              textSize: 14,
            }}
          />
        </VectorSource>
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: 190,
    minHeight: 190,
    overflow: "hidden",
    backgroundColor: "#1a2630",
    borderBottomColor: "#2f4337",
    borderBottomWidth: 1,
  },
  map: {
    flex: 1,
  },
});
