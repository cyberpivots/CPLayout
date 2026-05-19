# Technical Architecture

## Architecture Summary

Use a shared TypeScript domain core and isolate every platform-specific capability behind adapters. The main technical boundary is that Python GIS packages do not run directly inside React Native mobile apps. Heavy Python/GDAL/RTKLIB workflows remain offline preprocessing or companion tooling.

## Proposed Monorepo

```text
apps/
  mobile/             # iOS/Android React Native or Expo prebuild app
  windows/            # React Native Windows app
packages/
  core/               # project schema, units, CRS policy, validation
  geometry/           # pivot circles, sectors, towers, clipping, scoring
  gnss/               # NMEA parsing, quality policies, receiver interfaces
  project-store/      # SQLite, project ZIP, GeoJSON/CSV import/export
  map-adapters/       # MapLibre mobile and WebView map abstraction
  ui/                 # shared field UI components where portable
fixtures/
  geometry/
  nmea/
  projects/
tools/
  preprocess/         # optional Python/GDAL/RTKLIB workflows
```

## React Native Foundation

The MVP can start with Expo prebuild/development builds for iOS/Android, but not Expo Go, because MapLibre and GNSS receiver access require native modules. A bare React Native app is also valid. Windows is separate through React Native Windows.

## TypeScript Module Structure

- `core`: Zod schemas, units, project metadata, CRS definitions, source-confidence enums.
- `geometry`: pure functions with no React dependency.
- `gnss`: parser and quality policies separated from transport.
- `project-store`: persistence, import/export, migrations.
- `map-adapters`: common map commands and events.
- `native-adapters`: per-platform implementations for location, Bluetooth, USB, serial, files.

## Native Module Strategy

- iOS: Core Location and Core Bluetooth first; ExternalAccessory only for compatible hardware and later native work.
- Android: Android Location, BLE, Bluetooth Classic, and USB host modules.
- Windows: C++/C# native modules for SerialCommunication and Geolocation.

Every native adapter should implement a shared interface so the app can fall back to manual import when hardware access is unavailable.

## Offline-First Storage

Use SQLite for project state and survey logs. Use JSON/GeoJSON/CSV for export. Use PMTiles/MBTiles as referenced files in the project package. AsyncStorage/MMKV should only store settings and last-opened project state.

## Mapping/Rendering Approach

- iOS/Android: `@maplibre/maplibre-react-native`.
- Windows: `react-native-webview` with OpenLayers or MapLibre GL JS.
- Basemaps: PMTiles/MBTiles/local tile packages only.
- Overlays: GeoJSON field boundaries, pivot sectors, towers, tracks, obstacles, and survey points.

## Python-to-TypeScript Migration Notes

Port these to TypeScript first: project schema, NMEA parsing, pivot geometry, tower locations, coverage scoring, and GeoJSON export.

Keep these outside the mobile app: GDAL/OGR conversion, raw GeoTIFF tiling, RTKLIB processing, OpenDroneMap, QGIS, and heavy optimization prototypes.

## Windows Support Strategy

Windows is a first-class target but not package-compatible with every mobile dependency. Build the Windows shell early, use WebView maps, and implement serial GNSS as a native Windows module after the pure TypeScript geometry core is stable.
