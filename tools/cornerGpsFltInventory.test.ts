import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCornerGpsFltInventoryReport,
  buildCornerGpsFltInventorySummary,
  type InventoryRoot,
} from "./cornerGpsFltInventory";

const root = mkdtempSync(join(tmpdir(), "cplayout-cornergps-flt-inventory-"));
const installRoot = join(root, "install");
const dataRoot = join(root, "data");
mkdirSync(join(installRoot, "config"), { recursive: true });
mkdirSync(join(dataRoot, "client-a"), { recursive: true });
writeFileSync(join(installRoot, "config", "synthetic.config"), "<configuration />\n");
writeFileSync(join(installRoot, "gpsmap.exe"), "synthetic executable fixture\n");
writeFileSync(join(dataRoot, "client-a", "field.bpf"), "<BorderPoints />\n");
writeFileSync(join(dataRoot, "client-a", "field.kml"), "<kml />\n");
writeFileSync(join(dataRoot, "client-a", "field.vri"), "synthetic vri fixture\n");
writeFileSync(join(dataRoot, "client-a", "do-not-hash.config"), "data config fixture\n");

const roots: InventoryRoot[] = [
  {
    id: "synthetic-install",
    label: "Synthetic install",
    localPath: installRoot,
    role: "install",
    maxDepth: 4,
  },
  {
    id: "synthetic-data",
    label: "Synthetic data",
    localPath: dataRoot,
    role: "data",
    maxDepth: 4,
  },
];

const report = buildCornerGpsFltInventoryReport("2026-06-08T00:00:00.000Z", { roots });
assert.equal(report.roots.length, 2);
assert.equal(report.supportedFileTypeCounts[".bpf"], 1);
assert.equal(report.supportedFileTypeCounts[".kml"], 1);
assert.equal(report.supportedFileTypeCounts[".vri"], 1);
assert.equal(report.artifacts.length, 2);
assert.equal(report.artifacts.every((artifact) => artifact.rootId === "synthetic-install"), true);
assert.equal(report.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)), true);
assert.equal(report.artifacts.some((artifact) => artifact.redactedPath.includes(root)), false);

const summary = buildCornerGpsFltInventorySummary(report, true);
assert.equal(summary.schemaVersion, "cplayout-cornergps-flt-inventory-summary-v1");
assert.equal(summary.dryRun, true);
assert.equal(summary.artifactCount, 2);
assert.equal(summary.artifactRootRoleCounts.install, 2);
assert.equal(summary.artifactRootRoleCounts.data, 0);
assert.equal(summary.supportedFileTypeCounts[".bpf"], 1);
assert.equal(JSON.stringify(summary).includes("redactedPath"), false);
assert.equal(JSON.stringify(summary).includes("sha256"), false);

console.log("CornerGPSMap / FLT inventory tests passed");
