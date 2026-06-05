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
        androidView="surface"
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
            paint={{
              "line-color": "#f2d27a",
              "line-dasharray": [3, 2],
              "line-opacity": 0.9,
              "line-width": 2,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-roads-casing"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roads }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": "#fffaf0",
              "line-opacity": 0.95,
              "line-width": 7,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-roads"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roads }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": "#d97832",
              "line-opacity": 0.95,
              "line-width": 3,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-road-labels"
            type="line"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.roadLabels }}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": "#6b4a2f",
              "line-dasharray": [1, 3],
              "line-opacity": 0.82,
              "line-width": 2,
            }}
          />
          <Layer
            id="cplayout-native-maplibre-proof-places"
            type="circle"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            {...{ "source-layer": NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layers.places }}
            paint={{
              "circle-color": "#dceee6",
              "circle-opacity": 0.95,
              "circle-radius": 7,
              "circle-stroke-color": "#1a2630",
              "circle-stroke-width": 2,
            }}
          />
        </VectorSource>
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: "stretch",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    backgroundColor: "#1a2630",
  },
  map: {
    flex: 1,
  },
});
