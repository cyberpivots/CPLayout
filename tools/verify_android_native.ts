import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCompleteAndroidNativeVerificationReport } from "@cplayout/project-store";
import {
  collectAndroidToolSnapshot,
  readExpoAndroidPackageName,
  reportFromSnapshot,
  timestampForFilename,
  writeJsonFile,
} from "./androidNativeProof";

const args = process.argv.slice(2);
const reportArgIndex = args.indexOf("--report");
const outputDirectory = "reports/android-native-verification";

if (reportArgIndex >= 0) {
  const reportPath = args[reportArgIndex + 1];
  if (!reportPath) {
    console.error("Usage: npm run verify:android-native -- --report <report.json>");
    process.exit(1);
  }
  try {
    parseCompleteAndroidNativeVerificationReport(JSON.parse(readFileSync(reportPath, "utf8")));
    console.log(`Android native verification report complete: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`blocked: Android native checklist evidence incomplete in ${reportPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const packageName = readExpoAndroidPackageName();
const snapshot = collectAndroidToolSnapshot({ packageName, outputDirectory });
const report = reportFromSnapshot(snapshot);
const reportPath = join(
  outputDirectory,
  `android-native-verification-${timestampForFilename(snapshot.generatedAt)}.json`,
);
writeJsonFile(reportPath, report);

if (snapshot.blocker) {
  console.error(snapshot.blocker);
  console.error(`Native verification report written: ${reportPath}`);
  process.exit(1);
}

console.error("blocked: Android native checklist evidence incomplete; run docs/android-native-verification.md on the detected built app and validate the completed report with:");
console.error(`npm run verify:android-native -- --report ${reportPath}`);
console.error(`Native verification report written: ${reportPath}`);
process.exit(1);
