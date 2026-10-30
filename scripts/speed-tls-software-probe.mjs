import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--child')){
 const r=spawnSync(process.execPath,[process.argv[1],'--child'],{windowsHide:true,encoding:'utf8',timeout:35000,env:{...process.env,OPENSSL_ia32cap:'~0x200000200000000',NODE_OPTIONS:''}});process.stdout.write(r.stdout||'');if(r.status!==0)console.log(JSON.stringify({softwareTls:false,exitCode:r.status,error:r.error?.code||'TLS_FAILURE'}));process.exit(r.status||0);
}
else{
 const r=await fetch('https://registry.npmjs.org/@electron/windows-sign',{headers:{Accept:'application/vnd.npm.install-v1+json'},signal:AbortSignal.timeout(25000)});const bytes=await r.arrayBuffer();const value=JSON.parse(Buffer.from(bytes).toString());console.log(JSON.stringify({softwareTls:r.ok,certificateVerification:true,package:value.name,bytes:bytes.byteLength,latest:value['dist-tags']?.latest}));
}
