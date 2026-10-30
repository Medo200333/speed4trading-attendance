import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
const profile=process.env.USERPROFILE||'C:/Users/PC HP';
const result={instructions:[],rootDirectories:[],profileDirectories:[],catalogs:[],historyFiles:[],projectPaths:[]};
for(const file of ['C:/AGENTS.md','C:/awwal-akher/AGENTS.md'])if(existsSync(file))result.instructions.push({file,text:readFileSync(file,'utf8')});
const directories=root=>{try{return readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).map(e=>e.name);}catch{return [];}};
result.rootDirectories=directories('C:/');result.profileDirectories=directories(profile);
const roots=[join(profile,'.codex'),join(profile,'Desktop'),join(profile,'Documents'),'C:/awwal-akher/docs'];
for(const root of roots){if(!existsSync(root))continue;for(const e of readdirSync(root,{withFileTypes:true})){if(e.isFile()&&/inventory|catalog|audit|report|جرد|فحص|برامج|مشاريع|history|session_index/i.test(e.name))result.catalogs.push({file:join(root,e.name),bytes:statSync(join(root,e.name)).size});}}
const history=join(profile,'.codex','sessions');
if(existsSync(history)){
 try{const raw=execFileSync('rg',['-l','-i','-m','1','Speed.?Maintenance',history],{encoding:'utf8',windowsHide:true,maxBuffer:2_000_000,timeout:30000});result.historyFiles=raw.trim().split(/\r?\n/).slice(-40);}catch(error){if(error.status!==1)result.historyError=error.code||error.status;}
 for(const file of result.historyFiles){if(statSync(file).size>60_000_000)continue;for(const line of readFileSync(file,'utf8').split('\n')){if(!/speed.?maintenance/i.test(line))continue;let value;try{value=JSON.parse(line);}catch{continue;}const text=JSON.stringify(value).replaceAll('\\\\','\\');const matches=text.match(/[A-Za-z]:[\\/][^"\n\r<>]*?(?:speed[-_ ]?maintenance|maintenance[-_ ]?speed)[^"\n\r<>]*/ig)||[];for(const match of matches){const clean=match.split('\\n')[0].split('\\r')[0].slice(0,300);if(!/password|secret|token|authorization/i.test(clean))result.projectPaths.push({from:basename(file),path:clean});}}}
}
console.log(JSON.stringify(result,null,2));
