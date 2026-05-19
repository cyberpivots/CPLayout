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
