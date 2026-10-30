// Speed License Manager - 127.0.0.1, optionally behind tailscale serve (tailnet only, password login). Signs Speed for Training activation codes.
import http from 'node:http';import {readFileSync,appendFileSync,existsSync,writeFileSync} from 'node:fs';import {createPrivateKey,sign,scryptSync,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';import {exec} from 'node:child_process';
const DIR='C:/ProgramData/SpeedLicense',KEY=DIR+'/private-ed25519.pem',LOG=DIR+'/issued-licenses.csv',PORT=Number(process.env.SPEED_LICENSE_PORT||7788);
const norm=m=>String(m||'').replace(/[^0-9a-f]/gi,'').toUpperCase();
export function issue({customer,machine,mac,expires},key=createPrivateKey(readFileSync(KEY))){
  customer=String(customer||'').trim();machine=String(machine||'').trim();mac=norm(mac);
  if(!customer||!machine||mac.length!==12)throw Error('اسم العميل واسم الجهاز وMAC (12 خانة) مطلوبة');
  const exp=expires?new Date(String(expires)+'T23:59:59Z'):null;if(exp&&isNaN(exp))throw Error('تاريخ الانتهاء غير صحيح');
  const payload={v:1,product:'speed-for-training',customer,machine,mac,issued:new Date().toISOString(),expires:exp?exp.toISOString():null};
  const body=Buffer.from(JSON.stringify(payload));return {payload,code:'SFT-LIC-'+body.toString('base64url')+'.'+sign(null,body,key).toString('base64url')};
}
const parseReq=c=>{try{return JSON.parse(Buffer.from(String(c).trim().replace(/^SFT-REQ-/,''),'base64url').toString())}catch{return null}};
const page=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Speed License Manager</title>
<style>body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;background:#F8F5EC;color:#0B2242;margin:0;padding:16px}form{max-width:620px;margin:auto;background:#fff;border:1px solid #E5DDC9;border-radius:14px;padding:20px;display:grid;gap:10px}h1{margin:0;font-size:22px}label{display:grid;gap:4px;font-weight:600}input,textarea{font:inherit;padding:8px;border:1px solid #E5DDC9;border-radius:8px}button{font:inherit;background:#0B2242;color:#fff;border:0;border-radius:8px;padding:10px;cursor:pointer}button.alt{background:#D6B25E;color:#0B2242}.msg{padding:8px;border-radius:8px;background:#F1DFAC}.err{background:#f6d5d2;color:#a13b32}</style>
<form id=f><h1>Speed License Manager</h1><p>إصدار كود تفعيل Speed for Training لجهاز محدد.</p>
<label>كود الطلب (اختياري — يملأ الجهاز وMAC)<textarea id=req dir=ltr rows=2></textarea></label><button type=button class=alt id=fill>قراءة كود الطلب</button>
<label>اسم العميل<input id=customer required></label><label>اسم الجهاز<input id=machine dir=ltr required></label><label>MAC<input id=mac dir=ltr required placeholder="AA:BB:CC:DD:EE:FF"></label>
<label>تاريخ الانتهاء (اختياري)<input id=expires type=date></label><button id=go>إصدار كود التفعيل</button><p id=msg class=msg hidden></p>
<label>كود التفعيل<textarea id=out dir=ltr rows=5 readonly></textarea></label><button type=button class=alt id=copy>نسخ الكود</button></form>
<script>const $=i=>document.getElementById(i),say=(t,e)=>{$('msg').hidden=false;$('msg').textContent=t;$('msg').className='msg'+(e?' err':'')};
$('fill').onclick=async()=>{const r=await fetch('./request',{method:'POST',body:$('req').value});const j=await r.json();if(!j.ok)return say(j.error,1);$('machine').value=j.machine;$('mac').value=j.macs[0]||'';say(j.macs.length>1?'للجهاز أكثر من MAC؛ تم اختيار الأول: '+j.macs.join(' , '):'تمت قراءة كود الطلب.')};
$('f').onsubmit=async e=>{e.preventDefault();$('go').disabled=true;say('جارٍ الإصدار…');try{const r=await fetch('./issue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer:$('customer').value,machine:$('machine').value,mac:$('mac').value,expires:$('expires').value})});const j=await r.json();if(!j.ok)return say(j.error,1);$('out').value=j.code;say('تم إصدار الكود وتسجيله في issued-licenses.csv')}catch{say('تعذر الاتصال بالمدير',1)}finally{$('go').disabled=false}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('out').value);say('تم النسخ')}catch{$('out').select();say('حدد الكود وانسخه يدوياً',1)}};</script><section id=pend style="max-width:620px;margin:16px auto;background:#fff;border:1px solid #E5DDC9;border-radius:14px;padding:20px"><h2 style="margin:0 0 8px">طلبات الترخيص من البرنامج</h2><label style="display:flex;gap:8px;align-items:center"><input type=checkbox id=auto> إصدار تلقائي بدون موافقة</label><div id=plist>…</div></section>
<script>const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function lp(){const j=await (await fetch('./pending')).json();$('auto').checked=!!j.autoIssue;$('plist').innerHTML=j.requests.length?j.requests.map(r=>'<div style="border-top:1px solid #eee;padding:8px 0"><b>'+esc(r.email)+'</b> '+esc(r.company)+'<br><small dir=ltr>'+esc(r.platform)+' '+esc(r.appVersion)+' | '+esc(r.deviceName)+' | '+esc(r.deviceId)+' | '+esc(r.at)+'</small><br>'+(r.status==='pending'?'<button data-a=approve data-i='+r.id+'>موافقة وإصدار</button> <button class=alt data-a=reject data-i='+r.id+'>رفض</button>':'<small>'+esc(r.status)+'</small>')+'</div>').join(''):'لا توجد طلبات.'}
$('plist').onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;b.disabled=true;const r=await (await fetch('./'+b.dataset.a,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:b.dataset.i})})).json();if(!r.ok)alert(r.error);lp()};
$('auto').onchange=async()=>{await fetch('./config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoIssue:$('auto').checked})});lp()};lp();setInterval(lp,15000);</script></html>`;
const json=(res,v)=>{res.writeHead(200,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(v))};
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].replace(/\\/g,'/').split('/').pop())){
 const AUTH=DIR+'/manager-auth.json',PUB=String(process.env.SPEED_MANAGER_HOSTS||'').toLowerCase().split(',').filter(Boolean);
 const auth=()=>{try{return JSON.parse(readFileSync(AUTH,'utf8'))}catch{return null}};
 const sid=a=>createHmac('sha256',Buffer.from(a.secret,'hex')).update('speed-manager-session').digest('base64url');
 const cookie=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x[0]));
 const fails=new Map();
 const loginPage=e=>`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Speed License Manager</title><style>body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;background:#F8F5EC;color:#0B2242;margin:0;padding:16px}form{max-width:420px;margin:40px auto;background:#fff;border:1px solid #E5DDC9;border-radius:14px;padding:20px;display:grid;gap:10px}input{font:inherit;padding:10px;border:1px solid #E5DDC9;border-radius:8px}button{font:inherit;background:#0B2242;color:#fff;border:0;border-radius:8px;padding:10px}.err{background:#f6d5d2;color:#a13b32;padding:8px;border-radius:8px}</style><form method=post action="./login"><h1 style="margin:0;font-size:22px">Speed License Manager</h1><label>كلمة المرور<input type=password name=password autocomplete=current-password required autofocus dir=ltr></label>${e?'<p class=err>'+e+'</p>':''}<button>دخول</button></form></html>`;
 http.createServer((req,res)=>{const host=String(req.headers.host||'').toLowerCase(),local=/^127\.0\.0\.1(:\d+)?$/.test(host);
  if(!local&&!PUB.includes(host)){res.writeHead(403);return res.end()}
  const scheme=local?'http://':'https://';
  if(req.method==='POST'&&req.headers.origin&&req.headers.origin.toLowerCase()!==scheme+host){res.writeHead(403);return res.end()}
  if(!local){const a=auth();if(!a){res.writeHead(503);return res.end('auth not configured')}
   const ip=String(req.headers['x-forwarded-for']||'tailnet');
   if(req.url==='/login'&&req.method==='POST'){let b='';req.on('data',c=>{b+=c;if(b.length>2000)req.destroy()});return req.on('end',()=>{const f=fails.get(ip)||{n:0,t:0};if(f.n>=5&&Date.now()-f.t<10*60e3){res.writeHead(429,{'content-type':'text/html; charset=utf-8'});return res.end(loginPage('محاولات كثيرة، حاول بعد 10 دقائق'))}
     const pw=new URLSearchParams(b).get('password')||'',h=scryptSync(pw,Buffer.from(a.salt,'hex'),32),ok=timingSafeEqual(h,Buffer.from(a.hash,'hex'));
     if(!ok){fails.set(ip,{n:f.n+1,t:Date.now()});res.writeHead(401,{'content-type':'text/html; charset=utf-8'});return res.end(loginPage('كلمة المرور غير صحيحة'))}
     fails.delete(ip);res.writeHead(303,{location:'./','set-cookie':'sm='+sid(a)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'});res.end()})}
   if(req.url==='/logout'){res.writeHead(303,{location:'./','set-cookie':'sm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});return res.end()}
   const c=cookie(req).sm||'',want=sid(a);if(c.length!==want.length||!timingSafeEqual(Buffer.from(c),Buffer.from(want))){if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','x-frame-options':'DENY','cache-control':'no-store'});return res.end(loginPage(''))}res.writeHead(401,{'content-type':'application/json'});return res.end('{"ok":false,"error":"login required"}')}}
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','x-frame-options':'DENY'});return res.end(page)}
  if(req.method==='GET'&&req.url==='/pending'){return import('./license-service.mjs').then(L=>json(res,{autoIssue:L.cfg().autoIssue,requests:L.load().requests.slice(-100).reverse().map(({code,ip,...r})=>r)}))}
  if(req.method!=='POST'){res.writeHead(404);return res.end()}
  let b='';req.on('data',c=>{b+=c;if(b.length>8000)req.destroy()});req.on('end',()=>{try{
   if(req.url==='/request'){const r=parseReq(b);return json(res,r&&r.machine?{ok:true,machine:r.machine,macs:r.macs}:{ok:false,error:'كود الطلب غير صالح'})}
   if(req.url==='/issue'){const {payload,code}=issue(JSON.parse(b));if(!existsSync(LOG))appendFileSync(LOG,'issued,customer,machine,mac,expires\n');const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';appendFileSync(LOG,[payload.issued,payload.customer,payload.machine,payload.mac,payload.expires||''].map(q).join(',')+'\n');return json(res,{ok:true,code})}
   if(req.url==='/approve'||req.url==='/reject'||req.url==='/config'){return import('./license-service.mjs').then(L=>{const v=JSON.parse(b||'{}');if(req.url==='/config'){writeFileSync(DIR+'/service-config.json',JSON.stringify({...L.cfg(),autoIssue:v.autoIssue===true}));return json(res,{ok:true})}const db=L.load(),r=db.requests.find(x=>x.id===v.id&&x.status==='pending');if(!r)return json(res,{ok:false,error:'الطلب غير موجود أو تم التعامل معه'});if(req.url==='/approve')L.issueFor(r);else r.status='rejected';L.save(db);json(res,{ok:true})}).catch(e=>json(res,{ok:false,error:e.message}))}
   res.writeHead(404);res.end()}catch(e){json(res,{ok:false,error:e.message})}})
 }).on('error',e=>{if(e.code==='EADDRINUSE'&&!process.env.NO_OPEN){exec('start "" http://127.0.0.1:'+PORT);setTimeout(()=>process.exit(0),1500)}else throw e}).listen(PORT,'127.0.0.1',()=>{console.log('Speed License Manager: http://127.0.0.1:'+PORT);if(!process.env.NO_OPEN)exec('start "" http://127.0.0.1:'+PORT)});
}
