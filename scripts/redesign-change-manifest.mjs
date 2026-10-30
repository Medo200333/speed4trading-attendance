import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const baseline = ".codex-backups/redesign-guide-20261022";
const modified = [], added = [];
let unchangedCount = 0;
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
function inspect(path) {
  if (!existsSync(path)) return;
  if (path.endsWith(".bak")) return;
  const old = join(baseline, path);
  if (!existsSync(old)) added.push(path.replaceAll("\\", "/"));
  else if (digest(old) !== digest(path)) modified.push(path.replaceAll("\\", "/"));
  else unchangedCount++;
}
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else inspect(path); } }
for (const directory of ["src", "scripts", "server"]) walk(directory);
for (const path of ["package.json", "package-lock.json", "vite.config.ts", "vite.access-staging.config.ts", ".gitignore"]) inspect(path);
const result = { baseline, modified, added, unchangedCount };
writeFileSync("docs/SKYLINE_REDESIGN_CHANGES.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
