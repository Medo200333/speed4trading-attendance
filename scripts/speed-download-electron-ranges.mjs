import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
if(!process.argv.includes('--child')){const p=spawn(process.execPath,[process.argv[1],'--child'],{windowsHide:true,stdio:'inherit',env:{...process.env,OPENSSL_ia32cap:'~0x200000200000000',NODE_OPTIONS:''}});p.on('exit',c=>process.exit(c||0));}
else{
 const version=JSON.parse(readFileSync('desktop/node_modules/electron/package.json')).version,name=`electron-v${version}-win32-x64.zip`,expected=JSON.parse(readFileSync('desktop/node_modules/electron/checksums.json'))[name];if(!expected)throw Error('OFFICIAL_CHECKSUM_MISSING');
 const root=resolve('.codex-backups/speed-source-identity-20261023/tools/electron-ranges');mkdirSync(root,{recursive:true});
 const canonical=`https://github.com/electron/electron/releases/download/v${version}/${name}`,size=1024*1024;let location=canonical,total=0;
 async function part(start,end){let last;
  for(let n=0;n<5;n++){try{
   const r=await fetch(location,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(25000)});
   if(r.status!==206)throw Error('RANGE_HTTP_'+r.status);
   const range=/bytes (\d+)-(\d+)\/(\d+)/.exec(r.headers.get('content-range')||'');if(!range||Number(range[1])!==start)throw Error('CONTENT_RANGE');
   if(!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(new URL(r.url).hostname))throw Error('DOWNLOAD_HOST');location=r.url;total=Number(range[3]);
   const body=Buffer.from(await r.arrayBuffer());if(body.length!==Number(range[2])-start+1)throw Error('PART_LENGTH');return body;
  }catch(error){last=error;await new Promise(r=>setTimeout(r,300*(n+1)));}}
  throw Error('ELECTRON_PART_'+start+' '+last?.message);
 }
 const first=await part(0,size-1);writeFileSync(join(root,'0.part'),first);
 let next=size,complete=1;const count=Math.ceil(total/size);
 async function worker(){while(next<total){const start=next;next+=size;const end=Math.min(total-1,start+size-1),file=join(root,start+'.part');if(!existsSync(file)||statSync(file).size!==end-start+1)writeFileSync(file,await part(start,end));complete++;if(complete%20===0)console.log(JSON.stringify({electronParts:complete,totalParts:count}));}}
 await Promise.all([worker(),worker(),worker()]);
 const archive=Buffer.concat(Array.from({length:count},(_,i)=>readFileSync(join(root,i*size+'.part'))));
 const sha256=createHash('sha256').update(archive).digest('hex');if(sha256!==expected)throw Error('OFFICIAL_ARCHIVE_CHECKSUM');const zip=join(root,name);writeFileSync(zip,archive);
 const dist=resolve('desktop/node_modules/electron/dist');mkdirSync(dist,{recursive:true});const result=spawnSync(resolve('desktop/node_modules/7zip-bin/win/x64/7za.exe'),['x','-y','-bd','-bso0','-o'+dist,zip],{windowsHide:true,encoding:'utf8',timeout:120000});if(result.status!==0)throw Error('EXTRACT '+result.stderr);
 writeFileSync('desktop/node_modules/electron/path.txt','electron.exe');
 writeFileSync(join(root,'verified.json'),JSON.stringify({version,sha256,bytes:archive.length,officialNpmPackageChecksum:true,certificateVerification:true,parts:count},null,2));console.log(JSON.stringify({electronRuntime:'READY',version,sha256,bytes:archive.length}));
}
