import {cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const destination='.codex-backups/attendance-http400-20261022';
mkdirSync(destination,{recursive:true});
for(const name of ['src','scripts','package.json']) if(!existsSync(join(destination,name))) cpSync(name,join(destination,name),{recursive:true});
if(!existsSync(join(destination,'backup.json'))) writeFileSync(join(destination,'backup.json'),JSON.stringify({at:new Date().toISOString(),purpose:'AcsEvent HTTP 400 compatibility and sanitized diagnostics'},null,2));
console.log(JSON.stringify({backup:destination}));
