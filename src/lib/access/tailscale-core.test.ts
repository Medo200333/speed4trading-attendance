import test from "node:test";
import assert from "node:assert/strict";
import { TAILSCALE_PAGES, fingerprintRoutes, isPublicTailscaleUrl, pickPrivateBrowser, parseBranchTarget } from "./tailscale-core.ts";

test("only public pages, no identity params", () => {
  for (const u of Object.values(TAILSCALE_PAGES)) { assert.ok(!u.includes("?") && !/@|hint|email|tailnet/i.test(u)); assert.ok(isPublicTailscaleUrl(u)); }
  assert.equal(isPublicTailscaleUrl("https://login.tailscale.com/login?login_hint=a@b.c"), false);
  assert.equal(isPublicTailscaleUrl("https://login.tailscale.com/a/abc"), false);
});
test("private window + fresh profile", () => {
  const all = () => true, url = TAILSCALE_PAGES.login, dir = "C:\\T\\speed-ts-1";
  const e = pickPrivateBrowser({}, all, url, dir)!;
  assert.equal(e.browser, "edge"); assert.ok(e.args.includes("--inprivate") && e.args.includes(`--user-data-dir=${dir}`)); assert.equal(e.args.at(-1), url);
  const c = pickPrivateBrowser({}, (p) => p.includes("chrome"), url, dir)!;
  assert.ok(c.args.includes("--incognito") && c.args.includes(`--user-data-dir=${dir}`));
  const f = pickPrivateBrowser({}, (p) => p.includes("firefox"), url, dir)!;
  assert.ok(f.args.includes("-private-window") && f.args.includes(dir));
  assert.equal(pickPrivateBrowser({}, () => false, url, dir), null);
  assert.equal(pickPrivateBrowser({}, all, "https://evil.example", dir), null);
});
test("branch targets", () => {
  assert.deepEqual(parseBranchTarget("192.168.1.2"), { host: "192.168.1.2", port: 80 });
  assert.deepEqual(parseBranchTarget("192.168.1.111/32"), { host: "192.168.1.111", port: 80 });
  assert.deepEqual(parseBranchTarget("10.0.0.5:8000"), { host: "10.0.0.5", port: 8000 });
  assert.equal(parseBranchTarget("999.1.1.1"), null); assert.equal(parseBranchTarget("a@b.com"), null);
});
test("opening reads fingerprint routes behind online machines, not the computers", () => {
  const found = fingerprintRoutes({
    a: { HostName: "DESKTOP-G2APKHF", Online: true, OS: "windows", PrimaryRoutes: ["192.168.1.3/32"], AllowedIPs: ["100.103.134.5/32", "192.168.1.3/32"] },
    b: { HostName: "DESKTOP-S0F4EFN", Online: true, OS: "windows", PrimaryRoutes: ["192.168.1.2/32"], AllowedIPs: ["100.68.221.34/32", "192.168.1.2/32"] },
    c: { HostName: "pc02", Online: true, OS: "windows", PrimaryRoutes: ["192.168.1.111/32"], AllowedIPs: ["100.92.140.43/32", "192.168.1.111/32"] },
    d: { HostName: "pxliens", Online: false, OS: "windows", PrimaryRoutes: ["192.168.1.4/32"] },
    e: { HostName: "grokbox-smk", Online: true, OS: "linux", AllowedIPs: ["100.85.196.96/32"] },
    f: { HostName: "DESKTOP-GD5RJ4M", Online: true, OS: "windows", TailscaleIPs: ["100.93.0.109"] } as never,
  });
  assert.deepEqual(found.map((row) => [row.name, row.ip]), [
    ["DESKTOP-G2APKHF", "192.168.1.3"],
    ["DESKTOP-S0F4EFN", "192.168.1.2"],
    ["pc02", "192.168.1.111"],
  ]);
  assert.equal(found.some((row) => row.ip.startsWith("100.")), false);
});
