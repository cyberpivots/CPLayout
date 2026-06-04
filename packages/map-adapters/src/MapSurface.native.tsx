import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { NativeAerialMapLibreReferenceSurface } from "./NativeAerialMapLibreReferenceSurface.native";
import { NativeMapLibreTileProofSurface } from "./NativeMapLibreTileProofSurface.native";
import { NativeMapWorkbenchSurface } from "./NativeMapWorkbenchSurface.native";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

const nativeMapLibreProofEnabled = process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF === "1";
const nativeAerialReferenceFlag = process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_AERIAL_REFERENCE;
const nativeAerialReferenceEnabled = nativeAerialReferenceFlag !== "0" && (Platform.OS === "android" || nativeAerialReferenceFlag === "1");

export function MapSurface(props: MapSurfaceProps): React.JSX.Element {
  if (nativeAerialReferenceEnabled) return <NativeMapWorkbenchSurface {...props} />;
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

export { NativeAerialMapLibreReferenceSurface, NativeMapLibreTileProofSurface, NativeMapWorkbenchSurface, SvgMapSurface };

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
