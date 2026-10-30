import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";
import { createAccessFixture } from "./access-test-device.mjs";
import { fixtureLogin } from "./hikvision-test-device.mjs";
import { readAppEnv } from "./with-app-env.mjs";

const output = resolve(".codex-backups/zubayd-platform-20261023/qa");
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), "skyline-access-e2e-"));
Object.assign(process.env, readAppEnv(process.cwd()), {
  SKYLINE_ACCESS_DATA_DIR: directory,
  SKYLINE_ADMIN_USERNAME: "fixture-admin",
  SKYLINE_ADMIN_PASSWORD: "fixture-admin-test-password",
  SKYLINE_DISABLE_SCHEDULER: "1",
});
delete process.env.SKYLINE_VAULT_KEY;
const fixture = await createAccessFixture();
let vite, browser, page;
const base = "http://127.0.0.1:8092";
try {
  vite = await createServer({
    configFile: "vite.access-staging.config.ts",
    logLevel: "error",
    cacheDir: "node_modules/.vite-zubayd-e2e",
  });
  await vite.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 150)));
  let capturedAction;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.postData()?.includes("device.save")
    )
      capturedAction = {
        url: request.url(),
        body: request.postDataBuffer(),
        contentType: request.headers()["content-type"],
      };
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("skyline-gate", "1");
    localStorage.setItem(
      "awwal-akher-link",
      JSON.stringify({ password: "old-fixture-secret" }),
    );
  });
  await page.goto(`${base}/legacy`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page
    .getByRole("heading", { name: "دخول التقرير", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "اختبر الاتصال", exact: true })
      .count(),
    0,
    "an old sessionStorage flag must not bypass server authentication",
  );
  await page.goto(`${base}/access`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page
    .getByRole("button", { name: "دخول زبيد", exact: true })
    .waitFor();
  await page
    .getByLabel("اسم مستخدم البرنامج", { exact: true })
    .fill("fixture-admin");
  await page
    .getByLabel("كلمة مرور البرنامج", { exact: true })
    .fill("fixture-admin-test-password");
  await page
    .getByRole("button", { name: "دخول زبيد", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "الرئيسية", exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(await page.title(), "زبيد");
  const manifest = await (
    await context.request.get(base + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.name, "زبيد");
  for (const icon of manifest.icons)
    assert.equal((await context.request.get(base + icon.src)).status(), 200);
  assert.ok(!(await page.locator("body").innerText()).includes("SKY LINE"));
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "skyline-access",
  );
  assert.ok(cookie?.httpOnly);
  assert.equal(cookie.sameSite, "Strict");
  const legacy = await context.newPage();
  await legacy.goto(`${base}/legacy`, { waitUntil: "networkidle" });
  await legacy
    .getByRole("link", { name: "مركز البصمة والأبواب", exact: true })
    .waitFor();
  await legacy.close();
  assert.ok(
    !(await page
      .evaluate(() => localStorage.getItem("awwal-akher-link"))
      .then((value) => value.includes("password"))),
  );
  const nav = async (label) => {
    const aliases = {
      "الأجهزة والتشخيص": "الأجهزة",
      المستخدمون: "الموظفون",
      "الصلاحيات والجداول": "الصلاحيات",
      "الإعدادات والأمان": "الإعدادات",
    };
    label = aliases[label] || label;
    const secondary = {
      "وسائل التحقق": ["الموظفون", "الكروت والوجه والأصابع"],
      الصلاحيات: ["الموظفون", "صلاحيات الأبواب"],
      "الأحداث والاستثناءات": ["التقارير", "سجل الأحداث الخام"],
      "سجل التدقيق": ["الإعدادات", "سجل التدقيق الإداري"],
      "دعم الوظائف والتشخيص": ["الأجهزة", "عرض جدول دعم الوظائف"],
      "Hik-Connect والملفات": ["الأجهزة", "فتح Hik-Connect والاستيراد اليدوي"],
    };
    if (secondary[label]) {
      await nav(secondary[label][0]);
      await page
        .getByRole("button", { name: secondary[label][1], exact: true })
        .first()
        .click();
      return;
    }
    if (!(await page.locator(".ac-sidebar:visible").isVisible()))
      await page.getByRole("button", { name: "المزيد", exact: true }).click();
    await page
      .locator(".ac-sidebar:visible")
      .getByRole("button", { name: label, exact: true })
      .click();
  };
  await nav("الأجهزة");
  await page
    .getByRole("button", { name: "إضافة جهاز بصمة جديد", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "إضافة جهاز بصمة جديد",
    exact: true,
  });
  await dialog
    .getByLabel("اسم الجهاز (اختياري)", { exact: true })
    .fill("جهاز اختبار آلي");
  await dialog
    .getByLabel("عنوان IP للبصمة", { exact: true })
    .fill(fixture.link.host);
  await dialog
    .getByLabel("منفذ الاتصال", { exact: true })
    .fill(String(fixture.link.port));
  await dialog
    .getByLabel("اسم مستخدم البصمة", { exact: true })
    .fill(fixtureLogin.username);
  await dialog
    .getByLabel("كلمة مرور البصمة", { exact: true })
    .fill(fixtureLogin.password);
  for (const width of [320, 360, 375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await dialog.boundingBox();
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= width + 1,
      "setup must fit " + width,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await dialog
    .getByRole("button", { name: "التالي: اختبار الاتصال", exact: true })
    .click();
  assert.ok(
    await dialog
      .getByRole("button", { name: "التالي: إكمال الإعداد", exact: true })
      .isDisabled(),
  );
  await dialog
    .getByRole("button", { name: "اختبار الاتصال", exact: true })
    .click();
  await dialog
    .getByText("DS-K1A340WX fixture", { exact: true })
    .waitFor({ timeout: 30000 });
  await dialog.getByText("V1.2.7 fixture", { exact: true }).waitFor();
  await dialog.getByText("Hikvision fixture", { exact: true }).waitFor();
  await dialog.getByText("2023-09-27", { exact: true }).waitFor();
  assert.equal(
    await dialog
      .locator("dt", { hasText: "عدد مستخدمي الجهاز" })
      .locator("..")
      .locator("dd")
      .innerText(),
    "2",
  );
  await dialog
    .getByRole("button", { name: "التالي: إكمال الإعداد", exact: true })
    .click();
  await dialog
    .getByLabel("مكان تركيب الجهاز", { exact: true })
    .fill("المدخل — موقع الاختبار");
  await dialog.getByRole("button", { name: "حفظ وإنهاء", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(fixture.mutations.length, 0);
  const legacyDirect = await context.newPage();
  await legacyDirect.addInitScript(
    ({ host, port, username }) =>
      localStorage.setItem(
        "awwal-akher-link",
        JSON.stringify({
          host,
          port,
          username,
          https: false,
          remember: true,
          mode: "direct",
          shift: "08:00",
        }),
      ),
    fixture.link,
  );
  await legacyDirect.goto(`${base}/legacy`, { waitUntil: "networkidle" });
  await legacyDirect
    .getByLabel("كلمة السر", { exact: true })
    .fill(fixtureLogin.password);
  await legacyDirect
    .getByRole("button", { name: "اختبر الاتصال", exact: true })
    .click();
  await legacyDirect
    .getByText("الاتصال تمام. اضغط اسحب الحضور.", { exact: true })
    .waitFor({ timeout: 30000 });
  await legacyDirect.close();
  assert.equal(
    fixture.mutations.length,
    0,
    "the legacy connection button must use authenticated read-only server functions",
  );
  await page.getByLabel("من تاريخ الجهاز", { exact: true }).fill("2015-01-01");
  await page.getByLabel("إلى تاريخ الجهاز", { exact: true }).fill("2015-01-02");
  await page.getByRole("button", { name: "سحب الآن", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("خام مقروء: 57") &&
      document.body.innerText.includes("لا توجد مزامنة جارية"),
    { timeout: 30000 },
  );
  assert.equal(fixture.mutations.length, 0);
  await nav("المستخدمون");
  await page.getByText("mk", { exact: true }).waitFor();
  await page.getByText("yousef", { exact: true }).waitFor();
  await page.getByRole("button", { name: "إضافة موظف", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("رقم الموظف الفريد", { exact: true }).fill("3");
  await dialog.getByLabel("اسم الموظف", { exact: true }).fill("موظف تجريبي");
  await dialog
    .getByRole("button", { name: "معاينة التغيير على الجهاز", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "إضافة مستخدم للجهاز",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(fixture.mutations.length, 0);
  assert.ok(
    await dialog
      .getByRole("button", { name: "تأكيد وإرسال إلى الجهاز", exact: true })
      .isDisabled(),
  );
  await dialog
    .getByLabel("اكتب: تأكيد المستخدم 3", { exact: true })
    .fill("تأكيد المستخدم 3");
  await dialog
    .getByRole("button", { name: "تأكيد وإرسال إلى الجهاز", exact: true })
    .click();
  dialog = page.getByRole("dialog", {name:"إعداد الموظف ووسائل التحقق",exact:true});
  await dialog.getByText(/حُفظ الموظف وأعيدت قراءته/).waitFor();
  assert.equal(fixture.mutations.length, 1);
  await dialog.getByRole("button",{name:"إنهاء إعداد الموظف",exact:true}).click();
  await dialog.waitFor({state:"hidden"});
  await page.getByText("موظف تجريبي",{exact:true}).waitFor();
  await nav("الأبواب");
  await page.getByRole("button", { name: "إضافة باب", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم الباب", { exact: true }).fill("باب محاكاة");
  await dialog
    .getByRole("button", { name: "حفظ داخل البرنامج", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(fixture.mutations.length, 1);
  await page.getByRole("button", { name: "فتح لحظي", exact: true }).click();
  dialog = page.getByRole("dialog", {
    name: "إرسال أمر للباب الفعلي",
    exact: true,
  });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
  assert.equal(
    fixture.mutations.length,
    1,
    "cancelled door preview must never send a command",
  );
  await nav("الإعدادات");
  await page
    .getByText("الحسابات والأمان وقواعد الحضور المتقدمة", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "إضافة أو تحديث حساب", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("اسم الدخول (استخدم الاسم الموجود لتحديث حساب)", {
      exact: true,
    })
    .fill("fixture-viewer");
  await dialog
    .getByLabel("الاسم المعروض", { exact: true })
    .fill("مشاهد تجريبي");
  await dialog
    .getByLabel("كلمة مرور جديدة، 10 أحرف على الأقل", { exact: true })
    .fill("fixture-viewer-test-password");
  await dialog
    .getByRole("button", { name: "حفظ داخل البرنامج", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`${base}/access`, { waitUntil: "networkidle" });
  await viewer
    .getByLabel("اسم مستخدم البرنامج", { exact: true })
    .fill("fixture-viewer");
  await viewer
    .getByLabel("كلمة مرور البرنامج", { exact: true })
    .fill("fixture-viewer-test-password");
  await viewer
    .getByRole("button", { name: "دخول زبيد", exact: true })
    .click();
  await viewer
    .getByRole("heading", { name: "الرئيسية", exact: true })
    .waitFor();
  assert.ok(
    await viewer
      .getByRole("button", { name: "إضافة موظف", exact: true })
      .isDisabled(),
  );
  assert.ok(capturedAction);
  const forged = await viewer.request.post(capturedAction.url, {
    headers: { "content-type": capturedAction.contentType, origin: base },
    data: capturedAction.body,
  });
  assert.ok((await forged.text()).includes("FORBIDDEN"));
  const crossOrigin = await context.request.post(capturedAction.url, {
    headers: {
      "content-type": capturedAction.contentType,
      origin: "https://attacker.invalid",
    },
    data: capturedAction.body,
  });
  const crossBody = await crossOrigin.text();
  assert.ok(crossOrigin.status() === 403 || crossBody.includes("ORIGIN"));
  for (const path of [
    "/.skyline-private/state.json",
    "/.codex-backups/access-center-20261022/src/lib/hikvision.functions.ts?raw",
    "/src/components/attendance-board.tsx.before-codex-fix.bak?raw",
  ]) {
    const response = await context.request.get(base + path);
    assert.equal(response.status(), 403);
  }
  await nav("الحضور والانصراف");
  await page.getByLabel("من تاريخ", { exact: true }).fill("2015-01-01");
  await page.getByLabel("إلى تاريخ", { exact: true }).fill("2015-01-01");
  await page
    .locator("tbody")
    .getByText("2015-01-01", { exact: true })
    .first()
    .waitFor();
  const exports = {};
  for (const label of ["CSV", "Excel", "PDF"]) {
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pendingDownload;
    const bytes = readFileSync(await download.path());
    if (label === "CSV") {
      assert.ok(bytes.toString("utf8").includes("2015-01-01"));
      assert.ok(bytes.toString("utf8").includes("mk"));
    } else if (label === "Excel") {
      const { sheetRows } = await vite.ssrLoadModule("/src/lib/xlsx-io.ts");
      const rows = sheetRows(bytes);
      assert.ok(
        rows.some((row) => row.includes("2015-01-01") && row.includes("mk")),
      );
    } else {
      assert.ok(bytes.toString("latin1").includes("/Subtype /Image"), "Arabic owner/client labels are rendered into PDF images");
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      assert.ok(bytes.subarray(-30).toString().includes("%%EOF"));
    }
    exports[label] = "PASS";
  }
  await page.getByRole("button",{name:"إدارة الشركات والفروع",exact:true}).click();
  await page.getByRole("button",{name:"إضافة شركة",exact:true}).click();
  const companyDialog=page.getByRole("dialog",{name:"إضافة شركة عميل",exact:true});
  await companyDialog.getByLabel("اسم الشركة بالعربية",{exact:true}).fill("شركة ماجفيجن التجريبية");
  await companyDialog.getByRole("button",{name:"التالي: مراجعة الشركة",exact:true}).click();
  await companyDialog.getByRole("button",{name:"حفظ شركة العميل",exact:true}).click();
  await companyDialog.getByRole("button",{name:"إضافة أول فرع داخل هذه الشاشة",exact:true}).click();
  const branchDialog=page.getByRole("dialog",{name:"إضافة فرع — شركة ماجفيجن التجريبية",exact:true});
  await branchDialog.getByLabel("اسم الفرع",{exact:true}).fill("فرع القاهرة");
  await branchDialog.getByRole("button",{name:"حفظ الفرع والتحقق من ظهوره",exact:true}).click();
  await branchDialog.waitFor({state:"hidden"});
  await page.getByText("فرع القاهرة",{exact:true}).waitFor();
  const companySelect=page.getByLabel("الشركة النشطة",{exact:true});
  const newCompany=await companySelect.locator("option").filter({hasText:"شركة ماجفيجن التجريبية"}).getAttribute("value");
  await companySelect.selectOption(newCompany);
  await nav("الأجهزة");
  await page.getByText("أضف أول جهاز لبدء العمل.",{exact:true}).waitFor();
  assert.equal(await page.getByText("جهاز اختبار آلي",{exact:true}).count(),0);
  await page.getByRole("button",{name:"إضافة جهاز بصمة جديد",exact:true}).click();
  const newDevice=page.getByRole("dialog",{name:"إضافة جهاز بصمة جديد",exact:true});
  await newDevice.getByLabel("الفرع أو الموقع",{exact:true}).locator("option").filter({hasText:"فرع القاهرة"}).waitFor({state:"attached"});
  for(const width of [320,360,375,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await newDevice.getByRole("button",{name:"إلغاء",exact:true}).click();
  await companySelect.selectOption("legacy");
  await nav("الرئيسية");
  const widths = [320, 360, 375, 390, 768, 1280];
  await nav("دليل التشغيل");
  await page
    .getByLabel("ابحث داخل دليل التشغيل", { exact: true })
    .fill("أول موظف");
  await page
    .locator(".ac-guide-topics")
    .getByRole("button", { name: /إضافة أول موظف/ })
    .click();
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await page
    .getByRole("heading", { name: "أدخل بيانات الموظف", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "افتح إضافة موظف", exact: true })
    .click();
  await page.getByRole("dialog", { name: "إضافة موظف", exact: true }).waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "إلغاء", exact: true })
    .click();
  const rootPage = await context.newPage();
  await rootPage.goto(base + "/", { waitUntil: "networkidle" });
  await rootPage
    .getByRole("heading", { name: "الرئيسية", exact: true })
    .waitFor();
  await rootPage.close();
  const sections = [
    "الرئيسية",
    "الأجهزة",
    "الموظفون",
    "الأبواب",
    "الصلاحيات",
    "الحضور والانصراف",
    "التقارير",
    "دليل التشغيل",
    "الإعدادات",
    "وسائل التحقق",
    "دعم الوظائف والتشخيص",
    "سجل التدقيق",
    "Hik-Connect والملفات",
  ];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of sections) {
      await nav(section);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      if (dimensions.scroll > dimensions.width + 1)
        console.log(
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .map((element) => ({
                  tag: element.tagName,
                  class: element.className?.toString().slice(0, 160),
                  left: Math.round(element.getBoundingClientRect().left),
                  right: Math.round(element.getBoundingClientRect().right),
                  width: Math.round(element.getBoundingClientRect().width),
                }))
                .filter((row) => row.left < -1 || row.right > innerWidth + 1)
                .slice(0, 35),
            ),
          ),
        );
      assert.ok(
        dimensions.scroll <= dimensions.width + 1,
        `${section}: horizontal overflow ${dimensions.scroll} at ${width}`,
      );
    }
    await nav("المستخدمون");
    await page.getByRole("button", { name: "إضافة موظف", exact: true }).click();
    const personForm = page.getByRole("dialog", {
      name: "إضافة موظف",
      exact: true,
    });
    await personForm.waitFor();
    const formBox = await personForm.boundingBox();
    assert.ok(
      formBox && formBox.x >= 0 && formBox.x + formBox.width <= width + 1,
      `user form must fit ${width}px`,
    );
    await personForm
      .getByLabel("اسم الموظف", { exact: true })
      .fill("موظف عربي — اختبار نموذج فقط");
    await personForm
      .getByRole("button", { name: "إلغاء", exact: true })
      .click();
    await nav("الرئيسية");
    await page.screenshot({ path: join(output, `access-${width}.png`) });
    if (width < 1200) {
      assert.equal(
        await page.locator(".ac-desktop-sidebar").isVisible(),
        false,
      );
      const trigger = page.getByRole("button", {
        name: "فتح قائمة الأقسام",
        exact: true,
      });
      await trigger.click();
      const drawer = page.getByRole("dialog", {
        name: "قائمة أقسام البرنامج",
        exact: true,
      });
      await drawer.waitFor();
      const buttons = drawer.getByRole("button");
      await buttons.first().focus();
      await page.keyboard.press("Shift+Tab");
      assert.ok(
        await buttons.last().evaluate((el) => el === document.activeElement),
      );
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      assert.ok(await trigger.evaluate((el) => el === document.activeElement));
      await trigger.click();
      await page
        .locator(".ac-drawer-backdrop")
        .click({ position: { x: 5, y: 5 } });
      await drawer.waitFor({ state: "hidden" });
    }
    if (width === 320) {
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "200% text must reflow",
      );
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
  }
  assert.deepEqual(errors, []);
  const result = {
    companiesAndBranches: "PASS",
    newCompanyHasNoCopiedDevice: "PASS",
    employeeCredentialsInSameDialog: "PASS",
    setupWizard: "PASS",
    authenticatedDeviceMetadata: "PASS",
    interactiveGuide: "PASS",
    guideTopics: 21,
    serverFunctions: "PASS",
    legacyServerSession: "PASS",
    legacyConnectionButton: "PASS",
    digestReadOnly: "PASS",
    original2015Timestamps: "PASS",
    confirmationBeforeMockWrite: "PASS",
    cancelledDoorNoCommand: "PASS",
    roleAuthorization: "PASS",
    csrf: "PASS",
    privatePaths403: "PASS",
    exports,
    screens: sections.length,
    widths,
    pageErrors: 0,
    realDeviceWrites: 0,
    mobileDrawerKeyboardAndBackdrop: "PASS",
    textZoom200: "PASS",
    brand: "زبيد",
  };
  writeFileSync(
    join(output, "e2e-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(output, "failure.png") });
    writeFileSync(
      join(output, "failure-ui.txt"),
      await page.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture.close();
}
