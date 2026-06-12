import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateImageryEvidencePacket } from "@cplayout/core";
import { parseCompleteAndroidNativeVerificationReport, SQLITE_SCHEMA_VERSION } from "@cplayout/project-store";
import {
  collectAndroidToolSnapshot,
  readExpoAndroidPackageName,
  reportFromSnapshot,
  timestampForFilename,
  writeJsonFile,
} from "./androidNativeProof";
import { DEFAULT_REAL_PIVOT_FIXTURE_MANIFEST_PATH, generateDefaultRealPivotFixtureManifest } from "./generateRealPivotFixtureManifest";

export type RoadmapGateStatus = "pass" | "fail" | "blocked" | "not_run";

export interface RoadmapCompletionOptions {
  full: boolean;
  dryRun: boolean;
  outputDirectory: string;
  androidReportPath?: string;
  googleEarthManifestPath?: string;
  nativeMapLibreReportPath?: string;
  realPivotFixturesPath?: string;
  realPivotProjectId?: string;
  realPivotProjectCrs?: string;
}

export interface RoadmapGateResult {
  id: string;
  label: string;
  status: RoadmapGateStatus;
  reason: string;
  command?: string;
  exitCode?: number | null;
  durationMs?: number;
  evidence?: string[];
  details?: unknown;
}

export interface RoadmapCompletionReport {
  schemaVersion: "cplayout-roadmap-completion-v1";
  generatedAt: string;
  commit: string;
  mode: "full" | "fast";
  status: "pass" | "fail" | "blocked";
  gates: RoadmapGateResult[];
  ownerInputContract: {
    decisionRequired: false;
    resourceInputs: string[];
  };
}

const DEFAULT_OUTPUT_DIRECTORY = "reports/roadmap-completion";
const DEFAULT_ANDROID_NATIVE_REPORT_DIRECTORY = "reports/android-native-verification";
const DEFAULT_GOOGLE_EARTH_MANIFEST_PATH = "reports/google-earth-visual-fidelity/visual-fidelity-manifest.json";
const DEFAULT_NATIVE_MAPLIBRE_REPORT_PATH = "reports/native-maplibre/latest.json";
const DEFAULT_REAL_PIVOT_FIXTURE_PATH = DEFAULT_REAL_PIVOT_FIXTURE_MANIFEST_PATH;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseRoadmapArgs(process.argv.slice(2), process.env);
  const report = runRoadmapCompletion(options);
  process.exit(report.status === "pass" ? 0 : report.status === "blocked" ? 2 : 1);
}

export function parseRoadmapArgs(
  rawArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
): RoadmapCompletionOptions {
  const fast = hasFlag(rawArgs, "--fast");
  return {
    full: hasFlag(rawArgs, "--full") || !fast,
    dryRun: hasFlag(rawArgs, "--dry-run"),
    outputDirectory: valueFor(rawArgs, "--output-dir") ?? env.CPLAYOUT_ROADMAP_REPORT_DIR ?? DEFAULT_OUTPUT_DIRECTORY,
    androidReportPath: valueFor(rawArgs, "--android-report") ?? env.CPLAYOUT_ANDROID_NATIVE_REPORT,
    googleEarthManifestPath: valueFor(rawArgs, "--google-earth-manifest") ?? env.CPLAYOUT_GOOGLE_EARTH_MANIFEST,
    nativeMapLibreReportPath: valueFor(rawArgs, "--native-maplibre-report")
      ?? env.CPLAYOUT_NATIVE_MAPLIBRE_REPORT
      ?? (existsSync(DEFAULT_NATIVE_MAPLIBRE_REPORT_PATH) ? DEFAULT_NATIVE_MAPLIBRE_REPORT_PATH : undefined),
    realPivotFixturesPath: valueFor(rawArgs, "--real-pivot-fixtures") ?? env.CPLAYOUT_REAL_PIVOT_FIXTURES,
    realPivotProjectId: valueFor(rawArgs, "--real-pivot-project-id") ?? env.CPLAYOUT_REAL_PIVOT_PROJECT_ID,
    realPivotProjectCrs: valueFor(rawArgs, "--real-pivot-project-crs") ?? env.CPLAYOUT_REAL_PIVOT_PROJECT_CRS,
  };
}

