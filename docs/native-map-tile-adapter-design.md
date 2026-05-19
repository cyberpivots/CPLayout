# Native Map Tile Adapter Design

MapLibre React Native is now installed/configured in the workspace, including the mobile Expo plugin and package dependencies. That does not make native map rendering production-verified: native MapLibre runtime behavior, Android/iOS persistence, and raw PMTiles/MBTiles archive rendering remain gated until a development build runs through the device/emulator checklist in `docs/android-native-verification.md`.

Current installed state:

- `apps/mobile/app.json` includes the `@maplibre/maplibre-react-native` config plugin.
- `apps/mobile/package.json` depends on `@maplibre/maplibre-react-native`.
- `packages/map-adapters/package.json` depends on `@maplibre/maplibre-react-native`, `maplibre-gl`, and `pmtiles`.

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

MapLibre React Native is not part of Expo Go and requires a native app build or development build. The dependency is already present, so the deferred work is no longer installation; it is native runtime verification, local tile-source adapter proof, and device evidence before any production claim.

## Primary Sources

- MapLibre React Native Expo setup says the package cannot be used with Expo Go: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- RasterSource supports `url`, `tiles`, `minzoom`, `maxzoom`, `scheme`, and `attribution`: https://maplibre.org/maplibre-react-native/docs/components/sources/raster-source/
- VectorSource supports TileJSON URLs and tile URL templates: https://maplibre.org/maplibre-react-native/docs/components/sources/vector-source/
- PMTiles browser integration uses MapLibre GL JS protocol registration, which is not the same as a native MapLibre RN local archive adapter: https://docs.protomaps.com/pmtiles/maplibre
