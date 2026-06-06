import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateImageryEvidencePacket } from "@cplayout/core";

export interface VerifyImageryEvidencePacketOptions {
  packetPath: string;
  requireCalibratedProjectedCandidate?: boolean;
}

export interface VerifyImageryEvidencePacketSummary {
  ok: boolean;
  packetPath: string;
  status: "ready_for_read_only_report" | "blocked";
  blockerCount: number;
  warningCount: number;
  blockerCodes: string[];
  warningCodes: string[];
  summary: {
    artifactCount: number;
    attributionCount: number;
    visualEvidenceCount: number;
    candidateCount: number;
    projectedCandidateCount: number;
    validProjectedCandidateCount: number;
    hardFailureCount: number;
  };
  candidateReviews: Array<{
    candidateId: string;
    status: "metadata_only" | "blocked" | "calibrated_projected_xy";
    projectedGeometryPresent: boolean;
    blockerCount: number;
    warningCount: number;
  }>;
  reasons: string[];
  advisoryOnly: true;
  canonicalGeometryMutation: false;
  evidenceOnly: true;
  appImportable: false;
  writesProjectDatabase: false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseVerifyImageryEvidenceArgs(process.argv.slice(2));
  if (!args.packetPath) {
    console.error("Usage: npm run verify:imagery-evidence -- --packet <companion-evidence-packet.json> [--require-calibrated-projected-candidate] [--json]");
    process.exit(1);
  }
  const summary = verifyImageryEvidencePacket(args);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatVerifyImageryEvidencePacketSummary(summary));
  }
  process.exit(summary.ok ? 0 : 1);
}

export function parseVerifyImageryEvidenceArgs(rawArgs: string[]): VerifyImageryEvidencePacketOptions & { json: boolean } {
  return {
    packetPath: valueFor(rawArgs, "--packet") ?? rawArgs.find((arg) => !arg.startsWith("--")) ?? "",
    requireCalibratedProjectedCandidate: rawArgs.includes("--require-calibrated-projected-candidate"),
    json: rawArgs.includes("--json"),
  };
}

export function verifyImageryEvidencePacket(options: VerifyImageryEvidencePacketOptions): VerifyImageryEvidencePacketSummary {
  const packetPath = options.packetPath;
  try {
    const packet = JSON.parse(readFileSync(packetPath, "utf8")) as unknown;
    const result = validateImageryEvidencePacket(packet);
    const calibratedCandidates = result.candidateReviews.filter((review) => review.status === "calibrated_projected_xy");
    const reasons = [
      ...result.blockers.map((issue) => `${issue.path}: ${issue.message}`),
      ...(options.requireCalibratedProjectedCandidate && calibratedCandidates.length === 0
        ? ["No candidate review is calibrated_projected_xy."]
        : []),
    ];
    const ok = result.status === "ready_for_read_only_report"
      && (!options.requireCalibratedProjectedCandidate || calibratedCandidates.length > 0);
    return {
      ok,
      packetPath,
      status: ok ? result.status : "blocked",
      blockerCount: result.blockerCount,
      warningCount: result.warningCount,
      blockerCodes: result.blockers.map((issue) => issue.code),
      warningCodes: result.warnings.map((issue) => issue.code),
      summary: result.summary,
      candidateReviews: result.candidateReviews.map((review) => ({
        candidateId: review.candidateId,
        status: review.status,
        projectedGeometryPresent: review.projectedGeometryPresent,
        blockerCount: review.blockerCount,
        warningCount: review.warningCount,
      })),
      reasons,
      advisoryOnly: true,
      canonicalGeometryMutation: false,
      evidenceOnly: true,
      appImportable: false,
      writesProjectDatabase: false,
    };
  } catch (error) {
    return {
      ok: false,
      packetPath,
      status: "blocked",
      blockerCount: 1,
      warningCount: 0,
      blockerCodes: ["invalid_packet_json"],
      warningCodes: [],
      summary: {
        artifactCount: 0,
        attributionCount: 0,
        visualEvidenceCount: 0,
        candidateCount: 0,
        projectedCandidateCount: 0,
        validProjectedCandidateCount: 0,
        hardFailureCount: 0,
      },
      candidateReviews: [],
      reasons: [`Packet could not be read or parsed: ${error instanceof Error ? error.message : String(error)}`],
      advisoryOnly: true,
      canonicalGeometryMutation: false,
      evidenceOnly: true,
      appImportable: false,
      writesProjectDatabase: false,
    };
  }
}

export function formatVerifyImageryEvidencePacketSummary(summary: VerifyImageryEvidencePacketSummary): string {
  const lines = [
    `Imagery evidence packet: ${summary.ok ? "pass" : "blocked"}`,
    `packet: ${summary.packetPath}`,
    `status: ${summary.status}`,
    `blockers: ${summary.blockerCount}`,
    `warnings: ${summary.warningCount}`,
    `candidates: ${summary.candidateReviews.map((review) => `${review.candidateId}:${review.status}`).join(", ") || "none"}`,
  ];
  if (summary.reasons.length > 0) {
    lines.push("reasons:");
    for (const reason of summary.reasons) lines.push(`- ${reason}`);
  }
  lines.push("boundaries: advisoryOnly=true canonicalGeometryMutation=false appImportable=false writesProjectDatabase=false");
  return lines.join("\n");
}

function valueFor(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
