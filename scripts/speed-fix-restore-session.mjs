import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
for(const root of [process.cwd(),resolve('.codex-backups/speed-source-identity-20261023/review')]){const file=join(root,'desktop/main.cjs');let s=readFileSync(file,'utf8');s=s.replace('      window.webContents.session.clearStorageData(', '      await window.webContents.session.clearStorageData(');writeFileSync(file,s);}
console.log('Restore waits for session storage clearing before restarting its application server.');
