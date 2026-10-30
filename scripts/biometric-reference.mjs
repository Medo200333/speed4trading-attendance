import {readFileSync} from 'node:fs';
const body=readFileSync('.codex-backups/access-center-20261022/references/Push_SDK_Access_Control_Protocol_20230927.txt','utf8');
const start=Number(process.argv[2]),end=Number(process.argv[3]);
console.log(body.split(/\r?\n/).slice(start-1,end).join('\n'));
