// Runs every scripts/**/*.test.mjs except app-builder template tests whose
// fixtures (.grok/skills, public/__grok) are not part of this product.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const SKIP = new Set(["brand-check.test.mjs", "write-atomic.test.mjs", "grok-pwa-plugin.test.mjs"]);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".test.mjs") && !SKIP.has(e.name) ? [join(dir, e.name)] : []);
const files = walk("scripts").sort();
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
