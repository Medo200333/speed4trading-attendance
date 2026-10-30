import {spawnSync} from 'node:child_process';
import {existsSync, cpSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const backup='.codex-backups/zubayd-platform-20261023';
mkdirSync(backup,{recursive:true});
for(const p of ['src','public','scripts','server','package.json','package-lock.json','vite.config.ts','vite.access-staging.config.ts'])if(existsSync(p)&&!existsSync(`${backup}/${p}`))cpSync(p,`${backup}/${p}`,{recursive:true});
const tools=Object.fromEntries(['node','npm','java','javac','adb','gradle','makensis','dotnet'].map(name=>{const r=spawnSync('where.exe',[name],{encoding:'utf8',windowsHide:true});return [name,r.status===0?r.stdout.trim().split(/\r?\n/):[]];}));
const result={at:new Date().toISOString(),backup,tools,androidSdk:existsSync(join(process.env.LOCALAPPDATA||'','Android','Sdk')),androidHomeConfigured:Boolean(process.env.ANDROID_HOME),javaHomeConfigured:Boolean(process.env.JAVA_HOME),electron:existsSync('node_modules/electron'),electronBuilder:existsSync('node_modules/electron-builder')};
writeFileSync(`${backup}/inventory.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
