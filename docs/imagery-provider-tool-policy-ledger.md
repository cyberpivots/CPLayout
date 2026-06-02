# Imagery Provider And Tool Policy Ledger

Date: 2026-05-28

## Decision

CPLayout uses open-source client software and free/no-cost, attribution-visible imagery paths. Live imagery is an interactive planning reference only. It must not become canonical geometry, a bulk downloader, a hidden-key integration, or a cloud telemetry path.

The v1 built-in live provider remains USGS The National Map Imagery Only. Custom open XYZ/WMTS templates are allowed only when the operator supplies a fixed tile URL template, attribution, license text, and no credentials. Reference overlays prefer local vector packages; when none are available and browser live reference sources are enabled, public no-key USGS TNM Imagery Topo may be used for roads, administrative boundaries, and labels. OpenLayers stays deferred until browser-side raster reprojection into arbitrary projected views is needed.

## Local Facts

- App/session online imagery settings live in `packages/core/src/settings.ts`.
- SVG tile planning lives in `packages/geometry/src/onlineImagery.ts` and is Web Mercator gated.
- SVG attribution rendering lives in `packages/map-adapters/src/SvgMapSurface.tsx`.
- MapLibre preview files are present under `packages/map-adapters/src/`, but native MapLibre runtime behavior remains unverified.
- Project export settings intentionally exclude `onlineImagery`; canonical project geometry remains project-CRS `XY`.

## Provider Ledger

| Source | CPLayout policy | Primary source |
| --- | --- | --- |
| USGS TNM Imagery Only | Built-in live U.S. imagery provider for v1, disabled by default and capped per viewport. | USGS lists `USGS Imagery Only` as a National Map base map and describes resolution variation; TNM tiled services use Web Mercator. https://www.usgs.gov/faqs/what-are-base-map-services-or-urls-used-national-map |
| USGS TNM imagery service endpoint | Current built-in URL-template source. Keep attribution visible. | Service metadata: https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson |
| USGS TNM Imagery Topo | Public no-key browser reference overlay for roads, administrative boundaries, and labels when no local vector reference package is available. | Service metadata describes a cached basemap of orthoimagery and US Topo vector data visible to the 1:9,028 scale. https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer?f=pjson |
| NAIP | Offline/preprocessed source and component of USGS imagery, not a separate CPLayout live default yet. | Data.gov/USDA NAIP record: https://catalog.data.gov/dataset/national-agriculture-imagery-program-naip-imagery |
| NASA GIBS | Candidate custom fixed-template science layer if license, attribution, layer, and time are explicit. | GIBS documents standards-based WMTS/WMS/TWMS/XYZ access. https://nasa-gibs.github.io/gibs-api-docs/access-basics/ |
| Landsat and NASA Earthdata | Offline/preprocessed source lane. | NASA Earthdata open data guidance: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-information-guidance |
| Copernicus Sentinel | Offline/preprocessed source lane or explicit custom source with required notices. | Copernicus data access terms: https://www.copernicus.eu/en/terms-use/how-access-data |
| OpenAerialMap or user-owned tiles | Allowed as custom open imagery when attribution/license are supplied and credential-free. | OAM legal page: https://openaerialmap.org/legal/ |
| OpenStreetMap public raster tiles | Excluded for CPLayout live imagery and offline/bulk use. | OSMF tile policy restricts bulk download and prefetch patterns. https://operations.osmfoundation.org/policies/tiles/ |
| Google, Bing, paid Mapbox, paid Esri/ArcGIS, keyed trial providers | Excluded. | Repo hard constraint in `AGENTS.md`; no paid maps, hidden keys, or trial-only SDKs. |
| Google Earth Pro screenshots | Local companion design-review evidence only when attribution remains visible. Do not cache imagery as a dataset, embed Google Earth imagery in CPLayout, bulk mine screenshots, or treat screenshot-derived CV as survey data. | Google Geo Guidelines require proper attribution and restrict commercial/promotional use; Google Maps/Earth terms prohibit bulk feeds, mass download, and substitute mapping datasets. https://about.google/brand-resource-center/products-and-services/geo-guidelines/ and https://maps.google.com/help/terms_maps-earth/ |

## Tool Ledger

| Tool or format | CPLayout policy | Primary source |
| --- | --- | --- |
| MapLibre raster sources | Preferred renderer path already represented by installed dependencies and local preview work. | MapLibre raster source spec supports tile templates, tile size, scheme, zoom bounds, and attribution. https://maplibre.org/maplibre-style-spec/sources/ |
| PMTiles with MapLibre | Advanced offline/native lane only until a local protocol or tile-serving adapter exists and devices pass. | PMTiles MapLibre docs: https://docs.protomaps.com/pmtiles/maplibre |
| MBTiles | Advanced offline/native lane; needs a local serving/protocol adapter before raw archive rendering claims. | Keep under `packages/project-store` metadata until adapter work is explicit. |
| COG/GeoTIFF | Offline preprocessing and companion-tool lane, not React Native runtime GIS. | GDAL COG docs: https://gdal.org/en/latest/drivers/raster/cog.html |
| OpenLayers | Deferred browser-only raster reprojection option. Do not add until MapLibre plus current SVG preview cannot meet requirements. | OpenLayers raster reprojection tutorial: https://openlayers.org/doc/tutorials/raster-reprojection.html |
| OpenCV Python/OpenCV.js | Local/offline companion CV lane for edge, contour, and circle detection over proof screenshots. Do not add to React Native runtime or use to derive canonical projected `XY` from Google imagery. | OpenCV Hough circle and OpenCV.js docs: https://docs.opencv.org/4.x/d3/de5/tutorial_js_houghcircles.html and https://docs.opencv.org/4.x/df/d0a/tutorial_js_intro.html |

## Non-Goals

- No Google, Bing, paid Mapbox, paid Esri/ArcGIS, hidden API keys, scraping, public OSM bulk tile use, or trial-only hosted imagery.
- No claim that native MapLibre, raw PMTiles/MBTiles rendering, or native ZIP sharing is production-verified before device/emulator evidence.
- No automatic geometry mutation from imagery. Imagery-derived vertices are planning evidence until field-verified and explicitly accepted.
- No verified Google Earth headless screenshot API, no permission claim for bulk automated CV extraction from Earth imagery, and no product-facing Google Earth comparison dataset rights.
