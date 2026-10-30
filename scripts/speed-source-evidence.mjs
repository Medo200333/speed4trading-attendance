import {readFileSync,readdirSync,existsSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source='C:/Speed-Maintenance-Room-v2',out=resolve('.codex-backups/speed-source-identity-20261023');mkdirSync(join(out,'source-reference'),{recursive:true});
const selected=['src/lib/brand.ts','src/styles.css','src/components/logo.tsx','src/components/maintenance/login-screen.tsx','src/components/ui/button.tsx','src/components/ui/input.tsx','src/routes/index.tsx','src/routes/__root.tsx','public/speed-trading-logo.png','public/favicon.svg'];
const files=[];for(const relative of selected){if(!existsSync(join(source,relative)))continue;const body=readFileSync(join(source,relative));const target=join(out,'source-reference',relative);mkdirSync(join(target,'..'),{recursive:true});copyFileSync(join(source,relative),target);files.push({path:relative,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}
const audits=[];const profile=process.env.USERPROFILE;
for(const directory of readdirSync(profile,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^Pc-Audit-/.test(e.name))){const file=join(profile,directory.name,'pc-inventory.json');if(!existsSync(file))continue;const lines=readFileSync(file,'utf8').split(/\r?\n/);for(let i=0;i<lines.length;i++){if(/Speed-Maintenance-Room-v2/i.test(lines[i])&&!/password|token|secret/i.test(lines[i]))audits.push({file,lineNumber:i+1,text:lines[i].trim().slice(0,600)});}}
const css=readFileSync(join(source,'src/styles.css'),'utf8'),tokens=Object.fromEntries([...css.matchAll(/--(color-[\w-]+|font-[\w-]+|radius-[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const evidence={sourceProject:source,sourceOwnerMark:'SPEED TRADING (literal image text)',requestedOwner:'Speed for Training',ownershipConflictRequiresConfirmation:true,productNameApproval:'Pending: earlier Speed Maintenance request vs current source-only instruction',audits,files,tokens,originalProjectModified:false};
writeFileSync(join(out,'identity-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({sourceProject:source,sourceFiles:files,auditPathEvidence:audits,tokens},null,2));
