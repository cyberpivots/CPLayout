import json
import zipfile
from pathlib import Path


REQUESTED_DIR = Path("/mnt/data/center_pivot_react_native_development_handoff")
FALLBACK_DIR = Path("/mnt/h/CPLayout/center_pivot_react_native_development_handoff")
SOURCE_JSON = Path("/mnt/h/CPLayout/center_pivot_free_python_tooling_handoff.json")
RESEARCH_DATE = "2026-05-19"


def choose_output_dir() -> Path:
    try:
        REQUESTED_DIR.mkdir(parents=True, exist_ok=True)
        probe = REQUESTED_DIR / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return REQUESTED_DIR
    except Exception:
        FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
        return FALLBACK_DIR


def src(tool_or_claim, title, url, source_type, verifies):
    return {
        "tool_or_claim": tool_or_claim,
        "source_title": title,
        "source_url": url,
        "source_type": source_type,
        "what_it_verifies": verifies,
        "date_accessed": RESEARCH_DATE,
    }


SOURCES = [
    src("React Native", "React Native Docs", "https://reactnative.dev/docs/getting-started", "official documentation", "React Native framework baseline and TypeScript-first application development."),
    src("React Native New Architecture", "React Native New Architecture Docs", "https://reactnative.dev/docs/the-new-architecture/landing-page", "official documentation", "New Architecture constraints for native modules and cross-platform app work."),
    src("Expo", "Expo Docs", "https://docs.expo.dev/", "official documentation", "Expo framework, development builds, and local native project generation options."),
    src("Expo local builds", "Expo EAS Local Builds", "https://docs.expo.dev/build-reference/local-builds/", "official documentation", "EAS local-build workflow exists, while hosted EAS build service must not be required for a no-cost local workflow."),
    src("React Native Windows", "React Native for Windows Docs", "https://microsoft.github.io/react-native-windows/", "official documentation", "Windows target support through React Native Windows."),
    src("React Native Windows native modules", "Native modules for React Native Windows", "https://microsoft.github.io/react-native-windows/docs/native-modules", "official documentation", "Windows native module path for serial/GNSS integrations."),
    src("MapLibre React Native", "MapLibre React Native GitHub", "https://github.com/maplibre/maplibre-react-native", "official repository", "Open-source React Native MapLibre package and platform scope."),
    src("MapLibre React Native docs", "MapLibre React Native Documentation", "https://maplibre.org/maplibre-react-native/", "official documentation", "Map display API and iOS/Android use path."),
    src("react-native-maps", "react-native-maps GitHub", "https://github.com/react-native-maps/react-native-maps", "official repository", "License and provider caveats for Apple Maps and Google Maps usage."),
    src("React Navigation", "React Navigation GitHub", "https://github.com/react-navigation/react-navigation", "official repository", "Navigation package license and React Native navigation role."),
    src("MapLibre GL JS", "MapLibre GL JS Documentation", "https://maplibre.org/maplibre-gl-js/docs/", "official documentation", "WebView/Web map rendering path without Mapbox SDK dependency."),
    src("Leaflet", "Leaflet GitHub", "https://github.com/Leaflet/Leaflet", "official repository", "Leaflet open-source license and lightweight WebView map option."),
    src("OpenLayers", "OpenLayers GitHub", "https://github.com/openlayers/openlayers", "official repository", "OpenLayers open-source license and WebView GIS rendering option."),
    src("OpenStreetMap data", "OpenStreetMap Copyright and License", "https://www.openstreetmap.org/copyright", "official documentation", "ODbL data license, attribution, and OSM credit requirements."),
    src("OpenStreetMap tiles", "OpenStreetMap Tile Usage Policy", "https://operations.osmfoundation.org/policies/tiles/", "official policy", "Public OSM tile servers are not an offline/bulk tile source."),
    src("PMTiles", "PMTiles Documentation", "https://docs.protomaps.com/pmtiles/", "official documentation", "Single-file local map tile package workflow."),
    src("pmtiles npm", "PMTiles GitHub", "https://github.com/protomaps/PMTiles", "official repository", "pmtiles JavaScript library and license."),
    src("MBTiles", "MBTiles Specification", "https://github.com/mapbox/mbtiles-spec", "official specification repository", "SQLite-based MBTiles file format."),
    src("Turf.js", "Turf.js Documentation", "https://turfjs.org/", "official documentation", "JavaScript geospatial measurement and geometry operations."),
    src("Proj4js", "Proj4js GitHub", "https://github.com/proj4js/proj4js", "official repository", "JavaScript coordinate transformations and MIT license."),
    src("JSTS", "JSTS GitHub", "https://github.com/bjornharrtell/jsts", "official repository", "JavaScript Topology Suite license and geometry capability."),
    src("polygon-clipping", "polygon-clipping GitHub", "https://github.com/mfogel/polygon-clipping", "official repository", "MIT polygon boolean operations for TypeScript geometry core."),
    src("rbush", "rbush GitHub", "https://github.com/mourner/rbush", "official repository", "R-tree spatial indexing package and MIT license."),
    src("geokdbush", "geokdbush GitHub", "https://github.com/mourner/geokdbush", "official repository", "Fast geographic nearest-neighbor search package and ISC license."),
    src("GeographicLib JS", "GeographicLib JS GitHub", "https://github.com/geographiclib/geographiclib-js", "official repository", "Geodesic calculation package and MIT license."),
    src("geotiff.js", "geotiff.js GitHub", "https://github.com/geotiffjs/geotiff.js", "official repository", "GeoTIFF parsing in JavaScript and MIT license."),
    src("shapefile", "shapefile GitHub", "https://github.com/mbostock/shapefile", "official repository", "Browser/Node shapefile reading and BSD-3-Clause license."),
    src("@tmcw/togeojson", "togeojson GitHub", "https://github.com/placemark/togeojson", "official repository", "KML/GPX to GeoJSON conversion and BSD-2-Clause license."),
    src("SQLite", "SQLite Copyright", "https://www.sqlite.org/copyright.html", "official documentation", "SQLite public-domain style status."),
    src("react-native-quick-sqlite", "react-native-quick-sqlite GitHub", "https://github.com/margelo/react-native-quick-sqlite", "official repository", "React Native SQLite library license and native dependency path."),
    src("WatermelonDB", "WatermelonDB GitHub", "https://github.com/Nozbe/WatermelonDB", "official repository", "Offline database layer and MIT license."),
    src("Realm JS", "Realm JS GitHub", "https://github.com/realm/realm-js", "official repository", "Realm local SDK license; cloud/sync products are not required and are deferred."),
    src("AsyncStorage", "AsyncStorage GitHub", "https://github.com/react-native-async-storage/async-storage", "official repository", "AsyncStorage license and scope."),
    src("MMKV", "react-native-mmkv GitHub", "https://github.com/mrousavy/react-native-mmkv", "official repository", "Fast key-value storage license and native dependency path."),
    src("react-native-fs", "react-native-fs GitHub", "https://github.com/itinance/react-native-fs", "official repository", "Local file access package and MIT license."),
    src("react-native-webview", "react-native-webview GitHub", "https://github.com/react-native-webview/react-native-webview", "official repository", "WebView package license and cross-platform map-container role."),
    src("react-native-ble-plx", "react-native-ble-plx GitHub", "https://github.com/dotintent/react-native-ble-plx", "official repository", "BLE package license and native Bluetooth path."),
    src("react-native-bluetooth-classic", "react-native-bluetooth-classic GitHub", "https://github.com/kenjdavidson/react-native-bluetooth-classic", "official repository", "Bluetooth Classic SPP path and Android-heavy risk."),
    src("react-native-usb-serialport-for-android", "react-native-usb-serialport-for-android GitHub", "https://github.com/bastengao/react-native-usb-serialport-for-android", "official repository", "Android USB serial package and maintenance risk."),
    src("serialport", "serialport GitHub", "https://github.com/serialport/node-serialport", "official repository", "Node desktop/CLI serial support, not direct mobile RN runtime support."),
    src("Core Location", "Apple Core Location Documentation", "https://developer.apple.com/documentation/corelocation", "official documentation", "iOS location APIs and permissions."),
    src("Core Bluetooth", "Apple Core Bluetooth Documentation", "https://developer.apple.com/documentation/corebluetooth", "official documentation", "iOS BLE integration path."),
    src("External Accessory", "Apple External Accessory Documentation", "https://developer.apple.com/documentation/externalaccessory", "official documentation", "iOS external accessory framework constraints for non-BLE serial-style accessories."),
    src("Apple Developer Program", "Apple Developer Program Enrollment", "https://developer.apple.com/programs/enroll/", "official documentation", "Apple distribution account cost risk."),
    src("Android location", "Android Location Permissions", "https://developer.android.com/develop/sensors-and-location/location/permissions", "official documentation", "Android precise/approximate location permission model."),
    src("Android Bluetooth", "Android Bluetooth Permissions", "https://developer.android.com/develop/connectivity/bluetooth/bt-permissions", "official documentation", "Android Bluetooth runtime permissions."),
    src("Android USB host", "Android USB Host Overview", "https://developer.android.com/develop/connectivity/usb/host", "official documentation", "Android USB host mode and device permission workflow."),
    src("Google Play distribution", "Google Play Console Account", "https://support.google.com/googleplay/android-developer/answer/6112435", "official documentation", "Google Play developer account fee risk for store distribution."),
    src("Windows SerialCommunication", "Windows.Devices.SerialCommunication Namespace", "https://learn.microsoft.com/en-us/uwp/api/windows.devices.serialcommunication", "official documentation", "Windows serial device access for GNSS receivers."),
    src("Windows Geolocation", "Windows.Devices.Geolocation Namespace", "https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation", "official documentation", "Windows geolocation APIs."),
    src("MSIX packaging", "MSIX documentation", "https://learn.microsoft.com/en-us/windows/msix/", "official documentation", "Windows packaging approach."),
    src("Microsoft Store account", "Opening a developer account", "https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account", "official documentation", "Microsoft Store account cost and registration caveats."),
    src("RTKLIB", "RTKLIB GitHub", "https://github.com/tomojitakasu/RTKLIB", "official repository", "Free RTK/GNSS processing software and license caveats."),
    src("RINEX", "IGS RINEX Working Group", "https://igs.org/wg/rinex/", "official standards body", "RINEX role for GNSS observation workflows."),
    src("NGS CORS", "NOAA NGS CORS", "https://geodesy.noaa.gov/CORS/", "official data source", "Free public GNSS station data in the United States."),
    src("React Native Paper", "React Native Paper GitHub", "https://github.com/callstack/react-native-paper", "official repository", "Free UI component library and MIT license."),
    src("React Hook Form", "React Hook Form GitHub", "https://github.com/react-hook-form/react-hook-form", "official repository", "Free form state package and MIT license."),
    src("Zod", "Zod GitHub", "https://github.com/colinhacks/zod", "official repository", "Free TypeScript validation package and MIT license."),
    src("Jest", "Jest Docs", "https://jestjs.io/", "official documentation", "Unit test framework and license."),
    src("React Native Testing Library", "React Native Testing Library", "https://callstack.github.io/react-native-testing-library/", "official documentation", "React Native component testing."),
    src("Detox", "Detox Documentation", "https://wix.github.io/Detox/", "official documentation", "React Native end-to-end testing framework."),
    src("Maestro", "Maestro GitHub", "https://github.com/mobile-dev-inc/Maestro", "official repository", "Open-source mobile UI testing option and license review path."),
]


def fs(is_free=True, cost_risk="none for software use", license_name="MIT", confidence="verified from package metadata or official repository", notes="Commercial use appears compatible with stated license; perform project legal review before release."):
    return {
        "is_free": is_free,
        "cost_risk": cost_risk,
        "license": license_name,
        "license_confidence": confidence,
        "commercial_use_notes": notes,
    }


def install(npm="", yarn="", expo="possible with caveats", bare="no", native=None, windows=None):
    return {
        "npm": npm,
        "yarn": yarn,
        "expo_compatibility": expo,
        "bare_react_native_required": bare,
        "native_dependencies": native or [],
        "windows_notes": windows or [],
    }


def catalog(name, category, platforms, primary_use, why, free_status, installation, examples, strengths, limitations, risk, alternatives, sources):
    return {
        "name": name,
        "category": category,
        "platforms": platforms,
        "primary_use": primary_use,
        "why_relevant_to_center_pivot_app": why,
        "free_status": free_status,
        "installation": installation,
        "example_use_cases": examples,
        "strengths": strengths,
        "limitations": limitations,
        "risk_level": risk,
        "alternatives": alternatives,
        "official_sources": sources,
    }


