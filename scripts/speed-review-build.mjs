import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFileSync,mkdirSync} from 'node:fs';
const root=process.cwd(),area=resolve('.codex-backups/speed-source-identity-20261023'),review=join(area,'review'),qa=join(area,'qa');mkdirSync(qa,{recursive:true});
const commands=[['typecheck',[join(root,'node_modules/typescript/bin/tsc'),'--noEmit']],['brand-assets',['scripts/zubayd-assets.mjs']],['standalone-build',['scripts/zubayd-build-server.mjs']],['android-build',['scripts/zubayd-build-android.mjs']]];
for(const [name,args] of commands){const r=spawnSync(process.execPath,args,{cwd:review,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:10_000_000,env:{...process.env,VITE_AUTH_ENABLED:'false',VITE_GROK_EXTENSIONS:'0'}});writeFileSync(join(qa,name+'.log'),(r.stdout||'')+(r.stderr||''));console.log(JSON.stringify({name,exitCode:r.status}));if(r.status!==0)throw Error('Review '+name+' failed. See QA log.');}
