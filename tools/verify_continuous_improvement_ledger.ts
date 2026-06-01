import { readFileSync } from "node:fs";
import { join } from "node:path";

type LedgerRow = {
  commitCell: string;
  iteration: number;
};

const through = parseThroughArg(process.argv.slice(2));
const ledgerPath = join(process.cwd(), "docs/continuous-improvement-loop.md");
const rows = parseLedgerRows(readFileSync(ledgerPath, "utf8"));
const maxIteration = Math.max(...rows.map((row) => row.iteration));
const expectedThrough = through ?? maxIteration;
const rowsByIteration = new Map<number, LedgerRow>();
const failures: string[] = [];

for (const row of rows) {
  if (rowsByIteration.has(row.iteration)) {
    failures.push(`duplicate row ${formatIteration(row.iteration)}`);
  }
  rowsByIteration.set(row.iteration, row);
}

for (let iteration = 1; iteration <= expectedThrough; iteration += 1) {
  const row = rowsByIteration.get(iteration);
  if (!row) {
    failures.push(`missing row ${formatIteration(iteration)}`);
    continue;
  }
  const isTerminalRow = iteration === expectedThrough;
  if (!isTerminalRow && !isCommittedSha(row.commitCell)) {
    failures.push(`row ${formatIteration(iteration)} missing committed SHA`);
  }
  if (isTerminalRow && !isCommittedSha(row.commitCell) && row.commitCell !== "Pending until committed.") {
    failures.push(`row ${formatIteration(iteration)} has invalid terminal commit cell: ${row.commitCell}`);
  }
}

if (expectedThrough > maxIteration) {
  failures.push(`requested ${formatIteration(expectedThrough)} but latest row is ${formatIteration(maxIteration)}`);
}

if (failures.length > 0) {
  console.error(`Continuous improvement ledger failed: ${ledgerPath}`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Continuous improvement ledger verified through ${formatIteration(expectedThrough)} with ${rows.length} rows.`);

function parseLedgerRows(markdown: string): LedgerRow[] {
  const parsedRows: LedgerRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const iterationMatch = line.match(/^\|\s*(\d{3})\s*\|/);
    if (!iterationMatch) continue;
    const commitMatch = line.match(/\|\s*(`[0-9a-f]{7,40}`|Pending until committed\.)\s*\|\s*(?:Pass|Blocked|Fail|Pending)/);
    const iterationCell = iterationMatch[1];
    const commitCell = commitMatch?.[1];
    if (!commitCell) {
      throw new Error(`Malformed ledger row: ${line}`);
    }
    parsedRows.push({
      commitCell,
      iteration: Number.parseInt(iterationCell, 10),
    });
  }
  return parsedRows.sort((left, right) => left.iteration - right.iteration);
}

function parseThroughArg(args: string[]): number | undefined {
  const throughIndex = args.indexOf("--through");
  const throughValue = throughIndex >= 0 ? args[throughIndex + 1] : undefined;
  const inlineThrough = args.find((arg) => arg.startsWith("--through="))?.slice("--through=".length);
  const value = throughValue ?? inlineThrough;
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error("Usage: npm run verify:loop-ledger -- --through <positive iteration number>");
    process.exit(1);
  }
  return parsed;
}

function isCommittedSha(value: string): boolean {
  return /^`[0-9a-f]{7,40}`$/.test(value);
}

function formatIteration(iteration: number): string {
  return iteration.toString().padStart(3, "0");
}
