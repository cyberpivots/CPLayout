# Online Imagery Interface Research

Date: 2026-05-19

## Decision

Use USGS The National Map `USGSImageryOnly` as the first optional online imagery preview provider for the SVG map MVP.

The feature is disabled by default. It is a live visual reference only and is not an offline cache, bulk downloader, or surveyed geometry source.

## Verified Sources

- USGS National Map basemap FAQ lists public basemap services and URLs, including imagery services.
  - https://www.usgs.gov/faqs/what-are-base-map-services-or-urls-used-national-map
- USGS `USGSImageryOnly` service metadata identifies the service as a cached tile basemap of orthoimagery, mostly NAIP for the conterminous United States, with copyright text `USDA, USGS The National Map: Orthoimagery`.
  - https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson
- ArcGIS REST map tile endpoint format is `/tile/{level}/{row}/{column}` for cached map services.
  - https://developers.arcgis.com/rest/services-reference/enterprise/map-tile/
- MapLibre style sources support raster tile URL templates for future renderer-adapter work.
  - https://maplibre.org/maplibre-style-spec/sources/
- OpenStreetMap public tile policy rejects bulk download, scraping, and prefetch-style use of public tile servers.
  - https://operations.osmfoundation.org/policies/tiles/

## Implementation Defaults

- Provider id: `usgs_imagery_only`
- Tile URL template: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`
- Min zoom: `0`
- Max zoom: `16`
- Tile cap: `64` per viewport
- Attribution: `USDA, USGS The National Map: Orthoimagery`

## Boundaries

- Keep `offlineMaps.allowNetworkTiles` fixed to `false`.
- Do not use Google Maps, paid Mapbox, paid Esri services, hidden keys, or paid imagery.
- Do not bulk cache or offline-prefetch public OSM tiles.
- Treat imagery-digitized geometry as planning-grade until field-survey verified.
- Native MapLibre runtime behavior remains unverified until Android/iOS development-build testing completes.
