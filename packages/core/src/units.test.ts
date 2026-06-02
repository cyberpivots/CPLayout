import assert from "node:assert/strict";

import { feetToMeters, formatDistanceInputValue, formatFeetInches, parseDistanceInput } from "./units";

assert.ok(Math.abs(parseDistanceInput("120", "us_survey_feet", "Span") - feetToMeters(120)) < 0.000001);
assert.ok(Math.abs(parseDistanceInput("120 ft", "us_survey_feet", "Span") - feetToMeters(120)) < 0.000001);
assert.ok(Math.abs(parseDistanceInput("120 6 in", "us_survey_feet", "Span") - feetToMeters(120.5)) < 0.000001);
assert.ok(Math.abs(parseDistanceInput("55 m", "metric", "Span") - 55) < 0.000001);
assert.equal(formatFeetInches(feetToMeters(120.5)), `120' 6"`);
assert.equal(formatDistanceInputValue(feetToMeters(120), "us_survey_feet"), "120");
assert.equal(formatDistanceInputValue(55, "metric"), "55");
assert.throws(() => parseDistanceInput("12 13 in", "us_survey_feet", "Span"), /between 0 and 12/);
assert.throws(() => parseDistanceInput("", "metric", "Span"), /required/);

console.log("unit conversion tests passed");
