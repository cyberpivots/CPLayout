import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface LoopRow {
  decision: string;
  focus: string;
  improvement: string;
  iteration: number;
  researchGate: string;
  testGate: string;
  voteStatus: string;
}

const args = parseArgs(process.argv.slice(2));
const loopPath = resolve(process.cwd(), args.path);
const markdown = readFileSync(loopPath, "utf8");
const rows = parseLoopRows(markdown);
const expectedThrough = args.through ?? 100;
const rowsByIteration = new Map(rows.map((row) => [row.iteration, row]));
const failures: string[] = [];

if (rows.length < expectedThrough) {
  failures.push(`expected at least ${expectedThrough} loop rows but found ${rows.length}`);
}

for (let iteration = 1; iteration <= expectedThrough; iteration += 1) {
  const row = rowsByIteration.get(iteration);
  if (!row) {
    failures.push(`missing row ${formatIteration(iteration)}`);
    continue;
  }
  if (!row.focus || !row.researchGate || !row.improvement || !row.testGate) {
    failures.push(`row ${formatIteration(iteration)} has an empty focus/research/improvement/test cell`);
  }
  if (!/vote/i.test(row.voteStatus)) {
    failures.push(`row ${formatIteration(iteration)} does not include a vote status`);
  }
  if (!/planned|pass|blocked|fail|pending/i.test(row.decision)) {
    failures.push(`row ${formatIteration(iteration)} has an invalid decision cell: ${row.decision}`);
  }
}

for (const phrase of [
  "canonicalGeometryMutation: false",
  "hiddenKeysAllowed: false",
  "networkRequired: false",
  "No automatic canonical geometry mutation",
  "No paid APIs",
  "weighted vote",
]) {
  if (!markdown.includes(phrase)) failures.push(`missing required guardrail phrase: ${phrase}`);
}

if (failures.length > 0) {
  console.error(`Research improvement loop failed: ${loopPath}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Research improvement loop verified through ${formatIteration(expectedThrough)} with ${rows.length} rows.`);

function parseLoopRows(markdownText: string): LoopRow[] {
  const parsed: LoopRow[] = [];
  for (const line of markdownText.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(\d{3})\s*\|/);
    if (!match) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 7) {
      throw new Error(`Malformed loop row: ${line}`);
    }
    parsed.push({
      iteration: Number.parseInt(match[1], 10),
      focus: cells[1] ?? "",
      researchGate: cells[2] ?? "",
      improvement: cells[3] ?? "",
      testGate: cells[4] ?? "",
      voteStatus: cells[5] ?? "",
      decision: cells[6] ?? "",
    });
  }
  return parsed.sort((left, right) => left.iteration - right.iteration);
}

function parseArgs(rawArgs: string[]): { path: string; through?: number } {
  const path = valueFor(rawArgs, "--path") ?? "docs/ml-cv-pivot-locating-improvement-loop.md";
  const throughText = valueFor(rawArgs, "--through");
  const through = throughText ? Number.parseInt(throughText, 10) : undefined;
  if (through !== undefined && (!Number.isInteger(through) || through < 1)) {
    console.error("Usage: tsx tools/verify_research_improvement_loop.ts --path <markdown> --through <positive iteration>");
    process.exit(1);
  }
  return { path, through };
}

function valueFor(rawArgs: string[], name: string): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];
  return rawArgs.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function formatIteration(iteration: number): string {
  return iteration.toString().padStart(3, "0");
}
