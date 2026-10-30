/** Public package downloader using Windows Schannel. No TLS bypass; checksums remain enforced. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const root=resolve('.codex-backups/speed-source-identity-20261023/tools');mkdirSync(root,{recursive:true});
const nonce=randomBytes(12).toString('hex');let base='',requests=0;const downloads=new Map();
const curl=(url,file)=>new Promise((done,fail)=>{
 const child=spawn('curl.exe',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--connect-timeout','15','--max-time','120','--retry','3','--retry-all-errors','--header','Accept: application/vnd.npm.install-v1+json','--output',file,url],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>error+=b);child.on('exit',code=>code===0?done():fail(new Error('SCHANNEL_DOWNLOAD '+code+' '+error.slice(0,200))));child.on('error',fail);
});
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const path=req.url||'';let url;
  if(path.startsWith('/'+nonce+'/registry/'))url='https://registry.npmjs.org/'+path.slice(('/'+nonce+'/registry/').length);
  else if(path.startsWith('/'+nonce+'/builder/'))url='https://github.com/electron-userland/electron-builder-binaries/releases/download/'+path.slice(('/'+nonce+'/builder/').length);
  else {res.writeHead(404);res.end();return;}
  if(path.includes('..')||path.includes('\\'))throw Error('PATH');
  const key=createHash('sha256').update(url).digest('hex'),file=join(root,key+'.download');
  if(!existsSync(file+'.complete')){
   if(!downloads.has(url))downloads.set(url,(async()=>{const temporary=file+'.partial';await curl(url,temporary);if(url.startsWith('https://registry.npmjs.org/')&&!url.split('?')[0].endsWith('.tgz'))JSON.parse(readFileSync(temporary,'utf8'));renameSync(temporary,file);writeFileSync(file+'.complete','verified transfer');})().finally(()=>downloads.delete(url)));
   await downloads.get(url);
  }
  let body=readFileSync(file);const json=body[0]===123;
  if(json)body=Buffer.from(body.toString('utf8').replaceAll('https://registry.npmjs.org/',base+'/registry/'));
  res.writeHead(200,{'content-type':json?'application/json':'application/octet-stream','content-length':body.length});res.end(req.method==='HEAD'?undefined:body);
  requests++;if(requests%50===0)console.log(JSON.stringify({downloadedPublicRequests:requests,tls:'Windows Schannel verified'}));
 }catch(error){res.writeHead(502);res.end('Official package download failed');console.error(error.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/'+nonce;
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
try{
 const code=await new Promise((done,fail)=>{const child=spawn(process.execPath,[npm,'install','--prefix','desktop','--save-dev','--save-exact','electron@latest','electron-builder@latest','--ignore-scripts','--no-audit','--no-fund','--maxsockets=4','--registry='+base+'/registry/'],{windowsHide:true,stdio:'inherit',env:{...process.env,NODE_OPTIONS:''}});child.on('exit',done);child.on('error',fail);});
 if(code!==0)throw Error('PACKAGE_INSTALL '+code);
 for(const path of ['desktop/package-lock.json','desktop/node_modules/.package-lock.json'])if(existsSync(path))writeFileSync(path,readFileSync(path,'utf8').replaceAll(base+'/registry/','https://registry.npmjs.org/'));
 const electronVersion=JSON.parse(readFileSync('desktop/node_modules/electron/package.json')).version;
 const archive=`electron-v${electronVersion}-win32-x64.zip`,zip=join(root,archive),sums=join(root,'electron-sha256.txt');
 await curl(`https://github.com/electron/electron/releases/download/v${electronVersion}/SHASUMS256.txt`,sums);
 if(!existsSync(zip))await curl(`https://github.com/electron/electron/releases/download/v${electronVersion}/${archive}`,zip);
 const expected=readFileSync(sums,'utf8').split(/\r?\n/).find(line=>line.trim().endsWith(archive))?.trim().split(/\s+/)[0];
 if(!expected||createHash('sha256').update(readFileSync(zip)).digest('hex')!==expected)throw Error('ELECTRON_CHECKSUM');
 const seven=JSON.parse(readFileSync('desktop/node_modules/7zip-bin/package.json'));const binary=resolve('desktop/node_modules/7zip-bin/win/x64/7za.exe');
 const dist=resolve('desktop/node_modules/electron/dist');mkdirSync(dist,{recursive:true});
 const extracted=await new Promise((done,fail)=>{const child=spawn(binary,['x','-y','-bd','-bso0','-o'+dist,zip],{windowsHide:true,stdio:'inherit'});child.on('exit',done);child.on('error',fail);});if(extracted!==0)throw Error('ELECTRON_EXTRACT');
 writeFileSync('desktop/node_modules/electron/path.txt','electron.exe');
 const result={electronVersion,archiveSha256:expected,electronBuilderVersion:JSON.parse(readFileSync('desktop/node_modules/electron-builder/package.json')).version,tlsVerification:true,registryIntegrity:true,schannelBridge:true};writeFileSync(join(root,'toolchain-result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 if(process.argv.includes('--build')){
  const build=await new Promise((done,fail)=>{const child=spawn(process.execPath,[npm,'--prefix','desktop','run','dist','--','--config.electronDist='+dist,'--config.electronVersion='+electronVersion],{windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_BINARIES_MIRROR:base+'/builder/',CSC_IDENTITY_AUTO_DISCOVERY:'false'}});child.on('exit',done);child.on('error',fail);});if(build!==0)throw Error('INSTALLER_BUILD '+build);
 }
}finally{await new Promise(r=>server.close(r));}
