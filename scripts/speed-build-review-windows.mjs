import {spawn} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const area=resolve('.codex-backups/speed-source-identity-20261023'),review=join(area,'review'),pkgFile=resolve('desktop/node_modules/electron-builder/package.json'),pkg=JSON.parse(readFileSync(pkgFile));
const cli=resolve(dirname(pkgFile),typeof pkg.bin==='string'?pkg.bin:pkg.bin['electron-builder']);
const electronVersion=JSON.parse(readFileSync('desktop/node_modules/electron/package.json')).version;
const child=spawn(process.execPath,[cli,'--projectDir',join(review,'desktop'),'--win','nsis','--config.electronDist='+resolve('desktop/node_modules/electron/dist'),'--config.electronVersion='+electronVersion],{windowsHide:true,stdio:'inherit',env:{...process.env,OPENSSL_ia32cap:'~0x200000200000000',GODEBUG:'cpu.aes=off,cpu.pclmulqdq=off',NODE_OPTIONS:'',CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
child.on('exit',code=>{writeFileSync(join(area,'qa/windows-build-result.json'),JSON.stringify({exitCode:code,reviewOnly:true,product:'Speed Maintenance (pending approval)',owner:'Speed for Training',certificateSigned:false,sourceProjectModified:false},null,2));process.exit(code||0);});
