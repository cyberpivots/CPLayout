# KML/KMZ Evidence

Use this reference when inspecting Google Earth Pro companion artifacts or CPLayout KML/KMZ exports.

## Primary Sources To Recheck

- Google KML Reference: `https://developers.google.com/kml/documentation/kmlreference`
- Google KML tutorial and shared styles: `https://developers.google.com/kml/documentation/kml_tut`
- Google KMZ archives: `https://developers.google.com/kml/documentation/kmzarchives`
- OGC KML standard page: `https://www.ogc.org/standards/kml/`
- Google Earth Help for drawing paths and polygons: `https://support.google.com/earth/answer/148072`

## CPLayout Rules

- KML/KMZ is WGS84 interchange, not canonical CPLayout geometry.
- KML coordinate tuples are longitude, latitude, optional altitude; altitude is metadata for CPLayout unless a future schema explicitly says otherwise.
- Project geometry remains projected/local `XY` in the project CRS.
- KML styles and style URLs are visual metadata only and must not alter project schemas, persistence, archives, or validation.
- KMZ should be treated as a ZIP archive. CPLayout exports `doc.kml` and rejects ambiguous multi-KML imports.

## Inspection Checklist

- For each artifact, record path, file size, SHA-256, modified time, and whether it is generated/local/ignored or tracked.
- For images, record dimensions and whether attribution is visible when the image includes Google Earth content.
- For KML, count `Placemark`, `Style`, `StyleMap`, `styleUrl`, `ExtendedData`, `Polygon`, `LineString`, and `Point` elements where parseable.
- For KMZ, list archive members and identify `doc.kml` or the selected KML member.
- Confirm CPLayout `ExtendedData` stays evidence/interchange metadata and does not imply runtime proof.

## Report Caveats

- Pixel checks can prove non-black/non-uniform captures, but they do not prove overlay correctness without visual review.
- Google Earth Pro desktop proof does not prove CPLayout web, Android, iOS, native SQLite, native sharing, or native MapLibre behavior.
- Screenshot-derived detections are planning-grade until an operator accepts them through CPLayout editing/import flows.
