# Free/Open-Source Stack Audit

| Dependency | Platforms | License | Cost status | Hidden-cost risk | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- |
| react-native | iOS, Android, Windows via react-native-windows | MIT | free | none for software use | medium | recommended |
| expo | iOS, Android | MIT | free | Expo open-source tooling is free; hosted EAS services may have paid limits and must not be required. | medium | recommended |
| react-native-windows | Windows | MIT | free | none for software use | medium | recommended |
| @react-navigation/native | iOS, Android, Windows support must be validated | MIT | free | none for software use | low | recommended |
| @maplibre/maplibre-react-native | iOS, Android | MIT | free | software free; tile data/source generation still needs license compliance and storage planning. | medium | recommended |
| react-native-maps | iOS, Android | MIT | free | package is MIT; map data/providers may impose API keys, terms, quotas, billing, or platform limits. | high | optional/deferred |
| react-native-webview + OpenLayers | iOS, Android, Windows | MIT for react-native-webview; BSD-2-Clause for OpenLayers | free | software free; still must supply lawful local tile data. | medium | recommended |
| pmtiles | iOS, Android, Windows, offline preprocessing | BSD-3-Clause | free | software free; tile data production and OSM attribution/license compliance remain required. | low | recommended |
| MBTiles | iOS, Android, Windows, offline preprocessing | open specification | free | format is free; data license and renderer support are separate. | low | recommended |
| @turf/turf | iOS, Android, Windows, Node | MIT | free | none for software use | medium | recommended |
| proj4 | iOS, Android, Windows, Node | MIT | free | none for software use | medium | recommended |
| polygon-clipping | iOS, Android, Windows, Node | MIT | free | none for software use | medium | recommended |
| jsts | iOS, Android, Windows, Node | EDL-1.0 OR EPL-1.0 | free | open-source but non-MIT license; legal review recommended before commercial distribution. | medium | recommended |
| rbush | iOS, Android, Windows, Node | MIT | free | none for software use | low | recommended |
| geokdbush | iOS, Android, Windows, Node | ISC | free | none for software use | low | recommended |
| geographiclib-geodesic | iOS, Android, Windows, Node | MIT | free | none for software use | low | recommended |
| geotiff | iOS, Android, Windows, Node | MIT | free | none for software use | medium | recommended |
| shapefile | iOS, Android, Windows, Node | BSD-3-Clause | free | none for software use | medium | recommended |
| @tmcw/togeojson | iOS, Android, Windows, Node | BSD-2-Clause | free | none for software use | low | recommended |
| react-native-quick-sqlite | iOS, Android, Windows uncertain | MIT | free | none for software use | medium | recommended |
| expo-sqlite + expo-file-system | iOS, Android | MIT | free | open-source Expo packages are free; hosted Expo services must not be required. | medium | recommended |
| @nozbe/watermelondb | iOS, Android, Windows uncertain | MIT | free | none for software use | medium | recommended |
| realm | iOS, Android, Windows status must be verified | Apache-2.0 | free | local SDK package is open source; any cloud/sync service must be excluded unless separately verified free and optional. | medium | recommended |
| @react-native-async-storage/async-storage | iOS, Android, Windows support must be verified | MIT | free | none for software use | low | recommended |
| react-native-mmkv | iOS, Android | MIT | free | none for software use | medium | recommended |
| react-native-fs | iOS, Android, Windows support must be validated | MIT | free | none for software use | medium | recommended |
| react-native-ble-plx | iOS, Android | MIT | free | none for software use | medium | recommended |
| react-native-bluetooth-classic | Android, iOS limited/uncertain | MIT | free | software free; iOS Classic serial accessories may require External Accessory/MFi/hardware support. | high | optional/deferred |
| react-native-usb-serialport-for-android | Android | MIT | free | none for software use | high | optional/deferred |
| serialport | Node desktop, offline preprocessing | MIT | free | none for software use | medium | recommended |
| RTKLIB | Windows, Linux, macOS, offline preprocessing | BSD-style with RTKLIB clauses | free | software free; hardware, cellular data, and correction services may not be free. | medium | recommended |
| react-native-paper | iOS, Android, Windows support must be validated | MIT | free | none for software use | low | recommended |
| react-hook-form | iOS, Android, Windows | MIT | free | none for software use | low | recommended |
| zod | iOS, Android, Windows, Node | MIT | free | none for software use | low | recommended |
| jest | iOS, Android, Windows, Node | MIT | free | none for software use | low | recommended |
| @testing-library/react-native | iOS, Android, Windows where RN renderer supports tests | MIT | free | none for software use | low | recommended |
| detox | iOS, Android | MIT | free | none for software use | medium | recommended |
| Maestro | iOS, Android | Apache-2.0 | free | open-source CLI is free; optional cloud services may have costs and must not be required. | medium | recommended |

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
