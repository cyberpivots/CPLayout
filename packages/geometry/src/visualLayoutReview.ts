export interface VisualLayoutReviewThresholds {
  maxCenterOffsetRatio: number;
  maxRadiusMismatchRatio: number;
  minDetectionConfidence: number;
}

export interface VisualLayoutReviewMetrics {
  centerOffsetRatio?: number;
  radiusMismatchRatio?: number;
  overlayVisible: boolean;
  attributionPresent: boolean;
  detectionConfidence: number;
}

export interface VisualLayoutReviewAssessment {
  score: number;
  confidence: number;
  warnings: string[];
  canonicalGeometryMutation: false;
  reviewStatus: "unreviewed";
  designOnly: true;
}

export const DEFAULT_VISUAL_LAYOUT_REVIEW_THRESHOLDS: VisualLayoutReviewThresholds = {
  maxCenterOffsetRatio: 0.05,
  maxRadiusMismatchRatio: 0.08,
  minDetectionConfidence: 0.65,
};

export function assessVisualLayoutReview(
  metrics: VisualLayoutReviewMetrics,
  thresholds: Partial<VisualLayoutReviewThresholds> = {},
): VisualLayoutReviewAssessment {
  const effectiveThresholds = { ...DEFAULT_VISUAL_LAYOUT_REVIEW_THRESHOLDS, ...thresholds };
  const warnings: string[] = [];
  let score = 100;

  if (!metrics.overlayVisible) {
    warnings.push("CPLayout overlay was not detected in the map-canvas screenshot.");
    score -= 30;
  }

  if (!metrics.attributionPresent) {
    warnings.push("Full-window Google Earth attribution evidence is missing or unclear.");
    score -= 20;
  }

  if (metrics.detectionConfidence < effectiveThresholds.minDetectionConfidence) {
    warnings.push(`Visual detection confidence is below ${effectiveThresholds.minDetectionConfidence}.`);
    score -= 20;
  }

  if (metrics.centerOffsetRatio !== undefined && metrics.centerOffsetRatio > effectiveThresholds.maxCenterOffsetRatio) {
    warnings.push(`Detected CPLayout center offset exceeds ${(effectiveThresholds.maxCenterOffsetRatio * 100).toFixed(1)}% of pivot radius.`);
    score -= Math.min(25, (metrics.centerOffsetRatio - effectiveThresholds.maxCenterOffsetRatio) * 250);
  }

  if (metrics.radiusMismatchRatio !== undefined && metrics.radiusMismatchRatio > effectiveThresholds.maxRadiusMismatchRatio) {
    warnings.push(`Detected CPLayout radius mismatch exceeds ${(effectiveThresholds.maxRadiusMismatchRatio * 100).toFixed(1)}%.`);
    score -= Math.min(25, (metrics.radiusMismatchRatio - effectiveThresholds.maxRadiusMismatchRatio) * 220);
  }

  return {
    score: round3(clamp(score, 0, 100)),
    confidence: round3(clamp(metrics.detectionConfidence, 0, 1)),
    warnings,
    canonicalGeometryMutation: false,
    reviewStatus: "unreviewed",
    designOnly: true,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
