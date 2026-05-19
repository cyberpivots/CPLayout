import { projectLonLatToXy } from "@cplayout/core";
import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { projectLayoutToWgs84FeatureCollection, projectWgs84Bounds, projectWgs84Center } from "./mapOverlayGeoJson";
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

export function MapSurface(props: MapSurfaceProps): React.JSX.Element {
  const geoJson = useMemo(
    () => projectLayoutToWgs84FeatureCollection(props.project, props.result, props.draftVertices),
    [props.project, props.result, props.draftVertices],
  );
  const center = useMemo(() => projectWgs84Center(props.project), [props.project]);
  const bounds = useMemo(() => projectWgs84Bounds(props.project), [props.project]);

  return (
    <View style={styles.shell}>
      <Map
        mapStyle={BLANK_STYLE as never}
        style={styles.map}
        attribution={false}
        logo={false}
        compass={true}
        onPress={(event) => {
          if (props.activeToolMode !== "place_pivot" || !props.onPlacePivot) return;
          const lngLat = event.nativeEvent.lngLat;
          props.onPlacePivot(projectLonLatToXy({ longitude: lngLat[0], latitude: lngLat[1] }, props.project.projectCrs));
        }}
      >
        <Camera
          initialViewState={{
            center,
            zoom: 14,
            bounds,
            padding: { top: 48, right: 48, bottom: 48, left: 48 },
          }}
        />
        <GeoJSONSource id="project-overlays" data={geoJson as never}>
          <Layer id="allowed-coverage" type="fill" source="project-overlays" filter={["==", ["get", "layerType"], "allowed_coverage"]} paint={{ "fill-color": "#6cb6df", "fill-opacity": 0.54 }} />
          <Layer id="end-gun-coverage" type="fill" source="project-overlays" filter={["==", ["get", "layerType"], "end_gun_coverage"]} paint={{ "fill-color": "#63c7cf", "fill-opacity": 0.26 }} />
          <Layer id="outside-field-coverage" type="fill" source="project-overlays" filter={["==", ["get", "layerType"], "outside_field_coverage"]} paint={{ "fill-color": "#e68b58", "fill-opacity": 0.32 }} />
          <Layer id="obstacles" type="fill" source="project-overlays" filter={["==", ["get", "layerType"], "obstacle"]} paint={{ "fill-color": "#c64f43", "fill-opacity": 0.78 }} />
          <Layer id="field-boundary" type="line" source="project-overlays" filter={["==", ["get", "layerType"], "field_boundary"]} paint={{ "line-color": "#253f2f", "line-width": 4 }} />
          <Layer id="draft-vertices" type="line" source="project-overlays" filter={["==", ["get", "layerType"], "draft_vertices"]} paint={{ "line-color": "#7b1f5a", "line-width": 3, "line-dasharray": [2, 2] }} />
          <Layer id="project-points" type="circle" source="project-overlays" filter={["in", ["get", "layerType"], ["literal", ["pivot_center", "water_source", "power_source", "tower_location"]]]} paint={{ "circle-radius": 6, "circle-color": "#fffef8", "circle-stroke-color": "#253f2f", "circle-stroke-width": 2 }} />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

export { SvgMapSurface } from "./SvgMapSurface";

const styles = StyleSheet.create({
  shell: {
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 620,
    flexGrow: 2,
    flex: 1,
    minHeight: 520,
    minWidth: 320,
    overflow: "hidden",
  },
  map: {
    flex: 1,
    minHeight: 520,
  },
});
