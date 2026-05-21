const fs = require("node:fs");
const path = require("node:path");

const packagePath = path.join(__dirname, "..", "node_modules", "xcode", "package.json");
const patchedUuidVersion = "11.1.1";

if (!fs.existsSync(packagePath)) {
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (packageJson.name !== "xcode") {
  throw new Error(`Refusing to patch unexpected package at ${packagePath}.`);
}

// Keep npm ls aligned with the root override while xcode still publishes uuid ^7 metadata.
packageJson.dependencies = {
  ...packageJson.dependencies,
  uuid: patchedUuidVersion,
};

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
