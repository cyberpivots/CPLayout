# Google Earth KML/KMZ Source Ledger

Date verified: 2026-05-22

## Verified Format Facts

- Google documents KML as an OGC-maintained XML format for geographic annotation and visualization. CPLayout targets KML 2.2 namespace output for broad Google Earth compatibility.
  Source: https://developers.google.com/kml/documentation/kmlreference
- KML coordinate tuples use longitude, latitude, and optional altitude. CPLayout treats altitude as non-layout metadata and does not store it in canonical geometry.
  Source: https://developers.google.com/kml/documentation/kmlreference
- OGC KML uses WGS 84 longitude/latitude semantics. CPLayout imports KML/KMZ as WGS84 interchange and immediately projects coordinates into the project CRS.
  Source: https://docs.ogc.org/is/12-007r2/12-007r2.html
- KMZ is a ZIP archive. Google recommends a single top-level KML file, commonly `doc.kml`; CPLayout exports KMZ as `doc.kml` and rejects ambiguous multi-KML archives.
  Source: https://developers.google.com/kml/documentation/kmzarchives

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
- KML/KMZ is a GIS exchange format only. Project backup/restore remains the CPLayout ZIP package.
- Native file picker/share behavior is compile-ready but not production-verified until the Android/iOS device checklist passes.
