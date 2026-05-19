# MVP Build Plan

## Smallest Useful Version

Build an offline manual layout app before live RTK hardware integration.

## Build First

1. Monorepo and shared TypeScript packages.
2. Project schema, Zod validation, units, CRS policy.
3. Geometry fixtures and Jest tests.
4. Manual boundary and obstacle layers.
5. Machine configuration form.
6. Full-circle and partial-circle coverage.
7. Tower locations, end-gun coverage, dry corners, conflict metrics.
8. Local save/open and project ZIP export.
9. Mobile MapLibre proof and Windows WebView map proof.

## Delay

- Live receiver streams.
- USB/Bluetooth Classic/ExternalAccessory.
- Raw Shapefile/GeoPackage editing.
- Large GeoTIFF rendering.
- Best-fit optimizer beyond deterministic grid search.
- PDF reports.
- App store distribution.

## Can Be Mocked

- Live GNSS with NMEA log replay.
- Offline basemap with a small sample PMTiles/MBTiles package.
- Windows serial receiver with imported NMEA logs.
- Public imagery with a tiny local tile fixture.

## Must Be Accurate From Day One

- CRS rejection and projection handling.
- Units and acreage conversions.
- Machine radius/span/tower math.
- Full/partial coverage geometry.
- Obstacle/no-spray subtraction.
- Export schema and source-confidence reporting.

## First Release Feature List

- Create/open/save project.
- Draw/import GeoJSON/CSV field boundary.
- Place pivot and infrastructure points.
- Enter machine geometry.
- Compute layout metrics.
- Export project ZIP/GeoJSON/CSV.
- Run fixture tests in CI/local command.