TOOL_CATALOG = [
    catalog("react-native", "React Native foundation", ["iOS", "Android", "Windows via react-native-windows"], "Core application framework.", "Provides shared TypeScript UI and native module access for field survey, map tools, and local project workflows.", fs(license_name="MIT"), install("npm install react-native", "yarn add react-native", "Expo uses React Native under the hood; bare app gives more native control.", "no for core, yes for many GNSS/map modules", ["Xcode for iOS", "Android Studio/SDK for Android", "Visual Studio workloads for Windows"], ["Use react-native-windows for Windows target."]), ["Shared mobile app shell", "TypeScript business logic packages", "native sensor bridge host"], ["Large ecosystem", "active upstream", "native access"], ["Windows support requires React Native Windows, not every mobile package works there."], "medium", ["Flutter", "Kotlin/Swift native apps"], ["https://reactnative.dev/docs/getting-started", "https://reactnative.dev/docs/the-new-architecture/landing-page"]),
    catalog("expo", "React Native foundation", ["iOS", "Android"], "Mobile development tooling and development builds.", "Good for early mobile MVP if native modules are handled through prebuild/development builds rather than Expo Go.", fs(license_name="MIT", cost_risk="Expo open-source tooling is free; hosted EAS services may have paid limits and must not be required."), install("npx create-expo-app", "yarn create expo-app", "Recommended only with development builds/prebuild; Expo Go is insufficient for MapLibre and GNSS native modules.", "bare/prebuild required for native GNSS and map packages", ["Expo prebuild", "iOS/Android native toolchains"], ["Does not solve React Native Windows."]), ["Mobile MVP shell", "permissions", "file system", "local dev builds"], ["Fast mobile bootstrapping", "good docs"], ["Windows target remains separate; native modules require care."], "medium", ["bare React Native CLI"], ["https://docs.expo.dev/", "https://docs.expo.dev/build-reference/local-builds/"]),
    catalog("react-native-windows", "React Native Windows", ["Windows"], "Windows desktop application target.", "Provides the Windows app path for survey-office workflows, serial GNSS receiver workflows, and local project editing on field laptops.", fs(license_name="MIT"), install("npx react-native-windows-init", "yarn react-native-windows-init", "Not an Expo target.", "yes for Windows project", ["Visual Studio", "Windows SDK", "MSIX packaging"], ["Treat Windows package compatibility separately."]), ["Windows map/editor app", "serial receiver native module host", "local file package manager"], ["Official Microsoft project", "native Windows APIs"], ["Mobile RN packages often lack Windows implementations."], "medium", ["Electron plus React web", "Tauri/Rust plus web UI"], ["https://microsoft.github.io/react-native-windows/", "https://microsoft.github.io/react-native-windows/docs/native-modules"]),
    catalog("@react-navigation/native", "React Native foundation", ["iOS", "Android", "Windows support must be validated"], "Navigation between project, map, survey, equipment, and export screens.", "Gives the app a standard screen/navigation model while keeping business logic outside UI components.", fs(license_name="MIT"), install("npm install @react-navigation/native react-native-screens react-native-safe-area-context", "yarn add @react-navigation/native react-native-screens react-native-safe-area-context", "Compatible with Expo and bare React Native; Windows support must be validated with chosen navigator.", "no for core navigation, native dependencies autolink", ["react-native-screens", "react-native-safe-area-context"], ["Validate navigator package on React Native Windows."]), ["project list to map flow", "settings/export navigation", "field workflow stacks"], ["Mature RN navigation ecosystem", "MIT license"], ["Navigator choice and Windows support need proof."], "low", ["custom navigation shell"], ["https://github.com/react-navigation/react-navigation"]),
    catalog("@maplibre/maplibre-react-native", "Mapping/rendering", ["iOS", "Android"], "Native vector map renderer.", "Best native mobile map candidate for offline vector/raster tiles, survey overlays, pivot circles, sectors, tower markers, and tracks without Mapbox SDK billing.", fs(license_name="MIT", cost_risk="software free; tile data/source generation still needs license compliance and storage planning."), install("npm install @maplibre/maplibre-react-native", "yarn add @maplibre/maplibre-react-native", "Requires development build/prebuild; not Expo Go.", "yes for native setup", ["CocoaPods", "Android Gradle", "offline style/tile assets"], ["No React Native Windows support. Use WebView map for Windows."]), ["Offline basemap", "GeoJSON overlays", "tower markers", "field boundary editing display"], ["Native performance", "Mapbox-style vector tile ecosystem without Mapbox service lock-in"], ["Windows gap", "editing controls must be built", "offline tile packaging remains nontrivial"], "medium", ["react-native-webview with MapLibre GL JS/OpenLayers", "Leaflet in WebView"], ["https://github.com/maplibre/maplibre-react-native", "https://maplibre.org/maplibre-react-native/"]),
    catalog("react-native-maps", "Mapping/rendering", ["iOS", "Android"], "Native Apple Maps/Google Maps-backed map component.", "Evaluated but not recommended for the core app because Android commonly depends on Google Maps provider/API setup and the package does not solve offline open basemap or Windows requirements.", fs(license_name="MIT", cost_risk="package is MIT; map data/providers may impose API keys, terms, quotas, billing, or platform limits.", notes="Use only for a platform-specific proof where provider terms are acceptable; do not make it a required dependency."), install("npm install react-native-maps", "yarn add react-native-maps", "Requires native setup; provider configuration varies.", "yes", ["Apple Maps on iOS", "Google Maps provider commonly used on Android"], ["No Windows path."]), ["iOS Apple Maps proof only", "non-offline prototype"], ["Mature package", "native map gestures"], ["Not offline-first, provider cost/terms risk, no Windows solution."], "high", ["@maplibre/maplibre-react-native", "WebView with OpenLayers/MapLibre GL JS"], ["https://github.com/react-native-maps/react-native-maps"]),
    catalog("react-native-webview + OpenLayers", "Mapping/rendering", ["iOS", "Android", "Windows"], "Cross-platform WebView map surface.", "Most practical shared map fallback for Windows and for rendering PMTiles/MBTiles-derived local tiles when native packages diverge.", fs(license_name="MIT for react-native-webview; BSD-2-Clause for OpenLayers", cost_risk="software free; still must supply lawful local tile data."), install("npm install react-native-webview ol", "yarn add react-native-webview ol", "Works in Expo development builds; platform support must be validated.", "native WebView module required", ["WebView native implementation", "local asset server or file access bridge"], ["React Native Windows WebView support must be verified against chosen version."]), ["Windows map view", "local HTML map bundle", "geometry editing UI", "PMTiles viewer"], ["Single map UI can be shared across platforms", "mature web GIS APIs"], ["Bridge latency", "harder native gesture integration", "large raster memory constraints"], "medium", ["Leaflet in WebView", "MapLibre GL JS in WebView"], ["https://github.com/react-native-webview/react-native-webview", "https://github.com/openlayers/openlayers"]),
    catalog("pmtiles", "Offline map storage", ["iOS", "Android", "Windows", "offline preprocessing"], "Single-file map tile archive and JavaScript reader.", "Useful for technician-loaded offline basemaps and raster/vector tile packages without a paid tile API.", fs(license_name="BSD-3-Clause", cost_risk="software free; tile data production and OSM attribution/license compliance remain required."), install("npm install pmtiles", "yarn add pmtiles", "Usable in JS/WebView contexts; native MapLibre integration may need protocol support or preprocessing.", "no for JS reader, yes if bridged into native map", [], ["PMTiles file can be stored with project assets."]), ["Offline county basemap", "drone imagery tile package", "single-file backup"], ["Simple file distribution", "HTTP range friendly", "good for local-first projects"], ["Native mobile integration may require WebView or custom protocol adapter."], "low", ["MBTiles", "local XYZ tile folder"], ["https://docs.protomaps.com/pmtiles/", "https://github.com/protomaps/PMTiles"]),
    catalog("MBTiles", "Offline map storage", ["iOS", "Android", "Windows", "offline preprocessing"], "SQLite tile archive format.", "Common output from tile conversion workflows for offline raster/vector maps and orthomosaics.", fs(license_name="open specification", cost_risk="format is free; data license and renderer support are separate."), install("format only", "format only", "Needs SQLite reader and renderer adapter.", "no", ["SQLite"], ["Can be read through SQLite on all platforms."]), ["Offline raster basemap", "drone orthomosaic tiles", "project map package"], ["Widely understood", "SQLite container"], ["Renderer/protocol glue is required; not a React Native component by itself."], "low", ["PMTiles", "GeoPackage tiles"], ["https://github.com/mapbox/mbtiles-spec", "https://www.sqlite.org/copyright.html"]),
    catalog("@turf/turf", "Geospatial math", ["iOS", "Android", "Windows", "Node"], "GeoJSON measurement and boolean helper library.", "Good first TypeScript layer for area, length, buffers, circle approximations, intersects, and clipping support around pivot geometry.", fs(license_name="MIT"), install("npm install @turf/turf", "yarn add @turf/turf", "JS-only package.", "no", [], []), ["Area checks", "distance measurement", "simple buffers", "circle/sector helper geometry"], ["Easy GeoJSON API", "broad ecosystem"], ["Complex polygon validity and precision can be weaker than GEOS; validate with golden tests."], "medium", ["polygon-clipping", "JSTS", "native GEOS/Rust core"], ["https://turfjs.org/", "https://github.com/Turfjs/turf"]),
    catalog("proj4", "CRS/projection", ["iOS", "Android", "Windows", "Node"], "Coordinate transformation in JavaScript.", "Required to avoid measuring acres/radius in WGS84 degrees and to transform survey WGS84 points to a project CRS.", fs(license_name="MIT"), install("npm install proj4", "yarn add proj4", "JS-only package.", "no", [], []), ["WGS84 to UTM", "State Plane definitions when supplied", "project CRS round trips"], ["Proven JS projection package", "offline CRS definitions possible"], ["EPSG database is not automatically complete; app must ship or define needed CRS strings."], "medium", ["PROJ native via Rust/C++/Python preprocessing"], ["https://github.com/proj4js/proj4js"]),
    catalog("polygon-clipping", "Geospatial math", ["iOS", "Android", "Windows", "Node"], "Polygon union/intersection/difference/xor.", "A pragmatic TypeScript core for subtracting obstacles, clipping pivot sectors to fields, and computing dry corners.", fs(license_name="MIT"), install("npm install polygon-clipping", "yarn add polygon-clipping", "JS-only package.", "no", [], []), ["coverage = field intersect pivot", "dry corners", "obstacle subtraction"], ["Focused polygon boolean operations", "small dependency"], ["GeoJSON conversion and invalid polygon repair must be implemented around it."], "medium", ["JSTS", "Turf boolean ops", "native GEOS"], ["https://github.com/mfogel/polygon-clipping"]),
    catalog("jsts", "Geospatial math", ["iOS", "Android", "Windows", "Node"], "JavaScript Topology Suite.", "Useful optional geometry fallback for validation and robust topology if Turf/polygon-clipping hit edge cases.", fs(license_name="EDL-1.0 OR EPL-1.0", cost_risk="open-source but non-MIT license; legal review recommended before commercial distribution.", notes="Keep optional until license review approves distribution obligations."), install("npm install jsts", "yarn add jsts", "JS-only package.", "no", [], []), ["geometry validity", "topology repair experiments", "line/polygon operations"], ["Mature geometry model"], ["License differs from MIT stack; API heavier."], "medium", ["polygon-clipping", "native GEOS"], ["https://github.com/bjornharrtell/jsts"]),
    catalog("rbush", "Spatial index", ["iOS", "Android", "Windows", "Node"], "R-tree spatial indexing.", "Speeds obstacle lookup, vertex snapping, conflict search, and nearest-feature UI hit testing.", fs(license_name="MIT"), install("npm install rbush", "yarn add rbush", "JS-only package.", "no", [], []), ["find obstacles near tower track", "snap candidate vertices", "map feature hit testing"], ["Fast", "small", "well-known"], ["Index stores boxes; geometry predicates still needed."], "low", ["flatbush", "custom grid index"], ["https://github.com/mourner/rbush"]),
    catalog("geokdbush", "Spatial index", ["iOS", "Android", "Windows", "Node"], "Nearest-neighbor search for geographic points.", "Useful for fast lookup of survey points, receiver samples, and nearby control points.", fs(license_name="ISC"), install("npm install geokdbush", "yarn add geokdbush", "JS-only package.", "no", [], []), ["nearest survey point", "quality-control point clusters"], ["Fast for points"], ["Works on points, not polygon topology."], "low", ["rbush", "kdbush"], ["https://github.com/mourner/geokdbush"]),
    catalog("geographiclib-geodesic", "Geospatial math", ["iOS", "Android", "Windows", "Node"], "Geodesic calculations on ellipsoid.", "Useful for GNSS QA and distance sanity checks before projection; not a replacement for projected acreage calculations.", fs(license_name="MIT"), install("npm install geographiclib-geodesic", "yarn add geographiclib-geodesic", "JS-only package.", "no", [], []), ["distance between repeated RTK shots", "projection distortion QA"], ["Accurate geodesic math"], ["Do not use for polygon acres or layout buffers."], "low", ["geolib", "native GeographicLib"], ["https://github.com/geographiclib/geographiclib-js"]),
    catalog("geotiff", "Imagery", ["iOS", "Android", "Windows", "Node"], "GeoTIFF parsing.", "Can inspect small GeoTIFF metadata and convert user imagery; large orthomosaics should be tiled offline before display.", fs(license_name="MIT"), install("npm install geotiff", "yarn add geotiff", "JS-only but memory heavy for large rasters.", "no", [], []), ["read GeoTIFF bounds", "COG metadata inspection", "small raster preview"], ["Pure JS", "COG-aware"], ["Large rasters are impractical inside RN memory; tile externally."], "medium", ["GDAL CLI preprocessing", "rasterio Python preprocessing"], ["https://github.com/geotiffjs/geotiff.js"]),
    catalog("shapefile", "Import/export", ["iOS", "Android", "Windows", "Node"], "Read ESRI Shapefiles.", "Can import simple field boundaries, but Shapefile is better handled in preprocessing or converted to GeoJSON/GeoPackage.", fs(license_name="BSD-3-Clause"), install("npm install shapefile", "yarn add shapefile", "JS package; test bundling in RN.", "no", [], []), ["read simple boundary shapefile", "convert to GeoJSON"], ["Free", "known package"], ["NPM metadata shows older modification; Shapefile sidecar/encoding issues make this a deferred MVP feature."], "medium", ["GDAL/ogr2ogr preprocessing", "GeoJSON import"], ["https://github.com/mbostock/shapefile"]),
    catalog("@tmcw/togeojson", "Import/export", ["iOS", "Android", "Windows", "Node"], "Convert KML/GPX to GeoJSON.", "Supports common survey exports from phones and handheld GPS units.", fs(license_name="BSD-2-Clause"), install("npm install @tmcw/togeojson", "yarn add @tmcw/togeojson", "JS package.", "no", [], []), ["KML boundary import", "GPX track import"], ["Focused converter", "open license"], ["Complex KMZ and huge files may require preprocessing."], "low", ["GDAL CLI preprocessing", "custom GPX parser"], ["https://github.com/placemark/togeojson"]),
    catalog("react-native-quick-sqlite", "Storage", ["iOS", "Android", "Windows uncertain"], "SQLite database access.", "Best candidate for local project store, geometry tables, RTK samples, and map package manifests on mobile.", fs(license_name="MIT"), install("npm install react-native-quick-sqlite", "yarn add react-native-quick-sqlite", "Requires development build/prebuild.", "yes", ["C++/JSI native build"], ["Windows support must be verified or replaced with platform SQLite adapter."]), ["project database", "survey point log", "offline tile index"], ["Fast local SQL", "works offline"], ["Native package compatibility is the main risk, especially Windows."], "medium", ["expo-sqlite for mobile", "WatermelonDB on SQLite", "platform-native SQLite wrapper"], ["https://github.com/margelo/react-native-quick-sqlite"]),
    catalog("expo-sqlite + expo-file-system", "Storage/files", ["iOS", "Android"], "Expo mobile SQLite and file access.", "Useful if the mobile app starts with Expo prebuild/development builds and wants Expo-maintained local storage/file APIs.", fs(license_name="MIT", cost_risk="open-source Expo packages are free; hosted Expo services must not be required."), install("npm install expo-sqlite expo-file-system", "yarn add expo-sqlite expo-file-system", "Good for Expo prebuild/development builds; not a Windows solution.", "requires Expo/native app", ["Expo native modules"], ["Use separate Windows adapters."]), ["mobile project store", "project export files", "local map package references"], ["Expo-maintained", "simple mobile setup"], ["Windows gap; native module compatibility still matters."], "medium", ["react-native-quick-sqlite", "react-native-fs"], ["https://docs.expo.dev/"]),
    catalog("@nozbe/watermelondb", "Storage", ["iOS", "Android", "Windows uncertain"], "Offline database abstraction over SQLite.", "Potential later data layer if project state grows beyond simple SQLite access and sync remains out of scope.", fs(license_name="MIT"), install("npm install @nozbe/watermelondb", "yarn add @nozbe/watermelondb", "Requires native setup and adapter validation.", "yes", ["SQLite adapter"], ["Windows support must be proved before adoption."]), ["large survey log store", "project list indexing", "offline queries"], ["Offline-first model", "MIT license"], ["Adds abstraction and migration complexity; not required for MVP."], "medium", ["react-native-quick-sqlite", "plain SQLite tables"], ["https://github.com/Nozbe/WatermelonDB"]),
    catalog("realm", "Storage", ["iOS", "Android", "Windows status must be verified"], "Local object database, deferred.", "Evaluated because it is common in React Native storage discussions, but not recommended for MVP because SQLite is simpler, file formats are more transparent, and cloud/sync product boundaries can confuse the no-backend requirement.", fs(license_name="Apache-2.0", cost_risk="local SDK package is open source; any cloud/sync service must be excluded unless separately verified free and optional.", notes="Defer unless the project specifically needs Realm local object storage and legal/product review approves it."), install("npm install realm", "yarn add realm", "Native package; not Expo Go.", "yes", ["Realm native SDK"], ["Windows RN support must be verified before use."]), ["deferred local object store"], ["Powerful local database", "Apache-2.0 package metadata"], ["Not needed for MVP; cloud/sync confusion; native integration risk."], "medium", ["SQLite", "WatermelonDB"], ["https://github.com/realm/realm-js"]),
    catalog("@react-native-async-storage/async-storage", "Storage", ["iOS", "Android", "Windows support must be verified"], "Small key-value settings.", "Use only for preferences, not project geometry or survey logs.", fs(license_name="MIT"), install("npm install @react-native-async-storage/async-storage", "yarn add @react-native-async-storage/async-storage", "Commonly supported.", "no for mobile autolinking, verify Windows", [], ["Use for small settings only."]), ["last project path", "UI preferences", "draft mode flags"], ["Simple", "free"], ["Not crash-safe enough for project files or high-rate GPS logs."], "low", ["react-native-mmkv", "SQLite settings table"], ["https://github.com/react-native-async-storage/async-storage"]),
    catalog("react-native-mmkv", "Storage", ["iOS", "Android"], "Fast key-value storage.", "Good for small high-read settings and cached UI state, not canonical project geometry.", fs(license_name="MIT"), install("npm install react-native-mmkv", "yarn add react-native-mmkv", "Requires native dev build.", "yes", ["JSI native module"], ["No primary Windows path."]), ["map UI state", "receiver profile cache"], ["Very fast"], ["Native package, Windows gap."], "medium", ["AsyncStorage", "SQLite settings table"], ["https://github.com/mrousavy/react-native-mmkv"]),
    catalog("react-native-fs", "Storage/files", ["iOS", "Android", "Windows support must be validated"], "Local file system operations.", "Needed for project import/export, ZIP backup, imagery packages, PMTiles/MBTiles files, and reports.", fs(license_name="MIT"), install("npm install react-native-fs", "yarn add react-native-fs", "Requires native module.", "yes", ["platform file permissions"], ["Validate Windows support and modern storage restrictions."]), ["save project package", "import GeoJSON", "copy PMTiles", "export report"], ["Straightforward file API"], ["Storage permission behavior varies by OS version."], "medium", ["expo-file-system for mobile", "platform file picker/native modules"], ["https://github.com/itinance/react-native-fs"]),
    catalog("react-native-ble-plx", "GNSS/RTK integration", ["iOS", "Android"], "Bluetooth Low Energy communication.", "Most realistic shared mobile path for modern BLE GNSS receivers that expose NMEA or vendor services over BLE.", fs(license_name="MIT"), install("npm install react-native-ble-plx", "yarn add react-native-ble-plx", "Requires development build/prebuild.", "yes", ["CoreBluetooth", "Android Bluetooth"], ["No Windows path."]), ["BLE GNSS receiver", "NMEA over BLE characteristic", "receiver profile setup"], ["Active package", "iOS/Android support"], ["BLE protocol varies by receiver; Bluetooth Classic SPP is separate."], "medium", ["native CoreBluetooth/Android BLE modules"], ["https://github.com/dotintent/react-native-ble-plx", "https://developer.apple.com/documentation/corebluetooth", "https://developer.android.com/develop/connectivity/bluetooth/bt-permissions"]),
    catalog("react-native-bluetooth-classic", "GNSS/RTK integration", ["Android", "iOS limited/uncertain"], "Bluetooth Classic SPP style communication.", "Many GNSS receivers expose NMEA over Bluetooth Classic serial; Android is the practical target.", fs(license_name="MIT", cost_risk="software free; iOS Classic serial accessories may require External Accessory/MFi/hardware support."), install("npm install react-native-bluetooth-classic", "yarn add react-native-bluetooth-classic", "Requires bare/development build.", "yes", ["Android Bluetooth Classic", "iOS ExternalAccessory only for compatible accessories"], ["Not a Windows solution."]), ["Android SPP GNSS receiver", "NMEA live stream"], ["Matches many field receivers on Android"], ["iOS limitations are severe; package release train includes RC metadata."], "high", ["BLE receiver workflow", "Android USB serial", "external logger import"], ["https://github.com/kenjdavidson/react-native-bluetooth-classic", "https://developer.apple.com/documentation/externalaccessory"]),
    catalog("react-native-usb-serialport-for-android", "GNSS/RTK integration", ["Android"], "USB serial receiver communication.", "Practical Android path for USB GNSS receivers and USB-serial adapters that stream NMEA.", fs(license_name="MIT"), install("npm install react-native-usb-serialport-for-android", "yarn add react-native-usb-serialport-for-android", "Requires native Android build.", "yes", ["Android USB host permission flow"], ["Android only."]), ["USB NMEA receiver", "receiver log capture", "lab test harness"], ["Direct serial path", "no paid cloud"], ["Maintenance and device coverage risk; Android-only."], "high", ["custom native Android module", "Bluetooth receiver", "import NMEA log"], ["https://github.com/bastengao/react-native-usb-serialport-for-android", "https://developer.android.com/develop/connectivity/usb/host"]),
    catalog("serialport", "GNSS/RTK integration", ["Node desktop", "offline preprocessing"], "Serial port access for Node tools.", "Good for companion desktop import/logging tools; not a direct React Native mobile runtime dependency.", fs(license_name="MIT"), install("npm install serialport", "yarn add serialport", "Not for mobile RN runtime.", "not applicable", ["Node native bindings"], ["For Electron/CLI tools; Windows RN should use Windows native serial APIs."]), ["Windows helper logger", "offline NMEA capture", "RTKLIB pipeline launcher"], ["Mature Node serial ecosystem"], ["Not directly usable in iOS/Android RN app."], "medium", ["Windows.Devices.SerialCommunication native module", "RTKLIB str2str"], ["https://github.com/serialport/node-serialport"]),
    catalog("RTKLIB", "GNSS/RTK integration", ["Windows", "Linux", "macOS", "offline preprocessing"], "RTK/PPK GNSS processing toolkit.", "Keep as external CLI/preprocessing for RINEX, base/rover, NTRIP/log workflows where mobile implementation would be too complex.", fs(license_name="BSD-style with RTKLIB clauses", cost_risk="software free; hardware, cellular data, and correction services may not be free.", notes="Review license notice and RTCM/NTRIP/correction-source terms separately."), install("external CLI, not npm", "external CLI, not yarn", "Not Expo/RN package.", "not embedded in MVP", ["native binaries"], ["Can be launched by desktop companion workflow, not mobile app MVP."]), ["PPK post-processing", "RINEX solution QA", "NTRIP client outside app"], ["Proven GNSS processing", "free software"], ["High domain complexity; mobile embedding is not an MVP target."], "medium", ["pygnssutils preprocessing", "receiver vendor software outside app"], ["https://github.com/tomojitakasu/RTKLIB", "https://igs.org/wg/rinex/"]),
    catalog("react-native-paper", "UI/UX", ["iOS", "Android", "Windows support must be validated"], "Material-style React Native UI components.", "Good for durable field forms, mode bars, dialogs, and technician-friendly controls if themed for sunlight and large touch targets.", fs(license_name="MIT"), install("npm install react-native-paper", "yarn add react-native-paper", "Compatible with standard RN; verify Windows target.", "no", ["react-native-vector-icons or icon package"], []), ["equipment forms", "settings", "dialogs", "status panels"], ["Mature", "accessible components"], ["Must be styled for field density and outdoor contrast."], "low", ["Tamagui", "custom components"], ["https://github.com/callstack/react-native-paper"]),
    catalog("react-hook-form", "UI/forms", ["iOS", "Android", "Windows"], "Form state management.", "Useful for equipment configuration, receiver profiles, project metadata, and validation-driven technician workflows.", fs(license_name="MIT"), install("npm install react-hook-form", "yarn add react-hook-form", "JS-only.", "no", [], []), ["span length form", "RTK quality thresholds", "export options"], ["Efficient forms", "works with Zod"], ["Requires good controlled component integration."], "low", ["Formik", "custom form state"], ["https://github.com/react-hook-form/react-hook-form"]),
    catalog("zod", "Validation", ["iOS", "Android", "Windows", "Node"], "Runtime schema validation.", "Provides project-file schema validation, units checks, and import/export guardrails.", fs(license_name="MIT"), install("npm install zod", "yarn add zod", "JS-only.", "no", [], []), ["project JSON validation", "span model validation", "RTK quality payload validation"], ["TypeScript-friendly", "clear errors"], ["Geometry validity still needs geometry-specific checks."], "low", ["Valibot", "io-ts"], ["https://github.com/colinhacks/zod"]),
    catalog("jest", "Testing", ["iOS", "Android", "Windows", "Node"], "Unit and golden-file tests.", "Required for center pivot geometry, projection, NMEA parsing, and scoring tests before field use.", fs(license_name="MIT"), install("npm install --save-dev jest", "yarn add --dev jest", "Works with RN tooling.", "no", [], []), ["geometry tests", "fixtures", "snapshot-free golden JSON"], ["Mature", "fast"], ["Native/e2e behavior needs separate tooling."], "low", ["Vitest for pure TS packages"], ["https://jestjs.io/"]),
    catalog("@testing-library/react-native", "Testing", ["iOS", "Android", "Windows where RN renderer supports tests"], "React Native component tests.", "Validates field workflows, form errors, and offline state transitions without device automation.", fs(license_name="MIT"), install("npm install --save-dev @testing-library/react-native", "yarn add --dev @testing-library/react-native", "Standard RN test dependency.", "no", [], []), ["screen rendering tests", "form validation tests", "workflow state tests"], ["User-centered assertions"], ["Does not test native map/GNSS hardware."], "low", ["Detox", "Maestro"], ["https://callstack.github.io/react-native-testing-library/"]),
    catalog("detox", "Testing", ["iOS", "Android"], "End-to-end mobile testing.", "Useful for validating survey and layout flows in simulators/emulators once native map modules are wired.", fs(license_name="MIT"), install("npm install --save-dev detox", "yarn add --dev detox", "Native app build required.", "yes for e2e targets", ["iOS simulator", "Android emulator"], ["No Windows path."]), ["create project flow", "offline import/export flow", "map tool mode flow"], ["Mature RN e2e tool"], ["Setup cost; hardware GNSS still needs simulation/import tests."], "medium", ["Maestro", "manual field test scripts"], ["https://wix.github.io/Detox/"]),
    catalog("Maestro", "Testing", ["iOS", "Android"], "Black-box mobile UI tests.", "Useful lower-code acceptance flow testing for field technician workflows; verify license and cloud features before adoption.", fs(license_name="Apache-2.0", cost_risk="open-source CLI is free; optional cloud services may have costs and must not be required."), install("CLI install from Maestro docs, not npm package", "not applicable", "Runs against built apps.", "yes for device app", ["mobile emulator/simulator"], ["No primary Windows desktop path."]), ["MVP smoke tests", "survey workflow script"], ["Readable test flows"], ["Avoid relying on paid Maestro Cloud."], "medium", ["Detox", "Appium"], ["https://github.com/mobile-dev-inc/Maestro"]),
]


