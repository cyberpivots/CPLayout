# Google Earth Import Wizard Research

Date verified: 2026-05-28

## Scope

This note supports the browser-only CPLayout Google Earth KML/KMZ import wizard in `apps/mobile/src/components/GoogleEarthImportWizard.tsx`.

The wizard is instructional UI only. It does not change `PivotProject`, KML parser schemas, SQLite schema, ZIP archive shape, or native runtime claims.

## Current User-Facing Drawing Instructions

1. Start in Google Earth Pro.
2. Draw the field boundary with `Add > Polygon`.
3. Name the boundary polygon `field_boundary` or `Boundary`.
4. Draw obstacle areas with `Add > Polygon`.
5. Name obstacle polygons with CPLayout obstacle names: `road`, `ditch`, `fence`, `building`, `canal`, `tree`, or `exclusion`.
6. Draw utility lines with `Add > Path` and utility points with `Add > Placemark`.
7. Use CPLayout utility names such as `underground_pipeline`, `power_line`, `power_pole`, `pump_location`, `access_lane`, `end_gun_arc`, and `corner_swing_limit`.
8. Save/export a focused KML or KMZ from Google Earth Pro.
9. In CPLayout, use `Import KML/KMZ`, review the selectable cards, deselect unintended features, and apply only the intended import.

## Primary-Source Facts Used

- Google Earth Help documents using Google Earth paths and polygons to draw lines and shapes. Source: https://support.google.com/earth/answer/148072
- Google KML Reference defines `Point`, `LineString`, `Polygon`, `coordinates`, and `ExtendedData` elements for KML interchange. Source: https://developers.google.com/kml/documentation/kmlreference
- Google KMZ guidance describes KMZ as a ZIP package and recommends a single root KML file, commonly `doc.kml`. Source: https://developers.google.com/kml/documentation/kmzarchives
- OGC KML WGS84 longitude/latitude semantics are tracked in `docs/kml-kmz-google-earth-source-ledger.md`.

## Screenshot Capture Manifest

Capture helper: `tools/capture_google_earth_import_wizard_screenshots.ps1`

Verified installed path on this Windows 11 PC:

```text
C:\Program Files\Google\Google Earth Pro\client\googleearth.exe
```

Generated assets:

| File | Size | SHA-256 | Notes |
| --- | ---: | --- | --- |
| `apps/mobile/src/assets/google-earth-wizard/google-earth-pro-main-window.png` | 2576 x 1568 | `3e29989cd42a0b536148b5ed159266ec79cf65d910833da96c4555c97c2307b4` | Real Google Earth Pro main window capture. The map canvas was black in this GUI session. |
| `apps/mobile/src/assets/google-earth-wizard/google-earth-pro-add-menu.png` | 760 x 220 | `40bd6080d1aeae36237780e46bf807b541efd7c9bbbeb8d540a9e81c62179386` | Real Google Earth Pro Add menu capture showing Placemark, Path, and Polygon entries. |

Manifest file:

```text
apps/mobile/src/assets/google-earth-wizard/manifest.json
```

## Blockers And Limits

- The Google Earth Pro map canvas rendered black during automated capture from this session, so the tutorial uses the Add-menu screenshot as the clearest real instructional asset and keeps the main-window screenshot only as contextual evidence.
- No Android or iOS native runtime behavior is claimed for this feature. The wizard is browser UI and offline asset usage.
- The wizard mirrors the current CPLayout importer. It does not add support for overlays, NetworkLinks, models, tours, style fidelity, altitude semantics, or raw imagery packages.
