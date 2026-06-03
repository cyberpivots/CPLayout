# Online Imagery Interface Research

Date: 2026-05-22

## Decision

Use open-source client software already present in the workspace for live imagery v1. The production U.S. farm aerial path is now offline local raster packages generated from sources such as NAIP outside the app, then imported with TileJSON/templates. The built-in live provider remains USGS The National Map `USGSImageryOnly` as a connected preview; a guarded custom open XYZ/WMTS source is allowed only when the user supplies an open tile URL template plus attribution and license text.

Live imagery is an interactive visual reference only, not an offline cache, bulk downloader, surveyed geometry source, or project-export setting.

Reference overlays prefer local vector map packages. When browser live reference sources are enabled and no local package is available, CPLayout may auto-apply the public no-key USGS The National Map `USGSImageryTopo` cached reference layer. It combines orthoimagery with US Topo vector data for roads, administrative boundaries, and labels, and remains an interactive-only display aid.

## Implementation Defaults

- Built-in provider id: `usgs_imagery_only`
- Built-in tile URL template: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`
- Built-in public reference overlay URL template: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}`
- Projection: `EPSG:3857`
- Tile scheme: `xyz`
- Tile size: `256`
- Min/max zoom: `0` to `16`
- Tile cap: `64` per viewport by default, maximum `128`
- Attribution: `USDA, USGS The National Map: Orthoimagery`
- Cache policy metadata: `interactive_only`

## Source Ledger

| Source | Current decision | Primary-source note |
| --- | --- | --- |
| USGS The National Map Imagery Only | Built-in v1 live provider. | The service metadata identifies `USGSImageryOnly` as a cached orthoimagery tile basemap, mostly NAIP in CONUS, with Web Mercator spatial reference and copyright text `USDA, USGS The National Map: Orthoimagery`: https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson |
| USGS The National Map Imagery Topo | Public no-key automatic reference overlay when local vector overlay packages are absent and live sources are enabled. | The service metadata identifies `USGSImageryTopo` as a cached basemap of orthoimagery and US Topo vector data visible to the 1:9,028 scale, with Web Mercator spatial reference and copyright text `USGS The National Map: Orthoimagery and US Topo`: https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer?f=pjson |
| USGS TNM projections | Required metadata for the built-in provider. | USGS says TNM tiled base map services use WGS 84 Web Mercator Auxiliary Sphere: https://www.usgs.gov/faqs/what-map-projections-are-used-national-map-tiled-base-map-services-and-dynamic-overlay |
| ArcGIS cached tiles | Supported URL-template shape for USGS. | ArcGIS REST cached map tiles use `/tile/{level}/{row}/{column}`: https://developers.arcgis.com/rest/services-reference/enterprise/map-tile/ |
| MapLibre raster source templates | Renderer mechanism for public reference overlays. | MapLibre raster sources support tile URL templates, `tileSize`, zoom bounds, and attribution: https://maplibre.org/maplibre-style-spec/sources/ |
| NAIP | Primary offline/preprocessed U.S. farm aerial package source, not a CPLayout live provider. | USGS EROS describes NAIP as USDA aerial imagery, public-domain media, available through EarthExplorer as GeoTIFF/JPEG2000, with projection details varying by product/year: https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip |
| NASA GIBS | Candidate custom/source-backed science imagery provider when the user supplies a fixed open WMTS/XYZ template. | GIBS provides public standards-compliant WMTS/WMS/TWMS/XYZ-style services and Web Mercator endpoints; time/layer fields must be fixed before CPLayout can use a tile template: https://nasa-gibs.github.io/gibs-api-docs/access-basics/ |
| NASA Earthdata and Landsat | Offline/preprocessed source lane; not a CPLayout live default. | NASA Earthdata states NASA promotes full and open Earth science data sharing. NASA's Landsat page says Landsat data and science products are publicly accessible and free of charge: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-information-guidance and https://science.nasa.gov/mission/landsat/data-overview/ |
| Copernicus Sentinel | Offline/preprocessed source lane or user-supplied custom open service with attribution. | Copernicus says data are available on a free, full, and open basis. The Sentinel legal notice requires source notices such as `Copernicus Sentinel data [Year]`: https://www.copernicus.eu/en/terms-use/how-access-data and https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice |
| OpenAerialMap | Candidate custom open imagery source with attribution and reasonable-use limits. | OAM describes openly licensed satellite/UAV imagery and CC-BY 4.0 attribution through the Open Imagery Network: https://openaerialmap.org/about/ |
| MapLibre GL JS / style sources | Web preview renderer for projected field projects. | MapLibre raster sources support `tiles`, `minzoom`, `maxzoom`, `tileSize`, `scheme`, and `attribution`: https://maplibre.org/maplibre-style-spec/sources/ |
| MapLibre React Native | Installed/configured, with generated TileJSON/tile-template descriptors as the supported native source shape. | MapLibre RN `RasterSource` and `VectorSource` accept TileJSON URLs or tile URL templates. Current Android claims still require report-specific proof; iOS behavior and raw PMTiles/MBTiles need a local protocol or tile-serving adapter before native rendering claims. |
| OpenLayers | Future browser raster-reprojection option only. | OpenLayers documents browser-side raster reprojection between source and view projections, including Proj4-backed projections, but `ol` is not installed for v1: https://openlayers.org/doc/tutorials/raster-reprojection.html |
| OpenStreetMap public raster tiles | Excluded from live imagery and bulk/offline use. | The OSMF tile policy prohibits bulk scraping/prefetch features and requires honoring cache behavior: https://operations.osmfoundation.org/policies/tiles/ |

## Boundaries

- Keep `onlineImagery` in app/session settings only; do not serialize it into project ZIP/export settings.
- Keep local aerial package preference in project-safe `aerialImagery` settings; package files themselves are imported separately and project ZIP archives keep only metadata.
- Keep canonical project geometry as projected/local `XY`. WGS84 is a display/overlay transform for MapLibre preview only.
- Keep SVG editing as the source of geometry mutation. The web MapLibre preview is read-only.
- Do not use Google Maps, Bing imagery, paid Mapbox, paid Esri/ArcGIS services, hidden API keys, tokenized templates, paid imagery, or trial-only providers.
- Do not use public OSM raster tiles for roads, borders, or labels; use local packages first or public no-key USGS reference services when live sources are enabled.
- Do not bulk cache, prefetch, scrape, or offline-package public live tile endpoints through this feature.
- Treat imagery-digitized geometry as planning-grade until field-survey verified.
- Native MapLibre runtime behavior must be tied to the specific completed Android/iOS report. Imported local aerial raster packages, iOS, and raw PMTiles/MBTiles remain unverified until their own reports pass.
