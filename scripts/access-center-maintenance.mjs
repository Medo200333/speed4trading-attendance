import { cpSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const backup = join(root, ".codex-backups", "access-center-20261022");
mkdirSync(backup, { recursive: true });
for (const name of ["src", "scripts", "package.json", "package-lock.json", "vite.config.ts", ".gitignore"]) {
  const target = join(backup, name);
  if (!existsSync(target)) cpSync(join(root, name), target, { recursive: true });
}
if (!existsSync(join(backup, "backup.json"))) writeFileSync(join(backup, "backup.json"), JSON.stringify({ at: new Date().toISOString(), root, sources: ["src", "scripts", "package.json", "package-lock.json", "vite.config.ts", ".gitignore"] }, null, 2));
console.log(JSON.stringify({ backup }));
