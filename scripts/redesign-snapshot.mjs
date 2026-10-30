import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const target = join(root, ".codex-backups", "redesign-guide-20261022");
mkdirSync(target, { recursive: true });
for (const path of ["src", "scripts", "server", "package.json", "package-lock.json", "vite.config.ts", "vite.access-staging.config.ts", ".gitignore"]) {
  if (existsSync(join(root, path)) && !existsSync(join(target, path))) cpSync(join(root, path), join(target, path), { recursive: true });
}
if (!existsSync(join(target, "snapshot.json"))) writeFileSync(join(target, "snapshot.json"), JSON.stringify({ at: new Date().toISOString(), purpose: "Arabic redesign, beginner guide and setup wizard", root }, null, 2));
console.log(JSON.stringify({ backup: target }));
