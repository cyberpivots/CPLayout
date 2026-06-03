import React from "react";
import { StyleSheet, View } from "react-native";

import { NativeMapLibreTileProofSurface } from "./NativeMapLibreTileProofSurface.native";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

const nativeMapLibreProofEnabled = process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF === "1";

export function MapSurface(props: MapSurfaceProps): React.JSX.Element {
  if (!nativeMapLibreProofEnabled) return <SvgMapSurface {...props} />;
  return (
    <View style={styles.shell}>
      <NativeMapLibreTileProofSurface />
      <View style={styles.editorSurface}>
        <SvgMapSurface {...props} />
      </View>
    </View>
  );
}

export { NativeMapLibreTileProofSurface, SvgMapSurface };

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
  },
  editorSurface: {
    flex: 1,
    minHeight: 0,
  },
});
