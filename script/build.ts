import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function autoBumpVersion() {
  if (process.env.SKIP_VERSION_BUMP === "1") {
    console.log("version bump skipped (SKIP_VERSION_BUMP=1)");
    return;
  }

  const versionPath = "version.json";
  try {
    const data = JSON.parse(await readFile(versionPath, "utf-8"));
    if (!Array.isArray(data.changelog)) data.changelog = [];
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    const [major, minor, patch] = data.version.split(".").map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;

    const sameDayEntry = data.changelog[0];
    if (sameDayEntry && sameDayEntry.date === today) {
      sameDayEntry.changes.push(`Build ${now}`);
      console.log(`same-day build appended to changelog entry ${sameDayEntry.version}`);
    } else {
      data.changelog.unshift({
        version: newVersion,
        date: today,
        changes: [`Build automático ${newVersion} (${now})`],
      });
    }

    data.version = newVersion;
    data.buildDate = today;

    console.log(`version bumped: ${major}.${minor}.${patch} -> ${newVersion}`);

    await writeFile(versionPath, JSON.stringify(data, null, 2) + "\n");
  } catch (err) {
    console.warn("warning: could not auto-bump version:", err);
  }
}

async function buildAll() {
  await autoBumpVersion();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
