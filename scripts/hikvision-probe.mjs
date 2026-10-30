import { readFileSync } from "node:fs";
import { createServer } from "vite";

// Read-only physical-device probe. Credentials stay in process memory.
const url = "http://192.168.1.21:80/ISAPI/System/deviceInfo";
let vite;
try {
  const fileFlag = process.argv.indexOf("--credentials-file");
  const credentials = fileFlag >= 0
    ? JSON.parse(readFileSync(process.argv[fileFlag + 1], "utf8"))
    : { username: process.env.HIKVISION_USERNAME, password: process.env.HIKVISION_PASSWORD };
  if (!credentials.username || !credentials.password) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    const challenge = response.headers.get("www-authenticate") || "";
    console.log(JSON.stringify({ status: response.status, digest: /digest/i.test(challenge), algorithm: /algorithm="?([\w-]+)/i.exec(challenge)?.[1] || "MD5", authenticatedRead: "NOT_RUN_MISSING_CREDENTIALS" }));
  } else {
    vite = await createServer({ configFile: false, logLevel: "silent", server: { middlewareMode: true, watch: null }, appType: "custom" });
    const { testDevice, pullChunk } = await vite.ssrLoadModule("/src/lib/hikvision.server.ts");
    const link = { host: "192.168.1.21", port: 80, https: false, username: credentials.username, password: credentials.password };
    const connection = await testDevice(link);
    if (!connection.ok) throw new Error("DEVICE_AUTHENTICATED_PROBE_FAILED");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let state = { ...link, startDate: process.env.HIKVISION_START_DATE || `${today.slice(0, 7)}-01`, endDate: process.env.HIKVISION_END_DATE || today, timeZone: "Africa/Cairo", eventSearchId: `e${Date.now()}`, eventPos: 0, eventsDone: false, variant: 0, pageSize: 10, usersDone: false, userSearchId: `u${Date.now()}`, userPos: 0 };
    const users = new Map();
    const punches = new Set();
    for (let guard = 0; guard < 40; guard += 1) {
      const result = await pullChunk(state);
      if (!result.ok) throw new Error("DEVICE_READ_FAILED");
      for (const person of result.users) users.set(person.employeeNo, person.name);
      for (const punch of result.punches) punches.add(`${punch.employeeNo}|${punch.date}|${punch.time}|${punch.method}`);
      state = { ...state, ...result };
      if (state.eventsDone && state.usersDone) break;
    }
    console.log(JSON.stringify({ authenticatedRead: state.eventsDone && state.usersDone ? "PASS" : "INCOMPLETE", model: connection.model, users: users.size, scannedEvents: state.eventPos, uniqueVerifications: punches.size }));
  }
} catch (error) {
  console.log(JSON.stringify({ error: error?.code || error?.cause?.code || error?.name || "UNKNOWN" }));
  process.exitCode = 1;
} finally {
  await vite?.close();
}
