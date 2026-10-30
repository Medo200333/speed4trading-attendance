import {createServer} from 'vite';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),area=resolve('.codex-backups/speed-source-identity-20261023'),review=join(area,'review'),out=join(area,'qa');mkdirSync(out,{recursive:true});
Object.assign(process.env,{SKYLINE_ACCESS_DATA_DIR:mkdtempSync(join(tmpdir(),'speed-identity-review-')),SKYLINE_ADMIN_USERNAME:'review-admin',SKYLINE_ADMIN_PASSWORD:'review-only-local-password',SKYLINE_DISABLE_SCHEDULER:'1',VITE_AUTH_ENABLED:'false',VITE_GROK_EXTENSIONS:'0'});delete process.env.SKYLINE_VAULT_KEY;
let vite,browser;
const previous=process.cwd();
try{
 process.chdir(review);
 vite=await createServer({root:review,configFile:join(review,'vite.config.ts'),cacheDir:join(area,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:8094,strictPort:true,fs:{allow:[review,join(root,'node_modules')],deny:['**/.env','**/.env.*','**/.git/**','**/*.keystore','**/*.jks','**/credential-*.json']}}});await vite.listen();
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8094/',{waitUntil:'networkidle',timeout:90000});
 await page.getByRole('button',{name:'دخول Speed Maintenance',exact:true}).waitFor();
 for(const width of [320,375,390,768,1280]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'login width '+width);await page.screenshot({path:join(out,'login-'+width+'.png'),fullPage:true});}
 await page.getByLabel('اسم مستخدم البرنامج',{exact:true}).fill('review-admin');await page.getByLabel('كلمة مرور البرنامج',{exact:true}).fill('review-only-local-password');await page.getByRole('button',{name:'دخول Speed Maintenance',exact:true}).click();
 await page.getByRole('heading',{name:'الرئيسية',exact:true}).waitFor();assert.equal(await page.title(),'Speed Maintenance');
 assert.ok(!(await page.locator('body').innerText()).includes('زبيد'));
 const logo=page.locator('.ac-official-logo:visible').first();await logo.waitFor();assert.equal(await logo.evaluate(img=>img.naturalWidth),1600);
 for(const width of [320,375,390,768,1280]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home width '+width);await page.screenshot({path:join(out,'home-'+width+'.png'),fullPage:true});}
 const source=readFileSync('public/brand/speed/source-logo.png');assert.ok(source.equals(readFileSync(join(area,'source-reference/public/speed-trading-logo.png'))),'original logo must be unchanged');
 assert.deepEqual(errors,[]);const result={reviewOnly:true,liveBrandChanged:false,sourceProjectModified:false,login:'PASS',home:'PASS',productName:'Speed Maintenance (pending approval)',ownerName:'Speed for Training (user specified)',logoLiteralText:'SPEED TRADING (conflict disclosed)',logoBytesUnchanged:true,widths:[320,375,390,768,1280],pageErrors:0};writeFileSync(join(out,'review-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();await vite?.close();process.chdir(previous);}