TS_INTERFACES = [
    """export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectCrs: string;
  unitSystem: 'metric' | 'us_survey_feet';
  sourceJsonVersion: string;
}""",
    """export interface RtkQuality {
  fixType: 'invalid' | 'autonomous' | 'dgps' | 'rtk_float' | 'rtk_fixed' | 'ppp' | 'unknown';
  satellites: number | null;
  hdop: number | null;
  vdop: number | null;
  pdop: number | null;
  correctionAgeSeconds: number | null;
  horizontalAccuracyMeters: number | null;
  verticalAccuracyMeters: number | null;
  baseStationId?: string;
  roverId?: string;
  nmeaQualityCode?: number;
}""",
    """export interface SurveyPoint {
  id: string;
  role: 'boundary' | 'pivot_center' | 'water_source' | 'power_source' | 'obstacle' | 'control' | 'note';
  wgs84: { longitude: number; latitude: number; ellipsoidalHeightMeters?: number };
  projected?: { x: number; y: number; z?: number; crs: string };
  observedAt: string;
  source: 'device_gps' | 'external_gnss' | 'imported' | 'manual';
  rtk?: RtkQuality;
  notes?: string;
}""",
    """export interface PivotMachine {
  id: string;
  name: string;
  spanLengthsMeters: number[];
  overhangMeters: number;
  endGunThrowMeters: number;
  towerClearanceBufferMeters: number;
  machineClearanceBufferMeters: number;
  sweep: FullCircleSweep | PartialCircleSweep;
}""",
    """export interface FullCircleSweep { mode: 'full_circle'; }
export interface PartialCircleSweep {
  mode: 'partial_circle';
  startAngleDegrees: number;
  stopAngleDegrees: number;
  direction: 'clockwise' | 'counterclockwise';
  endGunOnRanges?: Array<{ startAngleDegrees: number; stopAngleDegrees: number }>;
}""",
    """export interface LayoutScenario {
  id: string;
  machineId: string;
  centerPointId?: string;
  centerProjected: { x: number; y: number; crs: string };
  metrics: {
    fieldAcres: number;
    irrigatedAcres: number;
    nonIrrigatedAcres: number;
    coveragePercent: number;
    endGunAcres: number;
    obstacleConflictCount: number;
    hardBoundaryConflictCount: number;
    score: number;
  };
  layers: GeoJSON.FeatureCollection[];
  warnings: string[];
}""",
]