export function runRoadmapCompletion(options: RoadmapCompletionOptions): RoadmapCompletionReport {
  const generatedAt = new Date().toISOString();
  const gates: RoadmapGateResult[] = [];

  console.log(`CPLayout roadmap completion run: ${options.full ? "full" : "fast"} mode`);
  console.log("Automation policy: run eligible gates, report external proof blockers, do not ask for step-by-step decisions.");

  gates.push(worktreeGate(options));
  gates.push(commandGate("validate", "TypeScript and workspace tests", ["npm", "run", "validate"], options));
  gates.push(commandGate("validate-skills", "Skills, agents, hooks, and records", ["npm", "run", "validate:skills"], options));
  gates.push(commandGate("validate-design-guides", "Design-guide advisory records", ["npm", "run", "validate:design-guides"], options));
  gates.push(commandGate("ml-companion-tests", "Local ML companion tests", ["npm", "run", "test:ml-companion"], options));
  gates.push(commandGate("ml-cv-loop", "ML/CV loop ledger verification", ["npm", "run", "verify:ml-cv-loop"], options));
  gates.push(commandGate("whole-loop", "Whole-codebase loop ledger verification", ["npm", "run", "verify:whole-loop"], options));
  gates.push(commandGate("diff-check", "Whitespace diff check", ["git", "diff", "--check"], options));
  gates.push(commandGate("audit", "npm audit", ["npm", "audit"], options));
  gates.push(options.full
    ? commandGate("web-proof", "Static web export and Playwright proof", ["npm", "run", "proof:web"], options)
    : notRunGate("web-proof", "Static web export and Playwright proof", "Fast mode skipped browser proof; run with --full to include it."));

  gates.push(androidNativeGate(options, generatedAt));
  gates.push(retiredReviewContractsGate(options));
  gates.push(googleEarthVisualFidelityGate(options));
  gates.push(realPivotFixtureGate(options, generatedAt));
  gates.push(nativeMapLibreGate(options));

  const report: RoadmapCompletionReport = {
    schemaVersion: "cplayout-roadmap-completion-v1",
    generatedAt,
    commit: currentGitCommit(),
    mode: options.full ? "full" : "fast",
    status: summarizeStatus(gates),
    gates,
    ownerInputContract: {
      decisionRequired: false,
      resourceInputs: [
        `Android native proof: keep a completed schema-v${SQLITE_SCHEMA_VERSION} report under ${DEFAULT_ANDROID_NATIVE_REPORT_DIRECTORY}, connect an adb device/emulator with local.centerpivot.layout installed, or provide --android-report / CPLAYOUT_ANDROID_NATIVE_REPORT.`,
        `Google Earth proof: provide --google-earth-manifest / CPLAYOUT_GOOGLE_EARTH_MANIFEST when the default ${DEFAULT_GOOGLE_EARTH_MANIFEST_PATH} is not the target proof.`,
        `Real pivot proof: place a calibrated operator-approved fixture at ${DEFAULT_REAL_PIVOT_FIXTURE_PATH}, or provide --real-pivot-fixtures / CPLAYOUT_REAL_PIVOT_FIXTURES.`,
        "Native MapLibre proof: provide a completed native render report with --native-maplibre-report / CPLAYOUT_NATIVE_MAPLIBRE_REPORT after a device run.",
      ],
    },
  };

  const reportPath = join(options.outputDirectory, `roadmap-completion-${timestampForFilename(generatedAt)}.json`);
  const latestPath = join(options.outputDirectory, "latest.json");
  writeJsonFile(reportPath, report);
  writeJsonFile(latestPath, report);
  writeMarkdownSummary(join(options.outputDirectory, "latest.md"), report);

  console.log(`Roadmap completion report written: ${reportPath}`);
  console.log(`Roadmap completion latest report: ${latestPath}`);
  console.log(`Roadmap completion status: ${report.status}`);
  for (const gate of gates) {
    console.log(`- ${gate.status.toUpperCase()} ${gate.id}: ${gate.reason}`);
  }

  return report;
}

