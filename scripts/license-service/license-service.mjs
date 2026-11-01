// Speed License Service - public request endpoint (behind Tailscale Funnel), bound to 127.0.0.1 only.
// Never returns or logs the private key. Default: requests wait for Mohamed's approval in Speed License Manager.
import http from 'node:http';import {readFileSync,writeFileSync,existsSync,renameSync,appendFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';
import {issue} from './manager.mjs';
const DIR='C:/ProgramData/SpeedLicense',DB=DIR+'/requests.json',CFG=DIR+'/service-config.json',LOG=DIR+'/issued-licenses.csv',PORT=Number(process.env.SPEED_LICENSE_SERVICE_PORT||7790);
export const cfg=()=>{try{return {autoIssue:false,...JSON.parse(readFileSync(CFG,'utf8'))}}catch{return {autoIssue:false}}};
export const load=()=>{try{return JSON.parse(readFileSync(DB,'utf8'))}catch{return {requests:[]}}};
export const save=db=>{const t=DB+'.tmp';writeFileSync(t,JSON.stringify(db,null,1));renameSync(t,DB)};
const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
export function issueFor(r){const {payload,code}=issue({customer:r.company||r.email,machine:r.deviceName,mac:r.deviceId});
  if(!existsSync(LOG))appendFileSync(LOG,'issued,customer,machine,mac,expires\n');appendFileSync(LOG,[payload.issued,payload.customer,payload.machine,payload.mac,payload.expires||''].map(q).join(',')+'\n');
  Object.assign(r,{status:'issued',code,issuedAt:payload.issued});return r}
export function validate(b){
  const email=String(b?.email||'').trim().toLowerCase(),deviceName=String(b?.deviceName||'').trim(),deviceId=String(b?.deviceId||'').replace(/[^0-9a-f]/gi,'').toUpperCase();
  const platform=String(b?.platform||'').trim().slice(0,20),appVersion=String(b?.appVersion||'').trim().slice(0,20),company=String(b?.company||'').trim().slice(0,120);
  if(!/^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i.test(email)||email.length>254)throw Error('EMAIL');
  // eslint-disable-next-line no-control-regex -- strips control characters on purpose
  if(!deviceName||deviceName.length>64||/[\u0000-\u001f]/.test(deviceName))throw Error('DEVICE');
  if(deviceId.length!==12)throw Error('DEVICE_ID');
  if(!/^(windows|android)$/.test(platform))throw Error('PLATFORM');
  return {email,deviceName,deviceId,platform,appVersion,company};
}
const hits=new Map();const limited=ip=>{const now=Date.now(),h=(hits.get(ip)||[]).filter(t=>now-t<3600_000);h.push(now);hits.set(ip,h);return h.length>10};
const send=(res,code,v)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(v))};
const pub=r=>({id:r.id,status:r.status,...(r.status==='issued'?{code:r.code}:{})});
if(process.argv[1]&&import.meta.url.endsWith('license-service.mjs')&&process.argv[1].endsWith('license-service.mjs')){
 http.createServer((req,res)=>{
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  const url=new URL(String(req.url||'/').replace(/^\/speed-license(?=\/|$)/,'')||'/','http://x');
  if(req.method==='GET'&&url.pathname==='/v1/health')return send(res,200,{ok:true,service:'speed-license'});
  const m=url.pathname.match(/^\/v1\/status\/([0-9a-f]{32})$/);
  if(req.method==='GET'&&m){const r=load().requests.find(x=>x.id===m[1]);return r?send(res,200,pub(r)):send(res,404,{error:'NOT_FOUND'})}
  if(req.method==='POST'&&url.pathname==='/v1/request'){
   if(limited(ip))return send(res,429,{error:'RATE_LIMIT'});
   let b='';req.on('data',c=>{b+=c;if(b.length>4000){send(res,413,{error:'TOO_LARGE'});req.destroy()}});
   req.on('end',()=>{try{const v=validate(JSON.parse(b));const db=load();
     let r=db.requests.find(x=>x.deviceId===v.deviceId&&x.email===v.email&&x.status!=='rejected');
     if(!r){if(db.requests.filter(x=>x.status==='pending').length>500)return send(res,503,{error:'BUSY'});
       r={id:randomBytes(16).toString('hex'),...v,ip,status:'pending',at:new Date().toISOString()};db.requests.push(r);}
     if(r.status==='pending'&&cfg().autoIssue)issueFor(r);save(db);send(res,200,pub(r))}
    catch(e){send(res,400,{error:/^[A-Z_]+$/.test(e.message)?e.message:'BAD_REQUEST'})}});return}
  send(res,404,{error:'NOT_FOUND'});
 }).listen(PORT,'127.0.0.1',()=>console.log('Speed License Service on 127.0.0.1:'+PORT));
}
