# Google Earth KML/KMZ Source Ledger

Date verified: 2026-05-28

## Verified Format Facts

- Google documents KML as an OGC-maintained XML format for geographic annotation and visualization. CPLayout targets KML 2.2 namespace output for broad Google Earth compatibility.
  Source: https://developers.google.com/kml/documentation/kmlreference
- KML coordinate tuples use longitude, latitude, and optional altitude. CPLayout treats altitude as non-layout metadata and does not store it in canonical geometry.
  Source: https://developers.google.com/kml/documentation/kmlreference
- OGC KML uses WGS 84 longitude/latitude semantics. CPLayout imports KML/KMZ as WGS84 interchange and immediately projects coordinates into the project CRS.
  Source: https://docs.ogc.org/is/12-007r2/12-007r2.html
- KMZ is a ZIP archive. Google recommends a single top-level KML file, commonly `doc.kml`; CPLayout exports KMZ as `doc.kml` and rejects ambiguous multi-KML archives.
  Source: https://developers.google.com/kml/documentation/kmzarchives
- Google Earth Pro user-facing drawing instructions use paths and polygons for lines and shapes. CPLayout's import wizard maps those drawing surfaces to its current KML/KMZ importer: polygons for field boundaries and obstacles, paths for utility lines, and placemarks for utility points or survey points.
  Source: https://support.google.com/earth/answer/148072
- Google documents shared KML `Style` elements under `Document` and `styleUrl` references from individual features. CPLayout uses this shared-style pattern so one deterministic style definition can be reused by many exported placemarks.
  Source: https://developers.google.com/kml/documentation/kml_tut
- Google KML `Style` can contain `IconStyle`, `LabelStyle`, `LineStyle`, and `PolyStyle`. CPLayout uses those elements only as visual interchange metadata for exported KML/KMZ.
  Source: https://developers.google.com/kml/documentation/kmlreference
- KML color values use `aabbggrr` byte order. CPLayout keeps KML color constants local to the exporter to avoid leaking KML-specific color ordering into project geometry or UI state.
  Source: https://developers.google.com/kml/documentation/kmlreference
- OGC identifies KML 2.2 as an OGC implementation standard. CPLayout's styling work targets KML visual presentation only and does not change the WGS84 interchange boundary or projected `XY` canonical geometry.
  Source: https://www.ogc.org/standards/kml/

## Dependency Decisions

- `@tmcw/togeojson` converts KML to GeoJSON, is BSD-2-Clause, and is used only as a parser bridge. Its GeoJSON output is WGS84 and must not be sent through the projected GeoJSON importer.
  Sources: https://github.com/placemark/togeojson, https://www.npmjs.com/package/@tmcw/togeojson
- `@xmldom/xmldom` provides a pure-JavaScript DOMParser for Node/Expo native parsing paths.
  Source: https://www.npmjs.com/package/@xmldom/xmldom
- `@placemarkio/tokml` converts CPLayout-generated WGS84 GeoJSON features to KML and is MIT licensed. CPLayout validates and builds its own feature collection before calling it.
  Sources: https://github.com/placemark/tokml, https://www.npmjs.com/package/@placemarkio/tokml
- `fflate` was already in `@cplayout/project-store` and remains the ZIP/KMZ implementation. `jszip` was not added.
  Source: https://www.npmjs.com/package/fflate

## CPLayout Scope

- Supported import geometry: `Placemark` `Polygon`, `Point`, supported `MultiGeometry`, and closed `LineString` rings.
- Deferred import constructs: `NetworkLink`, remote resources, `GroundOverlay`, `PhotoOverlay`, `ScreenOverlay`, 3D `Model`, tours, animation, gx time tracks, embedded image semantics, and style fidelity.
- Exported KML includes field boundary, obstacles, infrastructure points, survey points, optional tower points, and CPLayout `ExtendedData`.
- Exported KML may include deterministic shared styles for Google Earth visual clarity. These styles are not imported as authoritative project data and do not affect CPLayout validation, geometry, persistence, or archive schemas.
- KML/KMZ is a GIS exchange format only. Project backup/restore remains the CPLayout ZIP package.
- Android native file picker/share behavior is proven for the canonical project ZIP package by the completed Android report; iOS behavior and any KML/KMZ-specific native picker/share regression still need their own checklist evidence.
- Browser import wizard screenshots and capture notes are recorded in `docs/google-earth-import-wizard-research.md`; the wizard is instructional UI and does not change KML/KMZ import semantics.
