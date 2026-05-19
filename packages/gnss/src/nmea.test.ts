import assert from "node:assert/strict";

import { defaultAppSettings } from "@cplayout/core";

import {
  evaluateRtkQualityGate,
  parseNmeaLog,
  parseNmeaSentence,
  rtkQualityFromNmeaSamples,
  surveyPointFromNmeaSamples,
} from "./nmea";

const gga = parseNmeaSentence("$GPGGA,172814.0,4042.6142,N,10459.2715,W,4,18,0.6,1560.2,M,-21.3,M,1.2,0134*5A");

assert.equal(gga?.sentenceType, "GGA");
assert.equal(gga?.fixType, "rtk_fixed");
assert.equal(gga?.satellites, 18);
assert.equal(gga?.hdop, 0.6);
assert.equal(gga?.correctionAgeSeconds, 1.2);
assert.ok(gga?.latitude && gga.latitude > 40.7);
assert.ok(gga?.longitude && gga.longitude < -104.9);

const rmc = parseNmeaSentence("$GPRMC,172814.0,A,4042.6142,N,10459.2715,W,0.0,0.0,190526,,,A*68");
assert.equal(rmc?.sentenceType, "RMC");
assert.ok(rmc?.longitude && rmc.longitude < 0);

const gst = parseNmeaSentence("$GPGST,172814.0,0.021,0.012,0.017,42.0,0.014,0.019,0.031*52");
assert.equal(gst?.sentenceType, "GST");
assert.equal(gst?.horizontalAccuracyMeters, 0.019);
assert.equal(gst?.verticalAccuracyMeters, 0.031);

const replay = parseNmeaLog([
  "$GPGGA,172814.0,4042.6142,N,10459.2715,W,4,18,0.6,1560.2,M,-21.3,M,1.2,0134*5A",
  "$GPGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.1,0.6,0.9*33",
  "$GPGST,172814.0,0.021,0.012,0.017,42.0,0.014,0.019,0.031*52",
]);
const quality = rtkQualityFromNmeaSamples(replay);
assert.equal(quality.fixType, "rtk_fixed");
assert.equal(quality.hdop, 0.6);
assert.equal(quality.verticalAccuracyMeters, 0.031);
assert.equal(evaluateRtkQualityGate(quality, defaultAppSettings().gpsQuality).accepted, true);

const simulatedPoint = surveyPointFromNmeaSamples({
  samples: replay,
  projectCrs: "EPSG:32613",
  id: "replay-1",
  label: "Replay fix",
  observedAt: "2026-05-19T09:00:00-06:00",
});
assert.equal(simulatedPoint.confidence, "rtk_fixed");
assert.ok(simulatedPoint.projected.x > 0);

console.log("nmea tests passed");
