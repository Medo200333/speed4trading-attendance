import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";

// This script sends GET and documented search POST requests only. Never use it for hardware writes.
const target = "http://192.168.1.21:80/ISAPI/System/deviceInfo";
const output = resolve(
  ".codex-backups/attendance-http400-20261022/physical-read-only.json",
);
let vite;
try {
  const flag = process.argv.indexOf("--credentials-file");
  const secret =
    flag >= 0
      ? JSON.parse(readFileSync(process.argv[flag + 1], "utf8"))
      : {
          username: process.env.HIKVISION_USERNAME,
          password: process.env.HIKVISION_PASSWORD,
        };
  const checkedAt = new Date().toISOString();
  if (
    typeof secret.username !== "string" ||
    typeof secret.password !== "string" ||
    !secret.username ||
    !secret.password
  ) {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const challenge = response.headers.get("www-authenticate") || "";
    const result = {
      checkedAt,
      address: "192.168.1.21:80",
      http: response.status,
      digest: /digest/i.test(challenge),
      algorithm: /algorithm="?([\w-]+)/i.exec(challenge)?.[1] || "MD5",
      authenticatedRead: "NOT_RUN_MISSING_CREDENTIALS",
      deviceWrites: 0,
    };
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else {
    process.env.SKYLINE_ACCESS_DATA_DIR = mkdtempSync(
      join(tmpdir(), "skyline-physical-probe-"),
    );
    process.env.SKYLINE_DISABLE_SCHEDULER = "1";
    delete process.env.SKYLINE_VAULT_KEY;
    vite = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, watch: null },
      appType: "custom",
    });
    const domain = await vite.ssrLoadModule("/src/lib/access/domain.ts");
    const store = await vite.ssrLoadModule("/src/lib/access/store.server.ts");
    const adapter = await vite.ssrLoadModule("/src/lib/access/isapi.server.ts");
    const pull = await vite.ssrLoadModule("/src/lib/access/pull.server.ts");
    const device = domain.newDevice(
      "hikvision-main",
      "البصمة الرئيسية",
      "192.168.1.21",
    );
    await store.rememberCredential(device.id, secret.username, secret.password);
    const scanned = await adapter.scanDevice(device);
    const users = new Set();
    const userSearchID = `physical-u-${Date.now()}`;
    let position = 0,
      done = false;
    for (let guard = 0; guard < 500 && !done; guard++) {
      const page = await adapter.userPage(scanned, position, userSearchID);
      for (const user of page.records) users.add(String(user.employeeNo));
      if (!page.done && page.next <= position) throw new Error("PAGE_STALLED");
      position = page.next;
      done = page.done;
    }
    if (!done) throw new Error("USER_PAGE_LIMIT");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const ranges = process.env.HIKVISION_START_DATE
      ? [
          [
            process.env.HIKVISION_START_DATE,
            process.env.HIKVISION_END_DATE || today,
          ],
        ]
      : [
          ["2015-01-01", "2015-01-03"],
          ["2026-10-01", "2026-10-22"],
        ];
    const imports = [];
    for (const [start, end] of ranges) {
      const { diagnostic } = await pull.readAttendance(
        scanned,
        start,
        end,
        undefined,
        true,
      );
      imports.push(diagnostic);
    }
    const result = {
      checkedAt,
      address: "192.168.1.21:80",
      authenticatedRead: "PASS",
      model: scanned.model,
      firmware: scanned.firmware,
      users: users.size,
      physicalDoorIds: scanned.physicalDoorIds,
      clock: scanned.clock,
      capabilities: scanned.capabilities,
      probes: scanned.probes,
      imports,
      deviceWrites: 0,
    };
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        authenticatedRead: "PASS",
        users: users.size,
        imports,
        matrixFile: output,
        deviceWrites: 0,
      }),
    );
  }
} catch (error) {
  console.log(
    JSON.stringify({
      authenticatedRead: "FAILED",
      error: /^[A-Z0-9_]+$/.test(error?.code || "")
        ? error.code
        : error?.name || "UNKNOWN",
      deviceWrites: 0,
    }),
  );
  process.exitCode = 1;
} finally {
  await vite?.close();
}
