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
