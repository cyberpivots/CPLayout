import { Camera, Layer, Map as MapLibreMap, RasterSource, type StyleSpecification } from "@maplibre/maplibre-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

export const NATIVE_MAPLIBRE_PROOF_TILE_SOURCE = {
  id: "cplayout-native-maplibre-proof-source",
  layerId: "cplayout-native-maplibre-proof-raster",
  tileUrlTemplate: "http://127.0.0.1:8765/cplayout-native-maplibre/{z}/{x}/{y}.png",
  tileJsonUrl: "http://127.0.0.1:8765/cplayout-native-maplibre/tilejson.json",
  attribution: "CPLayout local generated tile proof",
  minzoom: 0,
  maxzoom: 22,
  tileSize: 256,
  scheme: "xyz" as const,
  center: [-104.070061, 39.902125] as [number, number],
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
        <RasterSource
          id={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
          tiles={[NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.tileUrlTemplate]}
          minzoom={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.minzoom}
          maxzoom={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.maxzoom}
          tileSize={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.tileSize}
          scheme={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.scheme}
          attribution={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.attribution}
          testID="native-maplibre-proof-raster-source"
        >
          <Layer
            id={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.layerId}
            type="raster"
            source={NATIVE_MAPLIBRE_PROOF_TILE_SOURCE.id}
            style={{
              rasterOpacity: 1,
              rasterFadeDuration: 0,
              rasterResampling: "nearest",
            }}
          />
        </RasterSource>
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
