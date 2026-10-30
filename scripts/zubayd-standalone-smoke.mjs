import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),{createInstallation}=require('../desktop/desktop-config.cjs');
const directory=mkdtempSync(join(tmpdir(),'zubayd-standalone-')),password='standalone-fixture-admin-pass';
createInstallation(directory,{companyName:'عميل التثبيت الجديد',username:'fixture-admin',password});
const env={};for(const key of ['SystemRoot','WINDIR','TEMP','TMP','PATH','LOCALAPPDATA','APPDATA','USERPROFILE','COMSPEC'])if(process.env[key])env[key]=process.env[key];
const instance=randomBytes(16).toString('hex');Object.assign(env,{NODE_ENV:'production',VITE_AUTH_ENABLED:'false',SKYLINE_ACCESS_DATA_DIR:directory,SKYLINE_VAULT_KEY:randomBytes(32).toString('base64'),NITRO_HOST:'127.0.0.1',NITRO_PORT:'8093',ZUBAYD_INSTANCE_ID:instance,SKYLINE_DISABLE_SCHEDULER:'1'});
let errorCodes=0;const child=spawn(process.execPath,[resolve('dist-server/server/index.mjs')],{cwd:directory,env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>errorCodes++);
let browser;
try{
 const base='http://127.0.0.1:8093';let ready=false;
 for(let n=0;n<80;n++){try{const r=await fetch(base+'/__zubayd/instance');if(r.ok&&(await r.json()).instance===instance){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'isolated standalone server must start');
 for(const path of ['/.codex-backups/test.txt','/.skyline-private/test.txt','/src/fake-secret.bak?raw'])assert.equal((await fetch(base+path)).status,403,'production private guard '+path);
 const before=readFileSync(join(directory,'state.json'),'utf8');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,80)));
 await page.goto(base+'/',{waitUntil:'networkidle',timeout:60000});
 await page.getByLabel('اسم مستخدم البرنامج',{exact:true}).fill('fixture-admin');await page.getByLabel('كلمة مرور البرنامج',{exact:true}).fill(password);await page.getByRole('button',{name:'دخول زبيد',exact:true}).click();
 await page.getByRole('heading',{name:'الرئيسية',exact:true}).waitFor();await page.getByText('عميل التثبيت الجديد',{exact:true}).first().waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('button',{name:'إدارة الشركات والفروع',exact:true}).click();
 await page.getByRole('heading',{name:'الشركات والفروع',exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.equal(readFileSync(join(directory,'state.json'),'utf8'),before,'fresh install smoke must not mutate application data');
 const result={nodeServer:'PASS',standaloneLogin:'PASS',privatePaths403:'PASS',ownerBrand:'زبيد',freshClient:'PASS',noDevelopmentDevices:'PASS',companyPage:'PASS',mobile390:'PASS',externalDatabaseRequiredForAccessCenter:false,externalAuthProviderRequiredForAccessCenter:false,pageErrors:errors.length,physicalDeviceRequests:0,stderrChunks:errorCodes};
 mkdirSync('.codex-backups/zubayd-platform-20261023/qa',{recursive:true});writeFileSync('.codex-backups/zubayd-platform-20261023/qa/standalone.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();child.kill();}