function commandGate(
  id: string,
  label: string,
  command: string[],
  options: RoadmapCompletionOptions,
): RoadmapGateResult {
  const startedAt = Date.now();
  const commandText = command.map((part) => part.includes(" ") ? JSON.stringify(part) : part).join(" ");
  if (options.dryRun) {
    return {
      id,
      label,
      status: "not_run",
      reason: `Dry run: would run ${commandText}.`,
      command: commandText,
      durationMs: 0,
    };
  }

  const [binary, ...args] = command;
  if (!binary) {
    return {
      id,
      label,
      status: "fail",
      reason: "Command gate has no executable.",
      command: commandText,
      exitCode: null,
      durationMs: Date.now() - startedAt,
    };
  }
  const result = spawnSync(binary, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const durationMs = Date.now() - startedAt;
  if (result.status === 0) {
    return {
      id,
      label,
      status: "pass",
      reason: "Command completed successfully.",
      command: commandText,
      exitCode: result.status,
      durationMs,
    };
  }
  return {
    id,
    label,
    status: "fail",
    reason: `Command failed with exit code ${result.status ?? "unknown"}.`,
    command: commandText,
    exitCode: result.status,
    durationMs,
  };
}

function worktreeGate(options: RoadmapCompletionOptions): RoadmapGateResult {
  const command = "git status --short --branch";
  if (options.dryRun) {
    return {
      id: "git-worktree",
      label: "Worktree snapshot",
      status: "not_run",
      reason: `Dry run: would run ${command}.`,
      command,
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  const result = spawnSync("git", ["status", "--short", "--branch"], {
    encoding: "utf8",
  });
  const durationMs = Date.now() - startedAt;
  if (result.status !== 0) {
    return {
      id: "git-worktree",
      label: "Worktree snapshot",
      status: "fail",
      reason: `git status failed with exit code ${result.status ?? "unknown"}.`,
      command,
      exitCode: result.status,
      durationMs,
    };
  }

  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const files = lines.slice(1);
  const trackedDirtyFiles = files.filter((line) => !line.startsWith("?? "));
  const untrackedFiles = files.filter((line) => line.startsWith("?? "));
  const clean = trackedDirtyFiles.length === 0 && untrackedFiles.length === 0;
  return {
    id: "git-worktree",
    label: "Worktree snapshot",
    status: "pass",
    reason: clean
      ? "Worktree is clean."
      : `Worktree has ${trackedDirtyFiles.length} tracked dirty files and ${untrackedFiles.length} untracked files; preserving as operator/prior-agent work.`,
    command,
    exitCode: result.status,
    durationMs,
    details: {
      clean,
      branch: lines[0] ?? "",
      trackedDirtyFiles,
      untrackedFiles,
    },
  };
}

function androidNativeGate(options: RoadmapCompletionOptions, generatedAt: string): RoadmapGateResult {
  if (options.dryRun) {
    return notRunGate(
      "android-native-runtime",
      "Android SQLite, ZIP sharing, picker, and migration runtime proof",
      "Dry run: would discover a completed Android report, detect adb/device state, or validate --android-report.",
    );
  }

  if (options.androidReportPath) {
    try {
      parseCompleteAndroidNativeVerificationReport(JSON.parse(readFileSync(options.androidReportPath, "utf8")));
      return {
        id: "android-native-runtime",
        label: "Android SQLite, ZIP sharing, picker, and migration runtime proof",
        status: "pass",
        reason: "Completed Android native verification report validated.",
        evidence: [options.androidReportPath],
      };
    } catch (error) {
      return {
        id: "android-native-runtime",
        label: "Android SQLite, ZIP sharing, picker, and migration runtime proof",
        status: "fail",
        reason: `Android report did not validate: ${error instanceof Error ? error.message : String(error)}`,
        evidence: [options.androidReportPath],
      };
    }
  }

  const discoveredReport = findCompletedAndroidNativeReport();
  if (discoveredReport) {
    return {
      id: "android-native-runtime",
      label: "Android SQLite, ZIP sharing, picker, and migration runtime proof",
      status: "pass",
      reason: "Discovered completed Android native verification report validated.",
      evidence: [discoveredReport.path],
      details: {
        generatedAt: discoveredReport.generatedAt,
        autoDiscovered: true,
      },
    };
  }

  const packageName = readExpoAndroidPackageName();
  const snapshot = collectAndroidToolSnapshot({
    packageName,
    outputDirectory: DEFAULT_ANDROID_NATIVE_REPORT_DIRECTORY,
  });
  const templatePath = join(
    DEFAULT_ANDROID_NATIVE_REPORT_DIRECTORY,
    `android-native-verification-${timestampForFilename(generatedAt)}.json`,
  );
  writeJsonFile(templatePath, reportFromSnapshot(snapshot));
  if (snapshot.blocker) {
    return {
      id: "android-native-runtime",
      label: "Android SQLite, ZIP sharing, picker, and migration runtime proof",
      status: "blocked",
      reason: snapshot.blocker,
      evidence: [templatePath],
    };
  }
  return {
    id: "android-native-runtime",
    label: "Android SQLite, ZIP sharing, picker, and migration runtime proof",
    status: "blocked",
    reason: "Device and native build detected, but the runtime checklist report is not complete yet.",
    evidence: [templatePath],
  };
}

export function findCompletedAndroidNativeReport(directory = DEFAULT_ANDROID_NATIVE_REPORT_DIRECTORY): {
  path: string;
  generatedAt: string;
} | null {
  if (!existsSync(directory)) return null;
  const candidates = readdirSync(directory)
    .filter((filename) => /^android-native-verification-.+\.json$/u.test(filename))
    .map((filename) => join(directory, filename))
    .map((path) => {
      try {
        const report = parseCompleteAndroidNativeVerificationReport(JSON.parse(readFileSync(path, "utf8")));
        return {
          path,
          generatedAt: report.generatedAt,
          mtimeMs: statSync(path).mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { path: string; generatedAt: string; mtimeMs: number } => candidate !== null)
    .sort((left, right) => {
      const generatedDelta = Date.parse(right.generatedAt) - Date.parse(left.generatedAt);
      if (Number.isFinite(generatedDelta) && generatedDelta !== 0) return generatedDelta;
      return right.mtimeMs - left.mtimeMs;
    });

  return candidates.length > 0
    ? { path: candidates[0].path, generatedAt: candidates[0].generatedAt }
    : null;
}

function retiredReviewContractsGate(options: RoadmapCompletionOptions): RoadmapGateResult {
  if (options.dryRun) {
    return notRunGate(
      "retired-review-contracts",
      "Retired Expert Review product contracts",
      "Dry run: would inspect removed review routes, contracts, archive exports, and SQLite migration.",
    );
  }

  const appPath = "apps/mobile/App.tsx";
  const archivePath = "packages/project-store/src/projectArchive.ts";
  const schemaPath = "packages/project-store/src/persistenceSchema.ts";
  const repositoryTypesPath = "packages/project-store/src/projectRepositoryTypes.ts";
  const reducerPath = "packages/core/src/projectReducer.ts";
  const appSource = existsSync(appPath) ? readFileSync(appPath, "utf8") : "";
  const archiveSource = existsSync(archivePath) ? readFileSync(archivePath, "utf8") : "";
  const schemaSource = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";
  const repositoryTypesSource = existsSync(repositoryTypesPath) ? readFileSync(repositoryTypesPath, "utf8") : "";
  const reducerSource = existsSync(reducerPath) ? readFileSync(reducerPath, "utf8") : "";
  const removedFiles = [
    "apps/mobile/src/components/ExpertReviewPanel.tsx",
    "packages/core/src/expertReview.ts",
    "packages/core/src/layoutEvidence.ts",
    "packages/project-store/src/projectReviewData.ts",
  ];
  const evidence = [appPath, archivePath, schemaPath, repositoryTypesPath, reducerPath, ...removedFiles];
  const missing = [
    ...removedFiles.map((path) => existsSync(path) ? `removed file still exists: ${path}` : ""),
    appSource.includes("\"review\"") || appSource.includes("workspace-nav-review") || appSource.includes("review-view") ? "mobile Review route/test IDs still present" : "",
    reducerSource.includes("apply_model_recommendation") ? "project reducer still exposes apply_model_recommendation" : "",
    repositoryTypesSource.includes("ProjectReviewData") || repositoryTypesSource.includes("loadProjectReviewDataAsync") || repositoryTypesSource.includes("saveProjectReviewDataAsync") ? "ProjectRepository still exposes review-data API" : "",
    archiveSource.includes("LEGACY_PROJECT_ARCHIVE_IGNORED_FILENAMES") ? "" : "archive importer lacks legacy review filename ignore list",
    archiveSource.includes("exports/layout-evidence.jsonl") && archiveSource.includes("exports/layout-decisions.jsonl") && archiveSource.includes("exports/model-recommendations.geojson") ? "" : "legacy review archive filenames are not explicitly ignored",
    SQLITE_SCHEMA_VERSION >= 10 ? "" : "SQLite schema version has not reached the retired-review migration gate",
    schemaSource.includes("DROP TABLE IF EXISTS layout_evidence") && schemaSource.includes("DROP TABLE IF EXISTS model_recommendations") && schemaSource.includes("DROP TABLE IF EXISTS layout_decisions") ? "" : "SQLite drop-review-contracts migration is missing",
  ].filter((value) => value.length > 0);

  if (missing.length > 0) {
    return {
      id: "retired-review-contracts",
      label: "Retired Expert Review product contracts",
      status: "blocked",
      reason: `Review product contract retirement is incomplete: ${missing.join(", ")}.`,
      evidence,
    };
  }

  return {
    id: "retired-review-contracts",
    label: "Retired Expert Review product contracts",
    status: "pass",
    reason: "Review UI routes, core contracts, repository APIs, archive exports, and SQLite tables are retired; legacy ZIP filenames are ignored for compatibility.",
    evidence,
  };
}

function googleEarthVisualFidelityGate(options: RoadmapCompletionOptions): RoadmapGateResult {
  if (options.dryRun) {
    return notRunGate(
      "google-earth-visual-fidelity",
      "Google Earth rendered KML/KMZ visual-fidelity proof",
      "Dry run: would validate an existing visual-fidelity manifest.",
    );
  }

  if (options.googleEarthManifestPath) {
    if (!existsSync(options.googleEarthManifestPath)) {
      return {
        id: "google-earth-visual-fidelity",
        label: "Google Earth rendered KML/KMZ visual-fidelity proof",
        status: "blocked",
        reason: `Google Earth visual-fidelity manifest does not exist: ${options.googleEarthManifestPath}`,
        evidence: [options.googleEarthManifestPath],
      };
    }
    const validation = validateGoogleEarthManifest(options.googleEarthManifestPath);
    return {
      id: "google-earth-visual-fidelity",
      label: "Google Earth rendered KML/KMZ visual-fidelity proof",
      status: validation.ok ? "pass" : "fail",
      reason: validation.ok
        ? "Google Earth manifest proves rendered non-black/non-uniform map canvas, overlay confirmation, KML integrity, and uncontaminated cleanup."
        : `Google Earth visual-fidelity manifest is not a strict proof: ${validation.errors.join("; ")}`,
      evidence: validation.evidence,
      details: validation.details,
    };
  }

  const candidates = findGoogleEarthManifestCandidates();
  if (candidates.length === 0) {
    return {
      id: "google-earth-visual-fidelity",
      label: "Google Earth rendered KML/KMZ visual-fidelity proof",
      status: "blocked",
      reason: `No Google Earth visual-fidelity manifest found. Expected ${DEFAULT_GOOGLE_EARTH_MANIFEST_PATH} or --google-earth-manifest.`,
    };
  }
  const validations = candidates.map((manifestPath) => validateGoogleEarthManifest(manifestPath));
  const validation = validations.find((candidate) => candidate.ok) ?? validations[0];
  if (!validation) {
    return {
      id: "google-earth-visual-fidelity",
      label: "Google Earth rendered KML/KMZ visual-fidelity proof",
      status: "blocked",
      reason: "No readable Google Earth visual-fidelity manifest was found.",
    };
  }
  return {
    id: "google-earth-visual-fidelity",
    label: "Google Earth rendered KML/KMZ visual-fidelity proof",
    status: validation.ok ? "pass" : "fail",
    reason: validation.ok
      ? "Google Earth manifest proves rendered non-black/non-uniform map canvas, overlay confirmation, KML integrity, and uncontaminated cleanup."
      : `Google Earth visual-fidelity manifest is not a strict proof: ${validation.errors.join("; ")}`,
    evidence: validation.evidence,
    details: validation.details,
  };
}

function realPivotFixtureGate(options: RoadmapCompletionOptions, generatedAt: string): RoadmapGateResult {
  if (options.dryRun) {
    return notRunGate(
      "real-pivot-fixture-proof",
      "Operator-approved calibrated real pivot fixture proof",
      "Dry run: would detect/build the real pivot fixture evidence packet.",
    );
  }

  const generatedFixture = options.realPivotFixturesPath || existsSync(DEFAULT_REAL_PIVOT_FIXTURE_PATH)
    ? null
    : tryGenerateDefaultRealPivotFixture(generatedAt);
  const fixturePath = options.realPivotFixturesPath
    ?? (existsSync(DEFAULT_REAL_PIVOT_FIXTURE_PATH)
      ? DEFAULT_REAL_PIVOT_FIXTURE_PATH
      : generatedFixture && "path" in generatedFixture ? generatedFixture.path : undefined);
  if (!fixturePath) {
    const generationError = generatedFixture && "error" in generatedFixture ? generatedFixture.error : undefined;
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: "blocked",
      reason: generationError
        ? `Default real pivot fixture manifest could not be generated: ${generationError}`
        : `No real pivot fixture manifest found. Expected ${DEFAULT_REAL_PIVOT_FIXTURE_PATH} or --real-pivot-fixtures.`,
    };
  }
  if (!existsSync(fixturePath)) {
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: "blocked",
      reason: `Real pivot fixture manifest does not exist: ${fixturePath}`,
    };
  }

  const context = inferRealPivotContext(fixturePath, options);
  if (context.error) {
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: "fail",
      reason: context.error,
      evidence: [fixturePath],
    };
  }
  if (!context.projectId || !context.projectCrs) {
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: "blocked",
      reason: "Real pivot fixture manifest must provide projectId and projectCrs, or pass --real-pivot-project-id and --real-pivot-project-crs.",
      evidence: [fixturePath],
    };
  }

  const outputDirectory = join("reports/real-pivot-fixtures", timestampForFilename(generatedAt));
  const command = [
    "python3",
    "-m",
    "cplayout_ml.cli",
    "build-evidence-packet",
    "--project-id",
    context.projectId,
    "--project-crs",
    context.projectCrs,
    "--real-pivot-fixtures",
    fixturePath,
    "--output-dir",
    outputDirectory,
  ];
  const result = spawnSync(command[0], command.slice(1), {
    shell: process.platform === "win32",
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONPATH: "tools/local-ml-companion/src",
    },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const missingLocalArtifact = output.includes("Companion artifact does not exist");
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: missingLocalArtifact ? "blocked" : "fail",
      reason: missingLocalArtifact
        ? `Fixture evidence packet is blocked by a missing local artifact: ${output}`
        : `Fixture evidence packet build failed with exit code ${result.status ?? "unknown"}.`,
      command: command.join(" "),
      exitCode: result.status,
      evidence: [fixturePath, outputDirectory],
      details: output ? { output } : undefined,
    };
  }

  const packetPath = join(outputDirectory, "companion-evidence-packet.json");
  const projectedGeoJsonPath = join(outputDirectory, "companion-evidence-packet-projected-xy.geojson");
  const validation = validateRealPivotEvidencePacket(packetPath);
  if (!validation.ok) {
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: validation.blocked ? "blocked" : "fail",
      reason: validation.reason,
      command: command.join(" "),
      exitCode: result.status,
      evidence: [fixturePath, packetPath, projectedGeoJsonPath],
      details: validation.details,
    };
  }
  const recommendation = firstProjectedPivotRecommendation(packetPath);
  if (!recommendation.ok) {
    return {
      id: "real-pivot-fixture-proof",
      label: "Operator-approved calibrated real pivot fixture proof",
      status: "blocked",
      reason: recommendation.reason,
      command: command.join(" "),
      exitCode: result.status,
      evidence: [fixturePath, packetPath, projectedGeoJsonPath],
    };
  }
  return {
    id: "real-pivot-fixture-proof",
    label: "Operator-approved calibrated real pivot fixture proof",
    status: "pass",
    reason: "Strict v2 companion packet validation passed and the calibrated operator-approved fixture produced a standalone projected-XY pivot-center candidate report.",
    command: command.join(" "),
    exitCode: result.status,
    evidence: [fixturePath, packetPath, projectedGeoJsonPath],
  };
}

