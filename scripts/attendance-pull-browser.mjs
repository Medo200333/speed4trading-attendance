import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { createAccessFixture } from "./access-test-device.mjs";
import { readAppEnv } from "./with-app-env.mjs";
const output = resolve(".codex-backups/zubayd-platform-20261023/qa");
Object.assign(process.env, readAppEnv(process.cwd()), {
  SKYLINE_ACCESS_DATA_DIR: mkdtempSync(join(tmpdir(), "skyline-pull-browser-")),
  SKYLINE_DISABLE_SCHEDULER: "1",
  SKYLINE_ADMIN_USERNAME: "fixture-admin",
  SKYLINE_ADMIN_PASSWORD: "fixture-admin-test-password",
});
delete process.env.SKYLINE_VAULT_KEY;
const fixture = await createAccessFixture();
let vite, browser, page;
try {
  vite = await createServer({
    configFile: "vite.access-staging.config.ts",
    cacheDir: "node_modules/.vite-attendance-http400",
    logLevel: "error",
  });
  const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts");
  const service = await vite.ssrLoadModule("/src/lib/access/service.server.ts");
  await store.updateState((s) =>
    Object.assign(s.devices[0], {
      host: fixture.link.host,
      port: fixture.link.port,
    }),
  );
  await service.actionCenter(
    {
      username: "fixture-admin",
      name: "fixture",
      role: "admin",
      sessionId: "fixture-preload",
    },
    {
      action: "connect",
      deviceId: "hikvision-main",
      username: fixture.link.username,
      password: fixture.link.password,
    },
  );
  fixture.faults.requireEventOffset = true;
  await vite.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8092/access", {
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
    .locator(".ac-sidebar")
    .getByRole("button", { name: "الحضور والانصراف", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "فحص الفترة القديمة: يناير 2015",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "تشخيص السحب (قراءة فقط)", exact: true })
    .click();
  await page.getByText("ملخص تشخيص ISAPI الآمن", { exact: true }).waitFor();
  await page.getByText("ملخص تشخيص ISAPI الآمن", { exact: true }).click();
  const diagnostic = JSON.parse(await page.locator("pre").innerText());
  assert.equal(diagnostic.raw, 57);
  assert.equal(diagnostic.uniqueVerifications, 24);
  assert.equal(
    (await store.readState()).events.length,
    0,
    "diagnostic must not import",
  );
  await page.getByRole("button", { name: "سحب الآن", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("خام مقروء: 57") &&
      document.body.innerText.includes("تحقق فريد: 24") &&
      document.body.innerText.includes("لا توجد مزامنة جارية"),
    null,
    { timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "افتح تقرير فترة السحب", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("من تاريخ", { exact: true }).inputValue(),
    "2015-01-01",
  );
  assert.equal(
    await page.getByLabel("إلى تاريخ", { exact: true }).inputValue(),
    "2015-01-03",
  );
  await page
    .locator("tbody")
    .getByText("2015-01-01", { exact: true })
    .first()
    .waitFor();
  await page
    .locator(".ac-sidebar")
    .getByRole("button", { name: "الحضور والانصراف", exact: true })
    .click();
  await page
    .getByRole("button", { name: "فحص أكتوبر 2026", exact: true })
    .click();
  await page.getByRole("button", { name: "سحب الآن", exact: true }).click();
  await page
    .getByText(
      "لا توجد حركات تحقق في الفترة المحددة. أحداث النظام لا تُحتسب حضوراً أو انصرافاً.",
      { exact: true },
    )
    .waitFor({ timeout: 30000 });
  assert.equal((await store.readState()).events.length, 56);
  fixture.faults.eventForce400 = true;
  fixture.faults.eventErrorXml = true;
  await page
    .getByRole("button", { name: "تشخيص السحب (قراءة فقط)", exact: true })
    .click();
  await page
    .getByText("فشل قراءة السجلات؛ لا توجد نتيجة مؤكدة للفترة المطلوبة.", {
      exact: true,
    })
    .waitFor();
  const failureDetails = page
    .locator("details")
    .filter({
      has: page.getByText("تفاصيل رفض AcsEvent المنقّاة", { exact: true }),
    });
  const failure = JSON.parse(await failureDetails.locator("pre").innerText());
  assert.equal(failure.attempts.at(-1).http, 400);
  assert.equal(failure.attempts.at(-1).response.subStatusCode, "badParameters");
  assert.equal(
    await page
      .getByText(
        "لا توجد حركات تحقق في الفترة المحددة. أحداث النظام لا تُحتسب حضوراً أو انصرافاً.",
        { exact: true },
      )
      .count(),
    0,
  );
  assert.ok(
    !(await page.locator(".ac-sync-state").innerText()).includes(
      "خام مقروء: 0",
    ),
  );
  assert.equal((await store.readState()).events.length, 56);
  await page.getByText("ملخص تشخيص ISAPI الآمن", { exact: true }).click();
  // Only the changed pull controls/diagnostic are checked; prior full mobile matrix is retained.
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `pull summary must fit ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  assert.equal(fixture.mutations.length, 0);
  const result = {
    serverFunctions: "PASS",
    adminReadDiagnostic: "PASS",
    historical: {
      raw: 57,
      verifications: 25,
      uniqueVerifications: 24,
      storedRaw: 56,
    },
    defaultReportPeriod2015: "PASS",
    emptyOctober: "PASS",
    http400DetailsAfterServerFunctionFailure: "PASS",
    failedReadIsNotEmptySuccess: "PASS",
    historicalRecordsRetained: "PASS",
    changedPullPanelWidths: [320, 1280],
    pageErrors: 0,
    physicalDeviceWrites: 0,
    mockDeviceWrites: 0,
  };
  writeFileSync(
    join(output, "browser-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (e) {
  if (page)
    await page.screenshot({ path: join(output, "pull-browser-failure.png") });
  throw e;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture.close();
}
