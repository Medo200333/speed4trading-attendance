import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const backup = ".codex-backups/access-center-20261022";
const paths = execFileSync("git", ["status", "--porcelain", "-uall"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, ""));
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const changed = [], preserved = [], additions = [];
for (const path of paths) {
  if (!existsSync(path) || path.endsWith(".bak") || path.startsWith("docs/codex-access-pack/")) continue;
  const previous = join(backup, path);
  if (existsSync(previous)) (digest(path) === digest(previous) ? preserved : changed).push(path);
  else additions.push(path);
}
writeFileSync("docs/access-center-changes.json", JSON.stringify({ baseline: backup, changedFromBaseline: changed, preservedExistingChanges: preserved, addedOrOutsideBaseline: additions }, null, 2));
console.log(JSON.stringify({ changedFromBaseline: changed, preservedExistingChanges: preserved, addedOrOutsideBaseline: additions }));