function nativeMapLibreGate(options: RoadmapCompletionOptions): RoadmapGateResult {
  if (options.dryRun) {
    return notRunGate(
      "native-maplibre-render-proof",
      "Native MapLibre TileJSON/template render proof",
      "Dry run: would validate --native-maplibre-report when provided.",
    );
  }

  if (!options.nativeMapLibreReportPath) {
    return {
      id: "native-maplibre-render-proof",
      label: "Native MapLibre TileJSON/template render proof",
      status: "blocked",
      reason: "No native MapLibre render report provided. TileJSON/template adapter readiness is local-code proven, but native render evidence requires device output.",
    };
  }
  try {
    const rawReport = readJsonWithBom(options.nativeMapLibreReportPath) as { status?: unknown; notes?: unknown };
    if (rawReport.status === "blocked") {
      return {
        id: "native-maplibre-render-proof",
        label: "Native MapLibre TileJSON/template render proof",
        status: "blocked",
        reason: typeof rawReport.notes === "string" && rawReport.notes.length > 0
          ? rawReport.notes
          : "Native MapLibre report records a blocked device/runtime proof.",
        evidence: [options.nativeMapLibreReportPath],
      };
    }
    const validation = validateNativeMapLibreReport(options.nativeMapLibreReportPath);
    if (validation.ok) {
      return {
        id: "native-maplibre-render-proof",
        label: "Native MapLibre TileJSON/template render proof",
        status: "pass",
        reason: "Native MapLibre render report validated.",
        evidence: validation.evidence,
        details: validation.details,
      };
    }
    return {
      id: "native-maplibre-render-proof",
      label: "Native MapLibre TileJSON/template render proof",
      status: "fail",
      reason: `Native MapLibre report is incomplete: ${validation.errors.join("; ")}`,
      evidence: validation.evidence,
      details: validation.details,
    };
  } catch (error) {
    return {
      id: "native-maplibre-render-proof",
      label: "Native MapLibre TileJSON/template render proof",
      status: "fail",
      reason: `Native MapLibre report could not be read: ${error instanceof Error ? error.message : String(error)}`,
      evidence: [options.nativeMapLibreReportPath],
    };
  }
}

