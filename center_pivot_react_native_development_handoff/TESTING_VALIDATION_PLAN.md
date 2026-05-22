# Testing Validation Plan

## Unit Tests

- Units and acre conversion.
- CRS policy rejects EPSG:4326 for area/radius/buffer.
- Pivot radius, tower radius, and end-gun radius.
- Angle wrap and partial-sector generation.
- NMEA GGA/RMC/GSA/GST parser fixtures.

## Geometry Tests

Create golden fixtures:

- 160-acre square field with quarter-section expectations.
- Irregular field with dry corners.
- Field with hole/exclusion.
- Partial-circle windshield-wiper operation.
- End-gun on/off ranges.
- Road/fence/tree/building clearance conflicts.
- Multi-scenario ranking.

Golden outputs should be GeoJSON plus metrics JSON. Do not rely only on screenshots.

## GPS Simulation Tests

- Replay NMEA logs through parser.
- Simulate low-quality fixes and verify rejection.
- Simulate repeated RTK fixed shots and residual checks.
- Validate correction age thresholds.

## Offline Map Tests

- Import PMTiles/MBTiles manifest.
- Confirm attribution required.
- Load map with no network.
- Fail a package with missing license metadata.

## Import/Export Tests

- GeoJSON round trip.
- KML import projects WGS84 lon/lat into project `XY`, warns on altitude, rejects unsupported-only files, and preserves a review step before mutation.
- KMZ import/export uses a single KML file and rejects missing-KML, multi-KML, oversized, or unsafe archive paths.
- KML export writes Google Earth-compatible Placemark polygons/points with CPLayout ExtendedData.
- CSV survey point import.
- Project ZIP export and reopen.
- Missing CRS import rejection.

## Cross-Platform Tests

- Shared TypeScript tests run on Node.
- Component tests run in React Native test environment.
- Detox or Maestro smoke tests for iOS/Android.
- Windows smoke tests for project open/save and map WebView.
