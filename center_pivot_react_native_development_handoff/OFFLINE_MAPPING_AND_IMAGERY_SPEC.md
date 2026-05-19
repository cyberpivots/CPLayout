# Offline Mapping And Imagery Spec

## Offline Basemap Strategy

The app must not rely on Google Maps, Mapbox hosted tiles, Esri services, or public OpenStreetMap tile caching. Use local PMTiles/MBTiles packages generated from lawful sources.

## Recommended Rendering

- iOS/Android: `@maplibre/maplibre-react-native`.
- Windows/fallback: `react-native-webview` with OpenLayers or MapLibre GL JS.
- Overlay all survey and pivot geometry as GeoJSON.

## PMTiles/MBTiles

PMTiles is recommended for single-file local map packages. MBTiles is widely supported and SQLite-based. Both require a renderer/protocol adapter and a lawful data source.

## OpenStreetMap Attribution

OSM data is licensed under ODbL and requires attribution. Public OSM tile servers have usage policies and are not a free offline tile backend. Store attribution/license text in each map package manifest and render it on the map.

## Drone Imagery Workflow

1. User supplies orthomosaic/GeoTIFF/COG.
2. Offline tool checks CRS, bounds, resolution, and nodata.
3. Convert to tiled PMTiles/MBTiles/raster tile package.
4. Import package plus metadata.
5. Overlay field/pivot geometry.
6. Treat digitized imagery features as planning-grade until survey validated.

## Large Raster Limits

Do not render large raw GeoTIFFs directly in React Native. Use `geotiff` only for metadata or small previews. Use GDAL/rasterio preprocessing outside the app for large orthomosaics.

## Excluded Paid Mapping Services

- Google Maps paid APIs.
- Mapbox paid tiles or SDK services.
- Esri/ArcGIS paid services.
- Any paid tile provider or trial-only imagery product.