export function validateGoogleEarthManifest(manifestPath: string): {
  ok: boolean;
  errors: string[];
  evidence: string[];
  details: unknown;
} {
  const errors: string[] = [];
  const manifest = readJsonWithBom(manifestPath) as {
    schemaVersion?: unknown;
    status?: unknown;
    proofPassed?: unknown;
    outputDir?: unknown;
    googleEarth?: {
      cleanup?: {
        status?: unknown;
        contaminated?: unknown;
        postflightProcessRemaining?: unknown;
      };
    };
    thresholds?: {
      minimumNonBlackRatio?: unknown;
      minimumGrayVariance?: unknown;
    };
    artifacts?: {
      kml?: unknown;
      kmz?: unknown;
      kmlIntegrity?: { passed?: unknown };
    };
    captures?: Array<{
      filename?: unknown;
      label?: unknown;
      width?: unknown;
      height?: unknown;
      sha256?: unknown;
      analysis?: {
        nonBlackRatio?: unknown;
        grayVariance?: unknown;
        mostlyBlack?: unknown;
        nearUniform?: unknown;
      } | null;
    }>;
    manualReview?: {
      overlayVisibleConfirmed?: unknown;
    };
  };

  if (manifest.schemaVersion !== "cplayout-google-earth-visual-fidelity-proof-v1") errors.push("schemaVersion mismatch");
  if (manifest.status !== "passed") errors.push("status must be passed");
  if (manifest.proofPassed !== true) errors.push("proofPassed must be true");
  if (manifest.artifacts?.kmlIntegrity?.passed !== true) errors.push("KML integrity must pass");
  if (manifest.manualReview?.overlayVisibleConfirmed !== true) errors.push("overlayVisibleConfirmed must be true");

  const minimumNonBlackRatio = typeof manifest.thresholds?.minimumNonBlackRatio === "number"
    ? manifest.thresholds.minimumNonBlackRatio
    : 0.08;
  const minimumGrayVariance = typeof manifest.thresholds?.minimumGrayVariance === "number"
    ? manifest.thresholds.minimumGrayVariance
    : 80;
  const mapCanvas = (manifest.captures ?? []).find((capture) => {
    const filename = typeof capture.filename === "string" ? capture.filename.toLowerCase() : "";
    const label = typeof capture.label === "string" ? capture.label.toLowerCase() : "";
    return filename.includes("map-canvas") || label.includes("map-canvas");
  });
  if (!mapCanvas) {
    errors.push("map-canvas capture is required");
  } else {
    const analysis = mapCanvas.analysis;
    if (typeof mapCanvas.width !== "number" || mapCanvas.width <= 0) errors.push("map-canvas width must be positive");
    if (typeof mapCanvas.height !== "number" || mapCanvas.height <= 0) errors.push("map-canvas height must be positive");
    if (typeof mapCanvas.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(mapCanvas.sha256)) {
      errors.push("map-canvas SHA-256 is required");
    }
    if (!analysis) {
      errors.push("map-canvas pixel analysis is required");
    } else {
      if (typeof analysis.nonBlackRatio !== "number" || analysis.nonBlackRatio < minimumNonBlackRatio) {
        errors.push(`map-canvas nonBlackRatio must be at least ${minimumNonBlackRatio}`);
      }
      if (typeof analysis.grayVariance !== "number" || analysis.grayVariance < minimumGrayVariance) {
        errors.push(`map-canvas grayVariance must be at least ${minimumGrayVariance}`);
      }
      if (analysis.mostlyBlack !== false) errors.push("map-canvas must not be mostly black");
      if (analysis.nearUniform !== false) errors.push("map-canvas must not be near-uniform");
    }
  }

  const cleanup = manifest.googleEarth?.cleanup;
  if (!cleanup) {
    errors.push("Google Earth cleanup evidence is required");
  } else {
    if (cleanup.contaminated === true) errors.push("cleanup must not be contaminated");
    if (cleanup.postflightProcessRemaining === true) errors.push("targeted Google Earth process must not remain after cleanup");
    if (typeof cleanup.status === "string" && /blocked|contaminated/i.test(cleanup.status)) {
      errors.push(`cleanup status is not acceptable: ${cleanup.status}`);
    }
  }

  const outputDir = typeof manifest.outputDir === "string" ? normalizeReportPath(manifest.outputDir) : dirname(manifestPath);
  const evidence = [
    manifestPath,
    stringEvidencePath(outputDir, manifest.artifacts?.kml),
    stringEvidencePath(outputDir, manifest.artifacts?.kmz),
  ].filter((value): value is string => Boolean(value));

  return {
    ok: errors.length === 0,
    errors,
    evidence,
    details: {
      status: manifest.status,
      proofPassed: manifest.proofPassed,
      mapCanvas,
      cleanup,
    },
  };
}

