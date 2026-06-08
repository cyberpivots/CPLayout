import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

interface InventoryRoot {
  id: string;
  label: string;
  localPath: string;
  role: "install" | "data";
  maxDepth: number;
}

interface InventoryArtifact {
  rootId: string;
  redactedPath: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
}

interface InventoryReport {
  schemaVersion: "cplayout-cornergps-flt-inventory-v1";
  generatedAt: string;
  outputDir: string;
  boundaries: {
    redacted: true;
    rawCustomerFilesCommitted: false;
    credentialsCommitted: false;
    controllerCompatibilityClaimed: false;
  };
  roots: Array<{
    id: string;
    label: string;
    role: "install" | "data";
    exists: boolean;
  }>;
  artifacts: InventoryArtifact[];
  supportedFileTypeCounts: Record<string, number>;
  skipped: Array<{ rootId: string; redactedPath: string; reason: string }>;
  warnings: string[];
}

const DEFAULT_ROOTS: InventoryRoot[] = [
  {
    id: "valley-flt-4-4-4",
    label: "Valley FLT 4.4.4 install",
    localPath: "/mnt/c/Program Files (x86)/Valmont/Valley FLT 4.4.4",
    role: "install",
    maxDepth: 6,
  },
  {
    id: "corner-gps-mapping-1-0-0-0",
    label: "Corner GPS Mapping 1.0.0.0 install",
    localPath: "/mnt/c/Valmont/Service Tools Suite/Common Service Tools/GPS Mapping/1.0.0.0",
    role: "install",
    maxDepth: 6,
  },
  {
    id: "valmont-service-tools-common",
    label: "Valmont Common Service Tools local data",
    localPath: "/mnt/c/Valmont/Service Tools Suite/Common Service Tools",
    role: "data",
    maxDepth: 4,
  },
];

const HASHED_EXTENSIONS = new Set([
  ".config",
  ".dll",
  ".exe",
  ".ini",
  ".json",
  ".manifest",
  ".settings",
  ".txt",
  ".xml",
  ".xsd",
]);

const COUNTED_EXTENSIONS = new Set([
  ".bpf",
  ".csv",
  ".ggs",
  ".kml",
  ".kmz",
  ".opt",
  ".out",
  ".vri",
]);

const MAX_HASH_BYTES = 100 * 1024 * 1024;

export function buildCornerGpsFltInventoryReport(generatedAt = new Date().toISOString()): InventoryReport {
  const timestamp = generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outputDir = join("reports", "cornergps-flt-inventory", timestamp);
  const artifacts: InventoryArtifact[] = [];
  const supportedFileTypeCounts: Record<string, number> = {};
  const skipped: InventoryReport["skipped"] = [];
  const warnings: string[] = [];

  for (const root of DEFAULT_ROOTS) {
    if (!existsSync(root.localPath)) continue;
    walkRoot(root, root.localPath, 0, artifacts, supportedFileTypeCounts, skipped);
  }

  if (artifacts.length === 0) {
    warnings.push("No executable/config artifacts were found under the known FLT/CornerGPSMap paths on this machine.");
  }

  return {
    schemaVersion: "cplayout-cornergps-flt-inventory-v1",
    generatedAt,
    outputDir,
    boundaries: {
      redacted: true,
      rawCustomerFilesCommitted: false,
      credentialsCommitted: false,
      controllerCompatibilityClaimed: false,
    },
    roots: DEFAULT_ROOTS.map((root) => ({
      id: root.id,
      label: root.label,
      role: root.role,
      exists: existsSync(root.localPath),
    })),
    artifacts: artifacts.sort((a, b) => a.redactedPath.localeCompare(b.redactedPath)),
    supportedFileTypeCounts: sortCounts(supportedFileTypeCounts),
    skipped,
    warnings,
  };
}

export function writeCornerGpsFltInventoryReport(report: InventoryReport): { manifestPath: string; readmePath: string } {
  mkdirSync(report.outputDir, { recursive: true });
  const manifestPath = join(report.outputDir, "manifest.json");
  const readmePath = join(report.outputDir, "README.md");
  writeFileSync(manifestPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(readmePath, readmeFor(report));
  return { manifestPath, readmePath };
}

function walkRoot(
  root: InventoryRoot,
  currentPath: string,
  depth: number,
  artifacts: InventoryArtifact[],
  supportedFileTypeCounts: Record<string, number>,
  skipped: InventoryReport["skipped"],
): void {
  if (depth > root.maxDepth) return;
  let entries: string[];
  try {
    entries = readdirSync(currentPath);
  } catch {
    skipped.push({ rootId: root.id, redactedPath: redactedPath(root, currentPath), reason: "Directory could not be read." });
    return;
  }

  for (const entry of entries) {
    const path = join(currentPath, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      skipped.push({ rootId: root.id, redactedPath: redactedPath(root, path), reason: "Path could not be statted." });
      continue;
    }
    if (stat.isDirectory()) {
      walkRoot(root, path, depth + 1, artifacts, supportedFileTypeCounts, skipped);
      continue;
    }
    if (!stat.isFile()) continue;

    const extension = extensionOf(entry);
    if (COUNTED_EXTENSIONS.has(extension)) {
      supportedFileTypeCounts[extension] = (supportedFileTypeCounts[extension] ?? 0) + 1;
    }
    if (!HASHED_EXTENSIONS.has(extension)) continue;
    if (stat.size > MAX_HASH_BYTES) {
      skipped.push({ rootId: root.id, redactedPath: redactedPath(root, path), reason: "Artifact exceeded hash size limit." });
      continue;
    }
    artifacts.push({
      rootId: root.id,
      redactedPath: redactedPath(root, path),
      extension,
      sizeBytes: stat.size,
      sha256: sha256File(path),
    });
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function redactedPath(root: InventoryRoot, path: string): string {
  const relativePath = relative(root.localPath, path).replace(/\\/g, "/");
  return relativePath && relativePath !== "." ? `${root.id}:/${relativePath}` : `${root.id}:/`;
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function readmeFor(report: InventoryReport): string {
  const rootRows = report.roots
    .map((root) => `| ${root.id} | ${root.role} | ${root.exists ? "yes" : "no"} |`)
    .join("\n");
  const countRows = Object.entries(report.supportedFileTypeCounts)
    .map(([extension, count]) => `| ${extension} | ${count} |`)
    .join("\n") || "| none | 0 |";
  return `# CornerGPSMap / FLT Redacted Inventory

Generated: ${report.generatedAt}

This report is redacted. It hashes executable/config artifacts and counts supported legacy exchange extensions only. It does not include raw BPF/KML/KMZ/CSV/VRI/OPT/OUT/GGS contents, local customer paths, coordinates, credentials, cloud endpoints, or controller-ready compatibility claims.

## Roots

| Root | Role | Exists |
| --- | --- | --- |
${rootRows}

## Supported File Type Counts

| Extension | Count |
| --- | ---: |
${countRows}

## Artifact Hashes

See \`manifest.json\` for redacted artifact paths and SHA-256 hashes. Keep generated reports under \`reports/cornergps-flt-inventory/\`; do not commit raw local customer artifacts.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildCornerGpsFltInventoryReport();
  const paths = writeCornerGpsFltInventoryReport(report);
  console.log(`Wrote ${paths.manifestPath}`);
  console.log(`Wrote ${paths.readmePath}`);
}
