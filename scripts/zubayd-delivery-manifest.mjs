import {readFileSync,writeFileSync,readdirSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {readAppEnv} from './with-app-env.mjs';
const backup=resolve('.codex-backups/zubayd-platform-20261023'),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const roots=['src','public','scripts','server','desktop','android/app/src'];
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const file=join(dir,e.name);if(e.isSymbolicLink()||['node_modules','build','.gradle'].includes(e.name))return [];return e.isDirectory()?walk(file):[file];});
const sourceFiles=[...roots.flatMap(walk),'brand.config.json','package.json','vite.zubayd-desktop.config.ts'];
const files=sourceFiles.filter(f=>!f.endsWith('.bak')&&!f.includes('.bak.')).filter(f=>!existsSync(join(backup,f))||hash(f)!==hash(join(backup,f))).map(f=>({path:f.replaceAll('\\','/'),sha256:hash(f),status:existsSync(join(backup,f))?'modified':'new'}));
const bundles=['dist-server','.vercel/output'].filter(existsSync).flatMap(walk);
const forbidden=bundles.filter(f=>/(?:^|[\\/])(?:\.env(?:\..*)?|state(?:\.previous)?\.json|companies\.json|credential-[a-f0-9]+\.json|.*\.keystore)$/.test(f));
const environment={...readAppEnv(process.cwd()),...process.env};
const secrets=Object.entries(environment).filter(([key,value])=>/^(?:HIKVISION_PASSWORD|SKYLINE_ADMIN_PASSWORD|SKYLINE_VAULT_KEY)$/.test(key)&&value&&value.length>=8).map(([,value])=>value);
let embeddedSecretDetected=false;
for(const file of bundles){if(statSync(file).size>30000000)continue;const bytes=readFileSync(file);if(secrets.some(secret=>bytes.includes(Buffer.from(secret))))embeddedSecretDetected=true;}
const result={at:new Date().toISOString(),baseline:relative(process.cwd(),backup).replaceAll('\\','/'),files,distributionCheck:{forbiddenDataFiles:forbidden.map(f=>f.replaceAll('\\','/')),embeddedAvailableSecretDetected:embeddedSecretDetected,availableSecretValuesChecked:secrets.length,valuesNeverLogged:true},artifacts:[{path:'releases/android/Zubayd-debug.apk',exists:existsSync('releases/android/Zubayd-debug.apk'),sha256:hash('releases/android/Zubayd-debug.apk')},{path:'dist-server/server/index.mjs',exists:existsSync('dist-server/server/index.mjs')},{path:'releases/windows/Zubayd-Setup-1.0.0.exe',exists:existsSync('releases/windows/Zubayd-Setup-1.0.0.exe')}]};
mkdirSync('docs',{recursive:true});writeFileSync('docs/ZUBAYD_CHANGES.json',JSON.stringify(result,null,2));
if(forbidden.length||embeddedSecretDetected)throw Error('Distribution privacy check failed; no secret was printed');
console.log(JSON.stringify({changedSourceFiles:files.length,forbiddenPackagedDataFiles:forbidden.length,embeddedAvailableSecretDetected:embeddedSecretDetected,availableSecretValuesChecked:secrets.length,deviceUsernameAvailable:Boolean(environment.HIKVISION_USERNAME),devicePasswordAvailable:Boolean(environment.HIKVISION_PASSWORD),vaultKeyAvailable:Boolean(environment.SKYLINE_VAULT_KEY),manifest:'docs/ZUBAYD_CHANGES.json'}));
