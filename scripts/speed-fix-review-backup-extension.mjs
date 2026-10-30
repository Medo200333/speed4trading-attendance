import {readFileSync,writeFileSync} from 'node:fs';
const file='.codex-backups/speed-source-identity-20261023/review/desktop/main.cjs';let s=readFileSync(file,'utf8');s=s.replace('!(/.(speedbackup|zubayd)$/i.test(backupTarget))','(!backupTarget.toLowerCase().endsWith(".speedbackup") && !backupTarget.toLowerCase().endsWith(".zubayd"))');writeFileSync(file,s);
for(const file of ['desktop/package-lock.json','desktop/node_modules/.package-lock.json']){try{const body=readFileSync(file,'utf8');writeFileSync(file,body.replace(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{24}\/registry\//g,'https://registry.npmjs.org/'));}catch(error){if(error.code!=='ENOENT')throw error;}}
console.log('Backup extensions checked literally; dependency lock URLs use the official HTTPS registry.');
