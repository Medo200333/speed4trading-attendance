import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
const profile=process.env.USERPROFILE||'C:/Users/PC HP',source='C:/Speed-Maintenance-Room-v2';
const report={auditFiles:[],auditEvidence:[],historyEvidence:[],sourceTop:[],sourceInstructions:[],identityFiles:[]};
for(const dir of readdirSync(profile).filter(n=>/^Pc-Audit-/.test(n)&&statSync(join(profile,n)).isDirectory())){
 const walk=(path,depth)=>{for(const entry of readdirSync(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory()&&depth<2&&!entry.isSymbolicLink())walk(file,depth+1);else if(entry.isFile()&&/\.(md|txt|json|csv)$/i.test(entry.name)){report.auditFiles.push(file);if(statSync(file).size<3_000_000){const lines=readFileSync(file,'utf8').split(/\r?\n/).filter(line=>/Speed-Maintenance-Room-v2|Speed.?Maintenance/i.test(line)&&!/password|authorization|secret|token|connectionstring/i.test(line));for(const line of lines.slice(0,12))report.auditEvidence.push({file,line:line.slice(0,900)});}}}};walk(join(profile,dir),0);
}
const history=join(profile,'.codex','history.jsonl');if(existsSync(history))for(const line of readFileSync(history,'utf8').split('\n')){if(!/speed.?maintenance/i.test(line))continue;try{const item=JSON.parse(line),text=item.text||'';const found=text.match(/[A-Za-z]:[\\/][^\r\n"<>]*?(?:Maintenance|maintenance)[^\r\n"<>]*/g);if(found)report.historyEvidence.push({sessionId:item.session_id,paths:found.map(p=>p.slice(0,200))});}catch{}}
if(existsSync(source)){
 report.sourceTop=readdirSync(source);
 for(const path of [join(source,'AGENTS.md')])if(existsSync(path))report.sourceInstructions.push({file:path,text:readFileSync(path,'utf8')});
 try{report.identityFiles=execFileSync('rg',['--files','-g','!node_modules','-g','!venv','-g','!.venv','-g','!.git','-g','!dist','-g','!build',source],{encoding:'utf8',windowsHide:true,maxBuffer:5_000_000}).split(/\r?\n/).filter(p=>/logo|brand|theme|font|favicon|login|signin|sidebar|header|splash|\.css$|package.json$|manifest|index.html$/i.test(p)).slice(0,160);}catch(e){report.sourceError=e.status;}
}
console.log(JSON.stringify(report,null,2));
