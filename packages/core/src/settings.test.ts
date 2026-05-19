import assert from "node:assert/strict";

import {
  defaultAppSettings,
  gpsFixMeetsThreshold,
  mergeAppSettings,
  parseAppSettings,
  projectSettingsFromApp,
} from "./settings";

const defaults = defaultAppSettings();
assert.equal(defaults.offlineMaps.allowNetworkTiles, false);
assert.equal(defaults.offlineMaps.requireAttribution, true);
assert.equal(defaults.coordinateDisplayFormat, "decimal_degrees");
assert.equal(defaults.gpsQuality.minimumFixType, "rtk_fixed");

const merged = mergeAppSettings({
  coordinateDisplayFormat: "degrees_minutes_seconds",
  drawing: { vertexSnapToleranceMeters: 2.5 },
});
assert.equal(merged.coordinateDisplayFormat, "degrees_minutes_seconds");
assert.equal(merged.drawing.vertexSnapToleranceMeters, 2.5);
assert.equal(merged.drawing.featureSnapToleranceMeters, defaults.drawing.featureSnapToleranceMeters);

const projectSettings = projectSettingsFromApp(merged);
assert.equal(projectSettings.offlineMaps.allowNetworkTiles, false);
assert.equal("packageDirectory" in projectSettings.offlineMaps, false);
assert.deepEqual(parseAppSettings(merged), merged);

assert.equal(gpsFixMeetsThreshold("rtk_fixed", "rtk_float"), true);
assert.equal(gpsFixMeetsThreshold("autonomous", "rtk_float"), false);
assert.equal(gpsFixMeetsThreshold("unknown", "autonomous"), false);

assert.throws(
  () => parseAppSettings({ ...defaults, offlineMaps: { ...defaults.offlineMaps, allowNetworkTiles: true } }),
  /Invalid input/,
);

console.log("settings tests passed");
