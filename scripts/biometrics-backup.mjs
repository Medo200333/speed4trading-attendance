import {cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const destination='.codex-backups/biometrics-20261022';
mkdirSync(destination,{recursive:true});
for(const name of ['src','scripts','package.json']) if(!existsSync(join(destination,name))) cpSync(name,join(destination,name),{recursive:true});
if(!existsSync(join(destination,'backup.json'))) writeFileSync(join(destination,'backup.json'),JSON.stringify({at:new Date().toISOString(),purpose:'Face photo capture and capability-gated biometric enrollment; no physical device writes'},null,2));
console.log(JSON.stringify({backup:destination}));
