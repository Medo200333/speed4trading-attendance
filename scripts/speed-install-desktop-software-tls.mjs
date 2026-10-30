import {spawn} from 'node:child_process';
import {join,dirname,resolve} from 'node:path';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
if(!process.argv.includes('--child')){
 const child=spawn(process.execPath,[process.argv[1],'--child'],{windowsHide:true,stdio:'inherit',env:{...process.env,OPENSSL_ia32cap:'~0x200000200000000',GODEBUG:'cpu.aes=off,cpu.pclmulqdq=off',NODE_OPTIONS:''}});child.on('exit',code=>process.exit(code||0));
}else{
 const run=args=>new Promise((done,fail)=>{const child=spawn(process.execPath,args,{windowsHide:true,stdio:'inherit',env:process.env});child.on('exit',code=>code===0?done():fail(Error('BUILD_COMMAND '+code)));child.on('error',fail);});
 const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 const latest=async name=>{const r=await fetch('https://registry.npmjs.org/'+name+'/latest',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('OFFICIAL_METADATA');return (await r.json()).version;};
 const electron=await latest('electron'),builder=await latest('electron-builder');
 await run([npm,'install','--prefix','desktop','--save-dev','--save-exact','electron@'+electron,'electron-builder@'+builder,'--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/']);
 await run([resolve('desktop/node_modules/electron/install.js')]);
 const executable=join(resolve('desktop/node_modules/electron/dist'),'electron.exe');if(!existsSync(executable))throw Error('RUNTIME_NOT_DOWNLOADED');
 const result={electron,builder,certificateVerification:true,tlsCrypto:'software AES in build processes only',runtimeExists:true};writeFileSync('.codex-backups/speed-source-identity-20261023/tools/software-tls-toolchain.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
