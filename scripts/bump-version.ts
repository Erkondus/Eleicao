import fs from "fs";
import path from "path";

const versionFile = path.join(process.cwd(), "version.json");
const type = process.argv[2] || "patch";
const message = process.argv.slice(3).join(" ");

if (!["patch", "minor", "major"].includes(type)) {
  console.error("Uso: npx tsx scripts/bump-version.ts [patch|minor|major] [descrição da mudança]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
const [major, minor, patch] = data.version.split(".").map(Number);

let newVersion: string;
if (type === "major") newVersion = `${major + 1}.0.0`;
else if (type === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

const today = new Date().toISOString().split("T")[0];

const entry = {
  version: newVersion,
  date: today,
  changes: message ? [message] : [`Atualização ${newVersion}`],
};

data.version = newVersion;
data.buildDate = today;
data.changelog.unshift(entry);

fs.writeFileSync(versionFile, JSON.stringify(data, null, 2) + "\n");
console.log(`✓ Versão atualizada: ${data.version.replace(newVersion, "")}${type === "patch" ? "" : ""}${newVersion}`);
console.log(`  Data: ${today}`);
if (message) console.log(`  Mudança: ${message}`);
