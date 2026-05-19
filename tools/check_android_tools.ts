import { collectAndroidToolSnapshot, readExpoAndroidPackageName } from "./androidNativeProof";

const packageName = readExpoAndroidPackageName();
const snapshot = collectAndroidToolSnapshot({
  packageName,
  outputDirectory: "reports/android-native-verification",
});

console.log(`Android package: ${snapshot.packageName}`);
console.log(`adb: ${snapshot.commands.adb.path ?? "not found"}`);
console.log(`emulator: ${snapshot.commands.emulator.path ?? "not found"}`);
console.log(`eas: ${snapshot.commands.eas.path ?? "not found"}`);
console.log(`expo CLI on PATH: ${snapshot.commands.expo.path ?? "not found"}`);

if (snapshot.devices.length > 0) {
  console.log("adb devices:");
  for (const device of snapshot.devices) {
    console.log(`- ${device.deviceLine} model=${device.model || "unknown"} android=${device.androidVersion || "unknown"} api=${device.apiLevel || "unknown"}`);
  }
} else {
  console.log("adb devices: none");
}

if (snapshot.installedPackage) {
  console.log(`installed package: ${snapshot.installedPackage.packagePath}`);
  console.log(`versionName: ${snapshot.installedPackage.versionName || "unknown"}`);
  console.log(`versionCode: ${snapshot.installedPackage.versionCode || "unknown"}`);
}

if (snapshot.blocker) {
  console.error(snapshot.blocker);
  process.exit(1);
}

console.log("Android native tooling check passed: adb, device, and built app package are available.");
