# Production Field Mapping Notes

## Source-Backed Decisions

- Codex guidance: OpenAI recommends durable repo instructions in `AGENTS.md`, planning for complex work, and asking Codex to run relevant tests/reviews before accepting changes. Codex config supports `model = "gpt-5.5"` and `model_reasoning_effort = "xhigh"` where available.
  Sources: https://developers.openai.com/codex/learn/best-practices, https://developers.openai.com/codex/guides/agents-md, https://developers.openai.com/codex/config-reference
- Expo SQLite: `expo-sqlite` provides a persistent SQLite API and Expo recommends installing SDK packages with `npx expo install`.
  Sources: https://docs.expo.dev/versions/latest/sdk/sqlite/, https://docs.expo.dev/versions/latest/
- React Native gestures: `PanResponder` provides gesture state including movement deltas, which is sufficient for the MVP SVG survey canvas.
  Source: https://reactnative.dev/docs/panresponder.html
- Coordinate conversion: Proj4js supports transforms to and from WGS84, but high-accuracy datum/grid work needs explicit definitions or grid files.
  Source: https://proj4js.org/
- Offline map policy: OpenStreetMap's public raster tile service does not permit offline bulk downloading; use self-hosted tiles or providers/packages whose terms explicitly allow offline use.
  Source: https://operations.osmfoundation.org/policies/tiles/
- Advanced map renderer lane: MapLibre React Native supports Expo/React Native but is native, requires setup/rebuild, and production apps must provide their own style/tiles.
  Source: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- Tile package formats: PMTiles is a single-file tile archive; MBTiles stores tiled map data in SQLite and is limited to Spherical Mercator presentation.
  Sources: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md, https://github.com/mapbox/mbtiles-spec

## MVP Implemented Here

- Coordinate format parsing/formatting for decimal degrees, degrees decimal minutes, degrees minutes seconds, and projected/local X/Y.
- Projected `XY` remains canonical for geometry and layout calculations.
- Field map viewport state supports pan, drag-pan, zoom, reset, mode selection, and active drawing layer selection without mutating geometry.
- Local settings are typed and validated; project-relevant settings are exportable while local package directories remain local-only.
- SQLite schema migrations cover projects, settings, large geometry vertex tables, survey points, GPS tracks, offline map package metadata, scenarios, and exports.
- Project files now have a versioned `pivot-project-v1` document validator, a local save/open repository interface, native SQLite repository implementation, browser local-storage repository implementation, and ZIP package round-trip logic.
- ZIP packages include `manifest.json`, `project.json`, scenario GeoJSON, survey CSV, and metrics CSV. Map package binaries are referenced by metadata; they are not embedded as canonical project geometry.

## Deferred Work

- Native MapLibre integration with local PMTiles/MBTiles protocol adapters.
- Production web SQLite, because Expo SQLite web support is alpha and needs WASM plus COOP/COEP headers.
- Native large-file import workflows beyond user-picked ZIP packages.
- R-tree/FTS/SQLCipher configuration gates after target platform builds are established.
- Live GNSS receiver transports and RTK correction workflows.

## Current Native/Web Split

- Native: `projectRepository.native.ts` uses Expo SQLite migrations and exact project snapshots while still populating normalized geometry, survey, scenario, and map-package tables.
- Web: `projectRepository.ts` uses browser local storage for the MVP because Expo SQLite web needs extra deployment headers. ZIP import/export uses browser Blob/File APIs.
- Native ZIP sharing/import uses Expo FileSystem's `File`/`Paths` API plus Expo Sharing. This keeps deprecated FileSystem legacy calls out of the implementation.
