import React from "react";
import { Platform } from "react-native";

import { NativeAerialMapLibreReferenceSurface } from "./NativeAerialMapLibreReferenceSurface.native";
import { NativeMapLibreTileProofSurface } from "./NativeMapLibreTileProofSurface.native";
import { NativeMapWorkbenchSurface } from "./NativeMapWorkbenchSurface.native";
import { SvgMapSurface } from "./SvgMapSurface";
import type { MapSurfaceProps } from "./types";

const nativeMapLibreProofEnabled = Platform.OS === "android" && process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_MAPLIBRE_PROOF === "1";
const nativeAerialReferenceFlag = process.env.EXPO_PUBLIC_CPLAYOUT_NATIVE_AERIAL_REFERENCE;
const nativeAerialReferenceEnabled = nativeAerialReferenceFlag !== "0" && (Platform.OS === "android" || nativeAerialReferenceFlag === "1");

export function MapSurface(props: MapSurfaceProps): React.JSX.Element {
  if (nativeMapLibreProofEnabled) {
    return <NativeMapLibreTileProofSurface />;
  }
  if (nativeAerialReferenceEnabled) return <NativeMapWorkbenchSurface {...props} />;
  return <SvgMapSurface {...props} />;
}

export { NativeAerialMapLibreReferenceSurface, NativeMapLibreTileProofSurface, NativeMapWorkbenchSurface, SvgMapSurface };
