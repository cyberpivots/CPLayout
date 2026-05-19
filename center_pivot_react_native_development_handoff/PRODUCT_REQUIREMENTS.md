# Product Requirements

## Product Statement

Build an offline-first React Native app for center pivot survey, mapping, and layout. The app must be practical in a field truck, at the pivot pad, and in a farm office. It must keep design-critical calculations transparent enough that a pivot technician can challenge the inputs and outputs.

## Personas

- Field technician: captures boundaries, obstacles, pivot center points, water and power locations, and receiver quality data while outdoors.
- Layout designer: compares pivot alternatives, span packages, end gun options, part-circle operation, dry corners, and conflicts.
- Farm manager: reviews coverage and acreage reports without needing GIS software.
- RTK/GNSS specialist: verifies receiver streams, correction age, fix status, repeated shots, datum, and survey accuracy.
- React Native developer: implements app screens, native adapters, storage, and tests from the handoff.

## Field Technician Workflows

1. Create a project before leaving the shop or offline in the field.
2. Select units and project CRS.
3. Load an offline basemap or work on a blank grid if maps are unavailable.
4. Capture or import boundary points.
5. Mark pivot center, water source, power source, roads, ditches, fences, trees, canals, buildings, and exclusion zones.
6. Enter machine geometry from manufacturer/as-built values.
7. Review coverage, dry corners, and hard conflicts.
8. Export a project package for office review.

## Feature Requirements

- Manual boundary drawing and vertex editing.
- Ordered GPS/RTK point capture with visible quality.
- Area and distance measurement in projected CRS.
- Full-circle and part-circle pivot modeling.
- Tower locations and tower tracks.
- End gun modeling with separate acreage.
- Obstacle/no-spray exclusion and hard clearance conflict checks.
- Multiple layout scenarios.
- Local project persistence and project ZIP export.
- Import/export of GeoJSON, CSV, GPX/KML where practical, NMEA logs, and offline map packages.

## Non-Goals

- No paid map API or paid GIS service dependency.
- No design approval, engineering stamp, hydraulic design, electrical design, or water-rights decision.
- No raw large GeoTIFF display as the primary mobile imagery workflow.
- No guarantee that phone GPS is suitable for construction-grade layout.
- No cloud account requirement.

## Field-Use Constraints

- Sunlight: use high-contrast UI and avoid relying on subtle colors.
- Gloves: large touch targets and clear mode states.
- Dust/wet conditions: minimize tiny controls and accidental destructive edits.
- Poor internet: project creation, map package use, and export must work offline.
- Inaccurate GPS: always show fix quality and source confidence.
- Battery: avoid continuous high-rate logging unless explicitly enabled.
- Stress: conflict warnings and acceptance gates must be simple, direct, and visible.

## Acceptance Criteria

- A technician can complete a manual layout with no internet.
- The app refuses acreage calculations in geographic degrees.
- The app shows source confidence for every survey-derived feature.
- Project export can be reopened and validated.
- All recommended software dependencies have source-linked license/cost notes.