PSEUDOCODE = {
    "load_project": """async function loadProject(path: string): Promise<Project> {
  const raw = await files.readText(path);
  const project = ProjectSchema.parse(JSON.parse(raw));
  assertSupportedSchemaVersion(project.schemaVersion);
  await validateLayerCrs(project.layers, project.metadata.projectCrs);
  return project;
}""",
    "capture_gps_point": """async function captureGpsPoint(role: SurveyPoint['role']): Promise<SurveyPoint> {
  const sample = await gnssProvider.currentSample();
  const rtk = normalizeRtkQuality(sample);
  if (!qualityPolicy.accepts(role, rtk)) throw new Error('GNSS quality is below threshold');
  return {
    id: ids.create(),
    role,
    wgs84: { longitude: sample.lon, latitude: sample.lat, ellipsoidalHeightMeters: sample.heightM },
    observedAt: sample.timestamp,
    source: sample.source,
    rtk,
  };
}""",
    "parse_nmea_sentence": """function parseNmeaSentence(sentence: string): Partial<GnssSample> {
  const parsed = nmea.parse(sentence);
  if (parsed.type === 'GGA') {
    return {
      lat: parsed.latitude,
      lon: parsed.longitude,
      timestamp: parsed.time,
      fixType: mapGgaQuality(parsed.quality),
      satellites: parsed.numSatellites,
      hdop: parsed.hdop,
      correctionAgeSeconds: parsed.dgpsAge ?? null,
    };
  }
  if (parsed.type === 'GST') return { horizontalAccuracyMeters: estimateFromGst(parsed) };
  return {};
}""",
    "convert_wgs84_to_projected": """function convertWgs84ToProjected(point: LonLat, projectCrs: string): XY {
  const transformer = proj4('EPSG:4326', projectCrs);
  const [x, y] = transformer.forward([point.longitude, point.latitude]);
  return { x, y };
}""",
    "build_field_polygon": """function buildFieldPolygon(points: SurveyPoint[]): Polygon {
  const xy = orderedBoundaryPoints(points).map(p => p.projected!);
  const ring = closeRing(removeDuplicateVertices(xy, 0.05));
  const polygon = polygonFromRing(ring);
  const repaired = makeValidOrFail(polygon);
  assertAreaUnitsAreLinear(repaired.crs);
  return repaired;
}""",
    "create_pivot_circle": """function createPivotCircle(center: XY, radiusM: number): Polygon {
  assertPositive(radiusM, 'radiusM');
  return approximateCircle(center, radiusM, { segments: 256 });
}""",
    "create_partial_pivot_sector": """function createPartialPivotSector(center: XY, radiusM: number, sweep: PartialCircleSweep): Polygon {
  const arc = buildArcVertices(center, radiusM, sweep.startAngleDegrees, sweep.stopAngleDegrees, sweep.direction, 256);
  return polygonFromRing([center, ...arc, center]);
}""",
    "calculate_tower_points": """function calculateTowerPoints(center: XY, machine: PivotMachine, angleDeg: number): TowerPoint[] {
  let radius = 0;
  return machine.spanLengthsMeters.map((span, idx) => {
    radius += span;
    return { towerIndex: idx + 1, radiusMeters: radius, point: polarOffset(center, radius, angleDeg) };
  });
}""",
    "clip_coverage_to_field": """function clipCoverageToField(coverage: Polygon, field: Polygon): Polygon {
  return booleanIntersection(coverage, field) ?? emptyPolygon();
}""",
    "subtract_obstacles": """function subtractObstacles(coverage: Polygon, obstacles: Polygon[]): Polygon {
  return obstacles.reduce((current, obstacle) => booleanDifference(current, obstacle) ?? emptyPolygon(), coverage);
}""",
    "score_layout": """function scoreLayout(input: LayoutScoreInput): LayoutScore {
  const acresScore = input.irrigatedAcres * input.weights.irrigatedAcre;
  const dryPenalty = input.dryAcres * input.weights.dryAcrePenalty;
  const conflictPenalty = input.hardConflicts.length * input.weights.hardConflictPenalty;
  const confidencePenalty = input.lowConfidenceInputs.length * input.weights.lowConfidencePenalty;
  return { total: acresScore - dryPenalty - conflictPenalty - confidencePenalty, components: { acresScore, dryPenalty, conflictPenalty, confidencePenalty } };
}""",
    "export_geojson": """async function exportGeojson(project: Project, layerIds: string[], outPath: string): Promise<void> {
  const features = layerIds.flatMap(id => project.layers[id].features);
  const fc = { type: 'FeatureCollection', features, properties: { projectCrs: project.metadata.projectCrs } };
  await files.writeText(outPath, JSON.stringify(fc, null, 2));
}""",
}


