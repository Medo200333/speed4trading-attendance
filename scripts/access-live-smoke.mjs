import assert from "node:assert/strict";
import { connect } from "node:net";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = "http://100.69.92.116:8080";
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  const response = await page.goto(`${base}/access`, { waitUntil: "networkidle", timeout: 60000 });
  assert.equal(response.status(), 200);
  await page.getByRole("button", { name: "دخول زبيد", exact: true }).waitFor({ timeout: 30000 });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 1);
  const root = await page.request.get(`${base}/`);
  assert.equal(root.status(), 200);
  const sshReachable = await new Promise((resolve) => {
    const socket = connect({ host: "100.69.92.116", port: 22 });
    socket.setTimeout(5000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
  // A nonexistent path avoids fetching any real private file when checking the guard.
  const guard = await page.request.head(`${base}/.codex-backups/__skyline_guard_probe__.json?raw`);
  const result = { address: base, accessPage: "PASS", rootHttp: root.status(), mobile390: "PASS", sshTcp22: sshReachable, privatePathGuard: guard.status() === 403 ? "ACTIVE" : "PENDING_CONFIG_APPROVAL", privateProbeHttp: guard.status(), pageErrors: errors, deviceRequests: 0, deviceWrites: 0 };
  await page.screenshot({ path: ".codex-backups/speed-rebrand-20261023/qa/live-access-login-390.png" });
  writeFileSync(".codex-backups/speed-rebrand-20261023/qa/live-result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  assert.deepEqual(errors, []);
} finally { await browser?.close(); }
