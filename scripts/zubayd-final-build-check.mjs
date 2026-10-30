import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const qa=resolve('.codex-backups/zubayd-platform-20261023/qa');mkdirSync(qa,{recursive:true});
const commands=[['standalone-build',['scripts/zubayd-build-server.mjs']],['desktop-logic-tests',['--test','scripts/zubayd-desktop.test.mjs']],['standalone-smoke',['scripts/zubayd-standalone-smoke.mjs']]];
for(const file of readdirSync('desktop').filter(name=>/\.(cjs|js)$/.test(name))){const r=spawnSync(process.execPath,['--check',join('desktop',file)],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);}
const results=[];
for(const [name,args] of commands){const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:10_000_000});writeFileSync(join(qa,name+'.log'),(r.stdout||'')+(r.stderr||''));results.push({name,exitCode:r.status});writeFileSync(join(qa,'final-build-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));if(r.status!==0)throw Error(name+' failed; see QA log');}
