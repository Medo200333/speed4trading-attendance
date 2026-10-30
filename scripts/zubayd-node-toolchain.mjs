import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const java='C:/Program Files/Android/Android Studio/jbr/bin/java.exe',out=resolve('.codex-backups/zubayd-platform-20261023/tools');mkdirSync(out,{recursive:true});
const result=spawnSync(java,['scripts/DownloadNodeToolchain.java',out],{stdio:'inherit',windowsHide:true,timeout:240000});if(result.status!==0)process.exit(result.status||1);
const record=JSON.parse(readFileSync(join(out,'verified-node.json'),'utf8'));
const ps=join(out,'expand-node.ps1');writeFileSync(ps,`Expand-Archive -LiteralPath '${join(out,record.archive).replaceAll("'","''")}' -DestinationPath '${out.replaceAll("'","''")}' -Force\n`);
const expanded=spawnSync('powershell.exe',['-NoProfile','-File',ps],{stdio:'inherit',windowsHide:true});if(expanded.status!==0)process.exit(expanded.status||1);
const directory=join(out,record.archive.replace(/\.zip$/,''));writeFileSync(join(out,'node-toolchain.json'),JSON.stringify({directory,...record}));console.log('Build toolchain ready; system PATH and services unchanged.');
