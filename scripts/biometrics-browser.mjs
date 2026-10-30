import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";
import { createBiometricFixture } from "./biometric-test-device.mjs";
import { readAppEnv } from "./with-app-env.mjs";
const output = resolve(".codex-backups/zubayd-platform-20261023/qa/face");
mkdirSync(output, { recursive: true });
Object.assign(process.env, readAppEnv(process.cwd()), {
  SKYLINE_ACCESS_DATA_DIR: mkdtempSync(join(tmpdir(), "skyline-bio-browser-")),
  SKYLINE_DISABLE_SCHEDULER: "1",
  SKYLINE_ADMIN_USERNAME: "fixture-admin",
  SKYLINE_ADMIN_PASSWORD: "fixture-admin-test-password",
});
delete process.env.SKYLINE_VAULT_KEY;
let browser, vite, fixture, page;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const generator = await context.newPage();
  const base64 = await generator.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 640;
    const ctx = c.getContext("2d");
    for (let y = 0; y < 640; y += 20)
      for (let x = 0; x < 480; x += 20) {
        ctx.fillStyle = (x + y) % 40 === 0 ? "#204060" : "#e0b090";
        ctx.fillRect(x, y, 20, 20);
      }
    return c.toDataURL("image/jpeg", 0.8).split(",")[1];
  });
  await generator.close();
  const photo = Buffer.from(base64, "base64");
  fixture = await createBiometricFixture(photo);
  vite = await createServer({
    configFile: "vite.access-staging.config.ts",
    cacheDir: "node_modules/.vite-speed-biometrics",
    logLevel: "error",
  });
  const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts"),
    api = await vite.ssrLoadModule("/src/lib/access/isapi.server.ts");
  await store.updateState((s) => {
    Object.assign(s.devices[0], {
      host: fixture.link.host,
      port: fixture.link.port,
      serial: "BIO-FIXTURE",
      model: "DS-K1A340WX",
      firmware: "V1.2.7",
      status: "online",
      checkedAt: new Date().toISOString(),
    });
    s.people = fixture.users.map((u) =>
      api.personFromDevice(u, "hikvision-main"),
    );
    s.accounts.push({
      username: "fixture-viewer",
      name: "viewer",
      role: "viewer",
      enabled: true,
      ...store.passwordHash("fixture-viewer-test-password"),
    });
  });
  await store.rememberCredential(
    "hikvision-main",
    fixture.link.username,
    fixture.link.password,
  );
  await vite.listen();
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let captured;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.postData()?.includes("phone") &&
      r.postData()?.includes("replaceExisting")
    )
      captured = {
        url: r.url(),
        body: r.postDataBuffer(),
        type: r.headers()["content-type"],
      };
  });
  await page.addInitScript(() => {
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        throw new Error("getUserMedia must not be used over HTTP");
      };
  });
  const base = "http://127.0.0.1:8092";
  await page.goto(base + "/access", {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page
    .getByLabel("اسم مستخدم البرنامج", { exact: true })
    .fill("fixture-admin");
  await page
    .getByLabel("كلمة مرور البرنامج", { exact: true })
    .fill("fixture-admin-test-password");
  await page
    .getByRole("button", { name: "دخول زبيد", exact: true })
    .click();
  await page.getByRole("heading", { name: "الرئيسية", exact: true }).waitFor();
  await page
    .locator(".ac-sidebar:visible")
    .getByRole("button", { name: "الموظفون", exact: true })
    .click();
  await page
    .locator("article")
    .filter({ has: page.getByText("mk", { exact: true }) })
    .getByRole("button", { name: "الكروت والوجه والأصابع", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("الموظف", { exact: true }).inputValue(),
    "hikvision-main:1",
  );
  await page
    .getByRole("heading", { name: "تسجيل بصمة الوجه", exact: true })
    .waitFor();
  await page
    .getByText("بصمات الأصابع وطريقة التسجيل اليدوي", { exact: true })
    .click();
  await page.getByText(/DS-K1A340WX لا يحتوي مستشعر إصبع/).waitFor();
  await page
    .getByRole("button", { name: "فحص وسائل الموظف (قراءة فقط)", exact: true })
    .click();
  await page.getByText(/جاهز لرفع JPEG/).waitFor();
  assert.equal(fixture.mutations.length, 0);
  await page
    .getByRole("button", { name: "التالي: اختيار صورة الوجه", exact: true })
    .click();
  const camera = page.getByLabel("التقاط صورة بالكاميرا", { exact: true });
  assert.equal(await camera.getAttribute("capture"), "user");
  assert.equal(await camera.getAttribute("accept"), "image/*");
  assert.equal(
    await page
      .getByLabel("اختيار صورة من المعرض", { exact: true })
      .getAttribute("capture"),
    null,
  );
  const widths = [320, 360, 375, 390, 768, 1280];
  async function layout(stage) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        stage + " overflow at " + width,
      );
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: join(output, stage + "-390.png") });
  }
  async function choose() {
    await camera.setInputFiles({
      name: "synthetic-pattern.jpg",
      mimeType: "image/jpeg",
      buffer: photo,
    });
    await layout("select");
    await page
      .getByRole("button", { name: "التالي: التعديل والمعاينة", exact: true })
      .click();
    await page.getByLabel("تكبير القص", { exact: true }).fill("1.2");
    await layout("crop");
    await page
      .getByRole("button", { name: "التالي: مراجعة الجودة", exact: true })
      .click();
    await page
      .getByLabel(
        "أؤكد أن الصورة لموظف واحد، الوجه واضح ومواجه للكاميرا بالكامل دون قناع أو نظارة شمسية.",
        { exact: true },
      )
      .check();
    await layout("quality");
    await page
      .getByRole("button", { name: "التالي: تأكيد التسجيل", exact: true })
      .click();
    await layout("review");
  }
  const dark = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 640;
    return c.toDataURL("image/png").split(",")[1];
  });
  await camera.setInputFiles({
    name: "synthetic-dark.png",
    mimeType: "image/png",
    buffer: Buffer.from(dark, "base64"),
  });
  await page
    .getByRole("button", { name: "التالي: التعديل والمعاينة", exact: true })
    .click();
  assert.ok(
    await page
      .getByRole("button", { name: "التالي: مراجعة الجودة", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("button", { name: "إلغاء الصورة / إعادة التصوير", exact: true })
    .click();
  assert.ok(
    await camera.isVisible(),
    "retake must return directly to photo selection",
  );
  assert.equal(fixture.mutations.length, 0);
  await choose();
  await page
    .getByRole("button", {
      name: "مراجعة تأكيد التسجيل",
      exact: true,
    })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "تأكيد تسجيل الوجه للموظف المحدد",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(fixture.mutations.length, 0);
  assert.ok(
    await dialog
      .getByRole("button", { name: "تأكيد تسجيل الوجه", exact: true })
      .isDisabled(),
  );
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await dialog.boundingBox();
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= width + 1,
      `face confirmation must fit ${width}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `confirmation overflow at ${width}`,
    );
  }
  await dialog
    .getByRole("button", { name: "إلغاء دون إرسال", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(fixture.mutations.length, 0);
  await choose();
  await page
    .getByRole("button", {
      name: "مراجعة تأكيد التسجيل",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("اكتب: تسجيل الوجه 1", { exact: true })
    .fill("تسجيل الوجه 1");
  await dialog
    .getByRole("button", { name: "تأكيد تسجيل الوجه", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByText("اكتمل وتحققنا منه", { exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(fixture.mutations.length, 1);
  assert.equal(fixture.bodies[0].metadata.FPID, "1");
  await page
    .getByRole("button", {
      name: "العودة إلى بيانات الموظف وفحصه",
      exact: true,
    })
    .click();
  await page
    .getByLabel("الموظف", { exact: true })
    .selectOption("hikvision-main:2");
  await page
    .getByRole("button", { name: "فحص وسائل الموظف (قراءة فقط)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "التالي: اختيار صورة الوجه", exact: true })
    .click();
  await page
    .getByRole("button", { name: "كاميرا جهاز البصمة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "التالي: التعديل والمعاينة", exact: true })
    .click();
  await page
    .getByRole("button", { name: "التالي: مراجعة الجودة", exact: true })
    .click();
  await page
    .getByLabel("الموظف الصحيح يقف أمام الجهاز ومستعد للتسجيل.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "التالي: تأكيد التسجيل", exact: true })
    .click();
  await page
    .getByRole("button", { name: "مراجعة تأكيد التسجيل", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  assert.equal(fixture.mutations.length, 1);
  await dialog
    .getByLabel("اكتب: تسجيل الوجه 2", { exact: true })
    .fill("تسجيل الوجه 2");
  await dialog
    .getByRole("button", { name: "تأكيد تسجيل الوجه", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByText("اكتمل وتحققنا منه", { exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(fixture.mutations.length, 3);
  assert.equal(fixture.bodies[1].metadata.FPID, "2");
  assert.ok(
    await page.evaluate(
      () =>
        ![
          ...Object.values(localStorage),
          ...Object.values(sessionStorage),
        ].some((v) => /data:image|PRIVATE-MODEL|FaceImage/.test(v)),
    ),
  );
  assert.ok(captured);
  const viewer = await browser.newContext();
  const v = await viewer.newPage();
  await v.goto(base + "/access", { waitUntil: "networkidle" });
  await v
    .getByLabel("اسم مستخدم البرنامج", { exact: true })
    .fill("fixture-viewer");
  await v
    .getByLabel("كلمة مرور البرنامج", { exact: true })
    .fill("fixture-viewer-test-password");
  await v
    .getByRole("button", { name: "دخول زبيد", exact: true })
    .click();
  await v.getByRole("heading", { name: "الرئيسية", exact: true }).waitFor();
  const forbidden = await viewer.request.post(captured.url, {
    headers: { "content-type": captured.type, origin: base },
    data: captured.body,
  });
  assert.ok((await forbidden.text()).includes("FORBIDDEN"));
  const csrf = await context.request.post(captured.url, {
    headers: {
      "content-type": captured.type,
      origin: "https://attacker.invalid",
    },
    data: captured.body,
  });
  assert.ok(csrf.status() === 403 || (await csrf.text()).includes("ORIGIN"));
  assert.deepEqual(errors, []);
  const result = {
    phoneFileCapture: "PASS",
    galleryFallback: "PASS",
    cropAndPreview: "PASS",
    sixStageWizard: "PASS",
    badQualityBlockedAndRetakeReturnsToSelection: "PASS",
    allPhotoStagesAtSixWidths: "PASS",
    explicitConfirmation: "PASS",
    cancelNoWrite: "PASS",
    photoUploadReadback: "PASS",
    terminalCaptureAndReadback: "PASS",
    correctEmployees: ["1", "2"],
    fingerprintUnsupportedExplained: "PASS",
    roleAndCSRF: "PASS",
    noBiometricsInBrowserStorage: "PASS",
    widths,
    pageErrors: 0,
    syntheticMockWrites: 3,
    physicalDeviceWrites: 0,
  };
  writeFileSync(
    join(output, "browser-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(output, "browser-failure.png") });
    console.log(JSON.stringify(await page.locator(".ac-face-editor").evaluate(el=>({text:el.textContent,canvas:[...el.querySelectorAll("canvas")].map(c=>({width:c.width,height:c.height,pixels:[...c.getContext("2d").getImageData(0,0,3,1).data]}))})).catch(()=>({}))));
  }
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
}
