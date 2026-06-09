import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { analyzePngPixels } from "./pngMetrics";

interface ScreenshotReview {
  path: string;
  sha256: string;
  metrics: ReturnType<typeof analyzePngPixels>;
  ocr: {
    available: boolean;
    text: string;
    forbiddenExistingMachineRadiusText: boolean;
  };
  cvSummary: {
    nonblankPass: boolean;
    nonuniformPass: boolean;
    lowClutterHeuristicPass: boolean;
    notes: string[];
  };
}

interface WillRheaVisualReviewReport {
  projectId: "will-rhea-jason-harmelink-example";
  generatedAt: string;
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  googleEarthRenderProof: false;
  screenshotCount: number;
  sourceFeatureIdsExpectedVisible: string[];
  suppressedFeatureIdsExpectedHidden: string[];
  reviews: ScreenshotReview[];
  warnings: string[];
}

const DEFAULT_OUTPUT_ROOT = "reports/visual-layout-review/will-rhea";
const SOURCE_FEATURE_IDS_EXPECTED_VISIBLE = [
  "will-rhea-lrdu-distance",
  "will-rhea-middle-part-circle-preferred-outline",
  "will-rhea-south-east-circle-preferred-outline",
];
const SUPPRESSED_FEATURE_IDS_EXPECTED_HIDDEN = ["will-rhea-existing-machine-zone"];

function main(): void {
  const args = process.argv.slice(2);
  const screenshotPaths = args.filter((arg) => !arg.startsWith("--"));
  const outputRootArg = valueArg(args, "--output-root") ?? DEFAULT_OUTPUT_ROOT;
  if (screenshotPaths.length === 0) {
    throw new Error("Usage: tsx tools/willRheaVisualReview.ts <screenshot.png...> [--output-root reports/visual-layout-review/will-rhea]");
  }

  const generatedAt = new Date().toISOString();
  const runId = generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outputDir = resolve(outputRootArg, runId);
  mkdirSync(outputDir, { recursive: true });

  const reviews = screenshotPaths.map(reviewScreenshot);
  const report: WillRheaVisualReviewReport = {
    projectId: "will-rhea-jason-harmelink-example",
    generatedAt,
    advisoryOnly: true,
    canonicalGeometryMutation: false,
    googleEarthRenderProof: false,
    screenshotCount: reviews.length,
    sourceFeatureIdsExpectedVisible: SOURCE_FEATURE_IDS_EXPECTED_VISIBLE,
    suppressedFeatureIdsExpectedHidden: SUPPRESSED_FEATURE_IDS_EXPECTED_HIDDEN,
    reviews,
    warnings: [
      "This is local screenshot evidence only; it is not Google Earth render proof.",
      "OCR/CV outputs are advisory review evidence and do not mutate projected XY geometry.",
      "Raw screenshots and reports are ignored local artifacts under reports/.",
    ],
  };

  writeFileSync(join(outputDir, "will-rhea-visual-review.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputDir, "README.md"), markdownReport(report));
  console.log(`Will Rhea visual review wrote ${outputDir}`);
}

function reviewScreenshot(inputPath: string): ScreenshotReview {
  const absolutePath = resolve(inputPath);
  if (!existsSync(absolutePath)) throw new Error(`Screenshot does not exist: ${inputPath}`);
  const data = readFileSync(absolutePath);
  const metrics = analyzePngPixels(data);
  const ocr = runTesseract(absolutePath);
  const lowClutterHeuristicPass = metrics.grayVariance > 8 && metrics.nonBlankPixelRatio > 0.08;
  return {
    path: absolutePath,
    sha256: createHash("sha256").update(data).digest("hex"),
    metrics,
    ocr,
    cvSummary: {
      nonblankPass: metrics.nonBlankPixelRatio > 0.05,
      nonuniformPass: metrics.grayVariance > 4,
      lowClutterHeuristicPass,
      notes: [
        "PNG metrics are a local nonblank/nonuniform proxy, not semantic map understanding.",
        "OpenCV line/circle analysis is not run unless a future helper adds an explicit local dependency.",
      ],
    },
  };
}

function runTesseract(path: string): ScreenshotReview["ocr"] {
  const probe = spawnSync("tesseract", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    return {
      available: false,
      text: "",
      forbiddenExistingMachineRadiusText: false,
    };
  }
  const result = spawnSync("tesseract", [path, "stdout"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const text = result.status === 0 ? result.stdout : "";
  return {
    available: result.status === 0,
    text,
    forbiddenExistingMachineRadiusText: /Existing machine radius review/i.test(text),
  };
}

function markdownReport(report: WillRheaVisualReviewReport): string {
  return [
    "# Will Rhea Visual Review",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `Google Earth render proof: ${report.googleEarthRenderProof}`,
    `Canonical geometry mutation: ${report.canonicalGeometryMutation}`,
    "",
    "## Expected Visible Evidence",
    ...report.sourceFeatureIdsExpectedVisible.map((id) => `- ${id}`),
    "",
    "## Expected Hidden Generated Evidence",
    ...report.suppressedFeatureIdsExpectedHidden.map((id) => `- ${id}`),
    "",
    "## Screenshots",
    ...report.reviews.map((review) => [
      `- ${basename(review.path)}: ${review.metrics.width}x${review.metrics.height}, nonblank ${review.metrics.nonBlankPixelRatio.toFixed(4)}, variance ${review.metrics.grayVariance.toFixed(2)}, OCR ${review.ocr.available ? "available" : "unavailable"}, forbidden radius text ${review.ocr.forbiddenExistingMachineRadiusText}`,
    ].join("\n")),
    "",
    "## Warnings",
    ...report.warnings.map((warning) => `- ${warning}`),
    "",
  ].join("\n");
}

function valueArg(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

main();
