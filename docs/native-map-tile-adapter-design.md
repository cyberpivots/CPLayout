# Native Map Tile Adapter Design

Native MapLibre rendering remains deferred until the Android native build/run path is available and device-verified. Do not add `@maplibre/maplibre-react-native` for this lane until that path exists.

## Metadata To MapLibre Source Mapping

Existing `MapPackageManifest` metadata maps to MapLibre React Native source props this way:

| Project metadata | MapLibre RN source field | Notes |
| --- | --- | --- |
| `id` | `id` | Stable source id. |
| `tileContentType` | source component choice | `raster` uses `RasterSource`; `vector` uses `VectorSource`. |
| `tileJsonUrl` | `url` | URL to a TileJSON document. |
| `tileUrlTemplates` | `tiles` | URL templates such as `{z}/{x}/{y}`. |
| `minZoom` | `minzoom` | Must remain in the 0-22 source range. |
| `maxZoom` | `maxzoom` | Must be greater than or equal to `minZoom`. |
| `tileScheme` | `scheme` | `xyz` or `tms`. |
| `attribution` | `attribution` | Passed through to the source. |

Raw `pmtiles` and `mbtiles` archives are not native-renderable from metadata alone. They need one of the accepted adapters below before `describeTilePackageReadiness(..., "native_maplibre_rn")` may report `canRender: true`.

## Accepted Future Adapter Options

- Local HTTP tile server that exposes app-readable TileJSON and tile URL templates.
- Extracted XYZ/TMS tile directory plus generated templates pointing at app-readable tile URLs.
- Generated TileJSON pointing at app-readable tile URLs.

## Deferred Dependencies

MapLibre React Native is not part of Expo Go and requires a native app build. Keep it out of `package.json` until Android native verification can install and run a built app or development build.

## Primary Sources

- MapLibre React Native Expo setup says the package cannot be used with Expo Go: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- RasterSource supports `url`, `tiles`, `minzoom`, `maxzoom`, `scheme`, and `attribution`: https://maplibre.org/maplibre-react-native/docs/components/sources/raster-source/
- VectorSource supports TileJSON URLs and tile URL templates: https://maplibre.org/maplibre-react-native/docs/components/sources/vector-source/
- PMTiles browser integration uses MapLibre GL JS protocol registration, which is not the same as a native MapLibre RN local archive adapter: https://docs.protomaps.com/pmtiles/maplibre
