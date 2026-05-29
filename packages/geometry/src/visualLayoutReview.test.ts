import assert from "node:assert/strict";

import { assessVisualLayoutReview } from "./visualLayoutReview";

const aligned = assessVisualLayoutReview({
  centerOffsetRatio: 0.02,
  radiusMismatchRatio: 0.03,
  overlayVisible: true,
  attributionPresent: true,
  detectionConfidence: 0.82,
});

assert.equal(aligned.reviewStatus, "unreviewed");
assert.equal(aligned.canonicalGeometryMutation, false);
assert.equal(aligned.designOnly, true);
assert.equal(aligned.warnings.length, 0);
assert.ok(aligned.score > 95);

const centerDrift = assessVisualLayoutReview({
  centerOffsetRatio: 0.11,
  radiusMismatchRatio: 0.02,
  overlayVisible: true,
  attributionPresent: true,
  detectionConfidence: 0.82,
});
assert.match(centerDrift.warnings.join("\n"), /center offset/i);
assert.ok(centerDrift.score < aligned.score);

const radiusDrift = assessVisualLayoutReview({
  centerOffsetRatio: 0.02,
  radiusMismatchRatio: 0.14,
  overlayVisible: true,
  attributionPresent: true,
  detectionConfidence: 0.82,
});
assert.match(radiusDrift.warnings.join("\n"), /radius mismatch/i);

const missingOverlay = assessVisualLayoutReview({
  overlayVisible: false,
  attributionPresent: true,
  detectionConfidence: 0.82,
});
assert.match(missingOverlay.warnings.join("\n"), /overlay/i);

const missingAttribution = assessVisualLayoutReview({
  overlayVisible: true,
  attributionPresent: false,
  detectionConfidence: 0.82,
});
assert.match(missingAttribution.warnings.join("\n"), /attribution/i);

const lowConfidence = assessVisualLayoutReview({
  overlayVisible: true,
  attributionPresent: true,
  detectionConfidence: 0.44,
});
assert.match(lowConfidence.warnings.join("\n"), /confidence/i);
assert.equal(lowConfidence.confidence, 0.44);

console.log("visual layout review tests passed");