def build_main_json(source):
    return {
        "project": {
            "name": "Free React Native Center Pivot Survey Mapping Layout App",
            "purpose": "Developer-ready handoff for a local-first React Native application that captures survey data, imports/exports GIS files, connects to practical GNSS/RTK workflows, models center pivot irrigation geometry, evaluates coverage and conflicts, and supports offline maps without paid APIs or paid cloud dependencies.",
            "base_source_file": str(SOURCE_JSON),
            "target_platforms": ["iOS", "Android", "Windows"],
            "free_cost_policy": "Recommended software must be open-source or otherwise free to use without mandatory subscription, paid API key, paid cloud build, paid map service, or trial-only plan. Hardware, cellular service, RTK correction subscriptions, Apple/Google/Microsoft store enrollment, and legal review may still cost money and are explicitly separated from the software stack.",
            "research_date": RESEARCH_DATE,
            "confidence_level": "High for official documentation, package names, and package license metadata verified on 2026-05-19; medium for cross-platform build practicality because native module support, receiver protocols, and app-store policies can change.",
            "major_constraints": [
                "React Native cannot directly run Shapely, GeoPandas, GDAL, rasterio, RTKLIB, or most Python geospatial libraries inside iOS/Android/Windows without a bridge, native port, WebAssembly build, backend, or preprocessing workflow.",
                "All acre, radius, buffer, tower, and clearance calculations must be performed in a projected CRS with linear units, never directly in WGS84 degrees.",
                "MapLibre React Native is recommended for iOS/Android, but Windows needs a separate strategy such as React Native WebView with OpenLayers/MapLibre GL JS or a Windows native map module.",
                "Offline maps require lawful local tile packages; public OSM tile servers must not be bulk-downloaded or used as a hidden offline tile backend.",
                "RTK-grade accuracy requires paid or already-owned hardware and a lawful correction/base workflow; free software does not make receivers, antennas, radios, or correction networks free.",
                "iOS external GNSS support is easiest with Core Location-compatible receivers or BLE; Bluetooth Classic serial/SPP-style receivers are primarily an Android/Windows path.",
                "Windows support must be validated package by package because many React Native mobile libraries do not ship Windows implementations.",
            ],
            "assumptions": [
                "The MVP is an offline/local-first app with local files and local SQLite, not a paid backend.",
                "The field technician enters verified machine geometry from manufacturer/as-built records.",
                "Free public basemap or imagery data is optional context, not a design-grade boundary source until validated by field survey.",
                "Development can use local build tools; hosted build services are optional and not required.",
                "The source JSON domain rules are preserved unless this React Native handoff explicitly narrows a feature to preprocessing or a later native module.",
            ],
            "non_goals": [
                "No paid Google Maps, Mapbox, Esri/ArcGIS, SaaS GIS, paid RTK correction service, paid satellite imagery, or paid cloud build dependency.",
                "No promise of centimeter accuracy from phone GPS.",
                "No hydraulic, electrical, structural, legal, water-rights, utility locating, or manufacturer safety approval.",
                "No embedded Python geospatial runtime in the mobile MVP.",
                "No unattended scraping or offline caching of public map tiles in violation of provider policies.",
            ],
        },
        "source_json_analysis": {
            "important_findings_reused": [
                "The Python handoff already separates software cost from unavoidable hardware/correction costs.",
                "It treats projected CRS handling as mandatory for all area, buffer, and radius calculations.",
                "It models wet coverage separately from physical machine/tower travel and clearance conflicts.",
                "It requires survey quality metadata and distinguishes RTK-fixed, RTK-float, DGPS, autonomous GPS, imagery digitized, imported CAD, user-estimated, and optimized sources.",
                "It keeps imagery-derived boundaries planning-grade until field validated.",
                "It recommends local/offline formats such as GeoJSON, CSV, GeoPackage, RINEX, GPX, KML, and DXF.",
            ],
            "python_tools_that_translate_well_to_react_native": [
                "pynmea2 concepts translate to a TypeScript NMEA parser, but not the Python package itself.",
                "Shapely geometry workflows translate conceptually to Turf.js, polygon-clipping, JSTS, or native GEOS/Rust modules.",
                "pyproj CRS concepts translate partially to proj4js with explicit EPSG/proj definitions.",
                "GeoPandas layer schemas translate to GeoJSON feature collections plus SQLite tables.",
                "matplotlib/folium review maps translate to MapLibre/OpenLayers/Leaflet map overlays.",
                "pytest fixture discipline translates to Jest golden-file geometry tests.",
            ],
            "python_tools_that_do_not_translate_directly": [
                "GDAL/OGR, rasterio, GeoPandas, Shapely, pyogrio, RTKLIB, OpenDroneMap, and QGIS are not direct mobile React Native dependencies.",
                "Large GeoTIFF/COG rendering is not practical as an in-app raw raster workflow; tile conversion is preferred.",
                "RTKLIB is best kept as an external desktop/offline preprocessing tool rather than embedded in the MVP app.",
                "GeoPackage full GIS semantics are easier to handle through preprocessing than through mobile TypeScript alone.",
                "Advanced optimization from scipy/OR-Tools should begin as deterministic TypeScript grid search, then move to Python/Rust/native if needed.",
            ],
            "domain_logic_to_preserve": source.get("center_pivot_domain_model", {}).get("layout_calculations", []) + source.get("algorithm_handoff", {}).get("coverage_area_calculation", []),
            "workflow_requirements_to_preserve": [
                "Reject calculations in degrees.",
                "Preserve raw survey coordinates and transformed coordinates.",
                "Store CRS and source quality with every layer.",
                "Require technician review for polygon repair, optimized placement, and imagery-derived boundaries.",
                "Export open local files for backup and review.",
            ],
            "risks_inherited_from_source_json": [
                "Receiver protocols and correction workflows vary by hardware.",
                "Imagery can be stale, offset, or too coarse for clearance decisions.",
                "Invalid polygons, missing CRS, and unordered boundary points can silently produce wrong acreage.",
                "Optimizers can produce mathematically attractive but constructability-poor layouts.",
                "Open-source license compatibility still needs legal review before commercial distribution.",
            ],
        },
        "recommended_app_architecture": {
            "architecture_summary": "Use a shared TypeScript domain core for project schema, CRS policy, geometry generation, scoring, import/export normalization, and tests. Use platform-specific shells for GNSS hardware and map rendering: MapLibre React Native on iOS/Android, and a WebView/OpenLayers or MapLibre GL JS path on Windows until a Windows-native map strategy is proven. Keep Python/GDAL/RTKLIB as optional offline preprocessing tools for heavy raster, vector conversion, and GNSS post-processing.",
            "mvp_architecture": [
                "Monorepo with packages/core, packages/geometry, packages/project-store, apps/mobile, and apps/windows.",
                "React Native mobile app using TypeScript and local SQLite/project JSON files.",
                "Manual boundary drawing/editing and GeoJSON/CSV import before live RTK hardware support.",
                "MapLibre React Native for iOS/Android display; WebView map fallback for Windows.",
                "Pure TypeScript center pivot geometry with deterministic tests.",
                "Project package export as ZIP containing project JSON, GeoJSON layers, CSV report, and map package references.",
            ],
            "advanced_architecture": [
                "Native Android module for USB serial GNSS and Bluetooth Classic receiver profiles.",
                "BLE receiver integration for iOS/Android receivers that expose useful NMEA/vendor characteristics.",
                "Windows C++/C# native module for Windows.Devices.SerialCommunication and Geolocation.",
                "Optional Rust/C++ geometry core if TypeScript polygon robustness becomes insufficient.",
                "Offline tile package builder using Python/GDAL/tippecanoe/pmtiles/MBTiles outside the mobile app.",
                "RTKLIB desktop companion workflow for RINEX/PPK and base/rover solution QA.",
            ],
            "offline_first_strategy": [
                "No account or backend required for project creation.",
                "Store canonical project metadata and vector layers locally in SQLite plus exportable JSON/GeoJSON.",
                "Store imagery/basemap packages as user-imported PMTiles/MBTiles or local tile folders with attribution metadata.",
                "Use atomic write patterns: write to temporary file, fsync/close where platform allows, then rename.",
                "Keep a project backup/export command that creates a portable ZIP.",
            ],
            "cross_platform_strategy": [
                "Shared TypeScript packages own domain logic and tests.",
                "Platform adapters implement location, GNSS hardware, file picker, map renderer, and packaging.",
                "Do not assume a mobile native module supports Windows; every dependency gets a Windows status.",
                "Use fixture-driven tests in the shared core before native UI work.",
            ],
            "platform_specific_modules": {
                "ios": [
                    "Core Location adapter for internal device GPS and compatible external GNSS exposed through location services.",
                    "Core Bluetooth adapter for BLE GNSS receiver profiles.",
                    "ExternalAccessory path only for compatible/MFi accessories and later-phase native work.",
                    "MapLibre React Native mobile map renderer.",
                    "Document picker/file import-export adapter.",
                ],
                "android": [
                    "Android location adapter.",
                    "Bluetooth LE adapter through react-native-ble-plx.",
                    "Bluetooth Classic/SPP or custom native module for NMEA receivers.",
                    "USB host/serial native module for USB GNSS receivers.",
                    "MapLibre React Native mobile map renderer.",
                    "Scoped storage/file picker adapter.",
                ],
                "windows": [
                    "React Native Windows application shell.",
                    "Windows.Devices.SerialCommunication native module for GNSS receiver serial ports.",
                    "Windows.Devices.Geolocation adapter.",
                    "WebView/OpenLayers or MapLibre GL JS map renderer.",
                    "MSIX/local installer packaging and filesystem project management.",
                ],
            },
            "where_python_still_fits": [
                "GDAL/ogr2ogr conversion of Shapefile/KML/GeoPackage/DXF into normalized GeoJSON before import.",
                "Raster conversion of GeoTIFF/COG/drone orthomosaics into PMTiles/MBTiles/local tiles.",
                "RTKLIB/pygnssutils/georinex workflows for RINEX, base/rover, and PPK outside the mobile MVP.",
                "Batch validation of project exports and high-precision reference calculations.",
                "Optional advanced optimization prototyping before porting stable logic to TypeScript/Rust.",
            ],
            "where_typescript_should_replace_python": [
                "Project schemas and validation.",
                "Survey point quality filtering.",
                "Pivot circle/sector/tower/end-gun geometry generation.",
                "Coverage scoring, scenario comparison, and report metrics.",
                "GeoJSON import/export for MVP files.",
                "NMEA parsing for GGA/GSA/GST/RMC quality fields once receiver stream access exists.",
            ],
            "where_native_modules_may_be_required": [
                "Android USB serial and Bluetooth Classic GNSS streams.",
                "iOS ExternalAccessory or vendor SDK receiver access.",
                "Windows serial port GNSS streams.",
                "High-performance geometry if TypeScript polygon operations fail tolerance tests.",
                "Large local file access and background location behavior, depending platform restrictions.",
            ],
        },
        "recommended_stack": {
            "minimum_viable_stack": ["react-native", "TypeScript", "zod", "@turf/turf", "proj4", "polygon-clipping", "rbush", "react-native-webview", "ol", "@react-navigation/native", "react-native-screens", "react-native-safe-area-context", "react-native-quick-sqlite or expo-sqlite for mobile", "react-native-fs or expo-file-system", "react-hook-form", "react-native-paper", "jest"],
            "advanced_stack": ["@maplibre/maplibre-react-native", "pmtiles", "MBTiles", "react-native-ble-plx", "react-native-bluetooth-classic", "react-native-usb-serialport-for-android", "react-native-windows native modules", "RTKLIB offline workflow", "GDAL/ogr2ogr preprocessing", "Rust/C++ geometry core optional"],
            "mapping_stack": ["@maplibre/maplibre-react-native for iOS/Android", "react-native-webview + OpenLayers or MapLibre GL JS for Windows and fallback", "PMTiles/MBTiles/local tiles for offline maps", "OpenStreetMap-derived data only with ODbL attribution and lawful tile generation"],
            "geospatial_math_stack": ["proj4", "@turf/turf", "polygon-clipping", "rbush", "geokdbush", "geographiclib-geodesic", "JSTS optional after license review", "native GEOS/Rust deferred until precision tests require it"],
            "rtk_gnss_stack": ["internal device location first", "TypeScript NMEA parser", "react-native-ble-plx for BLE GNSS", "Android Bluetooth Classic/USB serial native paths", "Windows SerialCommunication native module", "RTKLIB/RINEX as offline preprocessing"],
            "storage_stack": ["SQLite canonical store", "GeoJSON project/layer export", "ZIP project package", "AsyncStorage/MMKV only for settings", "PMTiles/MBTiles for map packages", "@nozbe/watermelondb optional", "realm deferred"],
            "ui_stack": ["@react-navigation/native", "react-native-screens", "react-native-safe-area-context", "react-native-paper or custom field UI", "react-hook-form", "zod", "large touch targets", "offline status and GNSS quality panels"],
            "testing_stack": ["jest", "@testing-library/react-native", "Detox for iOS/Android", "Maestro optional CLI", "golden GeoJSON fixtures", "NMEA log fixtures", "projection roundtrip tests"],
            "build_packaging_stack": ["local Xcode/Android Studio/Gradle builds", "React Native Windows with Visual Studio and MSIX", "Expo prebuild/development builds only when compatible", "no mandatory hosted EAS, App Center, or paid CI"],
        },
        "tool_catalog": TOOL_CATALOG,
        "platform_feasibility": {
            "ios": {
                "feasibility": "Feasible for manual layout, internal GPS, BLE-compatible external GNSS, offline project files, and MapLibre mobile maps. Higher-risk for Bluetooth Classic serial receivers and any receiver requiring ExternalAccessory/MFi/vendor SDK.",
                "gps_gnss_notes": [
                    "Core Location can supply phone GPS and some external receiver positions, but app must expose quality limitations and not treat phone GPS as RTK.",
                    "BLE GNSS receivers are the most practical external receiver path if they expose usable services.",
                    "NMEA over arbitrary Bluetooth Classic SPP is not a normal iOS app path.",
                ],
                "bluetooth_serial_notes": [
                    "Use Core Bluetooth/BLE where receiver supports it.",
                    "ExternalAccessory may be required for non-BLE accessories; compatibility and program requirements are hardware-specific.",
                ],
                "mapping_notes": ["MapLibre React Native for mobile native map.", "WebView/OpenLayers fallback for shared editor experiments."],
                "build_distribution_cost_risks": [
                    "Xcode and simulator development are free, but Apple Developer Program enrollment may be required for broad device testing, TestFlight, and App Store distribution.",
                    "Local builds are possible; do not require hosted EAS.",
                ],
                "required_permissions": ["Location When In Use", "Precise Location where applicable", "Bluetooth usage descriptions", "Local network/files/photos only if needed for import/export"],
            },
            "android": {
                "feasibility": "Strongest field GNSS platform because Android supports internal location, BLE, Bluetooth Classic, USB host, local files, and sideload/local APK workflows.",
                "gps_gnss_notes": [
                    "Internal location is useful for planning-grade capture only unless paired with external receiver data.",
                    "External GNSS can stream NMEA over BLE, Bluetooth Classic, or USB depending receiver.",
                    "Expose fix type, DOP, satellites, correction age, and estimated accuracy prominently.",
                ],
                "bluetooth_serial_notes": ["BLE path through react-native-ble-plx.", "Bluetooth Classic/SPP likely requires Android-specific package or custom native module."],
                "usb_serial_notes": ["USB host permissions are runtime/device-specific.", "Use a native Android USB serial adapter for supported chipsets and keep import-from-log as fallback."],
                "mapping_notes": ["MapLibre React Native is recommended for mobile map.", "Offline tiles stored locally with attribution metadata."],
                "build_distribution_cost_risks": ["Local debug/release APK builds and sideloading can be free.", "Google Play distribution may require a developer account fee."],
                "required_permissions": ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION where applicable", "BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "USB device permission", "Foreground service/background location only if a later workflow requires it", "File picker/scoped storage permissions as needed"],
            },
            "windows": {
                "feasibility": "Feasible as a desktop/field-laptop companion using React Native Windows, local files, WebView mapping, and native serial modules. Not all mobile RN packages carry over.",
                "gps_gnss_notes": ["Use Windows Geolocation for internal/location-provider data.", "Use native serial communication for USB/serial GNSS receivers where permitted."],
                "serial_port_notes": ["Implement a RNW native module over Windows.Devices.SerialCommunication.", "Node serialport is useful for companion CLI/Electron tools, not direct RNW runtime."],
                "mapping_notes": ["Prefer WebView/OpenLayers or MapLibre GL JS local map bundle.", "Native mobile MapLibre package should not be assumed to support Windows."],
                "build_distribution_cost_risks": ["Local MSIX/sideload packaging can avoid store costs.", "Microsoft Store account cost/status should be verified at publishing time."],
                "required_permissions": ["Location capability if using geolocation", "serialCommunication/device capabilities in app manifest", "file system picker permissions/capabilities as needed"],
            },
        },
        "domain_data_models": {
            "typescript_interfaces": TS_INTERFACES,
            "geojson_models": [
                "Field boundary: GeoJSON Polygon/MultiPolygon with properties {layerType:'field_boundary', sourceConfidence, crs, areaSqM, areaAcres}.",
                "Obstacle: Point/LineString/Polygon converted to buffered Polygon for clearance calculations with properties {obstacleType, bufferMeters, hardConflict, noSpray}.",
                "Pivot coverage: generated Polygon/MultiPolygon with properties {scenarioId, coverageType:'base'|'end_gun'|'clipped'|'dry_corner'}.",
                "Tower locations: Point features with towerIndex, radiusMeters, angleDegrees, scenarioId.",
                "Tower tracks: LineString/Polygon features for circle/arc plus buffer where clearance is modeled.",
            ],
            "pivot_machine_models": [
                "spanLengthsMeters is an ordered array from pivot outward.",
                "towerRadiusMeters is derived as cumulative span length.",
                "machineRadiusMeters = sum(spanLengthsMeters) + overhangMeters unless manufacturer package defines a different wet radius.",
                "endGunRadiusMeters = machineRadiusMeters + endGunThrowMeters when enabled.",
                "Sweep supports full_circle and partial_circle with direction and wrap handling.",
            ],
            "survey_models": [
                "SurveyPoint stores WGS84 raw coordinates, optional projected coordinates, timestamp, source, role, notes, and RTK quality.",
                "SurveyTrack stores ordered point ids, role, quality policy used, simplification tolerance, and repair log.",
                "SourceConfidence enum must be visible in reports.",
            ],
            "rtk_quality_models": [
                "Map NMEA GGA quality codes to invalid/autonomous/dgps/rtk_float/rtk_fixed where possible.",
                "Store HDOP/VDOP/PDOP, satellites, correction age, estimated accuracy, base station id, rover id, antenna height where provided.",
                "QualityPolicy defines acceptable fix types and thresholds per feature role.",
            ],
            "project_file_schema": [
                "Canonical project JSON contains metadata, CRS, units, machines, layers, scenarios, map packages, imports, exports, and validation logs.",
                "Large binary tile/imagery files are referenced by relative path in the project package, not embedded in JSON.",
                "All files exported as a project ZIP should include a manifest with checksums and source/license metadata.",
            ],
            "units_and_conversions": [
                "1 acre = 4046.8564224 square meters.",
                "1 acre = 43560 square feet.",
                "Store canonical linear units in meters internally; render feet/acres for US field workflows as configured.",
                "Angles must have one internal convention documented in code; convert display conventions at UI boundaries.",
            ],
        },
        "core_algorithms": {
            "field_boundary_processing": source.get("algorithm_handoff", {}).get("field_boundary_processing", []) + ["In TypeScript MVP, accept ordered survey points and GeoJSON first; defer Shapefile/KMZ/GeoPackage to preprocessing until import tests are stable."],
            "crs_projection_handling": source.get("algorithm_handoff", {}).get("coordinate_reference_system_handling", []) + ["Ship explicit proj4 definitions for supported UTM/State Plane project CRS choices; require user confirmation when CRS is missing."],
            "pivot_circle_generation": ["Generate projected-coordinate circle vertices at configurable segment count.", "Use high enough resolution for acreage tolerance; include tolerance in report.", "Keep base machine wet radius separate from end-gun radius and machine travel clearance."],
            "partial_circle_arc_generation": source.get("algorithm_handoff", {}).get("partial_circle_modeling", []),
            "tower_location_generation": source.get("algorithm_handoff", {}).get("tower_and_span_modeling", []),
            "end_gun_coverage_generation": source.get("algorithm_handoff", {}).get("end_gun_modeling", []),
            "obstacle_exclusion": source.get("algorithm_handoff", {}).get("obstacle_exclusion", []),
            "coverage_area_calculation": source.get("algorithm_handoff", {}).get("coverage_area_calculation", []),
            "best_fit_pivot_placement": ["Phase 1: fixed/user-selected center only.", "Phase 2: deterministic grid search inside allowed center zone.", "Phase 3: refine top candidates with local optimizer or Rust/Python sidecar if needed.", "Always return top N candidates and rejection reasons, not only the best score."],
            "multi_pivot_layout": source.get("algorithm_handoff", {}).get("multi_pivot_layout", []),
            "survey_accuracy_scoring": ["Score by fix type, repeated observations, DOP, satellite count, correction age, source confidence, and role criticality.", "Make low-confidence geometry visible in warnings and reports.", "Do not allow design-grade acceptance if required roles lack quality metadata unless user explicitly downgrades the project."],
            "rtk_quality_filtering": source.get("algorithm_handoff", {}).get("accuracy_error_handling", []),
        },
        "workflow_blueprints": {
            "mvp_manual_layout_workflow": {
                "steps": ["Create project and choose CRS/units.", "Draw or import field boundary as GeoJSON/CSV.", "Mark pivot center, water source, power source, roads, fences, buildings, ditches, trees, and exclusion zones.", "Enter machine span lengths, overhang, end-gun throw, and sweep mode.", "Generate base/end-gun/tower geometry.", "Clip coverage to field and subtract exclusions.", "Review acres, coverage percent, dry corners, and conflicts.", "Export project ZIP, GeoJSON, CSV report, and optional static map."],
                "inputs": ["field boundary", "machine geometry", "obstacle layers", "project CRS", "buffer rules"],
                "outputs": ["layout scenario", "coverage layers", "conflict report", "project package"],
                "tools": ["React Native", "proj4", "polygon-clipping", "@turf/turf", "SQLite", "MapLibre/OpenLayers"],
                "validation_checks": ["CRS is projected", "span lengths positive", "polygon valid", "area tolerance met", "hard conflicts displayed"],
            },
            "gps_boundary_survey_workflow": {
                "steps": ["Select capture mode.", "Show live accuracy/fix status.", "Capture ordered boundary points or import track.", "Filter points by quality policy.", "Project points to project CRS.", "Build/repair polygon and log changes.", "Compare area against expected acres.", "Require technician approval."],
                "inputs": ["device GPS or external GNSS samples", "quality thresholds", "operator notes"],
                "outputs": ["survey points", "field polygon", "QA log"],
                "tools": ["Core Location/Android Location/Windows Geolocation", "NMEA parser", "proj4", "geometry core"],
                "validation_checks": ["min point count", "acceptable fix type", "HDOP/correction thresholds", "self-intersection check", "manual review"],
            },
            "rtk_receiver_workflow": {
                "steps": ["Choose receiver profile and transport.", "Connect via BLE/Bluetooth Classic/USB/serial depending platform.", "Parse NMEA and optional vendor quality fields.", "Display fix type, DOP, satellites, correction age, and estimated accuracy.", "Apply role-specific quality policy.", "Log raw stream where user enables it.", "Store accepted points with metadata.", "Allow RINEX/RTKLIB preprocessing import for advanced QA."],
                "inputs": ["receiver stream", "quality policy", "antenna height", "base/rover metadata"],
                "outputs": ["accepted survey points", "raw log", "quality report"],
                "tools": ["react-native-ble-plx", "Android Bluetooth/USB native modules", "Windows serial native module", "RTKLIB offline"],
                "platform_notes": ["iOS BLE/Core Location first; ExternalAccessory later.", "Android has strongest receiver-transport options.", "Windows serial module is native work."],
                "validation_checks": ["fix type accepted", "correction age under threshold", "repeated point residual under tolerance", "base/rover metadata present for RTK records"],
            },
            "offline_map_package_workflow": {
                "steps": ["Select lawful source data.", "Generate vector/raster tiles offline using documented tools.", "Package as PMTiles or MBTiles.", "Store attribution/license metadata.", "Import package into app.", "Render with MapLibre/OpenLayers.", "Validate extent, zooms, and attribution display."],
                "inputs": ["OSM extract or user-owned imagery", "style JSON", "AOI", "license metadata"],
                "outputs": ["PMTiles/MBTiles package", "map manifest", "attribution text"],
                "tools": ["PMTiles", "MBTiles", "GDAL/tippecanoe/tilemaker optional preprocessing", "MapLibre/OpenLayers"],
                "licensing_notes": ["OSM data is ODbL and needs attribution.", "Do not bulk download public OSM tiles.", "Public/user imagery terms must be stored with package."],
                "validation_checks": ["package opens offline", "attribution visible", "AOI/zoom limits match project", "no hidden paid API calls"],
            },
            "imagery_import_workflow": {
                "steps": ["Accept user-supplied GeoTIFF/COG/orthomosaic as source.", "Inspect CRS, bounds, resolution, nodata, and file size.", "If large, require offline tiling to PMTiles/MBTiles.", "Import tile package and manifest.", "Overlay field/pivot geometry.", "Mark imagery-derived features planning-grade until survey validated."],
                "inputs": ["GeoTIFF/COG/orthomosaic/tiles", "GCP metadata optional", "license metadata"],
                "outputs": ["local imagery package", "preview layer", "imagery QA report"],
                "tools": ["geotiff.js for metadata/small previews", "GDAL preprocessing", "PMTiles/MBTiles"],
                "risks": ["large raster memory", "stale/offset imagery", "unknown CRS", "license uncertainty"],
                "validation_checks": ["CRS known", "bounds match field", "known control point offset checked", "file size under device limits"],
            },
            "export_reporting_workflow": {
                "steps": ["Validate project.", "Generate metrics.", "Write GeoJSON layers.", "Write CSV report.", "Write project manifest/checksums.", "Package ZIP.", "Optionally create printable PDF/static map in later phase."],
                "inputs": ["project", "scenario", "selected export formats"],
                "outputs": ["project ZIP", "GeoJSON", "CSV", "report JSON"],
                "tools": ["SQLite", "file system adapter", "GeoJSON writer", "CSV writer"],
                "validation_checks": ["schema valid", "all referenced files exist", "CRS metadata included", "attribution included", "round-trip import test passes"],
            },
        },
        "screen_and_feature_spec": {
            "screens": ["Project list", "Project setup", "Map workspace", "Survey capture", "Receiver connection", "Field boundary editor", "Obstacle/exclusion editor", "Pivot layout editor", "Machine configuration", "Scenario comparison", "Export/report", "Settings/about/licenses"],
            "field_work_modes": ["pan/inspect", "capture point", "draw boundary", "edit vertices", "mark obstacle", "measure distance/area", "place pivot", "simulate sweep", "review conflicts"],
            "map_tools": ["large mode buttons", "snap toggle", "undo/redo", "vertex add/move/delete", "buffer editor", "layer visibility", "GPS follow", "offline map package selector"],
            "survey_tools": ["point capture", "track capture", "quality gate", "repeat observation", "notes/photos optional", "raw NMEA logging optional"],
            "pivot_layout_tools": ["set center", "enter radius/machine", "full circle", "partial circle", "end-gun toggle/ranges", "tower locations", "dry corner display", "clearance conflict list"],
            "equipment_configuration_tools": ["span length list", "overhang", "end gun throw", "clearance buffers", "manufacturer/model notes", "angle convention", "units"],
            "export_import_tools": ["GeoJSON", "CSV", "project ZIP", "KML/GPX import", "PMTiles/MBTiles import", "NMEA log import", "deferred DXF/Shapefile via preprocessing"],
            "settings": ["units", "default CRS policy", "quality thresholds", "attribution text", "receiver profiles", "offline storage location", "license acknowledgements"],
        },
        "file_format_support": {
            "import_formats": ["GeoJSON", "CSV lat/lon", "CSV projected x/y", "GPX/KML through @tmcw/togeojson", "project ZIP", "NMEA log", "PMTiles/MBTiles map packages"],
            "export_formats": ["project ZIP", "GeoJSON", "CSV metrics", "CSV survey points", "report JSON", "KML deferred", "DXF deferred/preprocessing"],
            "offline_map_formats": ["PMTiles recommended", "MBTiles supported with adapter", "local XYZ/TMS folder optional", "GeoPackage tiles deferred"],
            "imagery_formats": ["PMTiles/MBTiles raster tiles recommended", "GeoTIFF/COG metadata/small preview only", "drone orthomosaic through offline tiling workflow"],
            "rtk_gnss_formats": ["NMEA live/log", "RINEX import/preprocessing", "RTKLIB solution files optional", "receiver binary logs deferred by vendor"],
            "unsupported_or_deferred_formats": ["Raw Shapefile in MVP", "full GeoPackage editing in MVP", "large raw GeoTIFF rendering in app", "vendor GNSS binary protocols", "paid API basemaps"],
        },
        "sample_typescript_pseudocode": PSEUDOCODE,
        "development_context_files": [
            {"file_name": "README_DEVELOPMENT_HANDOFF.md", "purpose": "Plain-English package overview.", "required_contents": ["app summary", "target users", "platforms", "MVP/advanced scope", "free policy"]},
            {"file_name": "PRODUCT_REQUIREMENTS.md", "purpose": "Product and field workflow requirements.", "required_contents": ["personas", "features", "non-goals", "acceptance criteria", "outdoor constraints"]},
            {"file_name": "TECHNICAL_ARCHITECTURE.md", "purpose": "React Native architecture and module strategy.", "required_contents": ["monorepo", "native modules", "offline storage", "mapping", "RTK", "Windows"]},
            {"file_name": "FREE_OPEN_SOURCE_STACK_AUDIT.md", "purpose": "Dependency license/cost audit.", "required_contents": ["package", "license", "cost risk", "status", "sources"]},
            {"file_name": "GEOSPATIAL_ALGORITHM_SPEC.md", "purpose": "Domain algorithm implementation spec.", "required_contents": ["pivot geometry", "CRS", "coverage", "scoring"]},
            {"file_name": "RTK_GNSS_INTEGRATION_SPEC.md", "purpose": "Receiver and RTK workflow spec.", "required_contents": ["NMEA", "transport", "quality", "RTKLIB/RINEX"]},
            {"file_name": "OFFLINE_MAPPING_AND_IMAGERY_SPEC.md", "purpose": "Map and imagery package spec.", "required_contents": ["PMTiles", "MBTiles", "OSM attribution", "GeoTIFF workflow"]},
            {"file_name": "DATA_MODEL_TYPESCRIPT_SPEC.md", "purpose": "TypeScript schema spec.", "required_contents": ["interfaces", "GeoJSON", "project file"]},
            {"file_name": "UI_UX_SCREEN_SPEC.md", "purpose": "Screens and field UI behavior.", "required_contents": ["screens", "tools", "outdoor usability"]},
            {"file_name": "TESTING_VALIDATION_PLAN.md", "purpose": "Test plan and fixtures.", "required_contents": ["unit", "geometry", "GPS simulation", "cross-platform"]},
            {"file_name": "AGENTIC_DEVELOPMENT_TASKS.json", "purpose": "Ordered coding-agent tasks.", "required_contents": ["objective", "inputs", "outputs", "dependencies", "success criteria"]},
            {"file_name": "PACKAGE_INSTALLATION_NOTES.md", "purpose": "Install and build notes.", "required_contents": ["npm commands", "Expo/bare warnings", "Windows setup"]},
            {"file_name": "MVP_BUILD_PLAN.md", "purpose": "Smallest useful build plan.", "required_contents": ["what to build", "what to delay", "accuracy from day one"]},
        ],
        "risk_register": [
            {"risk": "Incorrect CRS or measuring in degrees.", "why_it_matters": "Acreage, radius, tower locations, buffers, and conflicts become wrong.", "mitigation": "Require projected CRS before calculations; unit tests reject EPSG:4326 calculations.", "severity": "critical", "applies_to": ["geometry", "survey", "reports"]},
            {"risk": "Map package appears free but relies on prohibited tile caching.", "why_it_matters": "Violates tile provider policies and can fail offline.", "mitigation": "Use lawful local PMTiles/MBTiles from licensed data; store attribution.", "severity": "high", "applies_to": ["mapping"]},
            {"risk": "External GNSS receiver protocol unsupported on iOS.", "why_it_matters": "Field RTK capture may work on Android but not iOS.", "mitigation": "Profile receivers by platform; BLE/Core Location first on iOS; import logs fallback.", "severity": "high", "applies_to": ["iOS", "RTK/GNSS"]},
            {"risk": "TypeScript polygon operations fail on complex invalid geometry.", "why_it_matters": "Coverage/dry-corner outputs can be wrong.", "mitigation": "Validate/repair inputs, add golden fixtures, keep Python/GDAL/GEOS preprocessing fallback.", "severity": "high", "applies_to": ["geometry"]},
            {"risk": "Windows package gap.", "why_it_matters": "Mobile RN dependencies may not build on RNW.", "mitigation": "Use adapter interfaces and WebView/Windows-native modules; test Windows from phase 1.", "severity": "high", "applies_to": ["Windows"]},
            {"risk": "RTK quality overstated.", "why_it_matters": "Bad pivot center or obstacle position can cause real construction conflicts.", "mitigation": "Prominent fix-quality display, thresholds, repeated observations, and report warnings.", "severity": "critical", "applies_to": ["survey", "RTK/GNSS"]},
            {"risk": "Large imagery crashes app.", "why_it_matters": "Drone orthomosaics and COGs can exceed mobile memory.", "mitigation": "Tile imagery offline and import PMTiles/MBTiles; use geotiff.js for metadata/small previews only.", "severity": "medium", "applies_to": ["imagery"]},
            {"risk": "License incompatibility.", "why_it_matters": "Commercial distribution obligations may be missed.", "mitigation": "Keep license audit in repo; mark JSTS/RTKLIB/OpenDroneMap/QGIS review-gated.", "severity": "medium", "applies_to": ["legal", "distribution"]},
        ],
        "development_roadmap": {
            "phase_1_mvp_manual_layout": ["Create monorepo and shared TypeScript domain packages.", "Implement project schema, unit conversion, CRS policy.", "Implement manual map workspace and GeoJSON/CSV import.", "Implement pivot circle/sector/tower/end-gun geometry.", "Implement coverage/clipping/obstacle metrics and reports.", "Export project ZIP/GeoJSON/CSV."],
            "phase_2_gps_survey_capture": ["Add internal GPS capture adapter.", "Add NMEA log import and parser fixtures.", "Add survey quality policies.", "Add boundary track capture and polygon builder.", "Add repeated observation QA."],
            "phase_3_offline_mapping": ["Add PMTiles/MBTiles import manifest.", "Add mobile MapLibre local source path.", "Add Windows WebView/OpenLayers package viewer.", "Add OSM attribution and no-public-tile-cache guardrails."],
            "phase_4_rtk_gnss_integration": ["Add BLE receiver profile abstraction.", "Prototype Android USB serial.", "Prototype Android Bluetooth Classic.", "Prototype Windows serial native module.", "Add RTK quality dashboard and raw log export.", "Add RTKLIB/RINEX preprocessing import workflow."],
            "phase_5_imagery_import": ["Add GeoTIFF metadata inspection.", "Add offline tiling tool instructions.", "Import raster PMTiles/MBTiles.", "Overlay imagery with survey geometry.", "Add imagery QA/control point checks."],
            "phase_6_optimization_and_reporting": ["Add deterministic best-fit grid search.", "Add multi-scenario comparison.", "Add top-N ranking and rejection explanations.", "Add printable report/PDF path.", "Consider Rust/C++ geometry if tests require robustness/performance."],
        },
        "acceptance_criteria": [
            "The app can create a project offline, choose a projected CRS, and save/reopen locally.",
            "The app refuses acre/radius/buffer calculations in EPSG:4326 degrees.",
            "A technician can draw/import a field boundary, obstacles, pivot center, water/power sources, and machine dimensions.",
            "The app generates full-circle and partial-circle coverage, tower points/tracks, end-gun coverage, dry corners, conflicts, irrigated acres, non-irrigated acres, and percent coverage.",
            "GeoJSON/CSV/project ZIP export round trips through import tests.",
            "Every map/imagery package has attribution/license metadata and no hidden paid tile API dependency.",
            "GPS/RTK points store fix type, DOP, satellites, correction age, and accuracy where available.",
            "iOS, Android, and Windows platform gaps are documented in code and UI, not hidden.",
            "The dependency audit contains licenses, cost risks, and official sources for every recommended dependency.",
        ],
        "recommended_next_agent_tasks": [
            "Scaffold the TypeScript monorepo and project schema package.",
            "Build geometry fixture tests for square, quarter-section, irregular, partial-circle, obstacle, and CRS roundtrip cases.",
            "Implement pure TypeScript pivot geometry before any native GNSS work.",
            "Prototype MapLibre iOS/Android and WebView/OpenLayers Windows map adapters behind one interface.",
            "Implement file/project ZIP import-export and license/attribution manifest.",
            "Prototype Android NMEA log import, then BLE/USB/Classic live streams after fixtures pass.",
        ],
        "sources": SOURCES,
    }


