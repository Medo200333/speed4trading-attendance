import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
const destination = '.codex-backups/speed-rebrand-20261023';
mkdirSync(destination, { recursive: true });
const paths = ['src', 'public', 'scripts', 'server', 'package.json', 'vite.config.ts', 'vite.access-staging.config.ts'];
for (const path of paths) {
  if (existsSync(path) && !existsSync(`${destination}/${path}`)) cpSync(path, `${destination}/${path}`, { recursive: true });
}
writeFileSync(`${destination}/BACKUP.json`, JSON.stringify({ task: 'Speed for Trading visual identity and mobile UX', created: new Date().toISOString(), paths, deviceWrites: 0 }, null, 2));
console.log(destination);
