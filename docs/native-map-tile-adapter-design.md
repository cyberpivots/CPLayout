# Native Map Tile Adapter Design

MapLibre React Native is installed/configured in the workspace, including the mobile Expo plugin and package dependencies. The generated TileJSON/tile-template adapter path has Android runtime proof through `reports/native-maplibre/latest.json`; that does not prove raw PMTiles/MBTiles archive rendering or iOS behavior.

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

Current chosen adapter path: generate TileJSON plus app-readable tile URL templates. `packages/core/src/mapTilePackages.ts` already treats those local sources as the lowest-risk native MapLibre descriptor shape. Android native rendering for this adapter path is proven by `reports/native-maplibre/latest.json`, which captures a device screenshot, pixel metrics, and tile requests. Raw PMTiles/MBTiles still need a local protocol, conversion, extraction, or tile-serving adapter before native rendering claims.

Use `docs/native-maplibre-render-report-template.json` for a completed native MapLibre render report. The roadmap runner validates that report only when it includes device/build identity, a local TileJSON or tile URL template source, screenshot hash and pixel metrics, and the explicit boundary that raw PMTiles/MBTiles native rendering was not proved.

## Accepted Future Adapter Options

- Local HTTP tile server that exposes app-readable TileJSON and tile URL templates.
- Extracted XYZ/TMS tile directory plus generated templates pointing at app-readable tile URLs.
- Generated TileJSON pointing at app-readable tile URLs.

## Deferred Dependencies

MapLibre React Native is not part of Expo Go and requires a native app build or development build. The dependency is already present, and the generated TileJSON/template Android proof exists; the deferred work is raw local archive rendering, iOS proof, and any broader production-map evidence beyond the local proof source.

## Primary Sources

- MapLibre React Native Expo setup says the package cannot be used with Expo Go: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- RasterSource supports `url`, `tiles`, `minzoom`, `maxzoom`, `scheme`, and `attribution`: https://maplibre.org/maplibre-react-native/docs/components/sources/raster-source/
- VectorSource supports TileJSON URLs and tile URL templates: https://maplibre.org/maplibre-react-native/docs/components/sources/vector-source/
- PMTiles browser integration uses MapLibre GL JS protocol registration, which is not the same as a native MapLibre RN local archive adapter: https://docs.protomaps.com/pmtiles/maplibre