def md_table(rows, headers):
    line = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join(["---"] * len(headers)) + " |"
    body = ["| " + " | ".join(str(cell).replace("\n", " ") for cell in row) + " |" for row in rows]
    return "\n".join([line, sep] + body)


def write_text(path: Path, content: str):
    path.write_text(content.strip() + "\n", encoding="utf-8")


def generate_files(out: Path, main):
    with (out / "center_pivot_react_native_development_handoff.json").open("w", encoding="utf-8") as f:
        json.dump(main, f, indent=2)
        f.write("\n")

    readme = f"""
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
"""
    write_text(out / "README_DEVELOPMENT_HANDOFF.md", readme)

    product = """
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
"""
    write_text(out / "PRODUCT_REQUIREMENTS.md", product)

    architecture = """
# Technical Architecture

## Architecture Summary

Use a shared TypeScript domain core and isolate every platform-specific capability behind adapters. The main technical boundary is that Python GIS packages do not run directly inside React Native mobile apps. Heavy Python/GDAL/RTKLIB workflows remain offline preprocessing or companion tooling.

## Proposed Monorepo

```text
apps/
  mobile/             # iOS/Android React Native or Expo prebuild app
  windows/            # React Native Windows app
packages/
  core/               # project schema, units, CRS policy, validation
  geometry/           # pivot circles, sectors, towers, clipping, scoring
  gnss/               # NMEA parsing, quality policies, receiver interfaces
  project-store/      # SQLite, project ZIP, GeoJSON/CSV import/export
  map-adapters/       # MapLibre mobile and WebView map abstraction
  ui/                 # shared field UI components where portable
fixtures/
  geometry/
  nmea/
  projects/
tools/
  preprocess/         # optional Python/GDAL/RTKLIB workflows
```

## React Native Foundation

The MVP can start with Expo prebuild/development builds for iOS/Android, but not Expo Go, because MapLibre and GNSS receiver access require native modules. A bare React Native app is also valid. Windows is separate through React Native Windows.

## TypeScript Module Structure

- `core`: Zod schemas, units, project metadata, CRS definitions, source-confidence enums.
- `geometry`: pure functions with no React dependency.
- `gnss`: parser and quality policies separated from transport.
- `project-store`: persistence, import/export, migrations.
- `map-adapters`: common map commands and events.
- `native-adapters`: per-platform implementations for location, Bluetooth, USB, serial, files.

## Native Module Strategy

- iOS: Core Location and Core Bluetooth first; ExternalAccessory only for compatible hardware and later native work.
- Android: Android Location, BLE, Bluetooth Classic, and USB host modules.
- Windows: C++/C# native modules for SerialCommunication and Geolocation.

Every native adapter should implement a shared interface so the app can fall back to manual import when hardware access is unavailable.

## Offline-First Storage

Use SQLite for project state and survey logs. Use JSON/GeoJSON/CSV for export. Use PMTiles/MBTiles as referenced files in the project package. AsyncStorage/MMKV should only store settings and last-opened project state.

## Mapping/Rendering Approach

- iOS/Android: `@maplibre/maplibre-react-native`.
- Windows: `react-native-webview` with OpenLayers or MapLibre GL JS.
- Basemaps: PMTiles/MBTiles/local tile packages only.
- Overlays: GeoJSON field boundaries, pivot sectors, towers, tracks, obstacles, and survey points.

## Python-to-TypeScript Migration Notes

Port these to TypeScript first: project schema, NMEA parsing, pivot geometry, tower locations, coverage scoring, and GeoJSON export.

Keep these outside the mobile app: GDAL/OGR conversion, raw GeoTIFF tiling, RTKLIB processing, OpenDroneMap, QGIS, and heavy optimization prototypes.

## Windows Support Strategy

Windows is a first-class target but not package-compatible with every mobile dependency. Build the Windows shell early, use WebView maps, and implement serial GNSS as a native Windows module after the pure TypeScript geometry core is stable.
"""
    write_text(out / "TECHNICAL_ARCHITECTURE.md", architecture)

    audit_rows = []
    for item in TOOL_CATALOG:
        audit_rows.append([
            item["name"],
            ", ".join(item["platforms"]),
            item["free_status"]["license"],
            "free" if item["free_status"]["is_free"] else "not free",
            item["free_status"]["cost_risk"],
            item["risk_level"],
            "recommended" if item["risk_level"] in ("low", "medium") else "optional/deferred",
        ])
    audit = "# Free/Open-Source Stack Audit\n\n" + md_table(audit_rows, ["Dependency", "Platforms", "License", "Cost status", "Hidden-cost risk", "Risk", "Status"])
    audit += """

## NPM Metadata Snapshot

Verified with `npm view` on 2026-05-19. Use this as a starting point, then re-run package metadata checks before implementation because versions and platform support can change.

| Package | Version observed | License observed |
| --- | --- | --- |
| `react-native` | 0.85.3 | MIT |
| `expo` | 55.0.24 | MIT |
| `@maplibre/maplibre-react-native` | 11.2.1 | MIT |
| `react-native-maps` | 1.27.2 | MIT |
| `@turf/turf` | 7.3.5 | MIT |
| `proj4` | 2.20.8 | MIT |
| `jsts` | 2.12.1 | EDL-1.0 OR EPL-1.0 |
| `polygon-clipping` | 0.15.7 | MIT |
| `rbush` | 4.0.1 | MIT |
| `geokdbush` | 2.1.0 | ISC |
| `geographiclib-geodesic` | 2.2.0 | MIT |
| `geotiff` | 3.0.5 | MIT |
| `shapefile` | 0.6.6 | BSD-3-Clause |
| `@tmcw/togeojson` | 7.1.2 | BSD-2-Clause |
| `pmtiles` | 4.4.1 | BSD-3-Clause |
| `react-native-webview` | 13.16.1 | MIT |
| `react-native-quick-sqlite` | 8.2.7 | MIT |
| `expo-sqlite` | 55.0.16 | MIT |
| `expo-file-system` | 55.0.20 | MIT |
| `@nozbe/watermelondb` | 0.28.0 | MIT |
| `realm` | 20.2.0 | Apache-2.0 |
| `@react-native-async-storage/async-storage` | 3.0.2 | MIT |
| `react-native-mmkv` | 4.3.1 | MIT |
| `react-native-fs` | 2.20.0 | MIT |
| `react-native-ble-plx` | 3.5.1 | MIT |
| `react-native-bluetooth-classic` | 1.73.0-rc.17 | MIT |
| `react-native-usb-serialport-for-android` | 0.5.0 | MIT |
| `serialport` | 13.0.0 | MIT |
| `@react-navigation/native` | 7.2.4 | MIT |
| `react-native-screens` | 4.25.1 | MIT |
| `react-native-safe-area-context` | 5.8.0 | MIT |
| `react-native-paper` | 5.15.2 | MIT |
| `react-hook-form` | 7.76.0 | MIT |
| `zod` | 4.4.3 | MIT |
| `jest` | 30.4.2 | MIT |
| `@testing-library/react-native` | 13.3.3 | MIT |
| `detox` | 20.50.4 | MIT |

## Confirmed-Free Core Recommendations

- `react-native`, TypeScript, `zod`, `@turf/turf`, `proj4`, `polygon-clipping`, `rbush`, `react-hook-form`, `jest`, and React Native Testing Library are suitable core dependencies.
- `@maplibre/maplibre-react-native` is recommended for iOS/Android map rendering, but Windows needs a separate map path.
- `pmtiles` and MBTiles are recommended local/offline package formats, not data licenses by themselves.

## Optional Or Review-Gated

- `jsts`: useful geometry option, but license differs from the MIT-heavy stack.
- `react-native-bluetooth-classic`: Android-heavy and receiver-specific.
- `react-native-usb-serialport-for-android`: Android-only and maintenance/device support must be validated.
- RTKLIB: free software, but keep external to the MVP and review license notices/correction-source terms.
- OpenDroneMap/QGIS/GDAL Python workflows: useful preprocessing, not embedded app dependencies.

## Excluded

- Google Maps paid APIs.
- Mapbox paid plans and Mapbox-hosted tiles.
- Esri/ArcGIS paid services.
- Paid RTK correction services as a required dependency.
- Paid satellite imagery or trial-only imagery products.
- Hosted cloud builds as a required workflow.

## Source Links

See `center_pivot_react_native_development_handoff.json` `sources` for official documentation and repository links.
"""
    write_text(out / "FREE_OPEN_SOURCE_STACK_AUDIT.md", audit)

    geo = """
# Geospatial Algorithm Spec

## Core Rule

Never calculate acres, machine radius, tower position, buffer distance, or clearance in EPSG:4326 degrees. Transform WGS84 survey coordinates into the project CRS first.

## Field Polygon Processing

1. Import ordered boundary points or GeoJSON polygon.
2. Confirm or assign source CRS.
3. Project to the project CRS.
4. Remove duplicate vertices below tolerance.
5. Close ring.
6. Detect self-intersections and invalid rings.
7. Repair only with logged action and technician review.
8. Store square meters, acres, CRS, and source confidence.

## Pivot Geometry

- `machineRadius = sum(spanLengths) + overhangLength` unless verified manufacturer geometry says otherwise.
- `endGunRadius = machineRadius + endGunThrow`.
- Full circle: approximate projected circle with enough segments for configured acre tolerance.
- Partial circle: create a sector from center plus ordered arc vertices; handle 0/360 wrap explicitly.
- Store wet coverage separately from machine-travel clearance geometry.

## Tower Placement

Tower radius is the cumulative sum of span lengths through each tower. For a selected angle:

```ts
x = center.x + radius * Math.cos(theta)
y = center.y + radius * Math.sin(theta)
```

The app must define the internal angle convention once and convert display conventions at the UI boundary.

## End Gun Modeling

Model the end gun as a separate annular sector from machine radius to end gun radius. Store end-gun acres separately because pressure, wind, nozzle package, and shutoff ranges can change actual coverage.

## Obstacle Exclusion

- Point obstacle: buffer by configured clearance radius.
- Line obstacle: buffer by width plus clearance.
- Polygon obstacle: use polygon plus safety buffer.
- No-spray zones subtract from wet coverage.
- Hard obstacles are checked against physical machine/tower-travel buffers.

## Coverage Scoring

```text
field_usable = field_boundary - nonfarmable_zones
wet_raw = base_sweep union enabled_end_gun_sweep
wet_allowed = wet_raw intersect field_usable - no_spray_zones - wet_exclusions
dry_corners = field_usable - wet_allowed
coverage_percent = wet_allowed.area / field_usable.area * 100
```

Report irrigated acres, non-irrigated acres, dry-corner acres, end-gun acres, hard conflicts, and low-confidence source warnings.

## Best-Fit Placement

MVP should not start with a black-box optimizer. Implement:

1. User-selected center.
2. Deterministic grid of candidate centers inside an allowed zone.
3. Score each candidate with exact geometry.
4. Return top N with score components and rejection reasons.
5. Add advanced optimizer only after deterministic tests pass.
"""
    write_text(out / "GEOSPATIAL_ALGORITHM_SPEC.md", geo)

    rtk = """
# RTK/GNSS Integration Spec

## Positioning Principle

The app must separate software from hardware and correction costs. Free software can parse NMEA and store RTK quality, but centimeter-grade work still requires suitable receiver hardware, antenna setup, correction/base data, and field procedure.

## NMEA Sentence Support

MVP parser should support:

- GGA: fix quality, latitude, longitude, satellites, HDOP, altitude, geoid separation, correction age, base station id when present.
- RMC: time, date, position, speed/course status.
- GSA: DOP and fix mode where present.
- GST: estimated position error fields where receiver emits them.
- GSV: satellites in view for diagnostics.

Store raw sentence logs optionally for troubleshooting.

## RTK Fix-Quality Handling

Normalize receiver status into:

- invalid
- autonomous
- DGPS/SBAS
- RTK float
- RTK fixed
- PPP/other high-precision mode
- unknown

Quality thresholds are role-specific. Pivot center, obstacles, boundaries, and control points can require stricter thresholds than planning notes.

## iOS Strategy

- Use Core Location for internal location and compatible external receivers.
- Use Core Bluetooth for BLE receivers that expose usable data.
- Treat Bluetooth Classic serial/SPP as not generally available for ordinary iOS apps.
- ExternalAccessory work is hardware-specific and may require compatible accessories and program constraints.

## Android Strategy

- Internal location for planning-grade capture.
- BLE through `react-native-ble-plx`.
- Bluetooth Classic/SPP through Android-specific package or custom native module.
- USB GNSS through Android USB host plus serial adapter module.
- Android should be the first platform for live receiver prototypes.

## Windows Strategy

- Use React Native Windows for UI.
- Implement a native module over Windows.Devices.SerialCommunication for serial GNSS receivers.
- Use Windows.Devices.Geolocation where available.
- Node `serialport` can support companion CLI tools, but should not be treated as direct RNW runtime support.

## RTKLIB/RINEX Role

RTKLIB and RINEX workflows should be external preprocessing or companion desktop flows:

1. Import RINEX rover/base/CORS files.
2. Process or inspect solution outside mobile app.
3. Import accepted solution points and QA metadata.

Do not embed full RTKLIB processing into the mobile MVP.

## Accuracy Validation

- Show fix type, satellites, HDOP/VDOP/PDOP, correction age, estimated horizontal/vertical accuracy, and base/rover metadata.
- Require repeated observations for pivot center and clearance-critical obstacles.
- Flag stale corrections, low satellites, high DOP, missing antenna height, and mixed datum/epoch metadata.
"""
    write_text(out / "RTK_GNSS_INTEGRATION_SPEC.md", rtk)

    offline = """
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
"""
    write_text(out / "OFFLINE_MAPPING_AND_IMAGERY_SPEC.md", offline)

    data_model = "# Data Model TypeScript Spec\n\n## Interfaces\n\n" + "\n\n".join(f"```ts\n{x}\n```" for x in TS_INTERFACES)
    data_model += """

## Project File Schema

```ts
export interface CenterPivotProject {
  schemaVersion: string;
  metadata: ProjectMetadata;
  machines: PivotMachine[];
  surveyPoints: SurveyPoint[];
  layers: Record<string, GeoJsonLayer>;
  scenarios: LayoutScenario[];
  mapPackages: MapPackageManifest[];
  validationLog: ValidationMessage[];
}
```

## GeoJSON Structures

- Field boundary and coverage layers use Polygon/MultiPolygon.
- Survey points and tower locations use Point features.
- Tracks and tower paths can use LineString plus optional buffered Polygon.
- Every feature must include `sourceConfidence`, `sourceLayerId`, and CRS metadata or a project-level CRS reference.

## Export Formats

- Project ZIP: canonical exchange package.
- GeoJSON: geometry exchange.
- CSV: survey points and scenario metrics.
- Report JSON: machine-readable metrics and warnings.
"""
    write_text(out / "DATA_MODEL_TYPESCRIPT_SPEC.md", data_model)

    ui = """
# UI/UX Screen Spec

## Screen List

1. Project list
2. Project setup
3. Map workspace
4. Survey capture
5. Receiver connection
6. Boundary editor
7. Obstacle/exclusion editor
8. Pivot layout editor
9. Machine configuration
10. Scenario comparison
11. Export/report
12. Settings/licenses

## Map Tool Modes

- Pan/inspect
- Capture point
- Draw boundary
- Edit vertices
- Mark obstacle
- Place pivot
- Measure
- Simulate sweep
- Review conflicts

Each mode needs an unmistakable active state, a cancel action, undo/redo, and protection against accidental destructive edits.

## Survey Capture UI

Show:

- Current coordinates.
- Fix type.
- Satellites.
- HDOP/VDOP/PDOP.
- Correction age.
- Estimated accuracy.
- Receiver/transport state.
- Capture eligibility for the selected role.

## Pivot Layout UI

- Large controls for full circle versus partial circle.
- Numeric inputs for span lengths, overhang, end gun, clearances, start/stop angles.
- Visual tower markers and dry-corner layer.
- Conflict list tied to map selection.

## Outdoor Usability

- High contrast.
- Large touch targets.
- No tiny required controls.
- Minimal reliance on color alone.
- Clear offline state.
- Battery-aware logging.
- Glove-friendly primary actions.
"""
    write_text(out / "UI_UX_SCREEN_SPEC.md", ui)

    testing = """
# Testing Validation Plan

## Unit Tests

- Units and acre conversion.
- CRS policy rejects EPSG:4326 for area/radius/buffer.
- Pivot radius, tower radius, and end-gun radius.
- Angle wrap and partial-sector generation.
- NMEA GGA/RMC/GSA/GST parser fixtures.

## Geometry Tests

Create golden fixtures:

- 160-acre square field with quarter-section expectations.
- Irregular field with dry corners.
- Field with hole/exclusion.
- Partial-circle windshield-wiper operation.
- End-gun on/off ranges.
- Road/fence/tree/building clearance conflicts.
- Multi-scenario ranking.

Golden outputs should be GeoJSON plus metrics JSON. Do not rely only on screenshots.

## GPS Simulation Tests

- Replay NMEA logs through parser.
- Simulate low-quality fixes and verify rejection.
- Simulate repeated RTK fixed shots and residual checks.
- Validate correction age thresholds.

## Offline Map Tests

- Import PMTiles/MBTiles manifest.
- Confirm attribution required.
- Load map with no network.
- Fail a package with missing license metadata.

## Import/Export Tests

- GeoJSON round trip.
- CSV survey point import.
- Project ZIP export and reopen.
- Missing CRS import rejection.

## Cross-Platform Tests

- Shared TypeScript tests run on Node.
- Component tests run in React Native test environment.
- Detox or Maestro smoke tests for iOS/Android.
- Windows smoke tests for project open/save and map WebView.
"""
    write_text(out / "TESTING_VALIDATION_PLAN.md", testing)

    install_notes = """
# Package Installation Notes

## MVP Commands

```sh
npm install react-native zod @turf/turf proj4 polygon-clipping rbush geokdbush geographiclib-geodesic react-hook-form react-native-paper @react-navigation/native react-native-screens react-native-safe-area-context
npm install @react-native-async-storage/async-storage react-native-webview
npm install --save-dev jest @testing-library/react-native typescript
```

Choose one mobile SQLite/file path after app framework decision:

```sh
npm install react-native-quick-sqlite react-native-fs
# or, for Expo mobile prebuild:
npm install expo-sqlite expo-file-system
```

## Mapping

```sh
npm install @maplibre/maplibre-react-native pmtiles
```

Use MapLibre React Native for iOS/Android. Use WebView plus OpenLayers or MapLibre GL JS for Windows/fallback:

```sh
npm install ol
# optional web map renderer
npm install maplibre-gl
```

## GNSS/RTK Optional Packages

```sh
npm install react-native-ble-plx
npm install react-native-bluetooth-classic
npm install react-native-usb-serialport-for-android
```

These require native builds and platform testing. Do not add them to the MVP until NMEA fixture import and the receiver interface are complete.

## Expo Versus Bare React Native

Expo Go is not enough for MapLibre and receiver native modules. Expo prebuild/development builds are acceptable if all needed native modules build locally. Bare React Native is acceptable and may be cleaner for GNSS-heavy work.

## Windows Setup

Use React Native Windows with Visual Studio and Windows SDK. Do not assume iOS/Android native packages support Windows. Build Windows map and serial adapters separately.

## Known Build Risks

- MapLibre native setup can require platform-specific configuration.
- Bluetooth and USB modules need runtime permissions and physical hardware tests.
- Windows support must be verified per dependency.
- Store distribution can create account/signing costs even if the software stack is free.
"""
    write_text(out / "PACKAGE_INSTALLATION_NOTES.md", install_notes)

    mvp = """
# MVP Build Plan

## Smallest Useful Version

Build an offline manual layout app before live RTK hardware integration.

## Build First

1. Monorepo and shared TypeScript packages.
2. Project schema, Zod validation, units, CRS policy.
3. Geometry fixtures and Jest tests.
4. Manual boundary and obstacle layers.
5. Machine configuration form.
6. Full-circle and partial-circle coverage.
7. Tower locations, end-gun coverage, dry corners, conflict metrics.
8. Local save/open and project ZIP export.
9. Mobile MapLibre proof and Windows WebView map proof.

## Delay

- Live receiver streams.
- USB/Bluetooth Classic/ExternalAccessory.
- Raw Shapefile/GeoPackage editing.
- Large GeoTIFF rendering.
- Best-fit optimizer beyond deterministic grid search.
- PDF reports.
- App store distribution.

## Can Be Mocked

- Live GNSS with NMEA log replay.
- Offline basemap with a small sample PMTiles/MBTiles package.
- Windows serial receiver with imported NMEA logs.
- Public imagery with a tiny local tile fixture.

## Must Be Accurate From Day One

- CRS rejection and projection handling.
- Units and acreage conversions.
- Machine radius/span/tower math.
- Full/partial coverage geometry.
- Obstacle/no-spray subtraction.
- Export schema and source-confidence reporting.

## First Release Feature List

- Create/open/save project.
- Draw/import GeoJSON/CSV field boundary.
- Place pivot and infrastructure points.
- Enter machine geometry.
- Compute layout metrics.
- Export project ZIP/GeoJSON/CSV.
- Run fixture tests in CI/local command.
"""
    write_text(out / "MVP_BUILD_PLAN.md", mvp)

    tasks = {
        "mvp_tasks": [
            {"id": "MVP-01", "objective": "Scaffold monorepo and shared packages.", "inputs": ["handoff JSON", "architecture spec"], "outputs": ["apps/mobile", "apps/windows", "packages/core"], "dependencies": [], "success_criteria": ["TypeScript builds", "Jest runs empty suite"], "recommended_files_modules_to_edit": ["package.json", "tsconfig.base.json", "packages/core"], "requires_native_platform_expertise": False},
            {"id": "MVP-02", "objective": "Implement project schemas and unit/CRS policy.", "inputs": ["DATA_MODEL_TYPESCRIPT_SPEC.md"], "outputs": ["Zod schemas", "unit conversion module", "CRS guard"], "dependencies": ["MVP-01"], "success_criteria": ["EPSG:4326 area calculations rejected", "project fixture validates"], "recommended_files_modules_to_edit": ["packages/core/src/schema.ts", "packages/core/src/units.ts", "packages/core/src/crs.ts"], "requires_native_platform_expertise": False},
            {"id": "MVP-03", "objective": "Implement pivot geometry core.", "inputs": ["GEOSPATIAL_ALGORITHM_SPEC.md"], "outputs": ["circle", "sector", "tower", "end gun", "coverage scoring"], "dependencies": ["MVP-02"], "success_criteria": ["golden geometry tests pass"], "recommended_files_modules_to_edit": ["packages/geometry/src"], "requires_native_platform_expertise": False},
            {"id": "MVP-04", "objective": "Implement local project store and export.", "inputs": ["project schema"], "outputs": ["SQLite adapter", "GeoJSON/CSV/project ZIP export"], "dependencies": ["MVP-02"], "success_criteria": ["project round-trip test passes"], "recommended_files_modules_to_edit": ["packages/project-store/src"], "requires_native_platform_expertise": False},
            {"id": "MVP-05", "objective": "Build map workspace with manual geometry tools.", "inputs": ["UI_UX_SCREEN_SPEC.md"], "outputs": ["map modes", "boundary editor", "obstacle editor", "pivot placement"], "dependencies": ["MVP-03", "MVP-04"], "success_criteria": ["manual layout workflow completes offline"], "recommended_files_modules_to_edit": ["apps/mobile/src/screens/MapWorkspace.tsx", "packages/map-adapters/src"], "requires_native_platform_expertise": True},
            {"id": "MVP-06", "objective": "Build machine configuration and scenario review screens.", "inputs": ["domain models"], "outputs": ["forms", "scenario metrics", "conflict list"], "dependencies": ["MVP-03"], "success_criteria": ["invalid span/end-gun inputs blocked", "scenario metrics visible"], "recommended_files_modules_to_edit": ["apps/mobile/src/screens/MachineConfig.tsx", "apps/mobile/src/screens/ScenarioReview.tsx"], "requires_native_platform_expertise": False},
            {"id": "MVP-07", "objective": "Create Windows proof shell.", "inputs": ["TECHNICAL_ARCHITECTURE.md"], "outputs": ["React Native Windows app opens project and renders WebView map fixture"], "dependencies": ["MVP-01", "MVP-04"], "success_criteria": ["Windows build runs locally", "WebView map fixture loads offline"], "recommended_files_modules_to_edit": ["apps/windows"], "requires_native_platform_expertise": True},
        ],
        "advanced_tasks": [
            {"id": "ADV-01", "objective": "Implement NMEA parser and log replay.", "inputs": ["RTK_GNSS_INTEGRATION_SPEC.md", "NMEA fixtures"], "outputs": ["parser", "quality normalizer", "log replay test"], "dependencies": ["MVP-02"], "success_criteria": ["GGA/RMC/GSA/GST fixtures parsed", "quality thresholds enforced"], "recommended_files_modules_to_edit": ["packages/gnss/src"], "requires_native_platform_expertise": False},
            {"id": "ADV-02", "objective": "Prototype Android USB serial GNSS adapter.", "inputs": ["receiver hardware", "Android USB docs"], "outputs": ["native adapter", "raw NMEA stream"], "dependencies": ["ADV-01"], "success_criteria": ["receiver stream captured", "permission flow documented"], "recommended_files_modules_to_edit": ["apps/mobile/android", "packages/gnss/src/adapters/androidUsb.ts"], "requires_native_platform_expertise": True},
            {"id": "ADV-03", "objective": "Prototype BLE GNSS adapter.", "inputs": ["BLE receiver profile"], "outputs": ["BLE scan/connect/read adapter"], "dependencies": ["ADV-01"], "success_criteria": ["sample receiver profile documented", "quality displayed live"], "recommended_files_modules_to_edit": ["packages/gnss/src/adapters/ble.ts"], "requires_native_platform_expertise": True},
            {"id": "ADV-04", "objective": "Prototype Windows serial adapter.", "inputs": ["Windows serial receiver", "RNW native module docs"], "outputs": ["SerialCommunication native module"], "dependencies": ["ADV-01", "MVP-07"], "success_criteria": ["NMEA stream captured on Windows", "disconnect/reconnect stable"], "recommended_files_modules_to_edit": ["apps/windows/windows", "packages/gnss/src/adapters/windowsSerial.ts"], "requires_native_platform_expertise": True},
            {"id": "ADV-05", "objective": "Add offline map package import.", "inputs": ["PMTiles/MBTiles fixtures"], "outputs": ["map package manifest", "offline renderer integration"], "dependencies": ["MVP-05", "MVP-07"], "success_criteria": ["offline map renders with attribution and no network"], "recommended_files_modules_to_edit": ["packages/map-adapters/src", "packages/project-store/src/mapPackages.ts"], "requires_native_platform_expertise": True},
            {"id": "ADV-06", "objective": "Add imagery tiling workflow docs/tooling.", "inputs": ["sample GeoTIFF", "GDAL workflow"], "outputs": ["tile conversion script or docs", "imagery manifest import"], "dependencies": ["ADV-05"], "success_criteria": ["sample orthomosaic tiles render offline", "imagery QA metadata shown"], "recommended_files_modules_to_edit": ["tools/preprocess", "packages/project-store/src/imagery.ts"], "requires_native_platform_expertise": False},
            {"id": "ADV-07", "objective": "Implement deterministic best-fit grid search.", "inputs": ["geometry core", "scoring weights"], "outputs": ["candidate generator", "top-N scenarios", "rejection reasons"], "dependencies": ["MVP-03"], "success_criteria": ["fixtures return expected ranked candidates", "hard conflicts excluded before scoring"], "recommended_files_modules_to_edit": ["packages/geometry/src/optimization.ts"], "requires_native_platform_expertise": False},
        ],
    }
    with (out / "AGENTIC_DEVELOPMENT_TASKS.json").open("w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)
        f.write("\n")


def main():
    with SOURCE_JSON.open("r", encoding="utf-8") as f:
        source = json.load(f)

    out = choose_output_dir()
    main_json = build_main_json(source)
    generate_files(out, main_json)

    zip_path = out.parent / "center_pivot_react_native_development_handoff.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for path in sorted(out.rglob("*")):
            z.write(path, path.relative_to(out.parent))

    print(json.dumps({"output_dir": str(out), "zip_path": str(zip_path)}, indent=2))


if __name__ == "__main__":
    main()
