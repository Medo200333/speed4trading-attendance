import { readFileSync, writeFileSync } from 'node:fs';
let file='scripts/access-center-e2e.mjs', source=readFileSync(file,'utf8');
source=source.replace('.codex-backups/redesign-guide-20261022/qa','.codex-backups/speed-rebrand-20261023/qa');
source=source.replace('    logLevel: "error",','    logLevel: "error",\n    cacheDir: "node_modules/.vite-speed-e2e",');
source=source.replace('"وسائل التحقق": ["الموظفون", "الكروت والوجه والأصابع"],','"وسائل التحقق": ["الموظفون", "الكروت والوجه والأصابع"],\n      "الصلاحيات": ["الموظفون", "صلاحيات الأبواب"],');
source=source.replaceAll('locator(".ac-sidebar")','locator(".ac-sidebar:visible")');
source=source.replace('[320, 375, 390, 768, 1280]','[320, 360, 375, 390, 768, 1280]');
source=source.replace('  await dialog.getByRole("button", { name: "التالي: اختبار الاتصال", exact: true }).click();', `  for (const width of [320,360,375,390,768,1280]) { await page.setViewportSize({width,height:900}); const box = await dialog.boundingBox(); assert.ok(box && box.x>=0 && box.x+box.width<=width+1, "setup must fit " + width); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); }
  await dialog.getByRole("button", { name: "التالي: اختبار الاتصال", exact: true }).click();`);
source=source.replace('    await page.screenshot({ path: join(output, `access-${width}.png`) });',`    await page.screenshot({ path: join(output, \`access-\${width}.png\`) });
    if (width < 1200) {
      assert.equal(await page.locator(".ac-desktop-sidebar").isVisible(),false);
      const trigger=page.getByRole("button",{name:"فتح قائمة الأقسام",exact:true});
      await trigger.click();
      const drawer=page.getByRole("dialog",{name:"قائمة أقسام البرنامج",exact:true}); await drawer.waitFor();
      const buttons=drawer.getByRole("button"); await buttons.first().focus(); await page.keyboard.press("Shift+Tab"); assert.ok(await buttons.last().evaluate(el=>el===document.activeElement));
      await page.keyboard.press("Escape"); await drawer.waitFor({state:"hidden"}); assert.ok(await trigger.evaluate(el=>el===document.activeElement));
      await trigger.click(); await page.locator(".ac-drawer-backdrop").click({position:{x:5,y:5}}); await drawer.waitFor({state:"hidden"});
    }
    if (width===320) { await page.evaluate(()=>document.documentElement.style.fontSize="200%"); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"200% text must reflow"); await page.evaluate(()=>document.documentElement.style.fontSize=""); }
`);
source=source.replace('    realDeviceWrites: 0,','    realDeviceWrites: 0,\n    mobileDrawerKeyboardAndBackdrop: "PASS",\n    textZoom200: "PASS",\n    brand: "Speed for Trading",');
source=source.replace('  const cookie =',`  assert.equal(await page.title(), "Speed for Trading");
  const manifest=await (await context.request.get(base+"/manifest.webmanifest")).json(); assert.equal(manifest.name,"Speed for Trading");
  for(const icon of manifest.icons) assert.equal((await context.request.get(base+icon.src)).status(),200);
  assert.ok(!(await page.locator("body").innerText()).includes("SKY LINE"));
  const cookie =`);
source=source.replace('else { assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");', 'else { assert.ok(bytes.toString("latin1").includes("Speed for Trading")); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");');
writeFileSync(file,source);

