import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const version=JSON.parse(readFileSync('desktop/node_modules/electron/package.json')).version,name=`electron-v${version}-win32-x64.zip`,expected=JSON.parse(readFileSync('desktop/node_modules/electron/checksums.json'))[name],root=resolve('.codex-backups/speed-source-identity-20261023/tools/electron-ranges'),zip=join(root,name),body=readFileSync(zip),sha256=createHash('sha256').update(body).digest('hex');
if(sha256!==expected)throw Error('OFFICIAL_CHECKSUM');
const result=spawnSync('powershell.exe',['-NoProfile','-File',resolve('scripts/speed-extract-runtime.ps1'),'-Archive',zip,'-Destination',resolve('desktop/node_modules/electron/dist')],{windowsHide:true,encoding:'utf8',timeout:120000});if(result.status!==0)throw Error(result.stderr||result.error?.message||'EXTRACT');
writeFileSync('desktop/node_modules/electron/path.txt','electron.exe');writeFileSync(join(root,'verified.json'),JSON.stringify({version,sha256,bytes:body.length,officialNpmPackageChecksum:true,certificateVerification:true},null,2));console.log(JSON.stringify({electronRuntime:'READY',version,sha256,bytes:body.length}));