export function validateNativeMapLibreReport(reportPath: string): {
  ok: boolean;
  errors: string[];
  evidence: string[];
  details: unknown;
} {
  const errors: string[] = [];
  const report = readJsonWithBom(reportPath) as {
    reportSchemaVersion?: unknown;
    proofTarget?: unknown;
    status?: unknown;
    target?: unknown;
    generatedAt?: unknown;
    device?: { adbSerial?: unknown; model?: unknown; osVersion?: unknown; apiLevel?: unknown };
    app?: { packageName?: unknown; versionName?: unknown; versionCode?: unknown; buildType?: unknown; commit?: unknown };
    tileSource?: {
      tileSourceKind?: unknown;
      tileContentType?: unknown;
      sourceComponent?: unknown;
      tileJsonUrl?: unknown;
      tileUrlTemplates?: unknown;
      sourceLayers?: unknown;
      attribution?: unknown;
    };
    screenshot?: {
      path?: unknown;
      sha256?: unknown;
      width?: unknown;
      height?: unknown;
      nonBlankPixelRatio?: unknown;
      grayVariance?: unknown;
    };
    boundaries?: {
      noRawPmtilesMbtilesNativeProof?: unknown;
      canonicalGeometryMutation?: unknown;
      networkRequired?: unknown;
    };
    tileServer?: {
      tileJsonRequests?: unknown;
      tileRequests?: unknown;
    };
    logcat?: {
      path?: unknown;
      sha256?: unknown;
      lineCount?: unknown;
      mapLibreLineCount?: unknown;
      mapLibreErrorLines?: unknown;
      resourceUrlErrorCount?: unknown;
      resourceUrlErrorLines?: unknown;
      clearedBeforeLaunch?: unknown;
    };
  };
  if (report.reportSchemaVersion !== 1) errors.push("reportSchemaVersion must be 1");
  if (report.proofTarget !== "native-maplibre-render") errors.push("proofTarget must be native-maplibre-render");
  if (report.status !== "pass") errors.push("status must be pass");
  if (report.target !== "native_maplibre_rn") errors.push("target must be native_maplibre_rn");
  for (const [label, value] of Object.entries({
    generatedAt: report.generatedAt,
    adbSerial: report.device?.adbSerial,
    model: report.device?.model,
    osVersion: report.device?.osVersion,
    packageName: report.app?.packageName,
    buildType: report.app?.buildType,
    commit: report.app?.commit,
    attribution: report.tileSource?.attribution,
  })) {
    if (typeof value !== "string" || value.trim().length === 0) errors.push(`${label} is required`);
  }
  if (report.tileSource?.tileSourceKind !== "tilejson_or_template") {
    errors.push("tileSource.tileSourceKind must be tilejson_or_template");
  }
  if (report.tileSource?.tileContentType !== "vector") {
    errors.push("tileSource.tileContentType must be vector");
  }
  if (report.tileSource?.sourceComponent !== "VectorSource") {
    errors.push("tileSource.sourceComponent must be VectorSource");
  }
  const sourceLayers = report.tileSource?.sourceLayers as { roads?: unknown; roadLabels?: unknown; borders?: unknown; places?: unknown } | undefined;
  for (const [label, value] of Object.entries({
    roads: sourceLayers?.roads,
    roadLabels: sourceLayers?.roadLabels,
    borders: sourceLayers?.borders,
    places: sourceLayers?.places,
  })) {
    if (typeof value !== "string" || value.trim().length === 0) errors.push(`tileSource.sourceLayers.${label} is required`);
  }
  const tileUrls = [
    typeof report.tileSource?.tileJsonUrl === "string" ? report.tileSource.tileJsonUrl : undefined,
    ...(Array.isArray(report.tileSource?.tileUrlTemplates) ? report.tileSource.tileUrlTemplates : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (tileUrls.length === 0) errors.push("at least one TileJSON URL or tile URL template is required");
  if (!tileUrls.every(isLocalTileSourceUrl)) errors.push("tile URLs must be local app-readable or localhost sources");

  const screenshotPath = typeof report.screenshot?.path === "string" && report.screenshot.path.trim().length > 0
    ? resolve(dirname(reportPath), report.screenshot.path)
    : "";
  if (!screenshotPath) {
    errors.push("screenshot.path is required");
  } else if (!existsSync(screenshotPath)) {
    errors.push(`screenshot does not exist: ${screenshotPath}`);
  }
  if (typeof report.screenshot?.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(report.screenshot.sha256)) {
    errors.push("screenshot.sha256 must be a SHA-256 hex digest");
  } else if (screenshotPath && existsSync(screenshotPath)) {
    const actualSha256 = sha256File(screenshotPath);
    if (actualSha256.toLowerCase() !== report.screenshot.sha256.toLowerCase()) {
      errors.push("screenshot.sha256 does not match the screenshot file");
    }
  }
  if (typeof report.screenshot?.width !== "number" || report.screenshot.width <= 0) errors.push("screenshot.width must be positive");
  if (typeof report.screenshot?.height !== "number" || report.screenshot.height <= 0) errors.push("screenshot.height must be positive");
  if (typeof report.screenshot?.nonBlankPixelRatio !== "number" || report.screenshot.nonBlankPixelRatio <= 0) {
    errors.push("screenshot.nonBlankPixelRatio must be greater than zero");
  }
  if (typeof report.screenshot?.grayVariance !== "number" || report.screenshot.grayVariance <= 0) {
    errors.push("screenshot.grayVariance must be greater than zero");
  }
  if (report.boundaries?.noRawPmtilesMbtilesNativeProof !== true) {
    errors.push("boundaries.noRawPmtilesMbtilesNativeProof must be true");
  }
  if (report.boundaries?.canonicalGeometryMutation !== false) {
    errors.push("boundaries.canonicalGeometryMutation must be false");
  }
  if (report.boundaries?.networkRequired !== false) {
    errors.push("boundaries.networkRequired must be false");
  }
  if (typeof report.tileServer?.tileRequests !== "number" || report.tileServer.tileRequests <= 0) {
    errors.push("tileServer.tileRequests must be greater than zero");
  }
  if (report.tileServer?.tileJsonRequests !== undefined
    && (typeof report.tileServer.tileJsonRequests !== "number" || report.tileServer.tileJsonRequests < 0)) {
    errors.push("tileServer.tileJsonRequests must be a nonnegative number when present");
  }
  const logcatPath = typeof report.logcat?.path === "string" && report.logcat.path.trim().length > 0
    ? resolve(dirname(reportPath), report.logcat.path)
    : "";
  if (!logcatPath) {
    errors.push("logcat.path is required");
  } else if (!existsSync(logcatPath)) {
    errors.push(`logcat evidence does not exist: ${logcatPath}`);
  }
  if (typeof report.logcat?.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(report.logcat.sha256)) {
    errors.push("logcat.sha256 must be a SHA-256 hex digest");
  } else if (logcatPath && existsSync(logcatPath)) {
    const actualSha256 = sha256File(logcatPath);
    if (actualSha256.toLowerCase() !== report.logcat.sha256.toLowerCase()) {
      errors.push("logcat.sha256 does not match the logcat evidence file");
    }
  }
  if (typeof report.logcat?.lineCount !== "number" || report.logcat.lineCount < 0) {
    errors.push("logcat.lineCount must be a nonnegative number");
  }
  if (typeof report.logcat?.mapLibreLineCount !== "number" || report.logcat.mapLibreLineCount < 0) {
    errors.push("logcat.mapLibreLineCount must be a nonnegative number");
  }
  if (!Array.isArray(report.logcat?.mapLibreErrorLines)) {
    errors.push("logcat.mapLibreErrorLines must be an array");
  }
  if (typeof report.logcat?.resourceUrlErrorCount !== "number" || report.logcat.resourceUrlErrorCount !== 0) {
    errors.push("logcat.resourceUrlErrorCount must be 0");
  }
  if (!Array.isArray(report.logcat?.resourceUrlErrorLines) || report.logcat.resourceUrlErrorLines.length !== 0) {
    errors.push("logcat.resourceUrlErrorLines must be an empty array");
  }

  return {
    ok: errors.length === 0,
    errors,
    evidence: [reportPath, screenshotPath, logcatPath].filter((value) => value.length > 0),
    details: {
      target: report.target,
      tileSource: report.tileSource,
      screenshot: report.screenshot,
      boundaries: report.boundaries,
      tileServer: report.tileServer,
      logcat: report.logcat,
    },
  };
}

function inferRealPivotContext(
  fixturePath: string,
  options: RoadmapCompletionOptions,
): { projectId?: string; projectCrs?: string; error?: string } {
  try {
    const manifest = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      projectId?: unknown;
      projectCrs?: unknown;
      fixtures?: Array<{ projectId?: unknown; projectCrs?: unknown }>;
    };
    const fixture = Array.isArray(manifest.fixtures) ? manifest.fixtures[0] : undefined;
    return {
      projectId: options.realPivotProjectId ?? stringOrUndefined(manifest.projectId) ?? stringOrUndefined(fixture?.projectId),
      projectCrs: options.realPivotProjectCrs ?? stringOrUndefined(manifest.projectCrs) ?? stringOrUndefined(fixture?.projectCrs),
    };
  } catch (error) {
    return { error: `Real pivot fixture manifest could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function validateRealPivotEvidencePacket(packetPath: string): { ok: true; details: unknown } | { ok: false; blocked: boolean; reason: string; details: unknown } {
  try {
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as unknown;
    const result = validateImageryEvidencePacket(packet);
    const projectedPivotReview = result.candidateReviews.find((review) => review.status === "calibrated_projected_xy");
    const details = {
      status: result.status,
      blockerCount: result.blockerCount,
      warningCount: result.warningCount,
      summary: result.summary,
      candidateReviews: result.candidateReviews.map((review) => ({
        candidateId: review.candidateId,
        status: review.status,
        projectedGeometryPresent: review.projectedGeometryPresent,
        blockerCount: review.blockerCount,
        warningCount: review.warningCount,
      })),
      blockerCodes: result.blockers.map((issue) => issue.code),
      warningCodes: result.warnings.map((issue) => issue.code),
    };
    if (result.status !== "ready_for_read_only_report") {
      return {
        ok: false,
        blocked: true,
        reason: `Fixture packet failed strict cplayout-imagery-evidence-v2 validation: ${result.blockers.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
        details,
      };
    }
    if (!projectedPivotReview) {
      return {
        ok: false,
        blocked: true,
        reason: "Fixture packet passed v2 metadata checks, but no candidate review is calibrated_projected_xy.",
        details,
      };
    }
    return { ok: true, details };
  } catch (error) {
    return {
      ok: false,
      blocked: false,
      reason: `Fixture packet could not be parsed or validated: ${error instanceof Error ? error.message : String(error)}`,
      details: {},
    };
  }
}

function firstProjectedPivotRecommendation(packetPath: string): { ok: true } | { ok: false; reason: string } {
  const packet = JSON.parse(readFileSync(packetPath, "utf8")) as {
    candidateReports?: Array<{
      proposedGeometry?: { pivotCenter?: unknown };
      metadata?: { hardFailures?: unknown };
    }>;
    modelRecommendations?: Array<{
      proposedGeometry?: { pivotCenter?: unknown };
      metadata?: { hardFailures?: unknown };
    }>;
  };
  const recommendations = packet.candidateReports ?? packet.modelRecommendations ?? [];
  const projectedPivotRecommendation = recommendations.find((recommendation) => {
    const hardFailures = recommendation.metadata?.hardFailures;
    return Boolean(recommendation.proposedGeometry?.pivotCenter)
      && (!Array.isArray(hardFailures) || hardFailures.length === 0);
  });
  if (projectedPivotRecommendation) return { ok: true };
  return {
    ok: false,
    reason: "Fixture packet built, but no candidate report contains projectedGeometry.pivotCenter without hard failures. Treat as evidence-only until calibrated truth is supplied.",
  };
}

function tryGenerateDefaultRealPivotFixture(generatedAt: string): { path: string } | { error: string } {
  try {
    return { path: generateDefaultRealPivotFixtureManifest({ generatedAt }).path };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function notRunGate(id: string, label: string, reason: string): RoadmapGateResult {
  return { id, label, status: "not_run", reason };
}

function summarizeStatus(gates: RoadmapGateResult[]): RoadmapCompletionReport["status"] {
  if (gates.some((gate) => gate.status === "fail")) return "fail";
  if (gates.some((gate) => gate.status === "blocked")) return "blocked";
  return "pass";
}

function writeMarkdownSummary(path: string, report: RoadmapCompletionReport): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const lines = [
    "# CPLayout Roadmap Completion Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Commit: ${report.commit}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    "",
    "| Gate | Status | Reason |",
    "| --- | --- | --- |",
    ...report.gates.map((gate) => `| ${gate.id} | ${gate.status} | ${gate.reason.replaceAll("|", "\\|")} |`),
    "",
    "## Resource Inputs",
    "",
    ...report.ownerInputContract.resourceInputs.map((input) => `- ${input}`),
    "",
  ];
  writeFileSync(path, lines.join("\n"), "utf8");
}

function findGoogleEarthManifestCandidates(root = "reports/google-earth-visual-fidelity"): string[] {
  if (!existsSync(root)) return [];
  const manifests = findFiles(root, "visual-fidelity-manifest.json");
  const candidates = [
    existsSync(DEFAULT_GOOGLE_EARTH_MANIFEST_PATH) ? DEFAULT_GOOGLE_EARTH_MANIFEST_PATH : undefined,
    ...manifests
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .map((entry) => entry.path),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

function findFiles(root: string, filename: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(path, filename));
    } else if (entry.isFile() && entry.name === filename) {
      found.push(path);
    }
  }
  return found;
}

function readJsonWithBom(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeReportPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function stringEvidencePath(baseDir: string, value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const normalized = normalizeReportPath(value);
  if (existsSync(normalized)) return normalized;
  const relativeToBase = join(normalizeReportPath(baseDir), normalized.split("/").pop() ?? normalized);
  return existsSync(relativeToBase) ? relativeToBase : normalized;
}

function isLocalTileSourceUrl(value: string): boolean {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("file://")
    || lower.startsWith("asset://")
    || lower.startsWith("content://")
    || lower.startsWith("app://")
    || lower.startsWith("blob:")
    || lower.startsWith("data:")
    || lower.startsWith("/")
    || lower.startsWith("./")
    || lower.startsWith("../")
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1");
  } catch {
    return false;
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hasFlag(rawArgs: string[], name: string): boolean {
  return rawArgs.includes(name);
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function currentGitCommit(): string {
  const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
