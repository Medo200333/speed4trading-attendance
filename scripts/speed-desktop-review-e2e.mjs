import {_electron as electron} from 'playwright';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const area=resolve('.codex-backups/speed-source-identity-20261023'),review=join(area,'review'),profile=mkdtempSync(join(tmpdir(),'speed-acceptance-'));
const packaged=join(review,'releases/windows/win-unpacked/Speed Maintenance.exe'),runtime=resolve('desktop/node_modules/electron/dist/electron.exe');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
let application,page;
async function capture(name){
 try{const encoded=await application.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];const shot=await Promise.race([window.webContents.capturePage(undefined,{stayHidden:true}),new Promise(r=>setTimeout(()=>r(null),5000))]);return shot&&!shot.isEmpty()?shot.toPNG().toString('base64'):'';});if(encoded){writeFileSync(join(area,'qa',name),Buffer.from(encoded,'base64'));return 'CAPTURED';}return 'UNAVAILABLE_WHILE_HIDDEN';}catch{return 'UNAVAILABLE_WHILE_HIDDEN';}
}
try{
 const isPackaged=existsSync(packaged);application=await electron.launch({executablePath:isPackaged?packaged:runtime,args:isPackaged?[]:[join(review,'desktop')],cwd:review,timeout:60000,chromiumSandbox:true,env:{...process.env,SPEED_DESKTOP_E2E:'1',SPEED_DESKTOP_TEST_PROFILE:profile,OPENSSL_ia32cap:'~0x200000200000000',NODE_OPTIONS:''}});
 page=await application.firstWindow();await page.locator('#setup').waitFor();
 const firstRunCapture=await capture('windows-first-run.png');
 await page.locator('[name=companyName]').fill('شركة اختبار Windows');await page.locator('[name=adminName]').fill('مدير الاختبار');await page.locator('[name=username]').fill('native-test-admin');await page.locator('[name=password]').fill('native-test-only-password');await page.locator('details').evaluate(element=>element.open=true);await page.locator('[name=port]').fill(String(port));
 await page.locator('#setup').evaluate(form=>form.requestSubmit());
 await page.getByRole('button',{name:'دخول Speed Maintenance',exact:true}).waitFor({timeout:60000});
 await page.getByLabel('اسم مستخدم البرنامج',{exact:true}).fill('native-test-admin');await page.getByLabel('كلمة مرور البرنامج',{exact:true}).fill('native-test-only-password');await page.locator('form').evaluate(form=>form.requestSubmit());
 await page.getByRole('heading',{name:'الرئيسية',exact:true}).waitFor();await page.getByText('شركة اختبار Windows',{exact:true}).first().waitFor();
 const brand=await application.evaluate(({app})=>({name:app.getName(),packaged:app.isPackaged,userData:app.getPath('userData')}));assert.equal(brand.name,'Speed Maintenance');assert.equal(brand.userData,profile);
 const state=JSON.parse(readFileSync(join(profile,'data/state.json')));assert.equal(state.devices.length,0);assert.equal(state.people.length,0);assert.ok(!readFileSync(join(profile,'data/state.json'),'utf8').includes('native-test-only-password'));assert.ok(existsSync(join(profile,'data/vault-key.bin')));
 const preferences=await application.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,webSecurity:p.webSecurity};});
 assert.deepEqual(preferences,{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true});
 const homeCapture=await capture('windows-home.png');
 const archive=join(profile,'native-backup.speedbackup');
 await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},archive);
 const nextWindow=application.waitForEvent('window');await page.evaluate(()=>window.zubaydDesktop.maintenance());const maintenance=await nextWindow;await maintenance.locator('#maintenance').waitFor();
 const credentials={username:'native-test-admin',password:'native-test-only-password',backupPassword:'native-test-only-archive-password'};
 const backup=await maintenance.evaluate(input=>window.zubaydDesktop.backup(input),credentials);assert.equal(backup.ok,true);assert.ok(existsSync(archive));assert.ok(!readFileSync(archive,'utf8').includes(credentials.password));
 const changed=JSON.parse(readFileSync(join(profile,'data/state.json')));changed.revision=99;writeFileSync(join(profile,'data/state.json'),JSON.stringify(changed));
 const preview=await maintenance.evaluate(input=>window.zubaydDesktop.restore(input),{...credentials,phase:'inspect'});assert.ok(preview.token);assert.equal(preview.preview.companies,1);
 const restored=await maintenance.evaluate(input=>window.zubaydDesktop.restore(input),{...credentials,phase:'commit',token:preview.token,phrase:'استعادة بيانات Speed Maintenance'});assert.equal(restored.ok,true);
 assert.notEqual(JSON.parse(readFileSync(join(profile,'data/state.json'))).revision,99);
 const prior=readdirSync(profile).find(name=>name.startsWith('data.before-restore-'));assert.ok(prior);assert.equal(JSON.parse(readFileSync(join(profile,prior,'state.json'))).revision,99);
 await maintenance.close();
 await page.getByRole('button',{name:'دخول Speed Maintenance',exact:true}).waitFor();
 await page.getByLabel('اسم مستخدم البرنامج',{exact:true}).fill('native-test-admin');await page.getByLabel('كلمة مرور البرنامج',{exact:true}).fill('native-test-only-password');await page.locator('form').evaluate(form=>form.requestSubmit());
 await page.getByRole('heading',{name:'الرئيسية',exact:true}).waitFor();
 const result={reviewOnly:true,packagedExecutable:brand.packaged,firstRunWizard:'PASS',windowsSafeStorage:'PASS',bundledRuntimeServer:'PASS',localAdministratorLogin:'PASS',nativeEncryptedBackup:'PASS',nativePreviewAndTransactionalRestore:'PASS',previousDataDirectoryRetained:'PASS',sandboxAndContextIsolation:'PASS',freshCompany:'PASS',noDevelopmentDevices:'PASS',temporaryProfile:'PASS',firstRunCapture,homeCapture,physicalDeviceRequests:0,cleanInstallerRun:false};writeFileSync(join(area,'qa/windows-native-e2e.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){if(page){await capture('windows-native-failure.png');writeFileSync(join(area,'qa/windows-native-failure-ui.txt'),await page.locator('body').innerText().catch(()=>''));}throw error;}
finally{await application?.close();}
