# Free React Native Center Pivot Survey Mapping Layout App

This package converts the prior Python/GIS center pivot handoff into a React Native development handoff for iOS, Android, and Windows.

The app goal is a local-first field and office tool for center pivot irrigation layout: capture or import field boundaries, mark pivot centers and infrastructure, model full-circle and part-circle pivots, compute irrigated and dry acres, flag conflicts, and export open project files without a paid backend or paid map API.

## Target Users

- Center pivot irrigation technicians who need a practical field layout and survey workflow.
- Farm managers or dealers reviewing alternatives before formal engineering.
- Developers building an offline-first GIS/GNSS React Native app.
- RTK/GNSS specialists integrating receiver-quality metadata into survey records.

## Target Platforms

- iOS: feasible for manual layout, internal GPS, BLE GNSS, and MapLibre mobile maps; external serial-style receiver access is constrained.
- Android: strongest field GNSS target because it can support internal GPS, BLE, Bluetooth Classic, USB host, and local APK workflows.
- Windows: feasible with React Native Windows for office/field laptops, local files, WebView maps, and native serial modules.

## MVP Scope

Build the smallest useful app first:

- Local project creation and project ZIP export.
- Projected CRS and unit policy.
- Manual field boundary creation/editing.
- Pivot center, water source, power source, obstacles, roads, ditches, fences, buildings, trees, and exclusion zones.
- Machine configuration: spans, overhang, end gun, full/partial sweep.
- Coverage, dry corners, conflict flags, irrigated acres, non-irrigated acres, and percent coverage.
- GeoJSON/CSV import-export.
- Deterministic geometry tests.

## Advanced Scope

- Live RTK receiver streams.
- Android USB serial and Bluetooth Classic.
- iOS BLE receiver profiles and ExternalAccessory research.
- Windows serial GNSS module.
- PMTiles/MBTiles offline basemap packages.
- Drone orthomosaic tile import.
- RINEX/RTKLIB preprocessing import.
- Best-fit pivot optimization and multi-pivot layout scoring.

## Free/No-Cost Constraint

The software stack must not require Google Maps paid APIs, Mapbox paid plans, Esri services, paid RTK corrections, paid satellite imagery, trial-only services, hosted cloud builds, or a paid backend.

Hardware and platform distribution are separate: GNSS receivers, antennas, radios, drones, cellular data, Apple Developer Program enrollment, Google Play distribution, and Microsoft Store publishing can cost money. The app must still work locally without requiring those paid services.

## How To Use This Package

Start with `center_pivot_react_native_development_handoff.json` for the machine-readable plan. Then use:

- `MVP_BUILD_PLAN.md` for build order.
- `TECHNICAL_ARCHITECTURE.md` for module boundaries.
- `GEOSPATIAL_ALGORITHM_SPEC.md` for geometry implementation.
- `RTK_GNSS_INTEGRATION_SPEC.md` for receiver integration.
- `FREE_OPEN_SOURCE_STACK_AUDIT.md` for dependency decisions.
- `AGENTIC_DEVELOPMENT_TASKS.json` for ordered coding-agent tasks.

Primary official sources are listed in the main JSON `sources` array.