file='scripts/biometrics-browser.mjs'; source=readFileSync(file,'utf8');
source=source.replace('import { mkdtempSync, writeFileSync }','import { mkdtempSync, mkdirSync, writeFileSync }');
source=source.replace('.codex-backups/biometrics-20261022','.codex-backups/speed-rebrand-20261023/qa/face').replace('Object.assign(process.env','mkdirSync(output,{recursive:true});\nObject.assign(process.env');
source=source.replace('node_modules/.vite-biometrics-browser','node_modules/.vite-speed-biometrics');
source=source.replaceAll('locator(".ac-sidebar")','locator(".ac-sidebar:visible")');
const start=source.indexOf('  for (const name of ['), end=source.indexOf('  await page\n    .getByRole("button", { name: "فحص وسائل الموظف',start);
source=source.slice(0,start)+`  await page.getByRole("heading",{name:"تسجيل بصمة الوجه",exact:true}).waitFor();
  await page.getByText("بصمات الأصابع وطريقة التسجيل اليدوي",{exact:true}).click();
  await page.getByText(/DS-K1A340WX لا يحتوي مستشعر إصبع/).waitFor();
`+source.slice(end);
source=source.replace('  const camera =',`  await page.getByRole("button",{name:"التالي: اختيار صورة الوجه",exact:true}).click();
  const camera =`);
const chooseStart=source.indexOf('  async function choose()'), chooseEnd=source.indexOf('  await choose();',chooseStart);
source=source.slice(0,chooseStart)+`  const widths=[320,360,375,390,768,1280];
  async function layout(stage) {
    for(const width of widths){ await page.setViewportSize({width,height:1000}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),stage+" overflow at "+width); }
    await page.setViewportSize({width:390,height:1000});
    await page.screenshot({path:join(output,stage+"-390.png")});
  }
  async function choose() {
    await camera.setInputFiles({ name:"synthetic-pattern.jpg",mimeType:"image/jpeg",buffer:photo });
    await layout("select");
    await page.getByRole("button",{name:"التالي: التعديل والمعاينة",exact:true}).click();
    await page.getByLabel("تكبير القص",{exact:true}).fill("1.2");
    await layout("crop");
    await page.getByRole("button",{name:"التالي: مراجعة الجودة",exact:true}).click();
    await page.getByLabel("أؤكد أن الصورة لموظف واحد، الوجه واضح ومواجه للكاميرا بالكامل دون قناع أو نظارة شمسية.",{exact:true}).check();
    await layout("quality");
    await page.getByRole("button",{name:"التالي: تأكيد التسجيل",exact:true}).click();
    await layout("review");
  }
`+source.slice(chooseEnd);
const repeated=source.indexOf('  await page.getByLabel("تكبير القص"',source.indexOf('  await choose();'));
const trigger=source.indexOf('  await page\n    .getByRole("button", {\n      name: "تسجيل الوجه',repeated);
source=source.slice(0,repeated)+source.slice(trigger);
source=source.replaceAll('تسجيل الوجه على البصمة — معاينة وتأكيد','مراجعة تأكيد التسجيل');
source=source.replace('  await page\n    .getByLabel("الموظف", { exact: true })','  await page.getByRole("button",{name:"العودة إلى بيانات الموظف وفحصه",exact:true}).click();\n  await page\n    .getByLabel("الموظف", { exact: true })');
const remoteStart=source.indexOf('  await page\n    .getByRole("button", {\n      name: "التسجيل من كاميرا جهاز البصمة');
const remoteEnd=source.indexOf('  dialog = page.getByRole("dialog");',remoteStart);
source=source.slice(0,remoteStart)+`  await page.getByRole("button",{name:"التالي: اختيار صورة الوجه",exact:true}).click();
  await page.getByRole("button",{name:"كاميرا جهاز البصمة",exact:true}).click();
  await page.getByRole("button",{name:"التالي: التعديل والمعاينة",exact:true}).click();
  await page.getByRole("button",{name:"التالي: مراجعة الجودة",exact:true}).click();
  await page.getByLabel("الموظف الصحيح يقف أمام الجهاز ومستعد للتسجيل.",{exact:true}).check();
  await page.getByRole("button",{name:"التالي: تأكيد التسجيل",exact:true}).click();
  await page.getByRole("button",{name:"مراجعة تأكيد التسجيل",exact:true}).click();
`+source.slice(remoteEnd);
source=source.replace('    cropAndPreview: "PASS",', '    cropAndPreview: "PASS",\n    sixStageWizard: "PASS",\n    allPhotoStagesAtSixWidths: "PASS",');
writeFileSync(file,source);
console.log('Browser regression tests updated for the new navigation and six-step face wizard.');
