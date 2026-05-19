import assert from "node:assert/strict";

import { parseNmeaSentence } from "./nmea";

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

console.log("nmea tests passed");
