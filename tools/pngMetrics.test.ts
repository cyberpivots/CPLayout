import assert from "node:assert/strict";

import { analyzePngPixels, createNativeMapLibreProofTilePng } from "./pngMetrics";

const tile = createNativeMapLibreProofTilePng();
const metrics = analyzePngPixels(tile);

assert.equal(metrics.width, 256);
assert.equal(metrics.height, 256);
assert.equal(metrics.sampleCount, 256 * 256);
assert.ok(metrics.nonBlankPixelRatio > 0.95);
assert.ok(metrics.grayVariance > 100);
assert.ok(metrics.maxGray > metrics.minGray);

console.log("PNG metric helper tests passed");
