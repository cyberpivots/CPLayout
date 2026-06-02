import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface WholeCodebaseLoopRow {
  artifactHashes: string;
  batch: string;
  decision: string;
  focus: string;
  improvement: string;
  iteration: number;
  nextTarget: string;
  researchGate: string;
  validation: string;
  vote: string;
}

const args = parseArgs(process.argv.slice(2));
const loopPath = resolve(process.cwd(), args.path);
const markdown = readFileSync(loopPath, "utf8");
const rows = parseLoopRows(markdown);
const rowsByIteration = new Map<number, WholeCodebaseLoopRow>();
const expectedThrough = args.through ?? 100;
const failures: string[] = [];

for (const row of rows) {
  if (rowsByIteration.has(row.iteration)) {
    failures.push(`duplicate row ${formatIteration(row.iteration)}`);
  }
  rowsByIteration.set(row.iteration, row);
}

if (rows.length < expectedThrough) {
  failures.push(`expected at least ${expectedThrough} loop rows but found ${rows.length}`);
}

for (let iteration = 1; iteration <= expectedThrough; iteration += 1) {
  const row = rowsByIteration.get(iteration);
  if (!row) {
    failures.push(`missing row ${formatIteration(iteration)}`);
    continue;
  }
  validateRow(row, failures);
}

for (const phrase of [
  "networkRequired: false",
  "hiddenKeysAllowed: false",
  "canonicalGeometryMutation: false",
  "No automatic canonical geometry mutation",
  "No paid APIs",
  "weighted vote",
  "projected/local XY",
]) {
  if (!markdown.includes(phrase)) failures.push(`missing required guardrail phrase: ${phrase}`);
}

if (expectedThrough > 100) {
  failures.push("whole-codebase loop is capped at 100 iterations");
}

if (failures.length > 0) {
  console.error(`Whole-codebase improvement loop failed: ${loopPath}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Whole-codebase improvement loop verified through ${formatIteration(expectedThrough)} with ${rows.length} rows.`);

function validateRow(row: WholeCodebaseLoopRow, failures: string[]): void {
  const label = formatIteration(row.iteration);
  if (!row.batch || !row.focus || !row.researchGate || !row.improvement || !row.validation || !row.vote || !row.nextTarget) {
    failures.push(`row ${label} has an empty required cell`);
  }
  if (!/^0?[1-9]$|^10$/.test(row.batch)) {
    failures.push(`row ${label} has invalid batch cell: ${row.batch}`);
  }
  if (!/weighted vote/i.test(row.vote)) {
    failures.push(`row ${label} does not include weighted vote status`);
  }
  if (!/^(Planned|Pending|Pass|Fail|Blocked)(?:[.;:].*)?$/i.test(row.decision)) {
    failures.push(`row ${label} has invalid decision cell: ${row.decision}`);
  }
  if (/^Pass/i.test(row.decision)) {
    validatePassedRow(row, failures);
  }
  if (/^Blocked/i.test(row.decision) && !/block|veto|missing|unavailable|unverified/i.test(row.decision)) {
    failures.push(`row ${label} is blocked without a blocker reason`);
  }
}

function validatePassedRow(row: WholeCodebaseLoopRow, failures: string[]): void {
  const label = formatIteration(row.iteration);
  if (/pending|planned|tbd|not run/i.test(row.validation)) {
    failures.push(`row ${label} is Pass but validation is not complete: ${row.validation}`);
  }
  if (/pending|planned|tbd|not run/i.test(row.artifactHashes)) {
    failures.push(`row ${label} is Pass but artifact hashes are not complete: ${row.artifactHashes}`);
  }
  if (!/[a-f0-9]{64}/i.test(row.artifactHashes) && !/SHA256SUMS\.txt/.test(row.artifactHashes)) {
    failures.push(`row ${label} is Pass but artifact hashes do not cite a hash or SHA256SUMS.txt`);
  }
  for (const path of extractRepoPaths(row.artifactHashes)) {
    if (!existsSync(resolve(process.cwd(), path))) {
      failures.push(`row ${label} cites missing artifact path: ${path}`);
    }
  }
}

function parseLoopRows(markdownText: string): WholeCodebaseLoopRow[] {
  const parsed: WholeCodebaseLoopRow[] = [];
  for (const line of markdownText.split(/\r?\n/)) {
    const match = line.match(/^\s*\|\s*(\d{3})\s*\|/);
    if (!match) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 10) {
      throw new Error(`Malformed loop row: ${line}`);
    }
    parsed.push({
      iteration: Number.parseInt(cells[0] ?? match[1], 10),
      batch: cells[1] ?? "",
      focus: cells[2] ?? "",
      researchGate: cells[3] ?? "",
      improvement: cells[4] ?? "",
      validation: cells[5] ?? "",
      artifactHashes: cells[6] ?? "",
      vote: cells[7] ?? "",
      decision: cells[8] ?? "",
      nextTarget: cells[9] ?? "",
    });
  }
  return parsed.sort((left, right) => left.iteration - right.iteration);
}

function parseArgs(rawArgs: string[]): { path: string; through?: number } {
  const path = valueFor(rawArgs, "--path") ?? "docs/whole-codebase-improvement-loop-2026-06-01.md";
  const throughText = valueFor(rawArgs, "--through");
  const through = throughText ? Number.parseInt(throughText, 10) : undefined;
  if (through !== undefined && (!Number.isInteger(through) || through < 1)) {
    console.error("Usage: tsx tools/verify_whole_codebase_improvement_loop.ts --path <markdown> --through <positive iteration>");
    process.exit(1);
  }
  return { path, through };
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function extractRepoPaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(/`?((?:docs|tools|packages|apps)\/[^\s`;,]+|package\.json)`?/g)) {
    paths.add(match[1].replace(/[.,;:]$/, ""));
  }
  return [...paths];
}

function formatIteration(iteration: number): string {
  return iteration.toString().padStart(3, "0");
}
